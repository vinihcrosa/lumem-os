# PRD — De quem é o adaptador: o daemon dono da própria cópia

> **Status:** em execução
> **Histórico:** v0.1 — proposta em **2026-09-08**, a partir de um sintoma relatado como problema de
> janela de contexto (*"o Lumem mostra 200K num modelo de 1M, e não pega Opus 5 nem Fable 5.1"*). O §2
> foi escrito **depois** de medir, e a medição virou o [ADR de
> 2026-09-08](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
> **Perguntas:** [open-questions.md](open-questions.md) — 5, todas respondidas
> **Tasks:** [tasks.md](tasks.md)
> **Decide:** o [ADR de 2026-09-08](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
> — o adaptador é a cópia que o daemon instalou, e o PATH nunca decide qual
> **Depende de:** a [021-second-agent](../021-second-agent/prd.md), que criou o catálogo `ADAPTERS`
> com `pinnedVersion` literal (A12), e a [006-acp-sessions](../006-acp-sessions/prd.md), que fez a
> sessão ser um processo de adaptador
> **Desenho:** nenhuma tela nova. A única superfície visível é a **frase de recusa** quando o
> adaptador gerenciado não está lá — texto, não layout

---

## 1. O problema, em uma frase

**O pino não decidia o que roda.**

O catálogo tinha `pinnedVersion: "0.75.1"`. A máquina rodava `0.40.0`, do PATH, havia nove dias — e
nada no produto era capaz de notar.

A `021-second-agent` escreveu a A12 com o motivo certo: *"uma publicação noturna de um adaptador de
terceiro não muda como o agente se comporta sem alguém ter revisado"*. Ela fez o **número** ser
literal. O que ficou de fora é que o número não era consultado por nenhum caminho de execução: a
resolução do binário terminava num `else` para o PATH, e o PATH tinha outra versão.

## 2. O que foi medido

Tudo aqui é 2026-09-08, nesta máquina, e o detalhe está no
[ADR](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).

**O estado encontrado.** `~/.lumem/adapters/` não existia — a instalação gerenciada nunca rodou. A
linha de `agent_config`, nos dois ambientes, apontava para `/…/nvm/…/bin/claude-agent-acp` com
`adapter_version = 0.40.0` e `created_at == updated_at`. O `0.40.0` depende de
`@anthropic-ai/claude-agent-sdk@0.3.160` — o Claude Code **2.1.160**.

**O que o adaptador velho entregava**, lido do `type:"config"` gravado nos transcripts:

| `0.40.0` | `0.75.1` |
|---|---|
| `default` — Opus 4.8 with 1M context | `default` — Opus (1M context) |
| `sonnet` — Sonnet 4.6 | `opus[1m]` — **Opus 5** with 1M context |
| `haiku` — Haiku 4.5 | `claude-fable-5-1[1m]` — **Fable 5.1** |
| `claude-fable-5-1[1m]` — **`Custom model`** | `sonnet` — Sonnet 5 |
| | `haiku` — Haiku 4.5 |

**A janela.** O Lumem não a calcula: `translate.ts:284-299` repassa o `size` do `usage_update`
verbatim. O `0.40.0` mandou `1000000` em cinco sessões e `200000` numa sexta, com o **mesmo**
`default` selecionado e um único evento de config. Um turno real no `0.75.1` mandou `size: 1000000`
nos três eventos, com `cost` e `_claude/rateLimit` presentes.

**O PATH, separado em duas coisas.** Com `PATH` contendo só `node`, o `0.75.1` completa `initialize`
e `session/new` e lista os cinco modelos — mas `session/prompt` responde `Authentication required`.
Acrescentando `/usr/bin/security`, o mesmo turno fecha em `end_turn` com `size: 1000000`. Logo: o
adaptador precisa de um PATH **utilizável** (keychain), e não precisa que o PATH diga **quem ele é**.

**O `cli` do Claude caiu.** Três medições: o handshake fecha com `claude` fora do PATH; o daemon em
execução spawna `@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, de dentro do pacote; e os
`authMethods` do `0.75.1` têm `args: ["--cli", "auth", "login", "--claudeai"]` — o `--cli` é do
próprio adaptador. O comentário do catálogo — *"um adaptador que dirige um binário que tem que
existir"* — era verdade no `0.40.0`.

## 3. O corte

O ADR decide. Esta PRD executa três invariantes e um conserto que a medição achou de graça.

### F1 — A resolução não tem `else`

`commandFor` devolve o caminho gerenciado ou **recusa com uma frase**. Nunca `spec.command`.

Uma spec com `package: null` deixa de significar "esperada no PATH". O campo fica — ele descreve
quem não tem pacote a baixar —, e o que muda é que ele não abre caminho para um binário que ninguém
escolheu: `installAdapter` recusa em vez de resolver pelo PATH.

> **Emenda de 2026-09-08**, escrita depois de o e2e cobrar. A primeira versão desta função dizia
> *"toda linha ACP resolve do catálogo, e um nome fora dele é recusado"* — e **25 specs de e2e
> ficaram vermelhas**, todas as que dirigem um adaptador falso nomeado `acp-falso` com
> `command: process.execPath`. A recusa estava errada, e o erro foi colapsar três casos em dois. O
> que a decisão proíbe é **o PATH escolher**, e são três coisas diferentes:
>
> | Linha | O que roda | Por quê |
> |---|---|---|
> | `transport: "pty"` | o comando dela, intocado | um shell não é adaptador |
> | nome **é** id de catálogo | a cópia gerenciada, **ignorando** o `command` gravado | é o caso que quebrou: `name: "claude"` com o caminho do `nvm` |
> | nome **não** é id, com caminho absoluto | o caminho, como ele diz | apontar para **um arquivo** não é o PATH escolher — é o adaptador compilado à mão, o agente ainda não catalogado, o falso do e2e |
> | nome **não** é id, com nome nu | **recusa** | isto sim é o PATH escolhendo, hoje de um jeito e amanhã de outro |

### F2 — O boot confere e reconcilia

Antes de a primeira sessão existir, o daemon compara a versão **no disco** com `pinnedVersion` e
instala se divergirem. Foi a ausência disto que deixou nove dias passarem: o pino subiu num commit e
nada na máquina releu.

A versão vem do `package.json` do pacote instalado, nunca de `<binário> --version` — medido no
`install-adapter.ts`, o `0.40.0` responde `--version` com **string vazia e exit 0**.

### F3 — O caminho não é dado de sessão

A invocação é resolvida da spec a cada `spawn` e a cada `resume`. Hoje três lugares congelam um
caminho absoluto: a coluna `agent_config.command`, escrita no dia em que a linha nasceu; o router de
`agentConfig`, que tem `create` e `remove` e **não tem `update`**; e o `resume`, que relança
`row.command` — o caminho da sessão morta, contra o próprio comentário dele, que diz que *"como o
adaptador é invocado hoje é configuração"*.

O que a linha guarda passa a ser **qual adaptador**, não onde ele estava em agosto.

### F4 — O `rateLimit` volta a acender

`rateLimitOf` exige `utilization` na raiz de `_claude/rateLimit`. O `0.75.1` a aninha em
`unifiedWindows.<janela>.utilization`, com `five_hour`, `seven_day` e
`seven_day_overage_included`. Por isso `rateLimit: null` em todo transcript.

Não é regressão da decisão — é defeito que ela expõe. Entra aqui porque o dado medido está na mão e
o rodapé que existe para mostrá-lo está apagado.

## 4. O que não muda

| Não muda | Por quê |
|---|---|
| o adaptador **não** vira dependência do pacote publicado | [Q1](open-questions.md) — 243 MB (Claude) + 301 MB (Codex) num `npm i -g`, e o `smoke:install` baixando meio giga por execução |
| `npm` continua vindo do PATH | é o instalador, não o adaptador. `installAdapter` já fala com as palavras do npm quando falta |
| o PATH do processo filho continua herdado | [Q3](open-questions.md) — medido: sem `/usr/bin/security` o turno morre em `Authentication required` |
| `setup.agents` continua relatando o que achou no PATH | [Q2](open-questions.md) — informação é útil e `BinaryReport.managed` já distingue. O que muda é que nenhum caminho de execução a consulta |
| `CODEX_ADAPTER.cli` continua `null` | já era, e pelo mesmo motivo medido na fase 0 da [021](../021-second-agent/prd.md) |
| as duas `configOptions` novas do `0.75.1` | [Q5](open-questions.md) — `effort` e `agent` são feature, não conserto. Vão para o [backlog](../../project/backlog.md) |

## 5. Como se sabe que funcionou

- Uma máquina com uma cópia global **diferente** do pino lança a gerenciada, e o teste prova isso
  pela versão que a sessão relata — não pela existência do arquivo.
- Uma máquina **sem** cópia gerenciada e **com** global no pino ainda recusa: a proveniência é a
  regra, não a coincidência de versão.
- Subir `pinnedVersion` e reiniciar troca o que roda, sem ninguém tocar em banco.
- Um `usage_update` do `0.75.1` produz `rateLimit` não nulo.
