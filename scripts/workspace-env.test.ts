import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

/**
 * O ciclo de vida do workspace é bash, e o que ele decide — onde o daemon
 * escreve, em que porta escuta, o que o teardown apaga — não tem tipo nenhum
 * para proteger. Estes testes rodam o shell de verdade: um `LUMEM_STATE_DIR`
 * errado aqui significa desenvolvimento escrevendo no `~/.lumem` de produção,
 * e um teardown errado significa o ambiente de dev do usuário apagado num
 * archive de workspace.
 */

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const WORKSPACE = join(REPO_ROOT, "scripts", "workspace");

const homes: string[] = [];

function fakeHome(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-home-"));
  homes.push(dir);
  return dir;
}

afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});

/** Sourceia o env.sh e devolve o que ele resolveu, sem subir nada. */
function resolve(env: Record<string, string> = {}): Record<string, string> {
  const script = `
    set -euo pipefail
    source "${WORKSPACE}/env.sh"
    resolve_ports
    echo "mode=$LUMEM_DEV_MODE"
    echo "stateDir=$LUMEM_STATE_DIR"
    echo "devHome=$LUMEM_DEV_HOME"
    echo "port=$LUMEM_PORT"
    echo "webPort=$LUMEM_WEB_PORT"
    echo "slug=$WORKSPACE_SLUG"
  `;
  const out = execFileSync("bash", ["-c", script], {
    encoding: "utf8",
    // Ambiente limpo: uma variável herdada da máquina de quem roda o teste
    // mudaria o que o script decide, e o teste passaria por acidente.
    env: { PATH: process.env["PATH"] ?? "", HOME: fakeHome(), ...env },
  });
  return Object.fromEntries(
    out
      .trim()
      .split("\n")
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at), line.slice(at + 1)];
      }),
  );
}

const defaults = JSON.parse(readFileSync(join(REPO_ROOT, "ports.json"), "utf8")) as {
  server: number;
  web: number;
};

describe("env.sh, modo compartilhado", () => {
  it("escreve no ambiente de dev, e não no ~/.lumem de produção", () => {
    const home = fakeHome();
    const resolved = resolve({ HOME: home });
    expect(resolved["mode"]).toBe("shared");
    expect(resolved["stateDir"]).toBe(join(home, ".lumem-dev", "shared"));
    expect(resolved["stateDir"]).not.toBe(join(home, ".lumem"));
  });

  it("é o mesmo state dir para dois worktrees, que é o ponto de ser compartilhado", () => {
    const home = fakeHome();
    const first = resolve({ HOME: home });
    const second = resolve({ HOME: home, LUMEM_DEV_HOME: join(home, ".lumem-dev") });
    expect(second["stateDir"]).toBe(first["stateDir"]);
  });

  it("usa as portas default do repositório", () => {
    const resolved = resolve();
    expect(Number(resolved["port"])).toBe(defaults.server);
    expect(Number(resolved["webPort"])).toBe(defaults.web);
  });

  it("ignora a reserva do harness — a porta do ambiente de dev é a default", () => {
    const resolved = resolve({ CONDUCTOR_PORT: "51000", LUMEM_RUN_PORT: "52000" });
    expect(Number(resolved["port"])).toBe(defaults.server);
  });

  it("ainda obedece quem define as duas portas na mão", () => {
    const resolved = resolve({ LUMEM_PORT: "51000", LUMEM_WEB_PORT: "51001" });
    expect(resolved["port"]).toBe("51000");
    expect(resolved["webPort"]).toBe("51001");
  });

  it("obedece um LUMEM_STATE_DIR explícito", () => {
    const resolved = resolve({ LUMEM_STATE_DIR: "/tmp/lumem-explicito" });
    expect(resolved["stateDir"]).toBe("/tmp/lumem-explicito");
  });
});

describe("env.sh, modo isolado", () => {
  it("volta ao state dir só deste worktree", () => {
    const home = fakeHome();
    const resolved = resolve({ HOME: home, LUMEM_ISOLATED: "1" });
    expect(resolved["mode"]).toBe("isolated");
    expect(resolved["stateDir"]).toBe(
      join(home, ".lumem-dev", "workspaces", resolved["slug"] as string),
    );
  });

  it("volta a preferir a reserva do harness", () => {
    const resolved = resolve({ LUMEM_ISOLATED: "1", CONDUCTOR_PORT: "51000" });
    expect(resolved["port"]).toBe("51000");
    expect(resolved["webPort"]).toBe("51001");
  });
});

describe("teardown.sh", () => {
  function teardown(env: Record<string, string>): string {
    return execFileSync("bash", [join(WORKSPACE, "teardown.sh")], {
      encoding: "utf8",
      env: { PATH: process.env["PATH"] ?? "", HOME: fakeHome(), ...env },
    });
  }

  it("não apaga o ambiente de dev compartilhado", () => {
    const home = fakeHome();
    const shared = join(home, ".lumem-dev", "shared");
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, "lumem.db"), "não me apague");

    const out = teardown({ HOME: home });

    expect(out).toContain("compartilhado");
    expect(readFileSync(join(shared, "lumem.db"), "utf8")).toBe("não me apague");
  });

  it("apaga o state dir do workspace no modo isolado", () => {
    const home = fakeHome();
    const slug = resolve({ HOME: home })["slug"] as string;
    const isolated = join(home, ".lumem-dev", "workspaces", slug);
    mkdirSync(isolated, { recursive: true });

    const out = teardown({ HOME: home, LUMEM_ISOLATED: "1" });

    expect(out).toContain("removido");
    expect(() => readFileSync(isolated)).toThrow();
  });
});

/**
 * O gate que o daemon roda como `test` do projeto.
 *
 * O que está sob teste **não é a suíte** — é o invólucro: que ele nunca fique
 * mudo e nunca fique sem teto. O daemon roda este script num PTY e concede 10
 * minutos; quando estourava, ele não tinha o que mostrar, porque o repórter
 * interativo do vitest reescreve um quadro em vez de escrever linhas.
 *
 * O `pnpm` é dublado, e é o que torna estes casos baratos: rodar a suíte de
 * verdade aqui custaria 71 s por caso e não provaria nada sobre o invólucro.
 */
describe("test.sh", () => {
  /** Um `pnpm` de mentira, primeiro no PATH, fazendo o que o caso precisar. */
  function withFakePnpm(body: string): string {
    const bin = fakeHome();
    writeFileSync(join(bin, "pnpm"), `#!/bin/sh
${body}
`, { mode: 0o755 });
    return bin;
  }

  function runGate(
    pnpmBody: string,
    env: Record<string, string> = {},
  ): { status: number; out: string } {
    const bin = withFakePnpm(pnpmBody);
    try {
      const out = execFileSync("bash", [join(WORKSPACE, "test.sh")], {
        encoding: "utf8",
        stdio: "pipe",
        /*
         * Teto do **caso**, e ele não é cerimônia.
         *
         * `execFileSync` é síncrono: ele segura a thread, então o `testTimeout`
         * do vitest não o alcança e uma trava aqui é uma trava na suíte inteira.
         * Foi assim que a primeira versão deste arquivo rodou 10 minutos em vez
         * de falhar em 5 segundos. Com o teto, regressão vira vermelho rápido.
         */
        timeout: 15_000,
        killSignal: "SIGKILL",
        env: {
          PATH: `${bin}:${process.env["PATH"] ?? ""}`,
          HOME: fakeHome(),
          ...env,
        },
      });
      return { status: 0, out };
    } catch (error) {
      const failure = error as { status?: number; stdout?: string; stderr?: string };
      return { status: failure.status ?? -1, out: `${failure.stdout ?? ""}${failure.stderr ?? ""}` };
    }
  }

  it("diz ao vitest que ninguém está olhando um terminal", () => {
    // Num PTY o repórter default redesenha um quadro, e uma corrida
    // interrompida não deixa uma linha sequer para o daemon mostrar.
    const { status, out } = runGate('echo "CI=$CI"; exit 0');

    expect(status).toBe(0);
    expect(out).toContain("CI=1");
  });

  it("respeita o CI de quem já o definiu", () => {
    const { out } = runGate('echo "CI=$CI"; exit 0', { CI: "true" });

    expect(out).toContain("CI=true");
  });

  it("devolve a reprovação da suíte como ela veio", () => {
    const { status } = runGate("exit 3");

    expect(status).toBe(3);
  });

  it("mata o gate que passou do teto, e diz que foi o teto", () => {
    /*
     * O caso que o daemon viu: sem isto a corrida some no teto **dele**, que é
     * maior, e a única coisa que sobra é "não terminou, sem saída".
     */
    const { status, out } = runGate("sleep 60", { LUMEM_GATE_TIMEOUT_SECONDS: "1" });

    expect(status).not.toBe(0);
    expect(out).toContain("passou de 1s");
    expect(out).toContain("não ter cabido no tempo");
  });

  it("não deixa o relógio do teto vivo depois de a suíte terminar", () => {
    /*
     * O defeito que custou 10 minutos, e que só aparece como **demora**: matar
     * o pid do watchdog deixa o `sleep` dele de pé, herdando o stdout do
     * script. Quem lê essa saída nunca vê o fim — que é, palavra por palavra, o
     * que o daemon relatou sobre o gate.
     *
     * O teto aqui é de 5 minutos e a suíte é instantânea: se o relógio
     * sobreviver, este caso passa dos 15 s do `execFileSync` e fica vermelho.
     */
    const started = Date.now();
    const { status } = runGate("exit 0", { LUMEM_GATE_TIMEOUT_SECONDS: "300" });

    expect(status).toBe(0);
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("anuncia o node e o teto antes de começar, porque o resto pode não chegar", () => {
    const { out } = runGate("exit 0", { LUMEM_GATE_TIMEOUT_SECONDS: "42" });

    expect(out).toContain("==> node v");
    expect(out).toContain("==> teto 42s");
  });
});

describe("default-ports.mjs", () => {
  it("imprime o par que está no ports.json", () => {
    const out = execFileSync("node", [join(WORKSPACE, "default-ports.mjs")], {
      encoding: "utf8",
    }).trim();
    expect(out).toBe(`${defaults.server} ${defaults.web}`);
  });

  it("falha quando o arquivo não tem as chaves", () => {
    const home = fakeHome();
    const file = join(home, "ports.json");
    writeFileSync(file, JSON.stringify({ web: 1 }));
    expect(() =>
      execFileSync("node", [join(WORKSPACE, "default-ports.mjs"), file], { stdio: "pipe" }),
    ).toThrow();
  });
});
