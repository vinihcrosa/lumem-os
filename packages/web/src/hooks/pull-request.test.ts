import { describe, expect, it } from "vitest";

import type { PrStatus } from "@lumem/shared";

import { POLL_BUSY_MS, POLL_IDLE_MS, pollIntervalFor } from "./usePullRequest.js";

/**
 * O ritmo, e as duas pausas que fazem a conta fechar.
 *
 * Poll é a única opção real: nem GitHub nem GitLab entregam webhook para uma
 * máquina sem endereço, e `gh` não tem *watch*. Então o que separa "consulta
 * com ritmo" de "tempestade de processos" é este punhado de decisões — e elas
 * são testadas aqui, e não dentro do hook, porque o painel fechado hoje já
 * desmonta a coluna inteira: o requisito estaria satisfeito por acidente de
 * montagem, e o teste passaria sem provar nada.
 */

function status(running: number): PrStatus {
  return {
    pull: {
      number: 19,
      url: null,
      title: "t",
      verdict: running > 0 ? "pending" : "ready",
      reason: { kind: "ready", passed: 0, approvedBy: [] },
      counts: { failed: 0, running, passed: 0, skipped: 0 },
      checks: [],
      base: "main",
      head: "pr-bar",
      updatedAt: "2026-09-05T12:00:00Z",
      author: "pessoa-1",
      alsoOpen: 0,
    },
    failure: null,
    readAt: "2026-09-05T12:00:00Z",
    host: "github.com",
    branch: "pr-bar",
    base: "main",
    published: true,
    compareUrl: null,
    merge: { merge: true, squash: true, rebase: true, deleteBranchOnMerge: false },
  };
}

describe("as duas pausas", () => {
  it("janela oculta não consulta", () => {
    expect(pollIntervalFor({ visible: false, panelOpen: true, status: status(0) })).toBe(false);
  });

  it("painel colapsado não consulta", () => {
    // E o painel **nasce** colapsado, então esta é a pausa que vale mais:
    // consultar para ninguém ver é processo gasto.
    expect(pollIntervalFor({ visible: true, panelOpen: false, status: status(0) })).toBe(false);
  });

  it("as duas pausas valem sozinhas, e não só juntas", () => {
    expect(pollIntervalFor({ visible: false, panelOpen: false, status: status(2) })).toBe(false);
  });
});

describe("o ritmo adaptativo", () => {
  it("com verificação rodando, pergunta de novo em segundos", () => {
    expect(pollIntervalFor({ visible: true, panelOpen: true, status: status(2) })).toBe(
      POLL_BUSY_MS,
    );
  });

  it("sem nada rodando, o que muda é gente — e gente é mais lenta que CI", () => {
    expect(pollIntervalFor({ visible: true, panelOpen: true, status: status(0) })).toBe(
      POLL_IDLE_MS,
    );
  });

  it("antes de saber qualquer coisa, o ritmo lento", () => {
    expect(pollIntervalFor({ visible: true, panelOpen: true, status: undefined })).toBe(
      POLL_IDLE_MS,
    );
  });

  it("worktree sem PR não acelera o relógio", () => {
    const semPr = { ...status(0), pull: null };
    expect(pollIntervalFor({ visible: true, panelOpen: true, status: semPr })).toBe(POLL_IDLE_MS);
  });
});
