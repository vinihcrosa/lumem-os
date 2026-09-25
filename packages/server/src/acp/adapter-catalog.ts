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

export interface AdapterCatalogOptions {
  stateDir: string;
  /** Injetável para o teste trocar o pino; o daemon usa `ADAPTERS`. */
  adapters?: readonly AdapterSpec[];
  now?: () => number;
}

type Listener = (adapterId: string) => void;

export class AdapterCatalog {
  private readonly path: string;
  private readonly adapters: readonly AdapterSpec[];
  private readonly now: () => number;
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
  }

  async load(): Promise<void> {
    this.entries = new Map();
    const raw = await this.readRaw();
    for (const [adapterId, candidate] of Object.entries(raw)) {
      const parsed = adapterCatalogEntrySchema.safeParse(candidate);
      if (!parsed.success) continue;
      if (parsed.data.adapterId !== adapterId) continue;
      // Pino trocado é adaptador outro (Q5): a lista de modelos dele pode não
      // ser a mesma, e o cache não tem como saber.
      if (parsed.data.adapterVersion !== this.pinOf(adapterId)) continue;
      this.entries.set(adapterId, parsed.data);
    }
  }

  async recordOptions(
    adapterId: string,
    configOptions: AcpConfigOption[],
    extra: RecordOptionsExtra,
  ): Promise<void> {
    const current = this.entryOf(adapterId);
    await this.commit({
      ...current,
      configOptions,
      optionsByModel: extra.optionsByModel ?? current.optionsByModel,
      authRequired: extra.authRequired,
    });
  }

  async recordCommands(adapterId: string, projectId: string, commands: AcpCommand[]): Promise<void> {
    const current = this.entryOf(adapterId);
    await this.commit({
      ...current,
      commandsByProject: { ...current.commandsByProject, [projectId]: commands },
    });
  }

  /** Um por adaptador de `ADAPTERS`, nessa ordem, e depois os ids sem spec que já gravaram. */
  view(projectId?: string): AdapterCatalogReading[] {
    const known = this.adapters.map((spec) => spec.id);
    const unknown = [...this.entries.keys()].filter((id) => !known.includes(id)).sort();
    return [...known, ...unknown].map((adapterId) => this.readingOf(adapterId, projectId));
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private readingOf(adapterId: string, projectId: string | undefined): AdapterCatalogReading {
    const entry = this.entries.get(adapterId);
    const label = this.adapters.find((spec) => spec.id === adapterId)?.label ?? adapterId;
    return {
      adapterId,
      label,
      authRequired: entry?.authRequired ?? null,
      configOptions: entry?.configOptions ?? [],
      optionsByModel: entry?.optionsByModel ?? {},
      commands: projectId === undefined ? [] : (entry?.commandsByProject[projectId] ?? []),
    };
  }

  private entryOf(adapterId: string): AdapterCatalogEntry {
    return (
      this.entries.get(adapterId) ?? {
        adapterId,
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
    const previous = this.entries.get(candidate.adapterId);
    // `capturedAt` fora da comparação: ele muda a cada chamada, e com ele dentro
    // todo `session/new` repetido viraria um `catalog.changed` na tela.
    if (previous !== undefined && sameContent(previous, candidate)) return;
    const next = { ...candidate, adapterVersion: this.pinOf(candidate.adapterId), capturedAt: this.now() };
    this.entries.set(next.adapterId, next);
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
