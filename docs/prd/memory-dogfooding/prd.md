# PRD — Três semanas com a memória ligada

> **Status:** v0.1 — proposto em 2026-09-05, **perguntas abertas**. Não é uma feature de código: é
> um **período de uso medido**, com o pouco de instrumentação que falta para os números existirem. O
> que ela entrega é uma **decisão**: a memória ganha mais código, ou congela.
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** ainda não — a fase 0 (instrumentação) vira tasks depois das perguntas
> **Depende de:** nada. A [distribution](../distribution/prd.md) já entregou o `lumem` instalável, e é
> **nele** que as três semanas rodam — no `~/.lumem` de produção, nunca no `~/.lumem-dev/shared` de
> desenvolvimento ([workspaces.md](../../project/workspaces.md)). O daemon ainda é foreground (D2 da
> distribution): um terminal ocupado por três semanas é o que traz "o daemon em background" do backlog
> de volta, e isso também é dado
> **Desenho:** nenhuma tela. O resultado é texto na CLI

---

## 1. O problema, em uma frase

**A parte mais elaborada do produto é a menos usada.**

Medido em 2026-09-05:

| O quê | Quanto |
|---|---|
| módulos em `packages/server/src/memory/` | mais de trinta arquivos de código, e outro tanto de teste |
| tabelas só de memória | `memory_entry`, `memory_decision`, `memory_proposal`, `memory_access`, `memory_signal`, `memory_usage`, `action_signal`, `playbook` |
| perguntas de desenho respondidas | 44 de 47, mais as 8 decisões do `context-delivery.md` |
| interruptores que gastam token | três — `distill`, `autoLearn`, `autoLearnBudget` —, **todos desligados**, mostrados como leitura pela `memory.settings` |
| números que o §6 do `context-delivery.md` diz que "precisam ser medidos" | seis. **Nenhum tem uma leitura** |
| itens de memória esperando no backlog (seção A) | cinco: contrato entre projetos, embeddings, consolidação, aprender de ações, índice de regras |

A memória foi construída **antes** de existir o hábito que a consome. O risco nomeado na avaliação de
arquitetura: construir o andar de cima sobre um chão em que ninguém andou. Este PRD é o andar.

## 2. O que existe para medir, e o que falta

Os seis números do §6, contra o código de hoje:

| Número | Onde o dado está | O que falta |
|---|---|---|
| tokens fixos por sessão (núcleo + skill) | evento `memory_core` na transcrição (`entries`, `chars`); `memory.core` dá a marca d'água **de agora** | somar por sessão ao longo do tempo: é evento, não linha |
| chamadas ao `/memory/ask` por sessão — **o mais importante** | `memory_usage`, gravado só pelo caminho do agente (`record: true` com `session`) | uma query por sessão, com mediana |
| custo e latência por pergunta, com e sem agente | latência: **nada**. Custo do agente do auto-learn e da destilação: **não é gravado** — `trackSessionUsage` resolve o escopo pela linha da sessão (`usage/record.ts`, `scopeOf` devolve `null` sem linha), e `capture.ts` e `auto-learn.ts` sobem agente **sem linha**. O backlog já nomeia isto — *"O que o Lumem gasta sozinho"* — e dá a razão: atribuir a um projeto seria contar como trabalho seu o que o sistema fez sozinho | gravar o consumo dessas sessões, com o **propósito** marcado — o que preserva a razão |
| "não sei" ÷ perguntas | o `http.ts` sabe em qual ramo caiu; **a verificar** se o `memory_usage` distingue acerto de vazio | provavelmente uma coluna |
| memórias criadas por auto-learn ÷ total | `provenance.source_actor` e `proposed_by` em cada entrada; o WAL `memory_decision` | uma query |
| sessões que escreveram ÷ sessões | `memory_decision` × `session` | uma query |

E três que o §6 não lista mas a decisão precisa: propostas aprovadas ÷ rejeitadas ÷ **ignoradas**
(`memory_proposal.status` e idade das pendentes), playbooks carregados (a telemetria da Q16), e o
crescimento do núcleo (`recentChars` já existe).

## 3. Escopo

### F1 — O consumo das sessões internas passa a existir

`session_usage` ganha `purpose` (`user` | `distill` | `auto_learn`), e as sessões que o próprio daemon
sobe passam a ser gravadas — projeto e worktree herdados da sessão que as originou, nulos quando não
há. É o item *"O que o Lumem gasta sozinho"* do backlog, que sai de lá para cá; e `purpose` é o que
preserva a razão dele: o consumo interno **não se mistura** ao do projeto, então a tela do workspace
continua dizendo só o que **você** gastou. Sem isto, *"quanto custa a memória?"* não tem resposta — e
custo é a primeira pergunta de quem liga um interruptor.

### F2 — `memory report`

Na CLI que já existe (`runMemoryCli`): `report --since 21d [--json]`. Imprime a tabela do §2 inteira
— os seis, os três, e o custo por propósito — para o período. **Só CLI.** Uma tela é o que o resultado
pode ou não justificar; desenhar antes é decidir antes de medir.

### F3 — O protocolo

Três semanas de **trabalho de verdade**, neste repositório e em **um segundo workspace com dois
projetos** ([U5](open-questions.md)) — o caso que justifica o conceito de workspace.

| Semana | Interruptores | O que se observa |
|---|---|---|
| 1 | todos desligados | a **linha de base**: núcleo e `ask`, só leitura. Quantas vezes o agente pergunta quando ninguém escreve por ele |
| 2 | `LUMEM_MEMORY_DISTILL=1` | a inbox: quantas propostas nascem, quantas você aprova, quanto tempo elas esperam |
| 3 | mais `LUMEM_MEMORY_AUTO_LEARN=1`, orçamento `3` | o acervo crescendo sozinho: o que fica, o que você apaga, o que custou |

Toda sexta: a saída do `report` colada em [journal.md](journal.md), nesta pasta, com **três linhas** do
que incomodou. A inbox é revisada **todo dia** — uma proposta pendente há mais de 48 horas conta
contra a destilação, porque significa que a inbox virou cerimônia.

### F4 — Os critérios, escritos antes

Os limiares são perguntas ([U2–U4](open-questions.md)), e são respondidos **antes** da semana 1. A
regra do jogo é que o número decide, não a impressão da última sexta:

- **verde** → a seção A do backlog reabre, na ordem em que o `report` diz que doeu;
- **vermelho** → a memória **congela**: nenhuma feature nova até um número mudar. Bug entra;
- **misto** → congela o que falhou, reabre o que passou. É o resultado mais provável, e o mais útil.

O resultado, seja qual for, é escrito no §7 deste PRD, com a tabela final.

### Não entra, e por quê

| Fora | Por quê |
|---|---|
| Qualquer item da seção A do backlog | é o que está em julgamento |
| Tela de configuração dos interruptores | [U1](open-questions.md): `env` basta para três toggles em três semanas — `LUMEM_MEMORY_DISTILL=1 lumem` |
| Mudar o portão, a inbox ou a precedência | o que está sendo medido é o desenho **como está** |
| Embeddings, consolidação, "dreaming" | seção A |
| Uma tela de números | é o que o resultado decide |

## 4. Decisões que já dá para tomar

- **Medir é CLI.** Um comando, texto, `--json` para guardar. Tela é consequência, não pré-requisito.
- **O custo interno é gravado com propósito, não misturado.** Somar o auto-learn ao consumo do projeto
  faria a tela do workspace mentir sobre o que **você** gastou.
- **A linha de base vem primeiro.** Sem a semana 1, o número da semana 2 não tem com o que se comparar.

## 5. Riscos

| Risco | Defesa |
|---|---|
| **Hawthorne:** você escreve memória porque está medindo | a semana 1 é só leitura, e o número que mais importa — perguntas por sessão — é do agente, não seu |
| **n = 1**, três semanas, um usuário | é o que existe. O PRD não promete significância; promete uma decisão melhor que a atual, que é nenhuma |
| carga de trabalho **enviesada**: três semanas mexendo no próprio Lumem | o segundo workspace, com dois projetos que não são este |
| o daemon de desenvolvimento e o de produção se misturam | os dois já têm state dir próprio. O protocolo roda **só** no instalado; mexer no Lumem durante as semanas usa o de dev, e não conta |
| o auto-learn gasta o **seu** dinheiro sem você ver | orçamento `3` por sessão, e o custo por propósito na sexta. Se assustar, a semana 3 encurta e isso é dado |
| a decisão "vermelho" não é respeitada | ela está escrita aqui, com data, antes do primeiro número. É o máximo que um documento pode fazer |

## 6. Fases

0. **Instrumentação** — F1 e F2. Dois dias, com prova;
1. **Semana 1** — linha de base;
2. **Semana 2** — destilação;
3. **Semana 3** — auto-learn;
4. **Decisão** — o §7 é escrito, o backlog A é tocado numa direção ou na outra.

## 7. Resultado

*Vazio até o fim da semana 3. Aqui entra a tabela final e a decisão.*

## 8. Custo nos testes

| Camada | Teste |
|---|---|
| F1 | integration com agente falso: o caminho do auto-learn e o da destilação produzem linha em `session_usage` com `purpose` certo e escopo herdado; o caminho do usuário continua `user`. **Mutação:** apagar a gravação interna tem que derrubar um teste |
| F2 | a CLI é in-process (`runMemoryCli` recebe `env`, `out`, `err`): banco semeado com um cenário conhecido → texto determinístico; `--json` é o mesmo dado |
| e2e | nenhum. Nada de tela |

Portão: `gate:quick` na fase 0. O resto do PRD não é testável por suíte — é uso.
