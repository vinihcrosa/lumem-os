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
#
# As outras duas coisas que ele faz existem porque o daemon roda este script
# **num PTY** (`ScriptRunner` → `PtyManager`), e um PTY muda o comportamento de
# quem escreve nele. As duas estão explicadas onde acontecem.
set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/env.sh"
cd "$REPO_ROOT"

# Saída em linhas, e não um quadro redesenhado.
#
# Num PTY o repórter default do vitest é o interativo: ele esconde o cursor
# (`ESC[?25l`), abre atualização sincronizada (`ESC[?2026h`) e **reescreve o
# mesmo quadro** até o fim. Quem lê esse PTY de fora — o daemon — só tem
# conteúdo legível quando a corrida termina; interrompida no meio, ela não deixa
# uma linha sequer, só controle de cursor. Medido: 71 s de corrida num PTY, e o
# primeiro texto durável é o resumo final.
#
# `CI` é a chave documentada do vitest para "ninguém está olhando um terminal",
# e ela não alcança mais nada deste repositório: o único outro leitor é o
# `playwright.config.ts`, e o `gate:quick` não roda playwright por desenho.
# Respeita quem já definiu — num runner de CI a variável já vale.
export CI="${CI:-1}"

# Um teto próprio, **abaixo** do que o daemon dá.
#
# O daemon concede 10 minutos ao `test` (`TEST_TIMEOUT_MS`) e, ao estourar,
# mata o processo e não tem o que dizer além de "não terminou". Um teto menor
# aqui troca esse silêncio por uma frase: o script continua vivo depois de matar
# a corrida, e escreve o que aconteceu.
#
# 480s é ~3,5× a pior corrida medida nesta árvore (71 s num PTY ocioso, 137 s
# com a máquina carregada), e deixa 120 s de folga para o daemon.
GATE_TIMEOUT_SECONDS="${LUMEM_GATE_TIMEOUT_SECONDS:-480}"

echo "==> node $(node -v)"
echo "==> teto ${GATE_TIMEOUT_SECONDS}s"

# Controle de trabalho ligado: sem ele o `pnpm` nasce no grupo de processos do
# próprio script, e matar o grupo no estouro levaria junto quem precisa
# sobreviver para escrever a frase.
set -m

pnpm gate:quick &
gate=$!

( sleep "$GATE_TIMEOUT_SECONDS"; kill -TERM "-${gate}" 2>/dev/null || true ) &
watchdog=$!

status=0
wait "${gate}" || status=$?

# O **grupo**, e não o pid: `kill "${watchdog}"` mata o subshell e deixa o
# `sleep` dele vivo, herdando o stdout do script. Um órfão segurando esse
# descritor é exatamente o defeito que este arquivo existe para consertar —
# quem lê a saída nunca vê o fim, porque o fim nunca chega. Custou uma corrida
# de 10 minutos para aparecer, e é por isso que há teste para ele.
kill -TERM "-${watchdog}" 2>/dev/null || true
wait "${watchdog}" 2>/dev/null || true

# Acima de 128 é morte por sinal, e o único sinal que este script manda é o do
# teto. Dizer isso é a diferença entre um vermelho que se age e um que se
# reexecuta na esperança.
if [ "${status}" -gt 128 ]; then
  echo "==> o gate passou de ${GATE_TIMEOUT_SECONDS}s e foi interrompido (sinal $((status - 128)))." >&2
  echo "    Não é reprovação da suíte: é ela não ter cabido no tempo." >&2
  echo "    LUMEM_GATE_TIMEOUT_SECONDS ajusta o teto." >&2
fi

exit "${status}"
