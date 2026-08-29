# shellcheck shell=bash
#
# Identidade do workspace. Sourced pelos três scripts de ciclo de vida.
#
# Um workspace é um worktree git próprio — criado pelo Superset, pelo Conductor
# ou à mão — e o Lumem tem duas coisas globais que não sobrevivem a dois deles
# ao mesmo tempo: as portas (4317/4318) e o state dir (~/.lumem, com o banco e
# as worktrees que o daemon cria). Tudo aqui existe para derivar um par de
# portas e um state dir que pertençam a *este* worktree e a mais nenhum.
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

# Fora do checkout, de propósito. O daemon cria as worktrees dele dentro do
# state dir, e um state dir dentro do repositório colocaria worktree de git
# dentro de worktree de git — o PRD exige que `worktree.path` fique fora de
# `project.path`, e o próprio git reclama.
LUMEM_DEV_HOME="${LUMEM_DEV_HOME:-$HOME/.lumem-dev}"
LUMEM_STATE_DIR="${LUMEM_DEV_HOME}/${WORKSPACE_SLUG}"

# Só para a linha de log: qual harness abriu este workspace.
if [ -n "${CONDUCTOR_WORKSPACE_ID:-}" ]; then
  WORKSPACE_HARNESS="conductor"
elif [ -n "${SUPERSET_WORKSPACE_ID:-}" ] || [ -n "${SUPERSET_WORKSPACE_PATH:-}" ]; then
  WORKSPACE_HARNESS="superset"
else
  WORKSPACE_HARNESS="local"
fi

export REPO_ROOT WORKSPACE_SLUG WORKSPACE_HARNESS LUMEM_DEV_HOME LUMEM_STATE_DIR

# Define LUMEM_PORT e LUMEM_WEB_PORT: um par livre e estável para este workspace.
#
# O Conductor já reserva dez portas por workspace e passa a primeira em
# CONDUCTOR_PORT — usar a reserva dele é melhor que sortear por fora, porque é
# ela que aparece na UI e no encaminhamento. O Superset não reserva nada, então
# aí o par sai de pick-ports.mjs, derivado do caminho do worktree.
resolve_ports() {
  if [ -n "${LUMEM_PORT:-}" ] && [ -n "${LUMEM_WEB_PORT:-}" ]; then
    :
  elif [ -n "${CONDUCTOR_PORT:-}" ]; then
    LUMEM_PORT="$CONDUCTOR_PORT"
    LUMEM_WEB_PORT="$((CONDUCTOR_PORT + 1))"
  else
    local ports
    ports="$(node "$REPO_ROOT/scripts/workspace/pick-ports.mjs" "$REPO_ROOT")"
    LUMEM_PORT="${ports% *}"
    LUMEM_WEB_PORT="${ports#* }"
  fi

  export LUMEM_PORT LUMEM_WEB_PORT
}
