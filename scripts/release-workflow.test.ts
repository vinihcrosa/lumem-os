import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import { DESKTOP_PLATFORMS } from "../packages/shared/src/desktop.js";

/**
 * O `release.yml` e o que ele faz com o app de desktop (`038`, AC 68).
 *
 * Um workflow só roda numa tag, e errar nele custa um nome no npm que não volta. Esta é a
 * metade que dá para provar sem publicar nada: o **desenho** — quais jobs, em qual ordem,
 * com qual bandeira. A outra metade, que o pacote instala e o app abre, é o `smoke:install
 * --only desktop`.
 *
 * O arquivo é lido como YAML, e não por regex: o que se afirma é a estrutura (o `needs`, a
 * matriz), e um passo que sumisse por uma indentação torta não pode continuar casando.
 */

interface Step {
  name?: string;
  uses?: string;
  run?: string;
  if?: string;
  with?: Record<string, unknown>;
}
interface Job {
  needs?: string | string[];
  "runs-on"?: string;
  strategy?: { matrix?: { include?: { os: string; platform: string; arch: string }[] } };
  steps: Step[];
}
interface Workflow {
  jobs: Record<string, Job>;
}

const workflow = parse(readFileSync(join(import.meta.dirname, "..", ".github/workflows/release.yml"), "utf8")) as Workflow;

const needs = (job: Job): string[] => (job.needs === undefined ? [] : [job.needs].flat());
const runs = (job: Job): string => job.steps.map((step) => step.run ?? "").join("\n");

describe("o release do app de desktop", () => {
  it("publishes the four desktop packages and attaches their artifacts", () => {
    const desktop = workflow.jobs["desktop"];
    const publish = workflow.jobs["publish"];
    expect(desktop).toBeDefined();
    expect(publish).toBeDefined();
    if (desktop === undefined || publish === undefined) return;

    // Um job por plataforma e arquitetura — as quatro do ADR, e só elas.
    const matrix = desktop.strategy?.matrix?.include ?? [];
    expect(matrix.map((entry) => `${entry.platform}-${entry.arch}`).sort()).toEqual([...DESKTOP_PLATFORMS].sort());
    // O macOS no runner de macOS, o Linux no de Linux: o `electron-builder` empacota o Linux
    // das duas arquiteturas num runner x64 (o cross-arch que a documentação dele descreve),
    // e o macOS das duas num runner arm64.
    for (const entry of matrix) {
      expect(entry.os.startsWith(entry.platform === "darwin" ? "macos" : "ubuntu"), entry.os).toBe(true);
    }
    expect(runs(desktop)).toContain("--platform ${{ matrix.platform }} --arch ${{ matrix.arch }}");

    // A publicação espera os quatro pacotes existirem: um release não sai com o app faltando.
    expect(needs(publish)).toEqual(expect.arrayContaining(["package", "smoke", "desktop"]));

    // `npm publish` de **cada** tarball do app, com proveniência, e antes do pacote do
    // daemon: quem instala o `lumem` novo e roda `menubar install` já encontra o app dele.
    const steps = publish.steps;
    const desktopStep = steps.findIndex((step) => /npm publish/.test(step.run ?? "") && /desktop\//.test(step.run ?? ""));
    const daemonStep = steps.findIndex((step) => /npm publish "\$\{\{ needs\.package\.outputs\.tarball \}\}"/.test(step.run ?? ""));
    expect(desktopStep).toBeGreaterThanOrEqual(0);
    expect(daemonStep).toBeGreaterThan(desktopStep);
    expect(steps[desktopStep]?.run).toContain("--provenance");
    expect(steps[desktopStep]?.run).toContain("--access public");
    // O laço cobre todos os tarballs que o download trouxe, e não uma lista escrita à mão.
    expect(steps[desktopStep]?.run).toMatch(/for \w+ in desktop\/\*\/\*\.tgz/);

    // O download junta os artefatos dos quatro jobs.
    const download = steps.find((step) => step.uses?.startsWith("actions/download-artifact") && step.with?.["pattern"] === "desktop-*");
    expect(download?.with?.["merge-multiple"]).toBe(true);

    // A release anexa `.zip` (macOS) e `.AppImage` e `.deb` (Linux), de cada arquitetura.
    const release = steps.find((step) => /gh release create/.test(step.run ?? ""));
    for (const extension of ["zip", "AppImage", "deb"]) expect(release?.run, extension).toContain(`desktop/assets/*.${extension}`);
  });

  it("checks the desktop manifest against the tag, like the daemon's", () => {
    // Quatro pacotes publicados numa versão e o CLI pedindo outra: o `version:set` mantém os
    // dois iguais, e o release confere antes de empacotar.
    const script = runs(workflow.jobs["package"] as Job);
    expect(script).toContain("packages/desktop/package.json");
    expect(script).toMatch(/desktop.*!=.*version|version.*!=.*desktop/s);
  });

  it("starts the app on the runner whose machine it targets, and never publishes from the smoke", () => {
    const desktop = workflow.jobs["desktop"] as Job;
    const smoke = desktop.steps.find((step) => /smoke:install --only desktop/.test(step.run ?? ""));
    expect(smoke).toBeDefined();
    // Só onde o pacote roda de verdade: o `darwin-arm64` no runner arm64 e o `linux-x64` no x64.
    expect(smoke?.if).toContain("darwin");
    expect(smoke?.if).toContain("linux");
    // Sem `xvfb` o Electron do Linux não tem onde abrir a janela.
    expect(runs(desktop)).toContain("xvfb");
    expect(runs(desktop)).not.toContain("npm publish");
  });
});
