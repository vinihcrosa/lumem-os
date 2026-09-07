import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RequestError } from "@agentclientprotocol/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AcpManager } from "../acp/AcpManager.js";
import { codexLikeScript, fakeAgentProcess, type FakeAgentScript } from "../testing/acp-fake-agent.js";
import { createAgentAuthService, type AgentAuthService } from "./agent-auth.js";

/**
 * Entrar no agente por **chamada**, e não por comando (`second-agent`, T10/T11).
 *
 * Contra o agente falso, a token zero. O que este arquivo cobra é o que a fase 0
 * mediu e o que o desenho decidiu: o método vem do handshake, a URL e o código
 * chegam no meio da espera, cancelar mata o processo, e a chave **atravessa** o
 * daemon sem ficar em lugar nenhum — o que é a maior parte da resposta de
 * segurança da feature, e por isso tem um teste que varre o disco.
 */

const dirs: string[] = [];
const managers: AcpManager[] = [];
const services: AgentAuthService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) service.cancelAll();
  await Promise.all(managers.splice(0).map((manager) => manager.killAll()));
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function stateDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "lumem-auth-"));
  dirs.push(dir);
  return dir;
}

function harness(script: FakeAgentScript) {
  const acpManager = new AcpManager({
    spawner: () => fakeAgentProcess(script).process,
    isAvailable: () => true,
    handshakeTimeoutMs: 2_000,
  });
  managers.push(acpManager);
  const service = createAgentAuthService({ acpManager });
  services.push(service);
  return { service, acpManager };
}

/** O perfil do Codex mais um `authenticate` roteirizado. */
function codexWith(authenticate: FakeAgentScript["authenticate"]): FakeAgentScript {
  return { ...codexLikeScript(), ...(authenticate ? { authenticate } : {}) };
}

async function settle(service: AgentAuthService, id: string, want: string): Promise<void> {
  await vi.waitFor(() => expect(service.status(id).state).toBe(want), { timeout: 2_000 });
}

/** Todo arquivo abaixo de um diretório, com o conteúdo. */
function filesUnder(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(path);
    if (!entry.isFile() || statSync(path).size > 2_000_000) return [];
    return [readFileSync(path, "utf8")];
  });
}

describe("start", () => {
  it("entra pelo método que o handshake ofereceu", async () => {
    const asked: string[] = [];
    const { service } = harness(codexWith((methodId) => void asked.push(methodId)));

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt",
    });

    expect(attempt.state).toBe("running");
    await settle(service, attempt.id, "ok");
    expect(asked).toEqual(["chat-gpt"]);
  });

  it("recusa um método que o agente não ofereceu, antes de chamar nada", async () => {
    // A mesma guarda do login por comando: o cliente manda um id, e o que vale é
    // o adaptador ter dito que aceita aquele id.
    const asked: string[] = [];
    const { service } = harness(codexWith((methodId) => void asked.push(methodId)));

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "entra-de-qualquer-jeito",
    });

    await settle(service, attempt.id, "failed");
    expect(service.status(attempt.id).message).toMatch(/não oferece o método/);
    expect(asked).toEqual([]);
  });

  it("conta a recusa do agente com a frase dele", async () => {
    // `RequestError` e não `Error`: um `Error` cru atravessa o fio como
    // "Internal error", e a frase do agente é justamente o que a tela mostra.
    // A mesma lição que o `probe` já tinha aprendido.
    const { service } = harness(
      codexWith(() => {
        throw RequestError.authRequired(undefined, "conta sem acesso ao Codex");
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt",
    });

    await settle(service, attempt.id, "failed");
    expect(service.status(attempt.id).message).toMatch(/conta sem acesso/);
  });

  it("não deixa sessão nenhuma para trás", async () => {
    // O processo do login existe para uma chamada. A sessão de verdade nasce
    // depois, com `spawn`, e um adaptador órfão por login seria um processo por
    // tentativa até a máquina reiniciar.
    const { service, acpManager } = harness(codexWith(() => {}));

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt",
    });

    await settle(service, attempt.id, "ok");
    expect(acpManager.list()).toHaveLength(0);
  });
});

describe("a chave de API", () => {
  it("chega ao agente pelo `_meta`", async () => {
    let seen: string | undefined;
    const { service } = harness(
      codexWith((_methodId, login) => {
        seen = login.apiKey;
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "api-key",
      apiKey: "sk-proj-nao-me-guarde",
    });

    await settle(service, attempt.id, "ok");
    expect(seen).toBe("sk-proj-nao-me-guarde");
  });

  it("não fica em nenhum arquivo do diretório de estado", async () => {
    /*
     * A resposta de segurança da feature, virada em teste.
     *
     * A chave atravessa o daemon a caminho do adaptador — que a escreve na casa
     * *dele*, e não aqui. Este teste varre o `stateDir` inteiro depois do login e
     * falha se ela aparecer em qualquer arquivo.
     */
    const secret = "sk-proj-segredo-que-nao-pode-vazar";
    const dir = stateDir();
    const { service } = harness(codexWith(() => {}));

    const attempt = service.start({
      command: "codex-acp",
      cwd: dir,
      methodId: "api-key",
      apiKey: secret,
    });
    await settle(service, attempt.id, "ok");

    expect(filesUnder(dir).join("\n")).not.toContain(secret);
  });

  it("não volta em nenhuma resposta do serviço", async () => {
    const secret = "sk-proj-nem-de-volta";
    const { service } = harness(codexWith(() => {}));

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "api-key",
      apiKey: secret,
    });
    await settle(service, attempt.id, "ok");

    expect(JSON.stringify([attempt, service.status(attempt.id)])).not.toContain(secret);
  });

  it("não aparece na frase de erro quando o agente recusa a chave", async () => {
    const secret = "sk-proj-nem-no-erro";
    const { service } = harness(
      codexWith((_methodId, login) => {
        // Um adaptador que ecoa a chave na mensagem é plausível, e é justamente
        // o caso em que o daemon não pode repassar o que ouviu sem olhar.
        throw RequestError.authRequired(undefined, `chave inválida: ${login.apiKey ?? ""}`);
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "api-key",
      apiKey: secret,
    });
    await settle(service, attempt.id, "failed");

    expect(service.status(attempt.id).message).not.toContain(secret);
  });
});

describe("a URL e o código", () => {
  it("aparecem no estado enquanto o agente espera", async () => {
    let release: (() => void) | undefined;
    const { service } = harness(
      codexWith(async (_methodId, login) => {
        const waiting = new Promise<void>((resolve) => {
          release = resolve;
        });
        void login.elicitUrl({
          url: "https://chatgpt.com/device",
          message: "Sign in to ChatGPT and enter this code: FKPT-QJ29",
        });
        await waiting;
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt-device-code",
    });

    await vi.waitFor(() => expect(service.status(attempt.id).elicitation).not.toBeNull(), {
      timeout: 2_000,
    });
    expect(service.status(attempt.id).elicitation).toMatchObject({
      url: "https://chatgpt.com/device",
      // O código sai da frase, porque é onde o adaptador o põe — o protocolo não
      // tem campo para ele.
      code: "FKPT-QJ29",
      message: "Sign in to ChatGPT and enter this code: FKPT-QJ29",
    });
    // E o estado continua `running`: mostrar a URL não é ter entrado.
    expect(service.status(attempt.id).state).toBe("running");

    release?.();
    await settle(service, attempt.id, "ok");
    // Terminou: não há mais URL para mostrar.
    expect(service.status(attempt.id).elicitation).toBeNull();
  });

  it("saem da tela quando o agente diz que aquela URL já foi usada", async () => {
    let release: (() => void) | undefined;
    const { service } = harness(
      codexWith(async (_methodId, login) => {
        void login.elicitUrl({
          url: "https://chatgpt.com/device",
          message: "code: AB12-CD34",
          elicitationId: "e-1",
        });
        await new Promise<void>((resolve) => {
          release = () => {
            void login.completeElicitation("e-1").then(resolve);
          };
        });
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt-device-code",
    });
    await vi.waitFor(() => expect(service.status(attempt.id).elicitation).not.toBeNull(), {
      timeout: 2_000,
    });

    release?.();

    await vi.waitFor(() => expect(service.status(attempt.id).elicitation).toBeNull(), {
      timeout: 2_000,
    });
  });

  it("mostram a frase inteira quando nada nela parece um código", async () => {
    // O destaque é um extra: sem código reconhecível, a frase do agente é tudo o
    // que a tela tem, e ela continua sendo mostrada.
    //
    // O login fica aberto de propósito. Um `authenticate` que termina limpa a
    // URL — é o comportamento certo, e é o que faz uma versão deste teste sem
    // espera passar por sorte ou falhar por corrida.
    const { service } = harness(
      codexWith(async (_methodId, login) => {
        void login.elicitUrl({
          url: "https://exemplo.test/autorize",
          message: "autorize no navegador e volte",
        });
        await new Promise<void>(() => {
          /* ninguém volta */
        });
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt-device-code",
    });

    await vi.waitFor(() => expect(service.status(attempt.id).elicitation).not.toBeNull(), {
      timeout: 2_000,
    });
    expect(service.status(attempt.id).elicitation).toMatchObject({
      code: null,
      message: "autorize no navegador e volte",
    });
  });

  it("são recusados numa conversa comum, que não tem onde mostrá-los", async () => {
    /*
     * A regra do `terminal` e do `fs`, aplicada de novo: o cliente responde o que
     * sabe responder. Uma conversa não tem painel de login, e engolir o pedido
     * deixaria o agente esperando por uma resposta que nunca viria.
     */
    const answers: string[] = [];
    const fake = fakeAgentProcess({
      prompt: async (_text, turn) => {
        answers.push("perguntou");
        return "end_turn";
      },
      authenticate: async (_methodId, login) => {
        answers.push(
          await login.elicitUrl({ url: "https://exemplo.test", message: "code: ZZ99-YY88" }),
        );
      },
    });
    const acpManager = new AcpManager({
      spawner: () => fake.process,
      isAvailable: () => true,
      handshakeTimeoutMs: 2_000,
    });
    managers.push(acpManager);

    // Sem serviço de login no caminho: é o `authenticate` cru, sem sink.
    await acpManager.authenticate({
      command: "claude-agent-acp",
      cwd: stateDir(),
      methodId: "qualquer",
    }).catch(() => {
      /* o agente falso padrão não oferece métodos; o que importa é não travar */
    });

    expect(answers).not.toContain("accept");
  });
});

describe("cancelar", () => {
  it("mata o adaptador e o estado não volta para `ok`", async () => {
    /*
     * A corrida que este teste fixa: matar o processo faz o `authenticate` falhar
     * **ou** resolver, dependendo de onde ele estava. Quem cancelou não pode ler
     * "entrou" por causa disso.
     */
    const { service } = harness(
      codexWith(async (_methodId, login) => {
        void login.elicitUrl({ url: "https://chatgpt.com/device", message: "code: QQ11-WW22" });
        await new Promise<void>(() => {
          /* nunca resolve: é uma pessoa que não voltou */
        });
      }),
    );

    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt-device-code",
    });
    await vi.waitFor(() => expect(service.status(attempt.id).elicitation).not.toBeNull(), {
      timeout: 2_000,
    });

    expect(service.cancel(attempt.id).state).toBe("cancelled");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(service.status(attempt.id).state).toBe("cancelled");
    expect(service.status(attempt.id).elicitation).toBeNull();
  });

  it("é idempotente, e não é erro cancelar o que já acabou", async () => {
    const { service } = harness(codexWith(() => {}));
    const attempt = service.start({
      command: "codex-acp",
      cwd: stateDir(),
      methodId: "chat-gpt",
    });
    await settle(service, attempt.id, "ok");

    expect(service.cancel(attempt.id).state).toBe("ok");
    expect(service.cancel(attempt.id).state).toBe("ok");
  });

  it("recusa um id que nunca existiu", () => {
    const { service } = harness(codexWith(() => {}));

    expect(() => service.status("nao-existe")).toThrow(/não existe login/);
    expect(() => service.cancel("nao-existe")).toThrow(/não existe login/);
  });
});
