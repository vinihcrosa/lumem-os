# PRD — O contrato de documentação: índice temporal e ADR

> **Status:** em execução
> **Histórico:** proposta em 2026-09-07, com as 12 perguntas respondidas no mesmo dia
> **Perguntas:** [open-questions.md](open-questions.md) · **Tasks:** [tasks.md](tasks.md)
> **Referência estudada:** [`vinihcrosa/lumem`](https://github.com/vinihcrosa/lumem) — outro
> projeto, com contrato de documentação e três ADRs. **Nada copiado**: ver §7
> **Desenho:** não tem tela. É a primeira feature do repositório que não toca em pixel nem em
> endpoint

---

## 1. O problema, em uma frase

**O repositório não tem onde registrar uma decisão, então ele registra decisão em 44 lugares e 5
deles mentem.**

O `docs/prd/` — como a categoria se chamava quando isto foi escrito — tinha 24 pastas e nenhuma ordem
legível. A ordem existe só no git, e o git mente: três
commits criaram 2, 4 e 4 pastas de uma vez, então 10 das 24 não têm "antes" nenhum. Um agente que
lista a árvore não sabe o que veio primeiro.

Pior que a ordem, a **precedência**. Quando duas PRDs se contradizem — e elas se contradizem, 44
vezes — nada diz qual vale. O que existe é uma convenção informal, boa, escrita em prosa:

> *"decisão revertida sem registro é decisão que volta sozinha"*
> *"não-objetivo revertido sem registro é dívida de documentação"*

Ela aparece 6 vezes e **falha 1 em 5**: quatro links apontam para o `prd.md` da `worktree-tabs`,
arquivo que nunca existiu, e dois deles foram criados por tasks marcadas `[x]` cujo trabalho era
justamente propagar uma nota de reversão. O repositório já auditou isso em
[harness-audit.md](../../project/harness-audit.md) e o defeito continua lá.

E o campo que deveria dizer o estado é o que apodreceu mais:

| PRD | `**Status:**` declarado | Verdade |
|---|---|---|
| [pull-request-status](../013-pull-request-status/prd.md) | *"em implementação"*, e uma nota de 2026-09-01 dizendo *"nenhuma das 16 tasks foi iniciada"* | `tasks.md` diz **completa**; `packages/server/src/pr/` tem 14 arquivos e ~115 KB |
| [right-panel](../004-right-panel/prd.md) | *"desenho fechado, tasks prontas para execução"* | entregue |
| [ui-shell](../002-ui-shell/prd.md) | *"desenho aprovado, tasks prontas para execução"* | entregue |
| [walking-skeleton](../001-walking-skeleton/prd.md) | *"decisões fechadas, pronto pra revisão final"* | 34 tasks entregues |
| [acp-sessions](../006-acp-sessions/prd.md) | *"fases 0 a 4 entregues"*, e no `:10` *"18 tasks, nenhuma iniciada"* | 35 tasks nas fases 1, 3, 4, 5 e 6 |

**Cinco de 23, e vaza para fora do `docs/`:** os dois READMEs da raiz publicam *"designed, not
built"* / *"desenhado, não implementado"* sobre uma feature que está implementada. O heading do
índice — *"Propostos em 2026-09-05 — quatro PRDs, nenhum começado"* — também já é falso, porque o
quarto é a [second-agent](../021-second-agent/prd.md), completa.

Esse é o achado que decide o desenho todo: **campo de prosa que carrega estado apodrece.** Qualquer
esquema que ponha precedência num campo assim vai apodrecer igual, e mais rápido, porque passa a ser
carregado.

## 2. O que o pedido era, e o que ele virou

O pedido chegou com duas partes:

1. um índice — `docs/features/<NNN>-nome/`, três dígitos;
2. a regra de que **PRD é estado temporal**: a mais recente manda sobre a mais antiga.

A segunda foi corrigida pelo autor no mesmo dia, antes de existir código: **PRD não é fonte de
verdade; ADR é** — e ADR não existia neste repositório.

Isso mudou o corte inteiro. Com o ADR carregando a precedência, **o número para de precisar
significar prioridade** — e três problemas que a prioridade tinha desaparecem sem nenhuma regra
nova:

| Problema da prioridade no número | Por que desaparece |
|---|---|
| **Emenda × criação.** A [Q6 da run-dock-open](../015-run-dock-open/open-questions.md) foi respondida em 2026-09-01 e **revertida em 2026-09-06**. O número dela é o de 09-05 | o número não afirma nada, então não pode estar errado |
| **Colisão em paralelo.** Duas worktrees pegam `025` e o git não reclama | o número é ordem, e ordem empatada é inofensiva |
| **Nenhum arquivo descreve o presente.** "O mais novo manda" obriga a reproduzir 24 PRDs em ordem na cabeça | a posição atual sobre decisão é a cadeia de ADR; sobre comportamento, é o código |

## 3. O contrato

### 3.1 Quatro camadas, e o que cada uma pode afirmar

| Camada | Onde | Afirma | Morre como |
|---|---|---|---|
| **Decisão** | `docs/adr/YYYY-MM-DD-HHMM-slug.md` | *"em 2026-08-17 escolhemos ACP, e o que perdeu foi isto"* | **superada** por outro ADR que a nomeia. Nunca editada, nunca apagada |
| **Estudo** | `docs/project/*.md` | a medição, a discussão e o contra-argumento que sustentaram uma decisão | fica como registro; **não afirma decisão** |
| **Execução** | `docs/features/NNN-nome/` | o que uma feature quis fazer, na época dela | fica como registro. Requisito contradito ganha nota com escopo |
| **Vigor** | o código | o que o sistema faz **hoje** | — |

A distinção que faz a regra funcionar: **ADR não descreve o sistema, descreve escolhas.** A posição
atual sobre uma decisão é a cadeia lida até o fim; a posição atual sobre *comportamento* é o código.
É isso que impede "o mais recente manda" de virar event-sourcing sem projeção — e é por isso que o
parágrafo de estado do [CLAUDE.md](../../../CLAUDE.md) continua existindo, agora com papel nomeado:
**ele é a projeção.**

### 3.2 As sete regras

1. **O número é ordem de leitura, não prioridade.** `docs/features/NNN-nome/`, três dígitos, ordem
   de merge do git, atribuído na criação, **nunca renumerado** depois de ter referência de fora.
   Lacuna é permitida. Colisão em paralelo se resolve renumerando a que mergeou depois.
2. **Precedência mora em `docs/adr/`.** `docs/adr/` decide · `docs/project/` sustenta ·
   `docs/features/` executa · o código está em vigor.
3. **ADR existe se passa nos três testes, todos:** difícil de reverter · surpreendente sem contexto ·
   produto de um trade-off real. Falha um e é uma nota na PRD. *Se você não sabe nomear uma
   alternativa real, provavelmente não é ADR.*
4. **ADR não se reverte em parte.** Se só parte mudou, o ADR novo **reafirma o que fica**. Nota de
   PRD nunca derruba ADR sozinha; se ela precisa disso, o que falta é um ADR.
5. **Estado se deriva, não se escreve.** ADR superado ⇔ outro o nomeia em `supersedes` — sem
   `status:`, sem backlink, nenhum arquivo editado depois de escrito. PRD proposta ⇔ não tem
   `tasks.md`. O `Status:` da PRD tem gramática fechada de quatro valores, e o gate confere contra o
   disco.
6. **A nota no requisito contradito fica** — no requisito, com âncora para quem contradiz, e
   **delimitando o que sobrou de pé**.
7. **Sem índice gerado.** A pasta é o índice, o frontmatter é o resumo. O [índice](../../README.md)
   continua escrito à mão porque já existe — mas nada novo passa a depender dele.

### 3.3 O ADR, concreto

```yaml
---
title: A sessão de agente é ACP, não PTY      # a posição, não o tema
date: 2026-08-17                              # a data da decisão
area: transport
summary: <uma frase que carrega o porquê — é o que decide relevância sem abrir o corpo>
feature: 006-acp-sessions                     # opcional
# supersedes: <nome-do-arquivo>               # opcional; a ausência é o normal
---
## Contexto           → a restrição que forçou a decisão, não o histórico
## Decisão            → 1–2 frases, verificável contra o código
## Alternativas consideradas
###  <alternativa>    → O que era · A favor · Contra · **Por que perdeu**
## Consequências
### Bom / ### Ruim / ### Riscos
```

Três coisas não são negociáveis no formato:

- **`Alternativas` é a parte que não se reconstrói depois.** A decisão está visível no código; os
  caminhos não tomados não estão em lugar nenhum.
- **`Por que perdeu` ≠ `Contra`.** Contra é o custo; por que perdeu é **qual custo foi decisivo**.
- **`Ruim` e `Riscos` são o que faz um ADR valer a leitura.** ADR só com a parte boa é advocacia, e
  quem bater no custo depois não vai saber que ele foi previsto.

### 3.4 A gramática do `Status:`

```
**Status:** proposta | em execução | completa | superada por <link do ADR>
```

| Valor | Deriva de |
|---|---|
| `proposta` | não existe `tasks.md` |
| `em execução` | existe `tasks.md` com checkbox aberto |
| `completa` | existe `tasks.md` sem checkbox aberto |
| `superada por <ADR>` | **não deriva** — é o único valor que precisa de um ADR, porque uma PRD inteira cair é decisão arquitetural |

A prosa rica não se perde: ela desce uma linha, para um `**Histórico:**`. Os 19 campos de cabeçalho
ad-hoc continuam livres de propósito — o gate olha **um** campo, não o cabeçalho.

## 4. Não-objetivos

| Não faz | Por quê |
|---|---|
| índice de ADR gerado | a pasta é o índice e o frontmatter é o resumo. Índice que nunca é escrito não pode divergir — e a alternativa foi desenhada e cortada na referência com o motivo *"designing for volume that does not exist"* |
| campo `status:` ou `superseded_by:` no ADR | [Q2](open-questions.md). É o modo de falha do §1, dois lugares para discordar |
| `docs/adr/drafts/`, ou ADR dentro da pasta da feature | [Q4](open-questions.md). Rascunho promovido é *"two locations and a drift window"*, e decisão sobrevive à feature que a produziu |
| ADR para as 44 supersessões informais | [Q10](open-questions.md). São supersessão de **requisito de feature**, não de arquitetura, e pela regra 4 elas ficam onde estão |
| os gates `broken-supersedes` e `supersedes-cycle` | [Q11](open-questions.md). Para 6 ADRs sem nenhum `supersedes`, é código para um problema que não existe. **Gatilho de voltar: o primeiro `supersedes:` escrito** |
| mover `docs/features/` para `docs/proposals/` na fase de proposta | [Q7](open-questions.md). Quebraria 27 referências e o número não existiria enquanto é proposta |
| renomear `prd.md` | só a **categoria** muda. `docs/features/005-file-editor/prd.md` |
| reescrever os 45 trailers de commit do histórico | git history não se reescreve. §6 |

## 5. O que "proposta" é, e por que ela fica

Três PRDs nunca foram implementadas — [daemon-auth](../019-daemon-auth/prd.md),
[memory-dogfooding](../020-memory-dogfooding/prd.md), [workspace-tasks](../022-workspace-tasks/prd.md). E o
repositório **já resolve isso sem saber**: nenhuma tem `tasks.md`, e o campo `Tasks:` de cada uma diz
literalmente *"ainda não — nascem depois das perguntas respondidas"*.

Isso é o que a feature formaliza, e não é prática ruim. **Arquivo vazio afirma que uma fase rodou;
ausência é o estado correto de uma fase que não rodou.** `tasks.md` não nasce vazio.

Duas consequências que ficam escritas:

- **Numeração não muda na promoção.** Uma proposta de `NNN` baixo implementada depois de uma de
  `NNN` alto **fica com o número baixo** — ele é ordem de criação, e renumerar quebraria as 27
  referências de fora e pagaria o custo dos trailers de novo.
- **A memory-dogfooding é caso à parte, e vale nomear:** ela não é feature de código — *"é um
  período de uso medido"*, e o entregável dela é **uma decisão**. Pelo contrato novo isso é
  candidato natural a virar ADR quando o período fechar, e a pasta dela passa a ser o estudo que o
  sustenta.

## 6. O que esta mudança custa, medido

| Superfície | Quantidade | Quebra? |
|---|---|---|
| `docs/prd` literal | 86 linhas em 38 arquivos | link markdown morto |
| `prd/<x>/` no [índice](../../README.md) | **117 ocorrências** em 107 linhas | idem |
| `../<feature>/` entre PRDs | 129 linhas | idem |
| `../../project/` e `../../references/` de dentro de PRD | 164 linhas | ✅ **imune** — a profundidade não muda |
| Strings executáveis em código | **0** | as 30 referências em `packages/` e `scripts/` são todas comentário ou texto de protótipo |
| Suíte de testes | — | ✅ **imune**. `scripts/gate-quick.ts` exclui `docs/**` por prefixo, e as 3 strings de teste com `docs/prd` são caminhos sintéticos escritos em tmpdir |
| `.claude/agents/` | **4 quebras** em 3 linhas | todas apontando `walking-skeleton`, que os dois agentes ainda chamam de *"feature atual"* — falso desde antes desta mudança |
| **Trailers de commit no histórico** | **45**, em 3 features | ⚠️ **irreversível.** Git history não se reescreve, então 45 mensagens passam a citar caminho inexistente |

Os 45 trailers são o único custo sem conserto, e são eles que fixam a regra 1: **numera uma vez, e
nunca renumera.**

E o risco é inteiramente **link morto silencioso**: não existe link-checker, markdown-lint nem
nenhum assert de existência de arquivo de documentação no repositório inteiro. É por isso que a
feature entrega um.

## 7. O que a referência ofereceu, e o que foi recusado

O estudo do [`vinihcrosa/lumem`](https://github.com/vinihcrosa/lumem) foi por opções já derrubadas
com razão escrita — o que vale mais que a estrutura. **Duas foram derrubadas de novo aqui:**

| Da referência | Aqui | Por quê |
|---|---|---|
| ADR por data pura (`YYYY-MM-DD-slug`) | **data + minuto** (`YYYY-MM-DD-HHMM-slug`) | o desempate por sufixo `-2..-99` que ela implementou vira desnecessário: o minuto ordena, e o único jeito de colidir de verdade é data + minuto + slug idênticos — que é o **mesmo caminho**, então o git levanta `add/add` e a colisão fica **visível** |
| Supersessão parcial **proibida** (a D11) | **proibida no ADR, permitida na PRD** | a D11 está certa sobre decisão arquitetural. Mas a nota do [walking-skeleton](../001-walking-skeleton/prd.md) — *"Continua valendo inteiro para projeto registrado por caminho… o que autoriza é a coluna `managed`"* — não é arquitetura, é requisito de feature, e a **delimitação** é o que a torna útil |
| `lumem adr lint` com dois gates | **não implementado** | lá os dois gates existem e **não rodam em CI nenhum**, e nenhum dos três ADRs usa `supersedes` — a cadeia nunca foi exercitada fora de fixture. Sinal de que custou mais que o valor |

E o que veio inteiro, porque a razão é boa e a evidência local confirma:

- **Estado derivado, não armazenado.** Lá é a D14; aqui é o §1 — 5 de 23 `Status:` errados.
- **Os três testes de "isso merece ADR".** Prova viva de lá: uma feature com 18 decisões e zero ADR.
- **Artefato preguiçoso** (`tasks.md` não nasce vazio) — que já era prática aqui, sem nome.
- **ADR global, nunca dentro da feature** — *"a decisão sobrevive à fatia que a produziu"*.

## 8. Critério de sucesso

Um agente que abre o repositório amanhã sabe responder três perguntas sem ler 24 PRDs:

1. **o que veio antes?** — o número.
2. **o que está decidido, e o que perdeu?** — `docs/adr/`, pelo frontmatter, sem abrir o corpo.
3. **essa PRD ainda vale?** — o `Status:`, e ele **não mente**, porque o gate compara com o disco.
