#!/usr/bin/env bash
#
# Deixa um workspace novo pronto para `pnpm dev` e para os gates.
#
# Ponto de entrada do `setup` de qualquer harness — Superset, Conductor ou a mão.
#
# Idempotente: roda de novo sem estragar nada. Não há `.env` para copiar — toda
# a configuração do daemon tem default e sai de variável de ambiente, e o run.sh
# é quem as define.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$REPO_ROOT"

echo "==> node"
node_major="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
if [ "$node_major" -lt 22 ]; then
  echo "erro: o repositório exige node >= 22, encontrei $(node -v 2>/dev/null || echo 'nada')" >&2
  exit 1
fi
echo "    $(node -v)"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "erro: pnpm não está no PATH — instale com 'corepack enable pnpm'" >&2
  exit 1
fi

echo "==> dependências"
# --frozen-lockfile: um workspace que resolve versões diferentes do checkout
# principal reproduz bugs que não existem em lugar nenhum.
#
# O postinstall do repositório roda aqui junto e conserta o bit de execução do
# spawn-helper do node-pty, que a extração de tarball do pnpm perde — sem ele
# todo spawn falha com um "posix_spawnp failed" que não menciona permissão.
pnpm install --frozen-lockfile

echo "==> navegador do playwright"
# Cache global (~/Library/Caches/ms-playwright), compartilhado entre workspaces:
# instantâneo quando já existe. Só chromium, que é o único projeto do
# playwright.config.ts.
if ! pnpm exec playwright install chromium; then
  echo "aviso: não consegui garantir o chromium; 'pnpm gate:full' vai falhar no e2e." >&2
  echo "       rode 'pnpm exec playwright install chromium' quando der." >&2
fi

mkdir -p "$LUMEM_STATE_DIR"

cat <<INFO

==> pronto
    workspace   $WORKSPACE_SLUG ($WORKSPACE_HARNESS)
    state dir   $LUMEM_STATE_DIR   (próprio deste workspace; ~/.lumem fica intocado)

    pnpm dev          via 'run' do harness, com portas próprias
    pnpm gate:quick   testes afetados pelo trabalho atual
    pnpm gate:full    suíte inteira + e2e
    pnpm gate:build   typecheck de tudo + build
INFO
