import { describe, expect, it } from "vitest";

import { spawnAcpProcess } from "./process.js";

/** Tudo o que o processo escreveu até sair. */
async function outputOf(process_: ReturnType<typeof spawnAcpProcess>): Promise<string> {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  for await (const chunk of process_.stdout) chunks.push(decoder.decode(chunk));
  await process_.exited;
  return chunks.join("");
}

describe("spawnAcpProcess", () => {
  it("tira do ambiente herdado do daemon o que a invocação manda tirar", async () => {
    /*
     * `034` T5: a conta sem diretório sobe com a variável do CLI **ausente**, e
     * o merge com `process.env` a traria de volta se o daemon tivesse uma — um
     * Lumem aberto de dentro de um terminal com `CLAUDE_CONFIG_DIR` exportado
     * subiria a conta 1 no diretório de outra pessoa. `HOME` faz o papel da
     * variável aqui porque ele já está no ambiente de quem roda o teste, e mudar
     * `process.env` num teste é regressão conhecida (`testing.md`).
     */
    expect(process.env.HOME).toBeTruthy();

    const child = spawnAcpProcess({
      command: "/bin/sh",
      args: ["-c", 'printf "%s|%s" "${HOME-ausente}" "$DA_CONTA"'],
      cwd: "/",
      env: { DA_CONTA: "sim" },
      unsetEnv: ["HOME"],
    });

    expect(await outputOf(child)).toBe("ausente|sim");
  });

  it("sem nada a tirar, herda o ambiente do daemon como sempre", async () => {
    const child = spawnAcpProcess({
      command: "/bin/sh",
      args: ["-c", 'printf "%s" "${HOME-ausente}"'],
      cwd: "/",
    });

    expect(await outputOf(child)).toBe(process.env.HOME);
  });
});
