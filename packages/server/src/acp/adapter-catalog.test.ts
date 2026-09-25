import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { ADAPTERS, CLAUDE_ADAPTER, CODEX_ADAPTER } from "@lumem/shared";
import type { AcpCommand, AcpConfigOption, AdapterSpec } from "@lumem/shared";

import { ADAPTER_CATALOG_FILE, AdapterCatalog } from "./adapter-catalog.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * O catálogo de adaptador (`033` §3.1, T7).
 *
 * É cache: o que este arquivo mais cobra é que ele **nunca** derruba o daemon
 * (corrompido lê vazio) e que ele **nunca** mente sobre um adaptador que mudou
 * (pino trocado invalida). O resto é o que a web lê dele.
 */

/**
 * O `writeAtomically` de verdade, com um freio opcional na **próxima** chamada.
 * Só o teste da fila o usa; os outros passam direto para o disco.
 */
const writes = vi.hoisted(() => {
  const state = {
    hold: null as Promise<void> | null,
    entered: Promise.resolve(),
    signalEntered: () => {},
  };
  state.entered = new Promise<void>((resolve) => {
    state.signalEntered = resolve;
  });
  return state;
});

vi.mock("../files/FileService.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../files/FileService.js")>();
  return {
    ...real,
    writeAtomically: async (...args: Parameters<typeof real.writeAtomically>) => {
      const hold = writes.hold;
      writes.hold = null;
      if (hold !== null) {
        writes.signalEntered();
        await hold;
      }
      return real.writeAtomically(...args);
    },
  };
});

afterEach(() => {
  cleanupGitFixtures();
});

const MODEL: AcpConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "opus[1m]",
  choices: [
    { value: "opus[1m]", name: "Opus" },
    { value: "haiku", name: "Haiku" },
  ],
};

const EFFORT: AcpConfigOption = {
  id: "effort",
  name: "Effort",
  category: "thought_level",
  currentValue: "xhigh",
  choices: [
    { value: "low", name: "Low" },
    { value: "xhigh", name: "Extra high" },
  ],
};

const REVIEW: AcpCommand = { name: "review", description: "Review the diff", takesInput: false };
const PLAN: AcpCommand = { name: "plan", description: "Plan the work", takesInput: true };

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

function fixture(adapters: readonly AdapterSpec[] = ADAPTERS) {
  const stateDir = tempDir("lumem-adapter-catalog-");
  const open = (specs: readonly AdapterSpec[] = adapters) =>
    new AdapterCatalog({ stateDir, adapters: specs, now: () => 1_000 });
  return { stateDir, file: join(stateDir, ADAPTER_CATALOG_FILE), open };
}

function claudeOf(catalog: AdapterCatalog, projectId?: string) {
  const reading = catalog.view(projectId).find((entry) => entry.adapterId === "claude");
  if (reading === undefined) throw new Error("claude missing from the view");
  return reading;
}

describe("persistir e reler", () => {
  it("o que foi gravado volta num catálogo novo sobre o mesmo diretório", async () => {
    const { open } = fixture();
    const first = open();
    await first.load();

    await first.recordOptions("claude", [MODEL, EFFORT], {
      authRequired: true,
      optionsByModel: { haiku: [{ ...MODEL, currentValue: "haiku" }] },
    });
    await first.recordCommands("claude", "project-a", [REVIEW]);

    const second = open();
    await second.load();

    expect(claudeOf(second, "project-a")).toEqual({
      adapterId: "claude",
      label: CLAUDE_ADAPTER.label,
      authRequired: true,
      configOptions: [MODEL, EFFORT],
      optionsByModel: { haiku: [{ ...MODEL, currentValue: "haiku" }] },
      commands: [REVIEW],
    });
  });

  it("grava em `_system/adapter-catalog.json`, `0600`, com o pino da captura", async () => {
    const { open, file } = fixture();
    const catalog = open();
    await catalog.load();

    await catalog.recordOptions("claude", [MODEL], { authRequired: false });

    expect(statSync(file).mode & 0o777).toBe(0o600);
    const onDisk = JSON.parse(readFileSync(file, "utf8")) as Record<string, { adapterVersion: string }>;
    expect(onDisk.claude?.adapterVersion).toBe(CLAUDE_ADAPTER.pinnedVersion);
  });

  it("uma gravação lenta não sobrescreve a mais nova que chegou depois dela", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();

    // A primeira gravação fica presa depois de já ter tirado o retrato
    // (`{claude}`). Sem fila, a segunda escreve `{claude, codex}`, e a primeira,
    // solta depois, faz `rename` por cima: memória certa, próximo boot errado.
    let release!: () => void;
    writes.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const first = catalog.recordOptions("claude", [MODEL], { authRequired: false });
    await writes.entered;
    const second = catalog.recordOptions("codex", [EFFORT], { authRequired: true });
    // Com fila, a segunda nunca chega ao disco enquanto a primeira está presa,
    // e a espera abaixo só não trava o teste — o resultado não depende dela.
    // Sem fila, ela termina sozinha, e é por ela que se espera.
    await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 100))]);
    release();
    await Promise.all([first, second]);

    const reread = open();
    await reread.load();
    expect(reread.view().find((entry) => entry.adapterId === "codex")?.configOptions).toEqual([
      EFFORT,
    ]);
    expect(claudeOf(reread).configOptions).toEqual([MODEL]);
  });

  it("gravar as opções padrão sem `optionsByModel` preserva as que o probe percorreu (M1a)", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();
    const haiku = [{ ...MODEL, currentValue: "haiku" }];

    await catalog.recordOptions("claude", [MODEL, EFFORT], {
      authRequired: true,
      optionsByModel: { haiku },
    });
    // A sessão real só conhece o `session/new`: se ela apagasse o que o probe
    // percorreu, toda conversa aberta devolveria a pílula ao effort do padrão.
    await catalog.recordOptions("claude", [MODEL, EFFORT], { authRequired: false });

    expect(claudeOf(catalog)).toMatchObject({ authRequired: false, optionsByModel: { haiku } });
  });
});

describe("arquivo corrompido", () => {
  it("lê vazio sem lançar", async () => {
    const { open, file } = fixture();
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, "{ isto não é json");

    const catalog = open();
    await expect(catalog.load()).resolves.toBeUndefined();

    expect(claudeOf(catalog, "project-a")).toEqual({
      adapterId: "claude",
      label: CLAUDE_ADAPTER.label,
      authRequired: null,
      configOptions: [],
      optionsByModel: {},
      commands: [],
    });
  });

  it("uma entrada com forma errada cai sozinha, e a vizinha fica", async () => {
    const { open, file } = fixture();
    const writer = open();
    await writer.load();
    await writer.recordOptions("codex", [EFFORT], { authRequired: true });
    const onDisk = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    onDisk.claude = { adapterId: "claude", configOptions: "não é lista" };
    writeFileSync(file, JSON.stringify(onDisk));

    const catalog = open();
    await catalog.load();

    expect(claudeOf(catalog).authRequired).toBeNull();
    expect(catalog.view().find((entry) => entry.adapterId === "codex")?.configOptions).toEqual([
      EFFORT,
    ]);
  });

  it("sem arquivo nenhum, é o catálogo vazio", async () => {
    const { open } = fixture();
    const catalog = open();

    await catalog.load();

    expect(catalog.view().map((entry) => entry.adapterId)).toEqual(ADAPTERS.map((spec) => spec.id));
    expect(catalog.view().every((entry) => entry.authRequired === null)).toBe(true);
  });
});

describe("pino trocado", () => {
  const pinned = (version: string): AdapterSpec[] => [
    { ...CLAUDE_ADAPTER, pinnedVersion: version },
    CODEX_ADAPTER,
  ];

  it("invalida a entrada gravada sob o pino anterior", async () => {
    const { open } = fixture(pinned("1.0.0"));
    const before = open();
    await before.load();
    await before.recordOptions("claude", [MODEL], { authRequired: false });
    await before.recordOptions("codex", [EFFORT], { authRequired: false });

    const after = open(pinned("2.0.0"));
    await after.load();

    expect(claudeOf(after)).toMatchObject({ authRequired: null, configOptions: [] });
    // Só a do pino que mudou: o Codex não trocou de versão.
    expect(after.view().find((entry) => entry.adapterId === "codex")?.configOptions).toEqual([
      EFFORT,
    ]);
  });

  it("com o mesmo pino, a entrada fica", async () => {
    const { open } = fixture(pinned("1.0.0"));
    const before = open();
    await before.load();
    await before.recordOptions("claude", [MODEL], { authRequired: false });

    const again = open(pinned("1.0.0"));
    await again.load();

    expect(claudeOf(again).configOptions).toEqual([MODEL]);
  });

  it("id sem spec grava sem pino, e cai no dia em que ganhar uma", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();
    await catalog.recordOptions("fake-agent", [MODEL], { authRequired: false });

    const reread = open();
    await reread.load();
    expect(reread.view().map((entry) => entry.adapterId)).toEqual([
      ...ADAPTERS.map((spec) => spec.id),
      "fake-agent",
    ]);
    expect(reread.view().at(-1)).toMatchObject({ label: "fake-agent", configOptions: [MODEL] });

    const withSpec = open([...ADAPTERS, { ...CODEX_ADAPTER, id: "fake-agent" }]);
    await withSpec.load();
    expect(withSpec.view().at(-1)).toMatchObject({ adapterId: "fake-agent", configOptions: [] });
  });
});

describe("onChange", () => {
  it("dispara quando o conteúdo muda, e não quando a mesma coisa chega de novo", async () => {
    const { open, file } = fixture();
    const catalog = open();
    await catalog.load();
    const changed: string[] = [];
    catalog.onChange((adapterId) => changed.push(adapterId));

    await catalog.recordOptions("claude", [MODEL, EFFORT], { authRequired: true });
    const writtenOnce = readFileSync(file, "utf8");
    // Cópia, e não o mesmo objeto: é o que um segundo `session/new` entrega.
    await catalog.recordOptions("claude", copy([MODEL, EFFORT]), { authRequired: true });

    expect(changed).toEqual(["claude"]);
    expect(readFileSync(file, "utf8")).toBe(writtenOnce);

    await catalog.recordOptions("claude", [MODEL, EFFORT], { authRequired: false });
    expect(changed).toEqual(["claude", "claude"]);
  });

  it("a mesma chave em outra ordem é o mesmo conteúdo", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();
    const changed: string[] = [];
    catalog.onChange((adapterId) => changed.push(adapterId));

    await catalog.recordOptions("claude", [MODEL], { authRequired: true });
    const { choices, currentValue, category, name, id } = MODEL;
    await catalog.recordOptions("claude", [{ choices, currentValue, category, name, id }], {
      authRequired: true,
    });

    expect(changed).toEqual(["claude"]);
  });

  it("comandos iguais não disparam; comandos novos disparam", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();
    const changed: string[] = [];
    catalog.onChange((adapterId) => changed.push(adapterId));

    await catalog.recordCommands("codex", "project-a", [REVIEW]);
    await catalog.recordCommands("codex", "project-a", copy([REVIEW]));
    await catalog.recordCommands("codex", "project-a", [REVIEW, PLAN]);

    expect(changed).toEqual(["codex", "codex"]);
  });

  it("quem cancela a inscrição para de ouvir", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();
    const changed: string[] = [];
    const stop = catalog.onChange((adapterId) => changed.push(adapterId));

    stop();
    await catalog.recordOptions("claude", [MODEL], { authRequired: true });

    expect(changed).toEqual([]);
  });
});

describe("comandos por projeto", () => {
  it("cada projeto lê os seus, e quem não pediu projeto lê nenhum", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();

    await catalog.recordCommands("claude", "project-a", [REVIEW]);
    await catalog.recordCommands("claude", "project-b", [PLAN]);

    expect(claudeOf(catalog, "project-a").commands).toEqual([REVIEW]);
    expect(claudeOf(catalog, "project-b").commands).toEqual([PLAN]);
    expect(claudeOf(catalog, "project-never-seen").commands).toEqual([]);
    expect(claudeOf(catalog).commands).toEqual([]);
  });

  it("gravar comandos antes de qualquer opção não inventa `authRequired`", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();

    await catalog.recordCommands("claude", "project-a", [REVIEW]);

    expect(claudeOf(catalog, "project-a")).toMatchObject({
      authRequired: null,
      configOptions: [],
      commands: [REVIEW],
    });
  });

  it("gravar opções depois não apaga os comandos", async () => {
    const { open } = fixture();
    const catalog = open();
    await catalog.load();

    await catalog.recordCommands("claude", "project-a", [REVIEW]);
    await catalog.recordOptions("claude", [MODEL], { authRequired: false });

    expect(claudeOf(catalog, "project-a").commands).toEqual([REVIEW]);
  });
});
