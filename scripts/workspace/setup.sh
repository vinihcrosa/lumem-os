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
# A versão exata mora no `.nvmrc` (T5 da `024-dev-harness`), e um major diferente
# recusa: o Node 26 desta máquina quebra o jsdom em 340 testes, e o vermelho
# parece defeito de código. O `--experimental-strip-types` não existe antes do
# 22.6 — um node velho demais cai no segundo ramo, que diz a mesma coisa.
if ! command -v node >/dev/null 2>&1; then
  echo "erro: não há node no PATH; o repositório está pinado no $(cat .nvmrc) — \`nvm install\` ou \`mise install\`" >&2
  exit 1
fi
if ! node --no-warnings --experimental-strip-types scripts/node-version.ts 2>/tmp/lumem-node-version.$$; then
  if [ -s /tmp/lumem-node-version.$$ ] && grep -q "pinado" /tmp/lumem-node-version.$$; then
    sed 's/^/    /' /tmp/lumem-node-version.$$ >&2
  else
    echo "erro: o repositório está pinado no node $(cat .nvmrc) e encontrei $(node -v) — \`nvm use\` ou \`mise install\`" >&2
  fi
  rm -f /tmp/lumem-node-version.$$
  exit 1
fi
rm -f /tmp/lumem-node-version.$$

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
    state dir   $LUMEM_STATE_DIR   (modo $LUMEM_DEV_MODE; ~/.lumem, o de produção, fica intocado)

    pnpm dev          via 'run' do harness, nas portas default
    pnpm gate:quick   testes afetados pelo trabalho atual
    pnpm gate:full    suíte inteira + e2e
    pnpm gate:build   typecheck de tudo + build
INFO
