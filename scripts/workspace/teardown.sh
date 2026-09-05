#!/usr/bin/env bash
#
# Apaga o estado que este workspace criou fora do checkout — quando houver.
#
# Ponto de entrada do `teardown` do Superset e do `archive` do Conductor.
#
# No modo compartilhado não há nada para apagar: o state dir é o ambiente de
# desenvolvimento inteiro, com os projetos de verdade cadastrados nele, e ele
# não pertence a este workspace. Só o modo isolado cria diretório descartável.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"

if [ "$LUMEM_DEV_MODE" != "isolated" ]; then
  echo "state dir compartilhado ($LUMEM_STATE_DIR) — nada a limpar neste workspace"
  exit 0
fi

# Três guardas antes de um rm -rf, porque um slug vazio aqui apagaria o
# ~/.lumem-dev/workspaces inteiro — o estado de todos os outros workspaces.
if [ -z "${WORKSPACE_SLUG:-}" ] || [ -z "${LUMEM_DEV_HOME:-}" ]; then
  echo "erro: identidade do workspace vazia; não vou apagar nada" >&2
  exit 1
fi
if [ "$LUMEM_STATE_DIR" != "$LUMEM_DEV_HOME/workspaces/$WORKSPACE_SLUG" ]; then
  echo "erro: $LUMEM_STATE_DIR não é o state dir deste workspace" >&2
  exit 1
fi
if [ ! -d "$LUMEM_STATE_DIR" ]; then
  echo "nada a limpar em $LUMEM_STATE_DIR"
  exit 0
fi

# O daemon pode ainda estar de pé segurando o banco. O worktree do git some de
# qualquer jeito, então o que importa é não deixar o diretório para trás.
rm -rf "$LUMEM_STATE_DIR"
echo "removido $LUMEM_STATE_DIR"
