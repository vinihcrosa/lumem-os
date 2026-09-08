/**
 * A conferência de envelhecimento dos adaptadores ACP. Pura e importável; a
 * entrada é `run-check-adapters.ts`, e o `check-adapters.test.ts` a roda contra o
 * catálogo de verdade.
 *
 * Ela existe porque a A12 ("nunca `@latest`") resolve um problema e **cria** o
 * outro. Uma versão literal é revisada por alguém, e é isso que se queria; ela
 * também para no tempo, e nada neste repositório sabia dizer que parou. A LUM-54
 * é o resultado: o pino `0.40.0` era o `latest` do dia em que foi escrito, e
 * quatro meses depois todo turno morria com `400 … Claude Code 2.1.160 does not
 * support this model`.
 *
 * O que ela confere são **duas coisas diferentes**, e a segunda é a que importa:
 *
 * 1. **o pino está atrás do `latest`?** Sinal fraco, e nunca reprova. "Existe
 *    versão nova" não é "a sua está quebrada" — o adaptador publica quase toda
 *    semana, e um gate que exige o `latest` é a A12 ao contrário.
 * 2. **o runtime que o adaptador embute está atrás do `latest` dele?** Sinal
 *    forte, e este reprova. É a mecânica exata do defeito: quem responde
 *    `session/prompt` é o `@anthropic-ai/claude-agent-sdk` de dentro do pacote,
 *    não o `claude` do PATH — que nesta máquina estava `103` releases à frente
 *    dele quando o produto quebrou.
 *
 * **Sem rede, ela passa.** Um gate que reprova num avião é um gate que as pessoas
 * aprendem a rodar com `--no-verify`, e a informação que ela dá não é urgente: o
 * defeito que ela previne leva meses para aparecer.
 */
import { execFileSync } from "node:child_process";

/*
 * Por caminho, e não por `@lumem/shared`: `scripts/` não é um pacote do
 * workspace e não tem `node_modules` próprio, então o alias não resolve aqui.
 * O catálogo é a fonte — conferir contra uma cópia seria conferir a cópia.
 */
import { ADAPTERS, type AdapterSpec } from "../packages/shared/src/adapters.js";

/**
 * Quantos releases o runtime pode estar atrás antes de isto reprovar.
 *
 * **É um alarme de fumaça, não uma especificação.** Os dois pontos de medição que
 * existem, contados na lista de publicações do registro em 2026-09-08:
 *
 * | Pino | Runtime embutido | Releases atrás do publicado | Turno |
 * |---|---|---|---|
 * | `0.40.0` | `0.3.160` | **87** | 400, recusado |
 * | `0.75.1` | `0.3.257` | **6** | `end_turn` |
 *
 * Trinta fica entre os dois com folga dos dois lados: alto o bastante para o
 * ritmo normal do pacote não pintar vermelho toda semana, baixo o bastante para
 * disparar muito antes de a recusa começar. Se ele disparar sem defeito nenhum
 * junto, o número está errado e o conserto é mudar o número — com o motivo
 * escrito, como este.
 *
 * Note que `87` releases não é o mesmo que os `103` de distância entre `160` e
 * `263`: o pacote não publica um release por número de patch. O que se conta aqui
 * é publicação, porque é o que responde "quantas vezes o mundo andou sem a gente".
 */
export const MAX_RUNTIME_RELEASES_BEHIND = 30;

export type FindingKind =
  | "adapter-behind"
  | "runtime-behind"
  | "runtime-not-pinned"
  | "unreadable";

export interface Finding {
  kind: FindingKind;
  /** O id do adaptador do catálogo, para a linha dizer de quem está falando. */
  adapter: string;
  /** Só o `runtime-behind` reprova. O resto é informação. */
  fails: boolean;
  message: string;
}

/** O que o registro npm respondeu sobre um pacote. */
export interface PackageFacts {
  /** Toda versão publicada, na ordem em que o registro as lista. */
  versions: readonly string[];
  /** As dependências de **uma** versão — a pinada, para achar o runtime. */
  dependencies: Readonly<Record<string, string>>;
}

/**
 * Como este arquivo fala com o registro npm. Costura porque as respostas
 * interessantes não podem ser produzidas por uma rede funcionando: um pacote que
 * saiu do ar, um runtime que mudou de nome, um caret onde havia versão exata.
 *
 * Devolve `null` para "não deu para perguntar", que é o mesmo caminho de estar
 * offline.
 */
export type Registry = (pkg: string, version?: string) => PackageFacts | null;

/**
 * Quantos releases separam duas versões, contando na lista do registro.
 *
 * Contagem, e não comparação de semver, de propósito: o que interessa é
 * "quantas publicações passaram sem que o pino andasse", e isso é uma distância
 * na lista. Semver diria que `0.3.160` é menor que `0.3.263` e não diria que
 * cem versões couberam no meio, que é o número que decide.
 *
 * `null` quando uma das duas não está na lista — uma versão que o registro não
 * conhece não tem distância, e inventar zero seria dizer "está em dia".
 */
export function releasesBetween(
  versions: readonly string[],
  from: string,
  to: string,
): number | null {
  const start = versions.indexOf(from);
  const end = versions.indexOf(to);
  if (start === -1 || end === -1) return null;
  return end - start;
}

/** A última publicada, que é a última da lista do registro. */
export function latestOf(versions: readonly string[]): string | null {
  return versions.length === 0 ? null : (versions[versions.length - 1] ?? null);
}

/** Uma versão exata, e não um `^`, `~` ou `*` — o que "pinado" quer dizer aqui. */
export function isExact(range: string): boolean {
  return /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(range);
}

export function checkAdapter(spec: AdapterSpec, registry: Registry): Finding[] {
  if (spec.package === null) return [];

  const findings: Finding[] = [];
  const pkg = registry(spec.package, spec.pinnedVersion);
  if (pkg === null) {
    return [
      {
        kind: "unreadable",
        adapter: spec.id,
        fails: false,
        message: `não deu para perguntar ao registro sobre ${spec.package}`,
      },
    ];
  }

  const latest = latestOf(pkg.versions);
  if (latest !== null && latest !== spec.pinnedVersion) {
    const behind = releasesBetween(pkg.versions, spec.pinnedVersion, latest);
    findings.push({
      kind: "adapter-behind",
      adapter: spec.id,
      // Nunca reprova: exigir o `latest` seria a A12 ao contrário.
      fails: false,
      message:
        `${spec.package} está em ${spec.pinnedVersion} e o latest é ${latest}` +
        (behind === null ? "" : ` (${behind} release(s) atrás)`),
    });
  }

  if (spec.runtime === null) return findings;

  const declared = pkg.dependencies[spec.runtime];
  if (declared === undefined) {
    /*
     * O runtime saiu de `dependencies`, e isto é um achado, não um silêncio.
     *
     * Duas causas, e as duas pedem alguém: o pacote passou a embutir outra
     * coisa (e o campo `runtime` do catálogo virou mentira), ou moveu o runtime
     * para `optionalDependencies` — que é o que o `codex-acp` faz com o binário
     * de plataforma dele.
     */
    findings.push({
      kind: "unreadable",
      adapter: spec.id,
      fails: false,
      message: `${spec.package}@${spec.pinnedVersion} não declara ${spec.runtime} em dependencies`,
    });
    return findings;
  }

  if (!isExact(declared)) {
    // A armadilha da fase 0, dita pelo nome: pinar o adaptador não pina o
    // agente. Não reprova porque não há o que consertar aqui — a faixa é do
    // terceiro, e o que dá para fazer é saber.
    findings.push({
      kind: "runtime-not-pinned",
      adapter: spec.id,
      fails: false,
      message: `${spec.package}@${spec.pinnedVersion} depende de ${spec.runtime}: ${declared} — uma faixa, então a versão que roda é a que o npm quiser`,
    });
    return findings;
  }

  const runtime = registry(spec.runtime);
  if (runtime === null) {
    findings.push({
      kind: "unreadable",
      adapter: spec.id,
      fails: false,
      message: `não deu para perguntar ao registro sobre ${spec.runtime}`,
    });
    return findings;
  }

  const runtimeLatest = latestOf(runtime.versions);
  if (runtimeLatest === null) return findings;

  const behind = releasesBetween(runtime.versions, declared, runtimeLatest);
  if (behind === null) {
    findings.push({
      kind: "unreadable",
      adapter: spec.id,
      fails: false,
      message: `${spec.runtime}@${declared} não está na lista de versões publicadas`,
    });
    return findings;
  }

  if (behind > MAX_RUNTIME_RELEASES_BEHIND) {
    findings.push({
      kind: "runtime-behind",
      adapter: spec.id,
      fails: true,
      message:
        `${spec.package}@${spec.pinnedVersion} embute ${spec.runtime}@${declared}, ` +
        `${behind} release(s) atrás do ${runtimeLatest} — acima do limite de ${MAX_RUNTIME_RELEASES_BEHIND}. ` +
        `Meça a versão candidata antes de trocar o pino: docs/project/claude-agent-acp-0.75.md`,
    });
  }

  return findings;
}

export function checkAdapters(
  registry: Registry,
  specs: readonly AdapterSpec[] = ADAPTERS,
): Finding[] {
  return specs.flatMap((spec) => checkAdapter(spec, registry));
}

/**
 * O registro de verdade, pelo `npm view`.
 *
 * `--json` e um timeout curto: a resposta é informação, não bloqueio, e um
 * registro atrás de proxy que demora vinte segundos por pacote transformaria
 * esta conferência na parte lenta de rodar teste.
 */
export function npmRegistry(timeoutMs = 10_000): Registry {
  return (pkg, version) => {
    const coordinate = version === undefined ? pkg : `${pkg}@${version}`;
    const versions = view<string[] | string>(pkg, "versions", timeoutMs);
    if (versions === null) return null;
    const dependencies =
      version === undefined
        ? {}
        : view<Record<string, string>>(coordinate, "dependencies", timeoutMs) ?? {};

    return {
      // Um pacote com uma publicação só volta string, não array.
      versions: Array.isArray(versions) ? versions : [versions],
      dependencies,
    };
  };
}

function view<T>(coordinate: string, field: string, timeoutMs: number): T | null {
  try {
    const output = execFileSync("npm", ["view", coordinate, field, "--json"], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (output === "") return null;
    return JSON.parse(output) as T;
  } catch {
    // Offline, proxy, pacote inexistente: um só caminho, porque a resposta é a
    // mesma — não deu para saber, e não saber não reprova.
    return null;
  }
}

export function formatFindings(findings: readonly Finding[]): string {
  if (findings.length === 0) return "adapters ok";
  const lines = findings.map(
    (finding) => `${finding.fails ? "FALHA" : "aviso"}  ${finding.adapter}: ${finding.message}`,
  );
  const failing = findings.filter((finding) => finding.fails).length;
  return [
    ...lines,
    "",
    `${findings.length} achado(s), ${failing} reprovando`,
  ].join("\n");
}

/** Só o runtime velho reprova; o resto é para ler. */
export function fails(findings: readonly Finding[]): boolean {
  return findings.some((finding) => finding.fails);
}
