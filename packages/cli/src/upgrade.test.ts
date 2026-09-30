import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  compareVersions,
  detectPackageManager,
  fetchLatestVersion,
  installCommand,
  PACKAGE_NAME,
  upgrade,
  type InstallCommand,
  type UpgradeDeps,
} from "./upgrade.js";
import { serviceIdentity, type ExecResult, type ServiceHost } from "./service.js";

let out: string[];
let err: string[];

function deps(overrides: Partial<UpgradeDeps> = {}): UpgradeDeps {
  return {
    out: (line) => out.push(line),
    err: (line) => err.push(line),
    current: "0.1.0",
    check: false,
    origin: "http://127.0.0.1:4317",
    fetchLatest: async () => "0.2.0",
    install: async () => 0,
    manager: "npm",
    probe: async () => ({ kind: "free" }),
    ...overrides,
  };
}

beforeEach(() => {
  out = [];
  err = [];
});

describe("lumem upgrade", () => {
  it("instala a última versão com o gerenciador que instalou o Lumem", async () => {
    const install = vi.fn(async () => 0);

    expect(await upgrade(deps({ install, manager: "pnpm" }))).toBe(0);

    expect(install).toHaveBeenCalledWith({
      command: "pnpm",
      args: ["add", "--global", `${PACKAGE_NAME}@0.2.0`],
    } satisfies InstallCommand);
    expect(out.join("\n")).toContain("v0.1.0 → v0.2.0");
    expect(out.at(-1)).toContain("v0.2.0 instalado");
  });

  it("já na última versão, não instala nada", async () => {
    // Uma pergunta ao registry custa um request; uma reinstalação custa minutos
    // e mexe no que já funciona.
    const install = vi.fn(async () => 0);

    expect(await upgrade(deps({ current: "0.2.0", fetchLatest: async () => "0.2.0", install }))).toBe(0);

    expect(install).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("já está na última versão (v0.2.0)");
  });

  it("com a versão local à frente do npm, não faz downgrade", async () => {
    const install = vi.fn(async () => 0);

    expect(await upgrade(deps({ current: "0.3.0", fetchLatest: async () => "0.2.0", install }))).toBe(0);

    expect(install).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("nada a fazer");
  });

  it("--check só relata, e nunca instala", async () => {
    const install = vi.fn(async () => 0);

    expect(await upgrade(deps({ check: true, install }))).toBe(0);

    expect(install).not.toHaveBeenCalled();
    expect(out.join("\n")).toContain("tem versão nova: v0.1.0 → v0.2.0");
  });

  it("com o registry fora do ar, falha sem tocar na instalação", async () => {
    const install = vi.fn(async () => 0);
    const fetchLatest = async () => {
      throw new Error("getaddrinfo ENOTFOUND registry.npmjs.org");
    };

    expect(await upgrade(deps({ fetchLatest, install }))).toBe(1);

    expect(install).not.toHaveBeenCalled();
    expect(err.join("\n")).toContain("ENOTFOUND");
  });

  it("instalador que falha devolve o código dele e diz que a versão não mudou", async () => {
    expect(await upgrade(deps({ install: async () => 13 }))).toBe(13);

    expect(err.join("\n")).toContain("continua na v0.1.0");
  });

  it("com um daemon de pé, diz que ele só muda depois de reiniciar", async () => {
    // O processo carregou o código no boot: o disco é novo e ele não.
    const probe = async () => ({ kind: "lumem" as const, version: "0.1.0" });

    await upgrade(deps({ probe }));

    expect(out.at(-1)).toContain("pare e suba de novo");
  });

  it("sem daemon de pé, não manda reiniciar coisa nenhuma", async () => {
    await upgrade(deps());

    expect(out.join("\n")).not.toContain("pare e suba de novo");
  });
});

/**
 * Um `ServiceHost` que só grava os comandos e diz quais estão carregados (`038`, AC 36).
 *
 * O relógio é falso e anda com o `sleep`, então esperar o daemon voltar não custa
 * tempo de parede — e o que o teste olha é **quais comandos** o `upgrade` mandou.
 */
function fakeService(options: { platform: NodeJS.Platform; loaded: boolean; failing?: readonly string[] }) {
  const commands: string[] = [];
  let clock = 0;
  const host: ServiceHost = {
    platform: options.platform,
    uid: 501,
    home: "/Users/ana",
    nodePath: "/opt/node/bin/node",
    lumemPath: "/opt/node/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs",
    path: "/usr/bin",
    exec: async (command, args): Promise<ExecResult> => {
      const line = [command, ...args].join(" ");
      commands.push(line);
      const isLoadedProbe =
        line === "launchctl print gui/501/tech.cazimi.lumem" ||
        line === "systemctl --user is-active lumem.service";
      const ok = isLoadedProbe ? options.loaded : !(options.failing ?? []).includes(line);
      return { code: ok ? 0 : 1, stdout: "", stderr: ok ? "" : `falhou: ${line}` };
    },
    read: () => null,
    exists: () => false,
    write: () => {},
    mkdir: () => {},
    remove: () => {},
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
  };
  return { host, commands, service: { host, identity: serviceIdentity({}) } };
}

describe("lumem upgrade com o serviço carregado", () => {
  /** O daemon velho ainda responde por um instante, e depois o novo. */
  const answering = (...versions: string[]) => {
    const queue = [...versions];
    return async () => ({ kind: "lumem" as const, version: queue.length > 1 ? queue.shift()! : queue[0]! });
  };

  it("restarts the service after a good install", async () => {
    // macOS: `kickstart -k` mata o processo velho e sobe o de agora.
    const mac = fakeService({ platform: "darwin", loaded: true });
    expect(await upgrade(deps({ service: mac.service, probe: answering("0.1.0", "0.1.0", "0.2.0") }))).toBe(0);

    expect(mac.commands).toContain("launchctl kickstart -k gui/501/tech.cazimi.lumem");
    // O que sai é a versão que o `/trpc/health` responde **depois** do reinício —
    // não a que o `upgrade` acabou de instalar: o velho ainda respondeu duas vezes.
    expect(out.at(-1)).toContain("v0.2.0");
    expect(out.join("\n")).not.toContain("pare e suba de novo");
    expect(err).toEqual([]);

    // Linux: o mesmo gesto, pelo systemd.
    out = [];
    const linux = fakeService({ platform: "linux", loaded: true });
    expect(await upgrade(deps({ service: linux.service, probe: answering("0.1.0", "0.2.0") }))).toBe(0);

    expect(linux.commands).toContain("systemctl --user restart lumem.service");
    expect(out.at(-1)).toContain("v0.2.0");
  });

  it("keeps today's sentence when there is no service", async () => {
    // Um daemon em primeiro plano (`lumem run`): não há supervisor a chamar, e a frase
    // de sempre continua sendo a verdade.
    const none = fakeService({ platform: "darwin", loaded: false });

    await upgrade(deps({ service: none.service, probe: async () => ({ kind: "lumem", version: "0.1.0" }) }));

    expect(none.commands.some((line) => line.includes("kickstart"))).toBe(false);
    expect(out.at(-1)).toContain("pare e suba de novo");
  });

  it("does not touch the service when the install failed", async () => {
    const loaded = fakeService({ platform: "darwin", loaded: true });

    expect(await upgrade(deps({ service: loaded.service, install: async () => 13 }))).toBe(13);

    expect(loaded.commands).toEqual([]);
  });

  it("says so when the supervisor refuses to restart, and when the old version never leaves", async () => {
    const refused = fakeService({
      platform: "darwin",
      loaded: true,
      failing: ["launchctl kickstart -k gui/501/tech.cazimi.lumem"],
    });
    expect(await upgrade(deps({ service: refused.service }))).toBe(1);
    expect(err.join("\n")).toContain("kickstart");

    err = [];
    const stuck = fakeService({ platform: "darwin", loaded: true });
    expect(await upgrade(deps({ service: stuck.service, probe: answering("0.1.0") }))).toBe(1);
    // A versão que ainda responde está na frase: é o que a pessoa precisa para decidir.
    expect(err.join("\n")).toContain("v0.1.0");
  });
});

describe("o gerenciador de pacotes", () => {
  it("sai do caminho de onde o Lumem está instalado", () => {
    // O ambiente do `npm i -g` não existe mais quando alguém digita `lumem
    // upgrade`; o caminho do arquivo sobrevive.
    expect(detectPackageManager("/usr/local/lib/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs")).toBe("npm");
    expect(detectPackageManager("/Users/x/Library/pnpm/global/5/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs")).toBe(
      "pnpm",
    );
    expect(detectPackageManager("/Users/x/.bun/install/global/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs")).toBe(
      "bun",
    );
    expect(detectPackageManager("/Users/x/.yarn/global/node_modules/@vinihcrosa/lumem-os/bin/lumem.mjs")).toBe("yarn");
  });

  it("cada um instala global do seu jeito", () => {
    expect(installCommand("npm", "p@1")).toEqual({ command: "npm", args: ["install", "--global", "p@1"] });
    expect(installCommand("pnpm", "p@1")).toEqual({ command: "pnpm", args: ["add", "--global", "p@1"] });
    expect(installCommand("yarn", "p@1")).toEqual({ command: "yarn", args: ["global", "add", "p@1"] });
    expect(installCommand("bun", "p@1")).toEqual({ command: "bun", args: ["add", "--global", "p@1"] });
  });
});

describe("a comparação de versões", () => {
  it("ordena por número, e não por texto", () => {
    expect(compareVersions("0.9.0", "0.10.0")).toBe(-1);
    expect(compareVersions("1.0.0", "0.99.99")).toBe(1);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("põe o prerelease antes do release", () => {
    expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBe(-1);
    expect(compareVersions("1.0.0", "1.0.0-rc.1")).toBe(1);
    expect(compareVersions("1.0.0-rc.1", "1.0.0-rc.2")).toBe(-1);
  });
});

describe("a consulta ao registry", () => {
  it("pede só o dist-tag latest e devolve a versão", async () => {
    const request = vi.fn(
      async (url: string | URL | Request) => {
        const href = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
        // A URL inteira, e não pedaços dela: é a que o AC 15 da `038` escreve, e a que
        // o daemon pede — o `%40` de antes era a mesma rota escrita de outro jeito.
        expect(href).toBe("https://registry.npmjs.org/@vinihcrosa%2Flumem-os/latest");
        return new Response(JSON.stringify({ version: "9.9.9" }), { status: 200 });
      },
    ) as unknown as typeof fetch;

    expect(await fetchLatestVersion({ request })).toBe("9.9.9");
  });

  it("resposta sem versão é erro, e não uma versão vazia", async () => {
    const request = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;

    await expect(fetchLatestVersion({ request })).rejects.toThrow("sem versão");
  });

  it("status ruim é erro com o status dentro", async () => {
    const request = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;

    await expect(fetchLatestVersion({ request })).rejects.toThrow("503");
  });
});
