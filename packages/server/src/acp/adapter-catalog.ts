import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ADAPTERS, adapterCatalogEntrySchema } from "@lumem/shared";
import type {
  AcpCommand,
  AcpConfigOption,
  AdapterCatalogEntry,
  AdapterCatalogView,
  AdapterSpec,
} from "@lumem/shared";

import { writeAtomically } from "../files/FileService.js";

/**
 * O catálogo de adaptador (`033` §3.1) — o que a pílula de modelo e o menu `/`
 * do rascunho leem antes de existir sessão (Q4).
 *
 * Não confundir com `agents/catalog.ts`, que é o dos agentes nomeados da
 * esteira.
 */

/** Dentro do `_system/`, que o git do `~/.lumem` já ignora. */
export const ADAPTER_CATALOG_FILE = join("_system", "adapter-catalog.json");

/** O que o catálogo sabe dizer sozinho; `installed` é de quem sabe resolver o comando (T9). */
export type AdapterCatalogReading = Omit<AdapterCatalogView, "installed">;

export interface RecordOptionsExtra {
  authRequired: boolean;
  /**
   * As opções por modelo, quando quem grava percorreu os modelos (M1a).
   *
   * Omitido **preserva** o que já estava: a sessão real só conhece o
   * `session/new`, e apagar o que o probe percorreu devolveria a pílula de
   * *effort* ao modelo padrão a cada conversa aberta.
   */
  optionsByModel?: Record<string, AcpConfigOption[]>;
}

/**
 * De quem é a leitura: o adaptador e a conta (`034` T9). Um `string` sozinho é
 * a leitura **sem conta** — a de antes de haver configuração, e a forma que os
 * chamadores de antes da `034` usavam.
 */
export type CatalogRef = string | { adapterId: string; accountId: string | null };

function refOf(ref: CatalogRef): { adapterId: string; accountId: string | null } {
  return typeof ref === "string" ? { adapterId: ref, accountId: null } : ref;
}

/**
 * A chave no mapa e no arquivo: a conta, ou o adaptador para a leitura sem
 * conta — que é a chave de antes da `034`, então essas entradas ficam idênticas
 * no disco. Id de conta é UUID e não colide com id de adaptador.
 */
function keyOf({ adapterId, accountId }: { adapterId: string; accountId: string | null }): string {
  return accountId ?? adapterId;
}

export interface AdapterCatalogOptions {
  stateDir: string;
  /**
   * A conta padrão de um adaptador, síncrona (`034` T9).
   *
   * Para duas coisas: a leitura do agente põe a padrão primeiro — é ela que a
   * pílula de hoje lê —, e o `load` migra a entrada do arquivo de antes, que era
   * por agente, para ela. Ausente: nenhuma conta é padrão, e nada migra.
   */
  defaultAccountOf?: (adapterId: string) => string | null;
  /** Injetável para o teste trocar o pino; o daemon usa `ADAPTERS`. */
  adapters?: readonly AdapterSpec[];
  now?: () => number;
}

type Listener = (adapterId: string) => void;

export class AdapterCatalog {
  private readonly path: string;
  private readonly adapters: readonly AdapterSpec[];
  private readonly now: () => number;
  private readonly defaultAccountOf: (adapterId: string) => string | null;
  private readonly listeners = new Set<Listener>();
  private entries = new Map<string, AdapterCatalogEntry>();
  /**
   * Uma gravação por vez. Sem isto, duas `rename` concorrentes podem chegar na
   * ordem trocada e o disco fica com o estado mais velho — a memória certa, o
   * próximo boot errado.
   */
  private writing: Promise<void> = Promise.resolve();

  constructor(options: AdapterCatalogOptions) {
    this.path = join(options.stateDir, ADAPTER_CATALOG_FILE);
    this.adapters = options.adapters ?? ADAPTERS;
    this.now = options.now ?? Date.now;
    this.defaultAccountOf = options.defaultAccountOf ?? (() => null);
  }

  async load(): Promise<void> {
    this.entries = new Map();
    const raw = await this.readRaw();
    for (const candidate of Object.values(raw)) {
      const parsed = adapterCatalogEntrySchema.safeParse(candidate);
      if (!parsed.success) continue;
      const { adapterId } = parsed.data;
      // Pino trocado é adaptador outro (Q5): a lista de modelos dele pode não
      // ser a mesma, e o cache não tem como saber.
      if (parsed.data.adapterVersion !== this.pinOf(adapterId)) continue;
      // O arquivo de antes da `034` era por agente: a leitura é da conta que
      // existia — a padrão —, e é para ela que vai.
      const accountId = parsed.data.accountId ?? this.defaultAccountOf(adapterId);
      const entry = { ...parsed.data, accountId };
      this.entries.set(keyOf(entry), entry);
    }
  }

  async recordOptions(
    ref: CatalogRef,
    configOptions: AcpConfigOption[],
    extra: RecordOptionsExtra,
  ): Promise<void> {
    const current = this.entryOf(refOf(ref));
    await this.commit({
      ...current,
      configOptions,
      optionsByModel: extra.optionsByModel ?? current.optionsByModel,
      authRequired: extra.authRequired,
    });
  }

  async recordCommands(ref: CatalogRef, projectId: string, commands: AcpCommand[]): Promise<void> {
    const current = this.entryOf(refOf(ref));
    await this.commit({
      ...current,
      commandsByProject: { ...current.commandsByProject, [projectId]: commands },
    });
  }

  /** Um por adaptador de `ADAPTERS`, nessa ordem, e depois os ids sem spec que já gravaram. */
  view(projectId?: string): AdapterCatalogReading[] {
    const known = this.adapters.map((spec) => spec.id);
    const adapterIds = new Set([...this.entries.values()].map((entry) => entry.adapterId));
    const unknown = [...adapterIds].filter((id) => !known.includes(id)).sort((a, b) => a.localeCompare(b));
    return [...known, ...unknown].flatMap((adapterId) => this.readingsOf(adapterId, projectId));
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * As leituras de um adaptador: a da conta padrão primeiro, as outras contas, e
   * a sem conta por último. Nenhuma entrada: uma leitura vazia, sem conta.
   */
  private readingsOf(adapterId: string, projectId: string | undefined): AdapterCatalogReading[] {
    const mine = [...this.entries.values()].filter((entry) => entry.adapterId === adapterId);
    if (mine.length === 0) return [this.readingOf(adapterId, undefined, projectId)];
    const preferred = this.defaultAccountOf(adapterId);
    const rank = (entry: AdapterCatalogEntry) =>
      entry.accountId === null ? 2 : entry.accountId === preferred ? 0 : 1;
    return mine
      .map((entry, index) => ({ entry, index }))
      .sort((a, b) => rank(a.entry) - rank(b.entry) || a.index - b.index)
      .map(({ entry }) => this.readingOf(adapterId, entry, projectId));
  }

  private readingOf(
    adapterId: string,
    entry: AdapterCatalogEntry | undefined,
    projectId: string | undefined,
  ): AdapterCatalogReading {
    const label = this.adapters.find((spec) => spec.id === adapterId)?.label ?? adapterId;
    return {
      adapterId,
      accountId: entry?.accountId ?? null,
      label,
      authRequired: entry?.authRequired ?? null,
      configOptions: entry?.configOptions ?? [],
      optionsByModel: entry?.optionsByModel ?? {},
      commands: projectId === undefined ? [] : (entry?.commandsByProject[projectId] ?? []),
    };
  }

  private entryOf(ref: { adapterId: string; accountId: string | null }): AdapterCatalogEntry {
    const { adapterId, accountId } = ref;
    return (
      this.entries.get(keyOf(ref)) ?? {
        adapterId,
        accountId,
        adapterVersion: this.pinOf(adapterId),
        configOptions: [],
        optionsByModel: {},
        authRequired: null,
        commandsByProject: {},
        capturedAt: this.now(),
      }
    );
  }

  private async commit(candidate: AdapterCatalogEntry): Promise<void> {
    const previous = this.entries.get(keyOf(candidate));
    // `capturedAt` fora da comparação: ele muda a cada chamada, e com ele dentro
    // todo `session/new` repetido viraria um `catalog.changed` na tela.
    if (previous !== undefined && sameContent(previous, candidate)) return;
    const next = { ...candidate, adapterVersion: this.pinOf(candidate.adapterId), capturedAt: this.now() };
    this.entries.set(keyOf(next), next);
    await this.save();
    for (const listener of this.listeners) listener(next.adapterId);
  }

  private save(): Promise<void> {
    const write = this.writing.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const snapshot = Object.fromEntries(this.entries);
      await writeAtomically(this.path, Buffer.from(`${JSON.stringify(snapshot, null, 2)}\n`), 0o600);
    });
    // A fila segue mesmo se esta gravação falhar; quem chamou recebe o erro.
    this.writing = write.catch(() => {});
    return write;
  }

  private async readRaw(): Promise<Record<string, unknown>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, "utf8"));
      return isRecord(parsed) ? parsed : {};
    } catch {
      /*
       * Ausente ou corrompido lê vazio, e **não** lança — o precedente é o
       * `SecretStore`. O catálogo é cache: lançar derrubaria o boot por um
       * arquivo que a próxima sessão repõe sozinha.
       */
      return {};
    }
  }

  private pinOf(adapterId: string): string | null {
    return this.adapters.find((spec) => spec.id === adapterId)?.pinnedVersion ?? null;
  }
}

function sameContent(a: AdapterCatalogEntry, b: AdapterCatalogEntry): boolean {
  return canonical({ ...a, capturedAt: 0 }) === canonical({ ...b, capturedAt: 0 });
}

/**
 * JSON com as chaves ordenadas. A mesma opção chega com as chaves em ordem
 * diferente conforme a fonte (probe, `session/new`, arquivo relido), e
 * `JSON.stringify` cru contaria isso como mudança.
 */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, inner: unknown) =>
    isRecord(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => x.localeCompare(y)))
      : inner,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
