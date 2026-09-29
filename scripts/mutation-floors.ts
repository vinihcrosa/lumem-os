/**
 * Os pisos de mutação por arquivo (T14 da 024-dev-harness): o score medido em 2026-09-28, menos dois
 * pontos, arredondado para baixo. **Só sobem** — um arquivo que passar a matar mais mutantes sobe o piso
 * no mesmo commit. Gerado do primeiro relatório do Stryker; editado à mão daqui em diante.
 */
export const MUTATION_FLOORS: Readonly<Record<string, number>> = {
  "packages/server/src/files/FileService.ts": 60, // medido 62.02, 574 mutantes
  "packages/server/src/files/path-guard.ts": 67, // medido 69.67, 211 mutantes
  "packages/server/src/git/CloneJobStore.ts": 75, // medido 77.78, 171 mutantes
  "packages/server/src/git/GitService.ts": 78, // medido 80.16, 756 mutantes
  "packages/server/src/git/clone-plan.ts": 80, // medido 82.22, 45 mutantes
  "packages/server/src/git/clone.ts": 66, // medido 68.85, 244 mutantes
  "packages/server/src/git/exec.ts": 82, // medido 84.62, 39 mutantes
  "packages/server/src/git/git-url.ts": 77, // medido 79.68, 251 mutantes
  "packages/server/src/git/managed-dir.ts": 68, // medido 70.73, 41 mutantes
  "packages/server/src/memory/MemoryService.ts": 74, // medido 76.09, 435 mutantes
  "packages/server/src/memory/access.ts": 86, // medido 88.41, 69 mutantes
  "packages/server/src/memory/auto-learn.ts": 55, // medido 57.8, 173 mutantes
  "packages/server/src/memory/capture.ts": 46, // medido 48.96, 96 mutantes
  "packages/server/src/memory/catalog.ts": 85, // medido 87.9, 124 mutantes
  "packages/server/src/memory/cli.ts": 66, // medido 68.75, 320 mutantes
  "packages/server/src/memory/core.ts": 76, // medido 78.12, 64 mutantes
  "packages/server/src/memory/distiller.ts": 45, // medido 47.32, 112 mutantes
  "packages/server/src/memory/entry.ts": 69, // medido 71.21, 132 mutantes
  "packages/server/src/memory/evidence.ts": 81, // medido 83.87, 62 mutantes
  "packages/server/src/memory/gate.ts": 75, // medido 77.19, 57 mutantes
  "packages/server/src/memory/home.ts": 91, // medido 93.38, 136 mutantes
  "packages/server/src/memory/http.ts": 44, // medido 46.6, 103 mutantes
  "packages/server/src/memory/main-cli.ts": 0, // medido 0.0, 6 mutantes
  "packages/server/src/memory/paths.ts": 67, // medido 69.49, 118 mutantes
  "packages/server/src/memory/playbook-telemetry.ts": 75, // medido 77.27, 44 mutantes
  "packages/server/src/memory/playbook-tracking.ts": 58, // medido 60.0, 15 mutantes
  "packages/server/src/memory/playbook.ts": 58, // medido 60.53, 228 mutantes
  "packages/server/src/memory/preamble.ts": 63, // medido 65.67, 67 mutantes
  "packages/server/src/memory/project-identity.ts": 71, // medido 73.27, 217 mutantes
  "packages/server/src/memory/projection.ts": 80, // medido 82.19, 73 mutantes
  "packages/server/src/memory/proposals.ts": 86, // medido 88.14, 59 mutantes
  "packages/server/src/memory/recall.ts": 86, // medido 88.55, 227 mutantes
  "packages/server/src/memory/repo.ts": 83, // medido 85.11, 47 mutantes
  "packages/server/src/memory/research.ts": 52, // medido 54.88, 82 mutantes
  "packages/server/src/memory/scan.ts": 88, // medido 90.39, 229 mutantes
  "packages/server/src/memory/scope-of-session.ts": 73, // medido 75.0, 16 mutantes
  "packages/server/src/memory/shadow.ts": 84, // medido 86.21, 58 mutantes
  "packages/server/src/memory/signals.ts": 85, // medido 87.95, 83 mutantes
  "packages/server/src/memory/skill.ts": 26, // medido 28.0, 100 mutantes
};
