import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  cleanupGitFixtures,
  createHeavyRepo,
  createRepo,
  tempDir,
} from "../testing/git-fixtures.js";
import {
  classify,
  clean,
  cloneEnv,
  cloneRepository,
  percentOf,
  phaseOf,
  ProgressReader,
  Ring,
  SilenceTimer,
  type CloneProgress,
} from "./clone.js";

afterEach(() => {
  cleanupGitFixtures();
  vi.useRealTimers();
});

/** Somewhere to clone into, with the temporary as the target's sibling. */
function destination(): { targetPath: string; tempPath: string } {
  const home = join(tempDir("lumem-clone-"), "pessoal", "api");
  return { targetPath: join(home, "repo"), tempPath: join(home, ".lumem-clone-j1") };
}

describe("cloneRepository", () => {
  it("clona por file:// e entrega o repositório no destino", async () => {
    // D11: nenhum teste desta feature toca a rede. O remoto é um repositório
    // local, e o transporte é o mesmo que o produto usa.
    const origem = await createRepo({ branch: "main" });
    const { targetPath, tempPath } = destination();

    await cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
    });

    expect(existsSync(join(targetPath, "README.md"))).toBe(true);
    // O temporário é a única coisa que existe no disco entre o começo e o fim.
    expect(existsSync(tempPath)).toBe(false);
  });

  it("clona um repositório vazio", async () => {
    // Q19: o cliente pode querer clonar um repositório vazio para trabalhar no
    // Lumem desde o dia 0.
    const origem = await createRepo({ empty: true });
    const { targetPath, tempPath } = destination();

    await cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
    });

    expect(existsSync(join(targetPath, ".git"))).toBe(true);
  });

  it("relata as fases enquanto elas acontecem", async () => {
    const origem = await createRepo();
    const { targetPath, tempPath } = destination();
    const visto: CloneProgress[] = [];

    await cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
      onProgress: (progress) => visto.push(progress),
    });

    expect(visto.length).toBeGreaterThan(0);
    expect(visto.map((p) => p.phase)).toContain("connecting");
    expect(visto.every((p) => p.message !== null)).toBe(true);
  });

  it("não deixa nada para trás quando falha", async () => {
    // §8: uma criação que falha não registra nada — e, aqui, não deixa nada.
    const { targetPath, tempPath } = destination();

    await expect(
      cloneRepository({
        rawUrl: "file:///nao/existe/lugar-nenhum.git",
        url: "file:///nao/existe/lugar-nenhum.git",
        targetPath,
        tempPath,
      }),
    ).rejects.toThrow();

    expect(existsSync(tempPath)).toBe(false);
    expect(existsSync(targetPath)).toBe(false);
  });

  it("classifica conexão recusada sem depender de DNS", async () => {
    const { targetPath, tempPath } = destination();

    const falha = cloneRepository({
      rawUrl: "ssh://127.0.0.1:1/repo.git",
      url: "ssh://127.0.0.1:1/repo.git",
      targetPath,
      tempPath,
    });

    await expect(falha).rejects.toMatchObject({ failure: "refused" });
  });

  it("deixa o origin apontando para `url`, e não para o que foi clonado", async () => {
    // §4.3. `git clone` grava em `.git/config`, em texto puro, exatamente a URL
    // que recebeu — e esse é o arquivo que o agente lê. O `remote set-url` roda
    // antes do `rename`, então o que sobrar de `rawUrl` nunca chega a existir no
    // caminho final.
    //
    // O que este teste prova é a invariante: o que fica gravado é `url`. Que
    // `url` não carrega credencial é assunto do `sanitizeGitUrl`, provado em
    // `git-url.test.ts` — `file://` não aceita userinfo, então o segredo de
    // verdade não cabe nesta fixture.
    const origem = await createRepo();
    const { targetPath, tempPath } = destination();
    const clonadoDe = `file://${origem}/`;
    const guardado = `file://${origem}`;

    await cloneRepository({ rawUrl: clonadoDe, url: guardado, targetPath, tempPath });

    const config = readFileSync(join(targetPath, ".git", "config"), "utf8");
    expect(config).toContain(`url = ${guardado}\n`);
    expect(config).not.toContain(clonadoDe);
  });

  it("recusa na hora quando o sinal já está abortado", async () => {
    const origem = await createRepo();
    const { targetPath, tempPath } = destination();

    await expect(
      cloneRepository({
        rawUrl: `file://${origem}`,
        url: `file://${origem}`,
        targetPath,
        tempPath,
        signal: AbortSignal.abort(),
      }),
    ).rejects.toMatchObject({ failure: "internal" });

    expect(existsSync(targetPath)).toBe(false);
  });

  it("cancela no meio e não deixa o temporário para trás", async () => {
    // Clone de repositório grande em rede ruim é o caso comum de arrependimento.
    const origem = await createHeavyRepo();
    const { targetPath, tempPath } = destination();
    const controller = new AbortController();

    const clone = cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    await expect(clone).rejects.toMatchObject({ failure: "internal" });
    expect(existsSync(targetPath)).toBe(false);
    expect(existsSync(tempPath)).toBe(false);
  });

  it("morre no silêncio, sem timeout total", async () => {
    // Um monorepo de 4 GiB numa rede de hotel é lento, não travado. O que este
    // teto pega é o que realmente parou de responder.
    const origem = await createHeavyRepo();
    const { targetPath, tempPath } = destination();

    const clone = cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
      silenceMs: 1,
    });

    await expect(clone).rejects.toMatchObject({ failure: "network" });
    expect(existsSync(tempPath)).toBe(false);
  });

  it("não deixa lixo no diretório do projeto", async () => {
    const origem = await createRepo();
    const { targetPath, tempPath } = destination();

    await cloneRepository({
      rawUrl: `file://${origem}`,
      url: `file://${origem}`,
      targetPath,
      tempPath,
    });

    expect(await readdir(join(targetPath, ".."))).toEqual(["repo"]);
  });
});

describe("cloneEnv", () => {
  it("fecha toda pergunta interativa", () => {
    // Um daemon não tem a quem perguntar: cada pergunta vira um processo
    // pendurado até o timeout, e um timeout é uma mensagem pior que a verdade.
    const env = cloneEnv({});

    expect(env["GIT_TERMINAL_PROMPT"]).toBe("0");
    expect(env["GIT_ASKPASS"]).toBe("");
    expect(env["SSH_ASKPASS"]).toBe("");
  });

  it("compõe o BatchMode sobre o GIT_SSH_COMMAND que já existia", () => {
    // Quem usa git server self-hosted frequentemente já tem um ali com `-i` e
    // `-p`. Sobrescrever quebraria justamente quem esta feature quer atender.
    expect(cloneEnv({ GIT_SSH_COMMAND: "ssh -i ~/.ssh/empresa -p 2222" })["GIT_SSH_COMMAND"]).toBe(
      "ssh -i ~/.ssh/empresa -p 2222 -o BatchMode=yes",
    );
  });

  it("usa ssh quando não havia nada", () => {
    expect(cloneEnv({})["GIT_SSH_COMMAND"]).toBe("ssh -o BatchMode=yes");
  });
});

describe("classify", () => {
  it.each([
    ["fatal: Authentication failed for 'https://github.com/org/repo.git/'"],
    ["git@github.com: Permission denied (publickey)."],
    ["fatal: could not read Username for 'https://github.com': terminal prompts disabled"],
    ["Host key verification failed."],
  ])("chama de auth: %s", (stderr) => {
    // A única classe com fluxo próprio (F6.10), e a falha mais frequente que
    // existe. `terminal prompts disabled` é o que o §4.2 produz quando o git
    // queria pedir uma senha.
    expect(classify(stderr)).toBe("auth");
  });

  it("separa recusa de conexão de problema de rede", () => {
    expect(classify("ssh: connect to host 127.0.0.1 port 1: Connection refused")).toBe("refused");
    expect(classify("fatal: unable to access '...': Could not resolve host: nao.existe")).toBe(
      "network",
    );
  });

  it("cai em git quando não reconhece", () => {
    expect(classify("fatal: repository 'x' does not exist")).toBe("git");
  });
});

describe("clean", () => {
  it("tira sequência ANSI e byte de controle", () => {
    // O texto vem do servidor remoto e vai para a tela do usuário.
    expect(clean("\u001b[31mremote: oi\u001b[0m\u0007")).toBe("remote: oi");
  });

  it("trunca uma linha longa", () => {
    expect(clean("x".repeat(900))).toHaveLength(501);
  });
});

describe("ProgressReader", () => {
  it("fatia por \\r e por \\n, porque o git usa os dois", () => {
    // Fatiar só por `\\n` entregaria uma linha enorme por fase, no fim — que é
    // exatamente quando ela deixa de ser progresso.
    const visto: CloneProgress[] = [];
    const reader = new ProgressReader((progress) => visto.push(progress));

    reader.push("Receiving objects:  10% (1/10)\rReceiving objects:  90% (9/10)\r");

    expect(visto.map((p) => p.percent)).toEqual([10, 90]);
    expect(visto.every((p) => p.phase === "receiving")).toBe(true);
  });

  it("segura a fase enquanto as linhas não a repetem", () => {
    const visto: CloneProgress[] = [];
    const reader = new ProgressReader((progress) => visto.push(progress));

    reader.push("Receiving objects:  10%\r");
    reader.push("remote: alguma coisa\n");

    expect(visto.at(-1)?.phase).toBe("receiving");
  });

  it("não emite linha vazia", () => {
    const visto: CloneProgress[] = [];
    const reader = new ProgressReader((progress) => visto.push(progress));

    reader.push("\r\n\r\n");

    expect(visto).toEqual([]);
  });
});

describe("phaseOf e percentOf", () => {
  it.each([
    ["Cloning into '/tmp/x'...", "connecting"],
    ["remote: Enumerating objects: 5, done.", "counting"],
    ["remote: Compressing objects:  50% (1/2)", "compressing"],
    ["Receiving objects:  33% (1/3)", "receiving"],
    ["Resolving deltas: 100% (1/1), done.", "resolving"],
    ["Updating files:  75% (3/4)", "checkout"],
  ])("lê a fase de %j", (line, phase) => {
    expect(phaseOf(line)).toBe(phase);
  });

  it("não inventa porcentagem onde não há", () => {
    expect(percentOf("remote: Enumerating objects: 5, done.")).toBeNull();
    expect(percentOf("Receiving objects:  33% (1/3)")).toBe(33);
  });
});

describe("Ring", () => {
  it("encontra um teto em vez da memória do daemon", () => {
    // Um servidor hostil pode despejar `remote:` por quanto tempo quiser.
    const ring = new Ring(1024);

    for (let index = 0; index < 100; index += 1) ring.push(Buffer.alloc(100, "x"));

    expect(ring.bytes).toBeLessThanOrEqual(1024 + 100);
    expect(ring.text().length).toBeLessThanOrEqual(1124);
  });

  it("guarda o fim, que é onde o git diz o que houve", () => {
    const ring = new Ring(16);

    ring.push(Buffer.from("cabeça que se perde"));
    ring.push(Buffer.from("fatal: o fim"));

    expect(ring.text()).toContain("fatal: o fim");
  });
});

describe("SilenceTimer", () => {
  it("dispara quando ninguém fala", () => {
    vi.useFakeTimers();
    const gritou = vi.fn();
    new SilenceTimer(120_000, gritou);

    vi.advanceTimersByTime(120_000);

    expect(gritou).toHaveBeenCalledOnce();
  });

  it("é reiniciado por cada linha, que é o que separa lento de travado", () => {
    vi.useFakeTimers();
    const gritou = vi.fn();
    const timer = new SilenceTimer(120_000, gritou);

    for (let index = 0; index < 10; index += 1) {
      vi.advanceTimersByTime(119_000);
      timer.touch();
    }
    vi.advanceTimersByTime(119_000);

    expect(gritou).not.toHaveBeenCalled();
  });
});
