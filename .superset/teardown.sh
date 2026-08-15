#!/usr/bin/env bash
#
# Apaga o estado que este workspace criou fora do checkout.
#
# O worktree em si o Superset remove. O que sobreviveria é o state dir do
# daemon, com o banco e as worktrees que ele criou — lixo acumulando em
# ~/.lumem-dev a cada workspace descartado.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/workspace.sh"

# Três guardas antes de um rm -rf, porque um slug vazio aqui apagaria o
# ~/.lumem-dev inteiro — o estado de todos os outros workspaces.
if [ -z "${WORKSPACE_SLUG:-}" ] || [ -z "${LUMEM_DEV_HOME:-}" ]; then
  echo "erro: identidade do workspace vazia; não vou apagar nada" >&2
  exit 1
fi
if [ "$LUMEM_STATE_DIR" != "$LUMEM_DEV_HOME/$WORKSPACE_SLUG" ]; then
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
