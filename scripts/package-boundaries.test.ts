/**
 * The boundaries **between** packages (T10 of docs/features/024-dev-harness/tasks.md).
 *
 * The rules inside one package live in that package — `web`'s eight are in
 * `packages/web/src/architecture.test.ts`, from the `032`. The ones that cross a
 * package live here, in `scripts/`, because a test that reads every package
 * from inside one of them would invert the very direction it defends
 * ([Q3](../docs/features/024-dev-harness/open-questions.md)). The name is not
 * `architecture.test.ts` on purpose: two files with that name make "the
 * architecture test failed" ambiguous.
 *
 * Every message says what to do, because the reader is an agent that has to fix
 * it without opening this file.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = join(import.meta.dirname, "..");
const PACKAGES = ["shared", "server", "web", "cli"] as const;
type Pkg = (typeof PACKAGES)[number];

interface Source {
  pkg: Pkg;
  /** Repository-relative. */
  path: string;
  text: string;
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) out.push(full);
  }
}

const sources: Source[] = PACKAGES.flatMap((pkg) => {
  const files: string[] = [];
  walk(join(repoRoot, "packages", pkg, "src"), files);
  return files.map((full) => ({ pkg, path: relative(repoRoot, full), text: readFileSync(full, "utf8") }));
});

interface Import {
  specifier: string;
  typeOnly: boolean;
  line: number;
}

const IMPORT = /(?:^|\n)\s*(import|export)\s+(type\s+)?[^'"`;]*?\sfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

function importsOf(text: string): Import[] {
  const out: Import[] = [];
  for (const m of text.matchAll(IMPORT)) {
    const specifier = (m[3] ?? m[4]) as string;
    const line = text.slice(0, m.index ?? 0).split("\n").length + (m[0].startsWith("\n") ? 1 : 0);
    out.push({ specifier, typeOnly: m[2] !== undefined, line });
  }
  return out;
}

function isTest(path: string): boolean {
  return /\.(test|spec|stories)\.tsx?$/.test(path) || path.includes(`${sep}testing${sep}`) || path.includes(`${sep}test${sep}`);
}

/** Which workspace package a bare `@lumem/*` specifier names. */
function lumemPackage(specifier: string): string | null {
  const m = /^(@lumem\/[a-z-]+|@vinihcrosa\/lumem-os)(\/.*)?$/.exec(specifier);
  return m?.[1] ?? null;
}

const NAME_OF: Record<Pkg, string> = {
  shared: "@lumem/shared",
  server: "@lumem/server",
  web: "@lumem/web",
  cli: "@vinihcrosa/lumem-os",
};

describe("a direção de dependência entre pacotes", () => {
  it("`shared` não importa pacote nenhum do repositório", () => {
    const problems = sources
      .filter((s) => s.pkg === "shared")
      .flatMap((s) =>
        importsOf(s.text)
          .filter((i) => lumemPackage(i.specifier) !== null)
          .map(
            (i) =>
              `${s.path}:${i.line} importa \`${i.specifier}\`: o \`shared\` é a base e não conhece ninguém — ` +
              "mova o que ele precisa para dentro dele, ou inverta a dependência",
          ),
      );
    expect(problems.join("\n")).toBe("");
  });

  it("`server` importa só o `shared`", () => {
    const problems = sources
      .filter((s) => s.pkg === "server")
      .flatMap((s) =>
        importsOf(s.text)
          .filter((i) => {
            const pkg = lumemPackage(i.specifier);
            return pkg !== null && pkg !== "@lumem/shared";
          })
          .map(
            (i) =>
              `${s.path}:${i.line} importa \`${i.specifier}\`: o daemon não conhece a tela nem o CLI — ` +
              "o que os dois dividem mora no `shared`",
          ),
      );
    expect(problems.join("\n")).toBe("");
  });

  it("`web` importa o `shared`, e do `server` só o **tipo** do router", () => {
    const problems = sources
      .filter((s) => s.pkg === "web")
      .flatMap((s) =>
        importsOf(s.text)
          .filter((i) => {
            const pkg = lumemPackage(i.specifier);
            if (pkg === null || pkg === "@lumem/shared") return false;
            return !(i.specifier === "@lumem/server/router-types" && i.typeOnly);
          })
          .map(
            (i) =>
              `${s.path}:${i.line} importa \`${i.specifier}\`${i.typeOnly ? "" : " como valor"}: a tela só enxerga o ` +
              "daemon por `import type { AppRouter } from \"@lumem/server/router-types\"` — o resto passa pelo `shared`",
          ),
      );
    expect(problems.join("\n")).toBe("");
  });

  /**
   * The one production import that leaves its package, and why it may: the
   * published package's `postinstall` needs the same spawn-helper fix the
   * repository runs, and esbuild inlines it into `bin/postinstall.mjs` — nothing
   * outside the package is read at install time. Tests may reach the repository
   * root (`ports.json`), because they are never shipped.
   */
  const RELATIVE_EXCEPTIONS: Readonly<Record<string, string>> = {
    "packages/cli/src/postinstall.ts": "../../../scripts/ensure-pty-helper.js",
  };

  it("nenhum import relativo de produção sai do próprio pacote", () => {
    const problems = sources.filter((s) => !isTest(s.path)).flatMap((s) =>
      importsOf(s.text)
        .filter((i) => i.specifier.startsWith("."))
        .filter((i) => RELATIVE_EXCEPTIONS[s.path] !== i.specifier)
        .filter((i) => {
          const target = resolve(repoRoot, dirname(s.path), i.specifier);
          return !target.startsWith(join(repoRoot, "packages", s.pkg) + sep);
        })
        .map(
          (i) =>
            `${s.path}:${i.line} importa \`${i.specifier}\`, que sai de \`packages/${s.pkg}\`: ` +
            "atravesse a fronteira pelo nome do pacote, que é o que o `package.json` declara",
        ),
    );
    expect(problems.join("\n")).toBe("");
  });
});

describe("toda dependência entre pacotes está declarada", () => {
  it("cada `@lumem/*` importado está no `package.json` de quem importa", () => {
    const problems: string[] = [];
    for (const pkg of PACKAGES) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, "packages", pkg, "package.json"), "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.devDependencies ?? {})]);
      for (const s of sources.filter((x) => x.pkg === pkg)) {
        for (const i of importsOf(s.text)) {
          const name = lumemPackage(i.specifier);
          if (name === null || name === NAME_OF[pkg] || declared.has(name)) continue;
          problems.push(
            `${s.path}:${i.line} importa \`${name}\`, que não está em packages/${pkg}/package.json: ` +
              "num monorepo com symlink isto funciona até o dia em que não funciona — declare a dependência",
          );
        }
      }
    }
    expect(problems.join("\n")).toBe("");
  });
});

/**
 * The files above the ceiling today, with the reason they are allowed to be
 * ([Q4](../docs/features/024-dev-harness/open-questions.md)). A file may grow past
 * its number only by raising it **here, with a new reason**: with agents, "update
 * the number" becomes a reflex, and a required reason turns growing into a
 * decision someone reads. A file that shrinks has to lower its number, and one
 * that fits the ceiling leaves the map.
 *
 * `web/src/features/` has its own ceiling of 400, in the `032`'s rule 8.
 */
export const LINE_CEILING = 700;

export const OVER_THE_CEILING: Readonly<Record<string, { lines: number; reason: string }>> = {
  "packages/server/src/acp/AcpManager.ts": {
    lines: 3069,
    reason:
      "linha de base 2026-09-28 (2813) mais 5 exceções de lint na linha da T9; quebrar é feature própria (backlog); " +
      "2818 → 2833 na `035`: o `cancelPending`, que emite o `permission_resolved` cancelado no cancel e na saída; " +
      "2833 → 2842 na `036`: o `reasoningMeta` da spec pelo caminho da `quotaRefusalKind`, que só existe aqui; " +
      "mais 158 da `037` — o fecho do turno na saída do processo e a espera pela saída quando o cano fecha " +
      "primeiro (S1), a pergunta que a saída grava antes do `session/prompt` (Q4) e um gatilho por `prompt` em " +
      "voo (Q5), que moram onde moram `promptInFlight` e o `turn_failed` da recusa; " +
      "3000 → 3021 na `038`: o `setUpdating` e a recusa de `prompt` enquanto o daemon se atualiza, que só " +
      "existem onde `prompt` marca o turno; " +
      "3021 → 3069 na `038`, o painel da barra: `liveProcesses`, `hasPendingPermission`, e o `rateLimits` que passa a " +
      "dizer quando e de qual conta veio — o que só quem guarda `lastRateLimit` e `pendingPermissions` sabe responder",
  },
  "packages/server/src/db/schema.ts": {
    lines: 1740,
    reason:
      "linha de base 2026-09-28; um schema do drizzle cresce por tabela; " +
      "1709 → 1740 na `038`: `daemon_settings`, a tabela de uma linha com as três `CHECK` (door 3)",
  },
  "packages/server/src/git/GitService.ts": { lines: 1099, reason: "linha de base 2026-09-28" },
  "packages/server/src/files/FileService.ts": { lines: 971, reason: "linha de base 2026-09-28" },
  "packages/server/src/memory/MemoryService.ts": { lines: 961, reason: "linha de base 2026-09-28" },
  "packages/server/src/sessions/SessionStore.ts": { lines: 951, reason: "linha de base 2026-09-28" },
  "packages/server/src/routers/worktree.ts": { lines: 897, reason: "linha de base 2026-09-28, mais uma exceção de lint na linha da T9" },
  "packages/server/src/tasks/conveyor.ts": { lines: 784, reason: "linha de base 2026-09-28" },
  "packages/server/src/bootstrap.ts": {
    lines: 843,
    reason:
      "linha de base 2026-09-28 (780), mais o import do log em arquivo da T11; " +
      "781 → 833 na `038`: a versão que sobe para o `openDatabase` copiar o banco, e a atualização do daemon — o serviço, " +
      "o desligamento por referência, o relógio e o `stop` —, que só o `bootstrap` alcança por ligar o `AcpManager`, o banco e o `createShutdownHandler`; " +
      "833 → 843 na `038`: o amostrador de recursos do painel, ligado aos dois managers e ao banco, e desarmado no desligamento",
  },
  "packages/server/src/repositories/task.ts": { lines: 756, reason: "linha de base 2026-09-28" },
  "packages/shared/src/acp-protocol.ts": {
    lines: 760,
    reason:
      "linha de base 2026-09-28 (749); um tipo por mensagem do protocolo, e o `content` do `tool_call` da `035`; " +
      "mais 9 da `037` S2 — o limite do frame do `/acp`, que o `maxPayload` do servidor e a recusa do web leem de um lugar só",
  },
  "packages/server/src/tasks/conveyor-ports.ts": { lines: 727, reason: "linha de base 2026-09-28" },
};

function lineCount(text: string): number {
  return (text.match(/\n/g) ?? []).length;
}

describe("teto de linhas fora de `web/src/features/`", () => {
  const production = sources.filter(
    (s) => !isTest(s.path) && !s.path.startsWith(join("packages", "web", "src", "features")),
  );

  it(`nenhum arquivo de produção passa de ${LINE_CEILING} linhas fora do mapa, e o mapa só muda com motivo`, () => {
    const problems: string[] = [];
    for (const s of production) {
      const lines = lineCount(s.text);
      const entry = OVER_THE_CEILING[s.path];
      if (entry === undefined) {
        if (lines > LINE_CEILING) {
          problems.push(
            `\`${s.path}\` tem ${lines} linhas, acima do teto de ${LINE_CEILING}: quebre o arquivo, ou registre a ` +
              "exceção em `OVER_THE_CEILING` com o tamanho de agora e o motivo",
          );
        }
        continue;
      }
      if (entry.reason.trim() === "") problems.push(`\`${s.path}\` está no mapa sem motivo`);
      if (lines > entry.lines) {
        problems.push(
          `\`${s.path}\` cresceu de ${entry.lines} para ${lines} linhas: reduza o arquivo, ou suba o número em ` +
            "`OVER_THE_CEILING` **com um motivo novo** — crescer é uma decisão, e o motivo é o que a revisão lê",
        );
      } else if (lines < entry.lines) {
        problems.push(`\`${s.path}\` encolheu de ${entry.lines} para ${lines} linhas: atualize o mapa — ele só desce sozinho`);
      } else if (lines <= LINE_CEILING) {
        problems.push(`\`${s.path}\` cabe no teto agora: tire-o de \`OVER_THE_CEILING\``);
      }
    }
    for (const path of Object.keys(OVER_THE_CEILING)) {
      if (!production.some((s) => s.path === path)) problems.push(`\`${path}\` está no mapa e não existe mais`);
    }
    expect(problems.join("\n")).toBe("");
  });
});
