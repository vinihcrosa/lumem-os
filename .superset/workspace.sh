# shellcheck shell=bash
#
# Identidade do workspace. Sourced pelos três scripts de ciclo de vida.
#
# Cada workspace do Superset é um worktree git próprio, e o Lumem tem duas
# coisas globais que não sobrevivem a dois deles ao mesmo tempo: as portas
# (4317/4318) e o state dir (~/.lumem, com o banco e as worktrees que o daemon
# cria). Tudo aqui existe para derivar um par de portas e um state dir que
# pertençam a *este* worktree e a mais nenhum.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

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

export REPO_ROOT WORKSPACE_SLUG LUMEM_DEV_HOME LUMEM_STATE_DIR
