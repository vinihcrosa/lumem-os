# PRD — Agente é sempre ACP, e abrir agente é compor um prompt

> **Status:** em execução
> **Histórico:** v0.1 — proposta em **2026-09-24**, a partir de um pedido do Vinicius com duas telas
> de referência: um modal *"What do you want to work on?"* para criar worktree, e uma conversa vazia
> *"New chat in /…"* para abrir agente dentro dela. A discovery mediu o código e o banco antes de
> escrever, e as **12 perguntas** foram respondidas no mesmo dia, uma por vez
> **Decisão:** [ADR de 2026-09-24](../../adr/2026-09-24-1620-agent-is-always-acp.md), que supera o
> [de 2026-08-17](../../adr/2026-08-17-1812-agent-session-is-acp-not-pty.md)
> **Perguntas:** [open-questions.md](open-questions.md) — Q0–Q11 respondidas; M1–M3 são medições da
> Fase 0
> **Tasks:** [tasks.md](tasks.md) — 24 tasks em 7 fases
> **Depende de:** [`006-acp-sessions`](../006-acp-sessions/prd.md) (a conversa), [`021-second-agent`](../021-second-agent/prd.md)
> (o catálogo `ADAPTERS`), [`026-worktree-from`](../026-worktree-from/prd.md) (as quatro origens),
> [`027-adapter-provenance`](../027-adapter-provenance/prd.md) (o adaptador é a cópia do daemon),
> [`023-composer-menus`](../023-composer-menus/prd.md) (a âncora e o teto dos menus)

---

## 1. O problema

Três coisas, e a terceira só aparece depois das duas primeiras.

**Um agente pode rodar num terminal, e metade do produto não sabe disso.** `agent_config.transport`
aceita `pty`, o formulário oferece `terminal (PTY)`, e a sessão abre com o CLI desenhando. Memória,
tarefas, custo, orçamento, esteira e o rodapé de login ignoram essa sessão — cada um por uma linha
de código diferente. Em produção há **uma** config assim, com **uma** sessão; no dev, uma config sem
sessão.

**Abrir agente é escolher uma config num menu, e o modelo só aparece depois.** O `＋ nova sessão`
lista shell e uma linha por config; o clique sobe o adaptador, roda `session/new`, e só então a
pílula de modelo existe. Trocar de modelo antes do primeiro turno é uma segunda ação, e trocar de
ACP é fechar a aba e abrir outra.

**Criar worktree não começa trabalho nenhum.** O diálogo pede nome e origem, cria o checkout e larga
você na aba do checkout. A intenção — *o que eu vim fazer aqui* — é digitada depois, num segundo
lugar, numa sessão que você ainda tem que abrir.

## 2. O que esta feature faz

1. **Agente é sempre ACP.** `agent_config` perde o transporte; a config de terminal fica
   aposentada, visível no histórico, sem reabrir.
2. **Criar worktree é compor o primeiro prompt.** Um modal com o prompt, a pílula de modelo e a
   origem; `Create` cria a worktree, abre a sessão no modelo escolhido, **espera o `setup`** e manda.
3. **Novo agente é uma aba rascunho.** *"Nova conversa em `/<worktree>`"*, o compositor, a pílula; a
   sessão nasce no primeiro envio.
4. **A pílula é uma só:** modelos agrupados por ACP — escolher o modelo escolhe o ACP.

## 3. Não-objetivos

| Não faz | Por quê |
|---|---|
| tirar o PTY do terminal integrado | [Q0](open-questions.md) — shell, scripts, login e o terminal do agente ACP ficam |
| criar tarefa junto com a worktree | [Q2](open-questions.md) — o modal cria worktree e sessão, e só |
| anexo no prompt (`+`) e sugestões de contexto | [Q9](open-questions.md) — [backlog](../../project/backlog.md), marcados como **importantes** |
| padrão de modelo por workspace ou lembrado | [Q8](open-questions.md) — a pílula nasce no padrão do ACP |
| mudar a esteira | ela continua abrindo sessão pelo caminho dela; unificar é backlog |

## 4. Requisitos

### F1 — O fim do agente-PTY

- **F1.1** `agent_config` não tem transporte. Toda config nova é ACP e exige versão do adaptador.
- **F1.2** A config `pty` existente é **aposentada** na migração (`retired_at`), não apagada: a FK
  da sessão é `restrict`, e a sessão antiga é histórico.
- **F1.3** Config aposentada não aparece em lista nenhuma, não sobe processo, e o daemon recusa
  `createAgent` com ela — com frase, não com código.
- **F1.4** A sessão de agente antiga, de terminal, aparece na lista de sessões do checkout com nome,
  estado e idade, **sem ação**: nem `reabrir`, nem `ver registro`, nem `nova sessão igual`.
- **F1.5** Shell, scripts, login e o terminal do agente ACP continuam PTY, sem mudança.

### F2 — O catálogo de adaptador

- **F2.1** O daemon sabe, **sem sessão viva**, as opções de cada adaptador instalado (modelo, modo,
  *effort*), no padrão que o ACP devolve no `session/new`.
- **F2.2** O catálogo é persistido em `~/.lumem/_system/adapter-catalog.json` e vale para a versão
  fixada do adaptador: trocar o pino o invalida.
- **F2.3** Ele é alimentado pelo probe, por toda sessão aberta, e — para os comandos `/` — pelos
  comandos que cada sessão recebe, **por projeto** (eles incluem as skills do projeto).
- **F2.4** No boot, o daemon sonda em segundo plano o adaptador instalado cujo catálogo falta ou
  venceu. O boot não espera.
- **F2.5** Mudou o catálogo, a tela fica sabendo (`catalog.changed`).

### F3 — A pílula

- **F3.1** Uma pílula com os modelos **agrupados por ACP**; escolher um modelo escolhe o ACP.
- **F3.2** Nasce no ACP padrão (`claude`) e no modelo que ele devolve como padrão (Q8).
- **F3.3** *Effort* aparece ao lado **só** quando o ACP escolhido o expõe (Q10); nunca valor
  inventado.
- **F3.4** ACP não instalado ou sem login aparece desabilitado, com o motivo e o caminho para o
  rodapé de login.
- **F3.5** O menu ancora na pílula e tem o teto `--size-menu-max-h` (regra da `023`).

### F4 — Criar worktree é compor o primeiro prompt

- **F4.1** O `+` da linha do projeto abre um modal largo: seletor de projeto, `…` (nome), seletor de
  origem, o campo *"No que você quer trabalhar?"*, a pílula e `Create ↵`.
- **F4.2** O nome da worktree é derivado do prompt, localmente, sem IA, e editável no `…`. Colisão
  ganha sufixo. A origem `issue` continua montando o nome da issue.
- **F4.3** A worktree só nasce no `Create`. Fechar o modal guarda o texto **por projeto**, enquanto a
  aba estiver aberta; `F5` perde (Q1).
- **F4.4** `Create` cria a worktree, abre a sessão **já no ACP e modelo escolhidos**, e abre a aba
  dela na frente.
- **F4.5** O primeiro prompt **espera o `setup`** (Q6): a conversa mostra *"preparando worktree…
  (setup)"*; terminou bem, o prompt sai e aparece como turno seu. Projeto sem `setup` manda na hora.
- **F4.6** `setup` falhou (ou estourou o teto de 10 min): o prompt **não** sai; a conversa mostra o
  erro, o atalho para a aba Setup, `mandar assim mesmo` e `editar`.
- **F4.7** Escolher uma branch que já tem worktree abre a existente, com uma aba rascunho contendo o
  texto, sem enviar.
- **F4.8** Falhou abrir a sessão, a worktree criada é removida — nada de worktree órfã.

### F5 — Novo agente é uma aba rascunho

- **F5.1** `＋ novo agente` abre uma aba rascunho, na frente: *"Nova conversa em `/<worktree>`"*, o
  compositor e a pílula. Nenhum processo sobe.
- **F5.2** O menu `/` do rascunho usa os comandos do catálogo para o projeto e o ACP escolhidos;
  vazio, diz que eles aparecem depois da primeira mensagem.
- **F5.3** O primeiro envio cria a sessão no ACP e modelo escolhidos, mostra *"abrindo <agente>…"*, e
  manda o texto quando ela anexar.
- **F5.4** Falhou criar: o texto fica, o erro aparece com frase, a pílula reabre.
- **F5.5** Fechar o rascunho descarta.
- **F5.6** O menu de sessão tem dois verbos: `＋ novo agente` e `terminal`.

### F6 — O modelo sobrevive à retomada

- **F6.1** Retomar uma sessão reaplica o modelo gravado nela (Q7).
- **F6.2** O modelo não existe mais: a retomada continua, e a conversa ganha uma linha dizendo qual
  modelo sumiu e em qual ela seguiu. Nunca troca calada.

## 5. Medições (Fase 0)

Medido pela T2 em **2026-09-24**, com o `AcpManager` deste repositório como cliente, contra as
cópias do daemon de dev (`~/.lumem-dev/shared/adapters/`): `claude-agent-acp@0.75.1` (Claude Code
`2.1.160` embutido) e `codex-acp@1.10.0`. **Nenhum `session/prompt`** — só `initialize`,
`session/new`, `session/set_config_option` e `session/load`, e é por isso que custou zero token. As
respostas, com o que cada uma muda no plano, estão no [open-questions.md](open-questions.md#medições-da-fase-0).

**M1 — o Claude expõe *effort*: sim.** O `session/new` traz cinco opções:

| id | categoria | choices | `currentValue` aqui |
|---|---|---|---|
| `mode` | `mode` | `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions` | `default` |
| `model` | `model` | `default`, `opus[1m]`, `claude-fable-5-1[1m]`, `sonnet`, `haiku` | `opus[1m]` |
| `effort` | `thought_level` | `default`, `low`, `medium`, `high`, `xhigh`, `max` | `xhigh` |
| `fast` | `model_config` | `on`, `off` | `off` |
| `agent` | *(nula)* | `default` + os subagentes dos plugins da máquina | `default` |

O conjunto **depende do modelo**, medido trocando `model` por `set_config_option` para cada choice:

| modelo | `effort` | `fast` |
|---|---|---|
| `default`, `opus[1m]` | sim, as seis | sim |
| `claude-fable-5-1[1m]`, `sonnet` | sim, as seis | **não** |
| `haiku` | **não** | **não** |

O Codex tem o mesmo desenho com outros nomes — `reasoning_effort` (`thought_level`), e as choices
também mudam por modelo: `low`…`xhigh` em `gpt-5.5`; `+ max` em `gpt-5.6-luna`; `+ max, ultra` em
`gpt-6-astra`, `gpt-5.6-sol` e `gpt-5.6-terra`.

**M2 — `session/load` restaura o modelo: não, em nenhum dos dois.** Um modelo trocado por
`set_config_option` sem turno depois dele **nunca** volta: nos dois adaptadores a troca vive só na
memória do processo.

| adaptador | o que o `session/load` devolve | medido |
|---|---|---|
| Claude | `settings.model` do `~/.claude/settings.json`, se houver; senão, o modelo da **última resposta real** do transcript | com `model: "opus[1m]"` na config do usuário: trocado para `haiku`, recarregado ⇒ `opus[1m]` (e o adaptador ainda chama `setModel` sobre o transcript em `sonnet`). Com uma config isolada sem `model`: ⇒ `claude-sonnet-4-6`, o do transcript — nunca o `haiku` |
| Codex | o `model` e o `model_reasoning_effort` do `~/.codex/config.toml`, sempre | thread cujo último turno rodou em `gpt-5.6-luna`, trocada para `gpt-6-astra`/`high`, recarregada ⇒ `gpt-5.5`/`medium` — nem o do último turno, nem o trocado |

O *effort* segue a mesma regra: volta ao `effortLevel` do usuário (`xhigh`) no Claude, e ao
`medium` do `config.toml` no Codex. Reaplicar funciona: `set_config_option` foi aceito na sessão
recém-carregada, nos dois.

Achado de brinde: **`session/load` de uma conversa que nunca recebeu um turno falha** — o Claude
responde `Resource not found`, o Codex `Internal error`. Nenhum dos dois grava nada em disco antes
do primeiro prompt.

**M3 — quanto custa abrir.** `probe`, três rodadas seguidas por adaptador, em ms. `spawn` é só a
chamada de `child_process.spawn`; o boot do node cai dentro do `initialize`.

| adaptador · `cwd` | rodada | `spawn` | `initialize` | `session/new` | total |
|---|---|---|---|---|---|
| Claude · diretório vazio | 1 / 2 / 3 | 4 / 1 / 1 | 149 / 155 / 154 | 2917 / 2625 / 2328 | **3070 / 2781 / 2483** |
| Claude · este checkout | 1 / 2 / 3 | 3 / 5 / 2 | 155 / 363 / 184 | 4066 / 4023 / 2707 | **4224 / 4391 / 2893** |
| Codex · diretório vazio | 1 / 2 / 3 | 3 / 1 / 1 | 250 / 113 / 116 | 137 / 68 / 68 | **390 / 182 / 185** |
| Codex · este checkout | 1 / 2 / 3 | 4 / 1 / 1 | 267 / 117 / 113 | 195 / 80 / 81 | **466 / 198 / 195** |

No Claude, o custo é quase todo o `session/new`, e dentro dele a fase `sdk-initialize` do próprio
adaptador (3 287 ms numa das rodadas, pelo log dele). O `session/load` custou na mesma ordem:
2 768–3 467 ms no Claude, 258–539 ms no Codex.

## 6. Fluxos

**Criar worktree com prompt.** `+` na linha do projeto → modal → escreve *"corrigir o login no
Safari"* → pílula `Claude · Opus` → `Create ↵` → a sidebar ganha `corrigir-o-login-no-safari`, a aba
da conversa abre na frente com *"preparando worktree… (setup)"* e o texto esmaecido → o `pnpm
install` termina → o texto vira turno seu, o agente responde em Opus.

**Setup falhou.** … → *"o setup saiu com 1"* + `ver saída` → `mandar assim mesmo` → o turno sai.

**Novo agente.** Worktree aberta → `＋ novo agente` → aba *"Nova conversa em
`/corrigir-o-login-no-safari`"* → pílula `Codex · gpt-5.5 · high` → escreve e manda → *"abrindo
codex…"* → a aba vira a conversa, o turno sai.

## 7. O que esta PRD contradiz

A nota fica no requisito contradito (regra 6 da [`025`](../025-docs-contract/prd.md)), e quem as
escreve é a T24 do [tasks.md](tasks.md). Em resumo: `001` (agente é PTY; prompt
na criação era não-objetivo; nome no primeiro quadro), `006` (F1.2, F5.6, A1, A8, A11, C9),
`009` (F5.2), `021` (C6, T9), `026` (F3.1, F3.2, F3.5), `017` (F1.3), `008` (O14), `016` (F1.1 —
compatível: o rascunho não é *conversa viva*).
