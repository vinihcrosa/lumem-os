# Workspaces — setup, run e teardown

O Lumem é desenvolvido em vários worktrees ao mesmo tempo, abertos por harnesses
diferentes (Superset, Conductor, ou `git worktree` na mão). Os três passos de
ciclo de vida — preparar, subir, descartar — vivem **num lugar só**, em
`scripts/workspace/`. Cada harness só aponta para lá.

## Os arquivos

| Arquivo | O quê |
|---|---|
| `scripts/workspace/env.sh` | Identidade do workspace: slug, state dir, par de portas. Sourced pelos outros três |
| `scripts/workspace/setup.sh` | Node ≥ 22, `pnpm install --frozen-lockfile`, chromium do playwright, state dir |
| `scripts/workspace/run.sh` | Resolve as portas e faz `exec pnpm dev` |
| `scripts/workspace/teardown.sh` | Apaga o state dir deste workspace, com três guardas antes do `rm -rf` |
| `scripts/workspace/pick-ports.mjs` | Par de portas livre derivado do caminho do worktree, para quando o harness não reserva nenhuma |

## Quem aponta para eles

| Harness | Arquivo | Mapeamento |
|---|---|---|
| Superset | `.superset/config.json` | `setup` / `run` / `teardown` |
| Conductor | `.conductor/settings.toml` | `scripts.setup` / `scripts.run.dev.command` / `scripts.archive` |
| À mão | — | `bash scripts/workspace/setup.sh` e depois `run.sh` |

Nenhum dos dois arquivos de configuração tem lógica. Se um passo mudar, ele muda
em `scripts/workspace/` e vale para os dois na mesma hora.

## O que é isolado por workspace, e por quê

O daemon tem duas coisas globais que não sobrevivem a dois worktrees ao mesmo
tempo:

- **as portas** (`4317`/`4318` por default) — dois `pnpm dev` disputariam a
  mesma;
- **o state dir** (`~/.lumem`, com o banco e as worktrees que o daemon cria) —
  dois daemons escreveriam no mesmo banco.

Por isso `env.sh` deriva os dois do caminho absoluto do worktree (não do nome:
dois workspaces podem se chamar igual em projetos diferentes). O state dir vira
`~/.lumem-dev/<nome>-<hash>`, **fora** do checkout — o PRD exige que
`worktree.path` fique fora de `project.path`, e o git reclama de worktree dentro
de worktree.

As portas seguem uma ordem de preferência:

1. `LUMEM_PORT` / `LUMEM_WEB_PORT` já definidos no ambiente — quem chamou manda;
2. `CONDUCTOR_PORT` — o Conductor reserva dez portas por workspace e é essa
   reserva que a UI dele mostra e encaminha; usar a dele é melhor que sortear
   por fora;
3. `pick-ports.mjs` — hash do caminho na faixa `43000+`, sondando para a frente
   se a porta derivada estiver ocupada. É o caminho do Superset, que não reserva
   nada.

O par é estável entre execuções, então o bookmark do navegador continua valendo.

## Limitação conhecida

O `pnpm gate:full` usa portas fixas para o e2e (`4417`–`4419`, em `ports.json`),
que **não** são derivadas do workspace. Dois workspaces rodando `gate:full` ao
mesmo tempo colidem. `pnpm dev` em paralelo, esse sim, é seguro — é o que o
`run_mode = "concurrent"` do Conductor declara.
