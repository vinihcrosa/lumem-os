#!/usr/bin/env bash
#
# Sobe daemon + web deste workspace, em portas e state dir só dele.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/workspace.sh"
cd "$REPO_ROOT"

ports="$(node .superset/pick-ports.mjs "$REPO_ROOT")"
LUMEM_PORT="${ports% *}"
LUMEM_WEB_PORT="${ports#* }"

# O vite lê as duas: LUMEM_WEB_PORT para escutar, LUMEM_PORT para apontar o
# proxy de /trpc e /pty. Definir só uma deixa a UI conversando com o daemon
# errado — ou com nenhum.
export LUMEM_PORT LUMEM_WEB_PORT LUMEM_STATE_DIR

mkdir -p "$LUMEM_STATE_DIR"

echo "→ workspace  $WORKSPACE_SLUG"
echo "→ daemon     127.0.0.1:$LUMEM_PORT"
echo "→ web        http://localhost:$LUMEM_WEB_PORT"
echo "→ state dir  $LUMEM_STATE_DIR"
echo

# exec, e não uma chamada comum: o sinal de parada precisa chegar ao turbo e
# daí ao daemon. É o handler de SIGTERM do daemon que mata os PTYs filhos, e um
# wrapper no meio deixaria shell órfã a cada parada do workspace.
exec pnpm dev
