#!/usr/bin/env bash
#
# Sobe daemon + web no ambiente de desenvolvimento (~/.lumem-dev/shared).
#
# Ponto de entrada do `run` de qualquer harness — Superset, Conductor ou a mão —
# e do `pnpm dev`, que aponta para cá justamente para não existir um caminho
# que suba o desenvolvimento no `~/.lumem` de produção por engano.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$REPO_ROOT"

resolve_ports

# O vite lê as duas: LUMEM_WEB_PORT para escutar, LUMEM_PORT para apontar o
# proxy de /trpc, /pty e /acp. Definir só uma deixa a UI conversando com o
# daemon errado — ou com nenhum. `resolve_ports` já exporta as duas;
# LUMEM_STATE_DIR vem do env.sh.
export LUMEM_STATE_DIR

mkdir -p "$LUMEM_STATE_DIR"

# O ambiente de dev é um só e as portas dele são fixas, então dois workspaces
# subindo ao mesmo tempo disputam a mesma porta. O vite tem strictPort e o
# daemon morre com EADDRINUSE, mas nenhuma das duas mensagens diz o que fazer.
port_free() {
  node --input-type=commonjs -e '
    const net = require("node:net");
    const server = net.createServer();
    server.once("error", () => process.exit(1));
    server.once("listening", () => server.close(() => process.exit(0)));
    server.listen(Number(process.argv[1]), "127.0.0.1");
  ' "$1"
}

for port in "$LUMEM_PORT" "$LUMEM_WEB_PORT"; do
  if ! port_free "$port"; then
    echo "erro: a porta $port já está ocupada." >&2
    if [ "$LUMEM_DEV_MODE" = "shared" ]; then
      cat >&2 <<MSG

O ambiente de dev é compartilhado entre os worktrees e escuta sempre em
$LUMEM_PORT/$LUMEM_WEB_PORT. Provavelmente já tem um 'pnpm dev' de pé — pare aquele, ou
suba este com estado e portas próprios:

    LUMEM_ISOLATED=1 ./scripts/workspace/run.sh
MSG
    fi
    exit 1
  fi
done

echo "→ workspace  $WORKSPACE_SLUG ($WORKSPACE_HARNESS)"
echo "→ modo       $LUMEM_DEV_MODE"
echo "→ daemon     127.0.0.1:$LUMEM_PORT"
echo "→ web        http://127.0.0.1:$LUMEM_WEB_PORT"
echo "→ state dir  $LUMEM_STATE_DIR"
echo

# exec, e não uma chamada comum: o sinal de parada precisa chegar ao turbo e
# daí ao daemon. É o handler de SIGTERM do daemon que mata os PTYs filhos, e um
# wrapper no meio deixaria shell órfã a cada parada do workspace.
exec pnpm dev:turbo
