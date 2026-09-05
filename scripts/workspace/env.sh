# shellcheck shell=bash
#
# Identidade do workspace. Sourced pelos três scripts de ciclo de vida.
#
# Um workspace é um worktree git próprio — criado pelo Superset, pelo Conductor
# ou à mão. O que este arquivo resolve é onde o daemon deste worktree escreve e
# em que portas ele escuta.
#
# Nada aqui conhece harness específico além de ler a porta que ele oferecer:
# `.superset/config.json` e `.conductor/settings.toml` só apontam para estes
# scripts.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Do caminho absoluto, não do nome: dois workspaces podem se chamar igual em
# projetos diferentes, mas ocupam caminhos diferentes.
if command -v shasum >/dev/null 2>&1; then
  WORKSPACE_HASH="$(printf '%s' "$REPO_ROOT" | shasum -a 256 | cut -c1-8)"
elif command -v sha256sum >/dev/null 2>&1; then
  WORKSPACE_HASH="$(printf '%s' "$REPO_ROOT" | sha256sum | cut -c1-8)"
else
  echo "erro: preciso de shasum ou sha256sum para identificar o workspace" >&2
  exit 1
fi

WORKSPACE_NAME="$(printf '%s' "$(basename "$REPO_ROOT")" | tr -c 'A-Za-z0-9._-' '-')"
WORKSPACE_SLUG="${WORKSPACE_NAME}-${WORKSPACE_HASH}"

# O ambiente de desenvolvimento, um só, ao lado do de produção.
#
# `~/.lumem` é o estado do Lumem instalado — os projetos de verdade de quem usa
# a máquina. O desenvolvimento escreve em `~/.lumem-dev/shared`, que tem a mesma
# forma e banco próprio: dá para cadastrar os projetos reais uma vez e continuar
# achando eles amanhã, em qualquer worktree, sem que um bug em desenvolvimento
# escreva no estado que o usuário depende.
#
# Compartilhado entre os worktrees de propósito. State dir por workspace começa
# vazio toda vez, e um ambiente que esquece os projetos a cada branch nova não
# serve para testar o produto com projeto de verdade.
#
# Fora do checkout, também de propósito: o daemon cria as worktrees dele dentro
# do state dir, e um state dir dentro do repositório colocaria worktree de git
# dentro de worktree de git — o PRD exige que `worktree.path` fique fora de
# `project.path`, e o próprio git reclama.
LUMEM_DEV_HOME="${LUMEM_DEV_HOME:-$HOME/.lumem-dev}"

# `LUMEM_ISOLATED=1` devolve o comportamento antigo: state dir e portas só deste
# worktree. É o que dois `run.sh` ao mesmo tempo exigem — e é o único modo em
# que o teardown apaga alguma coisa.
if [ -n "${LUMEM_ISOLATED:-}" ]; then
  LUMEM_DEV_MODE="isolated"
  LUMEM_STATE_DIR="${LUMEM_STATE_DIR:-$LUMEM_DEV_HOME/workspaces/$WORKSPACE_SLUG}"
else
  LUMEM_DEV_MODE="shared"
  LUMEM_STATE_DIR="${LUMEM_STATE_DIR:-$LUMEM_DEV_HOME/shared}"
fi

# Só para a linha de log: qual harness abriu este workspace.
if [ -n "${CONDUCTOR_WORKSPACE_ID:-}" ]; then
  WORKSPACE_HARNESS="conductor"
elif [ -n "${SUPERSET_WORKSPACE_ID:-}" ] || [ -n "${SUPERSET_WORKSPACE_PATH:-}" ]; then
  WORKSPACE_HARNESS="superset"
else
  WORKSPACE_HARNESS="local"
fi

export REPO_ROOT WORKSPACE_SLUG WORKSPACE_HARNESS LUMEM_DEV_HOME LUMEM_DEV_MODE LUMEM_STATE_DIR

# Define LUMEM_PORT e LUMEM_WEB_PORT.
#
# No modo compartilhado são as portas default do repositório (`ports.json`,
# 4317/4318): é uma instalação de desenvolvimento só, e o endereço dela não
# muda de worktree para worktree — o bookmark do navegador vale sempre, e a
# porta que aparece na documentação é a que está rodando.
#
# No modo isolado o par sai da reserva do harness, quando existe: o Conductor
# reserva dez portas por workspace e o próprio Lumem reserva um bloco por
# checkout, e é essa reserva que a UI deles mostra e encaminha. Sem reserva,
# `pick-ports.mjs` deriva um par livre do caminho do worktree.
resolve_ports() {
  local ports
  if [ -n "${LUMEM_PORT:-}" ] && [ -n "${LUMEM_WEB_PORT:-}" ]; then
    :
  elif [ "$LUMEM_DEV_MODE" = "shared" ]; then
    ports="$(node "$REPO_ROOT/scripts/workspace/default-ports.mjs" "$REPO_ROOT/ports.json")"
    LUMEM_PORT="${ports% *}"
    LUMEM_WEB_PORT="${ports#* }"
  elif [ -n "${LUMEM_RUN_PORT:-}" ]; then
    LUMEM_PORT="$LUMEM_RUN_PORT"
    LUMEM_WEB_PORT="$((LUMEM_RUN_PORT + 1))"
  elif [ -n "${CONDUCTOR_PORT:-}" ]; then
    LUMEM_PORT="$CONDUCTOR_PORT"
    LUMEM_WEB_PORT="$((CONDUCTOR_PORT + 1))"
  else
    ports="$(node "$REPO_ROOT/scripts/workspace/pick-ports.mjs" "$REPO_ROOT")"
    LUMEM_PORT="${ports% *}"
    LUMEM_WEB_PORT="${ports#* }"
  fi

  export LUMEM_PORT LUMEM_WEB_PORT
}
