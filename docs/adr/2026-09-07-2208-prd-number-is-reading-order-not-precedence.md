---
title: O número da PRD é ordem de leitura, não precedência
date: 2026-09-07
area: docs
summary: A precedência entre documentos sai do índice das features e vai para uma cadeia de ADRs, porque um número afirma o instante da criação e a decisão se move depois dele — e um campo de prosa que carrega estado apodrece, como 5 dos 23 `Status:` deste repositório provam.
feature: 025-docs-contract
---

## Contexto

O `docs/prd/` tinha 24 pastas e nenhuma ordem legível, e o pedido foi um índice temporal —
`NNN-nome`, três dígitos — com a regra de que **PRD é estado temporal: a mais recente manda**.

Duas medições feitas antes de escrever mudaram o que a regra podia ser.

**A primeira: o repositório já registra precedência em 44 lugares, em prosa.** A frase-regra aparece
6 vezes — *"decisão revertida sem registro é decisão que volta sozinha"* — e a mecânica é boa: a nota
vai no **requisito contradito**, com âncora para quem contradiz, delimitando o que sobrou de pé. E
**falha 1 em 5**: quatro links apontam para `docs/prd/worktree-tabs/prd.md`, arquivo que nunca
existiu, dois deles criados por tasks marcadas `[x]` cujo trabalho era propagar exatamente essa nota.

**A segunda, e é a restrição que bifurca a decisão: campo de prosa que carrega estado apodrece.** O
`**Status:**` é universal (23 de 23) e **mente em 5** — `pull-request-status` se declara *"em
implementação"* com uma nota dizendo *"nenhuma das 16 tasks foi iniciada"*, enquanto o `tasks.md` diz
completa e `packages/server/src/pr/` tem 14 arquivos e ~115 KB. Vaza para fora do `docs/`: os dois
READMEs da raiz publicam *"designed, not built"* sobre essa feature.

## Decisão

O número ordena a leitura e **não afirma precedência**. `docs/features/NNN-nome/`, três dígitos,
ordem de merge do git, atribuído na criação e **nunca renumerado** depois de ter referência de fora.

A precedência mora em `docs/adr/`: **`docs/adr/` decide · `docs/project/` sustenta ·
`docs/features/` executa · o código está em vigor.** ADR não descreve o sistema, descreve escolhas —
a posição atual sobre uma decisão é a cadeia lida até o fim; sobre comportamento, é o código.

## Alternativas consideradas

### Prioridade dura — a PRD mais recente manda

- **O que era:** o pedido original. O número é a lei: PRD de `NNN` maior derruba a de `NNN` menor, e
  um agente pode ignorar a mais antiga sem ler.
- **A favor:** é a regra mais curta possível, e a única que dispensa ler os dois documentos. Para um
  agente com contexto limitado, isso é dinheiro.
- **Contra:** exige três regras novas — o que fazer com emenda posterior, o que fazer com colisão de
  `NNN` entre worktrees, e onde ficaria a projeção do estado atual.
- **Por que perdeu:** **a lei nasceria errada no dia um.** A
  [Q6 da `015-run-dock-open`](../features/015-run-dock-open/open-questions.md) foi respondida em
  2026-09-01 e **revertida em 2026-09-06**, antes de qualquer código. O número daquela pasta é o de
  09-05. Uma decisão de 09-06 mora num número mais velho que features criadas em 09-05 — e não é
  caso raro: é o padrão de trabalho deste repositório, onde PRD se emenda enquanto executa. O custo
  decisivo não foi o número de regras; foi que a regra seria **falsa contra um caso que já
  existia**.

### Prioridade como default — o mais novo ganha se contradiz de fato

- **O que era:** o meio. Tem que ler os dois; o mais recente prevalece quando há contradição real; o
  par de links `Sucede:`/`Substitui:` carrega o peso e o número é dica.
- **A favor:** preserva a convenção informal que já existe em 44 lugares, sem inventar categoria
  nova.
- **Contra:** o número continua sugerindo autoridade que ele não tem.
- **Por que perdeu:** **na prática é "só ordem" com uma frase a mais** — se ler os dois é
  obrigatório, o número não decidiu nada. A frase extra só cria a chance de alguém tratá-la como
  regra dura.

### Ordem, com a precedência num campo de estado por documento

- **O que era:** manter o número como ordem, e resolver precedência com `status: superseded` mais
  `superseded_by:` escritos no documento superado.
- **A favor:** quem abre o arquivo velho **vê o aviso na hora** — que é o buraco real da alternativa
  escolhida.
- **Contra:** dois lugares que podem discordar, e alguém tem que lembrar de editar o antigo.
- **Por que perdeu:** os 5 `Status:` errados são a medição desse modo de falha **neste repositório**,
  não em teoria. Um campo que exige write-back num arquivo antigo é um campo que vai divergir.

### Supersessão parcial permitida também no ADR

- **O que era:** deixar um ADR reverter *parte* de outro, com escopo escrito — que é o que este
  repositório já faz bem na PRD.
- **A favor:** reversão pequena custa nota pequena, e a
  [nota do `001-walking-skeleton`](../features/001-walking-skeleton/prd.md) é o melhor artefato de
  supersessão dos dois repositórios estudados: reverte o F2.5 só para projeto gerenciado e escreve
  *"continua valendo inteiro para projeto registrado por caminho… o que autoriza é a coluna
  `managed`, e não uma dedução"*.
- **Contra:** transforma cada decisão num diff contra outra decisão.
- **Por que perdeu:** **para arquitetura, sim; para requisito de feature, não.** A posição atual sobre
  uma decisão arquitetural precisa caber num arquivo — se ela precisa ser montada de fragmentos,
  ninguém consegue enunciá-la. Mas a nota do `001` não é arquitetura, e é justamente a delimitação
  que a torna útil. Ficaram as duas gramáticas, com a fronteira sendo o que morre com a feature.

## Consequências

### Bom

- **Três problemas desapareceram sem regra nova:** emenda × criação, colisão de `NNN` em paralelo, e
  "nenhum arquivo descreve o presente". Todos eram problemas de prioridade no número.
- **O número nunca mente, porque não afirma nada.** Isso também torna o desempate de empate
  irrelevante: 10 das 24 pastas nasceram em três commits que criaram várias de uma vez, sem "antes"
  entre elas, e o desempate alfabético não custa nada exatamente porque o número não significa nada.
- **O `Status:` passou a ter gramática fechada de quatro valores**, e três deles se derivam do disco
  — o gate compara.
- O parágrafo de estado do `CLAUDE.md` ganhou papel nomeado: **ele é a projeção.**

### Ruim

- **Um agente que só olha o número não sabe o que está em vigor.** Ele *tem* que ir ao `docs/adr/`, e
  nada o obriga.
- **Quem abre um ADR superado direto não vê aviso nenhum.** Status derivado significa que o arquivo
  antigo fica intocado. O agente caminha a cadeia; a pessoa não.
- **Duas gramáticas de supersessão** para aprender, e a fronteira *"isso morre com a feature ou
  atravessa o sistema?"* é julgamento.
- Os **45 trailers de commit** no histórico passam a citar caminho inexistente. Irreversível, pago
  uma vez — e é o que fixa a regra de nunca renumerar.

### Riscos

- **A pergunta que este desenho não responde:** um agente lê de fato uma decisão para a qual ele
  apenas foi *apontado*? A referência estudada registra isso como a incógnita que ela esperava o uso
  real responder, e aqui vale o mesmo. É o tipo de coisa que a
  [`020-memory-dogfooding`](../features/020-memory-dogfooding/prd.md) mediria.
- **Sem gate de cadeia** (`broken-supersedes`, `supersedes-cycle`) — nenhum destes seis ADRs tem
  `supersedes`, então seria código para um problema que não existe. Na referência os dois gates
  existem e não rodam em CI nenhum. **Gatilho de voltar: o primeiro `supersedes:` escrito.**
- **`docs/adr/` cresce plano, sem índice gerado** — a pasta é o índice e o frontmatter é o resumo. A
  referência estima que a conta só fecha contra isso em ~60 ADRs; aqui são seis, e a aposta é que a
  frase de `summary` sustente a descoberta até lá.
