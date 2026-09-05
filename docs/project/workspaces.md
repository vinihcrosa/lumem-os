# Workspaces — setup, run e teardown

O Lumem é desenvolvido em vários worktrees ao mesmo tempo, abertos por harnesses
diferentes (Superset, Conductor, ou `git worktree` na mão). Os três passos de
ciclo de vida — preparar, subir, descartar — vivem **num lugar só**, em
`scripts/workspace/`. Cada harness só aponta para lá.

## Os arquivos

| Arquivo | O quê |
|---|---|
| `scripts/workspace/env.sh` | Identidade do workspace: slug, modo, state dir, par de portas. Sourced pelos outros três |
| `scripts/workspace/setup.sh` | Node ≥ 22, `pnpm install --frozen-lockfile`, chromium do playwright, state dir |
| `scripts/workspace/run.sh` | Resolve as portas, confere que estão livres e faz `exec pnpm dev:turbo` |
| `scripts/workspace/teardown.sh` | Apaga o state dir do workspace — **só no modo isolado**, e com três guardas antes do `rm -rf` |
| `scripts/workspace/default-ports.mjs` | O par default (`4317`/`4318`) lido do `ports.json`, porque `env.sh` é bash |
| `scripts/workspace/pick-ports.mjs` | Par de portas livre derivado do caminho do worktree, para quando o harness não reserva nenhuma |

## Quem aponta para eles

| Harness | Arquivo | Mapeamento |
|---|---|---|
| Superset | `.superset/config.json` | `setup` / `run` / `teardown` |
| Conductor | `.conductor/settings.toml` | `scripts.setup` / `scripts.run.dev.command` / `scripts.archive` |
| **Lumem** | `.lumem/project.toml` | `scripts.setup` / `scripts.run` / `scripts.teardown` |
| À mão | — | `bash scripts/workspace/setup.sh` e depois `run.sh` |
| **`pnpm dev`** | `package.json` | o script `dev` da raiz **é** o `run.sh`; `dev:turbo` é o `turbo dev` cru que ele executa |

Nenhum desses arquivos de configuração tem lógica. Se um passo mudar, ele muda
em `scripts/workspace/` e vale para todos na mesma hora.

> **O Lumem entrou nesta tabela em 2026-08-30**, com a
> [project-scripts](../prd/project-scripts/prd.md). Até então este repositório
> tinha três scripts de ciclo de vida que o Superset e o Conductor liam e o
> **produto não** — a ironia que abre o PRD dela. O `env.sh` continua sendo quem
> resolve portas, e agora ele tem uma terceira fonte para ler: o `LUMEM_RUN_PORT`
> que o daemon reserva por checkout, no mesmo molde do `CONDUCTOR_PORT`.

## Dois ambientes: produção e desenvolvimento

> **Mudou em 2026-08-31.** Antes cada worktree tinha state dir e portas
> próprias. O que isso custava está no fim desta seção.

O daemon guarda tudo num state dir — banco, worktrees que ele cria, memória do
workspace — e escuta num par de portas. São dois ambientes, e a diferença é só
qual state dir:

| Ambiente | State dir | Portas | Quem escreve nele |
|---|---|---|---|
| **produção** | `~/.lumem` | `4317`/`4318` | o `lumem` instalado (`npm i -g @vinihcrosa/lumem-os`) |
| **desenvolvimento** | `~/.lumem-dev/shared` | `4317`/`4318` | `scripts/workspace/run.sh`, de qualquer worktree |

Mesma forma, mesmo endereço, banco diferente. Um bug em desenvolvimento não
escreve no estado de que o uso diário depende, e os dois não sobem ao mesmo
tempo — a porta é a mesma de propósito, porque o que se quer testar é o produto,
não uma variante dele em endereço estranho.

O ambiente de dev é **um só, compartilhado por todos os worktrees**. É o que
permite cadastrar os projetos reais uma vez e continuar achando eles amanhã, em
qualquer branch: state dir por workspace nasce vazio toda vez, e ambiente que
esquece os projetos a cada branch nova não serve para testar com projeto de
verdade.

Ele fica **fora** do checkout — o PRD exige que `worktree.path` fique fora de
`project.path`, e o git reclama de worktree dentro de worktree.

`LUMEM_DEV_HOME` move a árvore de dev inteira; `LUMEM_STATE_DIR` aponta um state
dir específico e vence tudo.

> Do layout antigo sobram diretórios em `~/.lumem-dev/<nome>-<hash>`, um por
> workspace já descartado. Nada os lê mais e nada os apaga sozinho: são estado
> de dev, e apagar disco de alguém sem pedir não é trabalho de script de
> migração. `rm -rf` neles quando quiser o espaço de volta.

## O modo isolado

`LUMEM_ISOLATED=1` devolve o comportamento antigo: state dir em
`~/.lumem-dev/workspaces/<nome>-<hash>` (do caminho absoluto, não do nome: dois
workspaces podem se chamar igual em projetos diferentes) e portas próprias.

É o que **dois `run.sh` ao mesmo tempo** exigem, e é o único modo em que o
`teardown.sh` apaga alguma coisa — no compartilhado ele não tem o que apagar, e
apagar seria destruir o ambiente de dev com os projetos cadastrados nele.

As portas, no isolado, seguem a ordem de preferência antiga:

1. `LUMEM_PORT` / `LUMEM_WEB_PORT` já definidos no ambiente — quem chamou manda;
2. `LUMEM_RUN_PORT` / `CONDUCTOR_PORT` — o Lumem reserva um bloco por checkout e
   o Conductor dez portas por workspace; é essa reserva que a UI deles mostra e
   encaminha, e usar a dela é melhor que sortear por fora;
3. `pick-ports.mjs` — hash do caminho na faixa `43000+`, sondando para a frente
   se a porta derivada estiver ocupada. É o caminho do Superset, que não reserva
   nada.

No modo compartilhado só a regra 1 sobrevive: a reserva do harness é ignorada,
porque o endereço do ambiente de dev não muda de worktree para worktree.

## Limitações conhecidas

**Um `run.sh` por vez.** No modo compartilhado a porta é fixa, então o segundo
para antes de subir, com a mensagem dizendo como pedir isolamento. O
`run_mode = "concurrent"` do Conductor continua verdadeiro só com
`LUMEM_ISOLATED=1`.

**`gate:full` em paralelo colide.** O e2e usa portas fixas (`4417`–`4420`, em
`ports.json`) que não são derivadas do workspace. Dois workspaces rodando
`gate:full` ao mesmo tempo disputam as mesmas — isso não mudou.

**O que o isolamento por workspace dava, e não dá mais por default:** dois
`pnpm dev` simultâneos sem pensar. O que ele custava era o ambiente de dev
recomeçar do zero a cada worktree — nenhum projeto cadastrado, nenhuma sessão
anterior, nada para testar contra. A troca foi feita com isso na mesa.
