#!/usr/bin/env bash
#
# O gate que o Lumem roda como `test` do projeto.
#
# Existe como script, e não como comando cru no `project.toml`, pelo mesmo
# motivo dos outros três: é o `env.sh` que resolve o ambiente — e a parte dele
# que importa aqui é o **node**. O daemon roda os scripts por `$SHELL -lc`, e um
# shell de login não interativo não carrega o nvm; sem esta passagem o gate roda
# na versão que sobrou no PATH do sistema, que nesta máquina quebra o jsdom em
# 340 testes.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$REPO_ROOT"

echo "==> node $(node -v)"
exec pnpm gate:quick
