import { describe, expect, it, vi } from "vitest";

import { MAX_BATCH_URL_LENGTH, travelsAlone, trpc } from "./trpc.js";

describe("o que viaja fora do lote", () => {
  // Medido no app de verdade (034 T18): o `setup.probe` sobe o adaptador e leva
  // de 4 a 9 s, e no mesmo lote segurava `workspace.slots`, `agentAccount.list`
  // e as listas de sessão — a tela inteira esperava o adaptador.
  it("o probe, que sobe um adaptador, não segura as consultas rápidas", () => {
    expect(travelsAlone("setup.probe")).toBe(true);
  });

  it("o que espera uma pessoa ou sobe um processo também viaja sozinho", () => {
    for (const path of ["setup.authenticate", "setup.installAdapter", "session.createAgent", "session.continueIn", "worktree.start"]) {
      expect(travelsAlone(path)).toBe(true);
    }
  });

  it("consulta rápida continua no lote", () => {
    for (const path of ["workspace.slots", "agentAccount.list", "session.listByScope", "health"]) {
      expect(travelsAlone(path)).toBe(false);
    }
  });
});

describe("o lote que não cabe numa URL", () => {
  // Medido no CI da `035`: com as worktrees do `repo-acp` na sidebar, o lote de
  // `session.listByScope` chegou a 16 090 caracteres de URL, o servidor HTTP do
  // Node respondeu `431` (a linha de requisição conta no teto de cabeçalho), o
  // corpo veio vazio e a sidebar mostrou *"Unexpected end of JSON input"* no
  // lugar das worktrees.
  it("sessenta consultas no mesmo tique viram lotes que cabem no teto", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        urls.push(url);
        const paths = new URL(url, "http://daemon").pathname.replace("/trpc/", "").split(",");
        return new Response(JSON.stringify(paths.map(() => ({ result: { data: [] } }))), {
          headers: { "content-type": "application/json" },
        });
      }),
    );
    try {
      const scope = `/home/runner/work/lumem-os/lumem-os/.lumem-e2e/workspaces/e2e/repo-acp/worktrees/`;
      const calls = Array.from({ length: 60 }, (_, index) =>
        trpc.session.listByScope.query({ worktreePath: `${scope}worktree-${index}` } as never),
      );
      await Promise.all(calls);

      expect(urls.length).toBeGreaterThan(1);
      for (const url of urls) expect(url.length).toBeLessThanOrEqual(MAX_BATCH_URL_LENGTH);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
