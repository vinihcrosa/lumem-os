---
title: Uma feature se prova por checks, e não se planeja em tasks
date: 2026-09-28
area: docs
summary: Feature nova neste repositório segue o fluxo da `tlc-spec-lean` — plano, checks, construção, verificação — dentro de `docs/features/NNN-nome/`. O `prd.md` ganha a forma do plano, o `open-questions.md` fica, o `checks.md` **substitui** o `tasks.md` e o `verification.md` é escrito por um `lumem-reviewer` novo, que não é o autor. Features existentes ficam no formato de tasks. O `Status:` passa a ser derivado de `tasks.md` **ou** `checks.md`. O número, a precedência em ADR e a gramática do `Status:` do ADR de 2026-09-07 ficam inteiros.
feature: 024-dev-harness
---

## Contexto

A [Q14 da `024`](../features/024-dev-harness/open-questions.md) decidiu tirar a `tlc-spec-lean` do
repositório **como estava** e basear nela o fluxo de feature, com a estrutura de `docs/features/` no
lugar do `.specs/` dela. A [Q15](../features/024-dev-harness/open-questions.md) é como.

As duas concordam em quase tudo. Os quatro movimentos da skill — **plano → checks → construção →
verificação** — têm correspondência aqui: o `prd.md` é o plano, o `open-questions.md` é o *"decisões,
você pergunta"* dela, as decisões `AD-NNN` do `STATE.md` dela são os ADRs, e o verificador que não é o
autor é o `lumem-reviewer`. Discordam num ponto só, e é o que este ADR decide: **a lista de tasks.**

A skill a recusa por princípio: *"granularidade não é qualidade"* — quinze tasks de um arquivo compram
ordem, não correção, e competem com as obrigações pela atenção do modelo. O que ela congela é o
**conjunto de obrigações**: cada check é uma afirmação observável com valor concreto, mais a **prova**
— o teste ou comando cujo código de saída a decide. Sem prova, não é check.

Aqui o `tasks.md` é contrato em três lugares: o `check-docs` deriva dele o `Status:` (proposta ⇔ sem
`tasks.md`), o `lumem-dev` executa por número de task, e a regra 5 do `CLAUDE.md` diz que ele não nasce
vazio. E o repositório já mediu os sintomas que a skill descreve:

- a [`walking-skeleton`](../features/001-walking-skeleton/tasks.md) foi entregue com **244 caixas
  abertas**, e a [`025`](../features/025-docs-contract/prd.md) teve que escrever que checkbox não
  indica progresso;
- a mesma `025` registrou que *"task escrita não é task começada"*;
- a [`028`](../features/028-autonomous-orchestration/tasks.md) tem **61 tasks** num arquivo só, e a
  [`024`](../features/024-dev-harness/tasks.md) ficou três semanas com 16 tasks escritas e nenhuma
  começada.

## Decisão

**Feature nova se prova por checks, e não se planeja em tasks.** Dentro de `docs/features/NNN-nome/`:

| Arquivo | O quê | Quem escreve |
|---|---|---|
| `prd.md` | o plano: problema, fluxo, impacto, entidades, superfície, **portas de mão única** (a forma literal e a alternativa recusada) e critérios EARS | quem planeja; uma pessoa lê e objeta antes de existir check |
| `open-questions.md` | as decisões que se perguntam, como hoje | quem planeja |
| `checks.md` | as obrigações: `C1…Cn`, cada uma com a prova, o join de cobertura e a política de teste | quem planeja, depois do plano aprovado |
| `verification.md` | o relatório do verificador, prova por prova | um `lumem-reviewer` **novo**, nunca o autor |

A construção não tem artefato: é do agente, escreve os testes **a partir dos checks** e nunca da
implementação, e commita. Mudança pequena — menos de uns três arquivos e nenhuma porta de mão única —
tem só `checks.md`, com um parágrafo de intenção, que é o atalho da própria skill.

**O `Status:` continua com a gramática fechada** e passa a ser derivado de `tasks.md` **ou**
`checks.md`: proposta ⇔ nenhum dos dois existe. Os validadores da skill, em Python, viram TypeScript
em `scripts/`, ao lado do `check-docs`, com teste que os faz ficar vermelhos de propósito.

**O que fica, inteiro, do [ADR de 2026-09-07](2026-09-07-2208-prd-number-is-reading-order-not-precedence.md):**
o número é ordem de leitura e nunca é renumerado; a precedência mora em `docs/adr/`; o `Status:` tem
gramática fechada e se deriva do disco. O que muda é **qual arquivo do disco**, e não a regra.

**Features existentes ficam como estão.** As duas formas convivem, e nenhuma feature é convertida.

## Alternativas

### O `tasks.md` fica, com os checks dentro dele

- **O que era:** cada task troca o *Done when* em prosa por checks com prova.
- **A favor:** nada muda no contrato, no `check-docs` nem nos agentes. É a mudança mais barata.
- **Contra:** preserva exatamente o que a skill existe para tirar — uma lista de ordem competindo com
  as obrigações.
- **Por que perdeu:** basear o fluxo na skill e cortar a tese central dela é ficar com a casca. E os
  sintomas que a tese descreve estão medidos neste repositório, no §Contexto.

### A skill como ela é, em `.specs/`

- **O que era:** reinstalar a `tlc-spec-lean` sem mudança, com os artefatos dela em `.specs/`.
- **A favor:** zero trabalho de adaptação, e as atualizações da skill chegam de graça.
- **Contra:** dois lugares de documentação de feature, e a regra de documentação do `CLAUDE.md` diz
  que é um só.
- **Por que perdeu:** a Q14 pediu *"com a nossa estrutura de docs"*. E o gate daqui não enxergaria o
  `.specs/`.

### `tasks.md` opcional, `checks.md` sempre

- **O que era:** o `checks.md` é obrigatório e o `tasks.md` é permitido para quem quiser ordem.
- **A favor:** não fecha a porta para uma feature grande que precise de sequência.
- **Contra:** sem regra de quando usar, o opcional vira o padrão de sempre, e volta a lista.
- **Por que perdeu:** a skill já tem a resposta para a feature grande — **fatias** dentro do
  `checks.md` (`S1`, `S2`), cortadas onde a superfície muda, com a conta de contexto de cada uma. É
  ordem sem lista de tasks.

## Consequências

### Bom

- A obrigação passa a ser o que manda: um check sem prova não existe, e o verificador que não é o
  autor fecha o buraco de *"o autor confere o próprio ponto cego"*.
- O `lumem-reviewer` ganha um lugar fixo no fluxo, em vez de rodar quando alguém lembra — que é a
  lacuna D5 da [auditoria](../project/harness-audit.md).

### Ruim

- **Duas formas convivem.** Quem lê uma feature antiga lê tasks; quem lê uma nova lê checks. O
  `check-docs` precisa conhecer as duas.
- **O `lumem-dev` e o `lumem-reviewer` mudam.** O primeiro executa checks por fatia e não task por
  task; o segundo escreve o `verification.md`. Os dois arquivos em `.claude/agents/` são reescritos.
- **A `024` termina no formato antigo.** A primeira feature no fluxo novo é a próxima.
- **A adaptação é nossa.** Atualizações da skill original não chegam sozinhas; quem quiser trazer uma
  lê o diff dela e decide.

### Riscos

- **O verificador caro demais para ser usado.** A skill manda disparar sempre, sem perguntar. Se o
  custo em token de verificar toda feature ficar alto, o risco é ele ser pulado em silêncio — e o
  gate do `verification.md` existe para que pular seja visível. **Gatilho de voltar:** três features
  seguidas em que o verificador foi pulado ou rodou pela metade.
