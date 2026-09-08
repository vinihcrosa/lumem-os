---
title: A memória escreve atrás de um portão, uma inbox e um interruptor desligado
date: 2026-08-17
area: memory
summary: Um caminho de escrita só para toda origem, com a decisão persistida antes de tocar o arquivo, porque revert real e replay pós-crash são o que tornam aceitável um sistema que escreve sozinho.
feature: 007-workspace-memory
---

## Contexto

A `007-workspace-memory` é a primeira feature do repositório em que **o sistema escreve sozinho** —
sem tela, sem gesto, a partir do que uma sessão de agente produziu. Todas as outras escrevem porque
alguém clicou.

A restrição que bifurca a decisão: **memória de workspace escrita por agente é irrastreável se não
carregar proveniência, e é a mais cara de errar.** Uma memória errada não falha visivelmente — ela
entra em todo prompt seguinte e enviesa tudo, silenciosamente, até alguém notar.

## Decisão

**Um caminho de escrita só**, para toda origem — tool MCP, comando seu, hook, importação — em seis
passos, com a **decisão persistida antes de tocar o arquivo**. Toda entrada carrega proveniência
(origem, sessão, projeto, confiança, e `superseded_by` quando substituída). Precedência é **shadow,
nunca merge**. E os três interruptores que gastam token vêm **desligados**, aparecendo na tela.

## Alternativas consideradas

A régua completa está no [§7 do PRD](../features/007-workspace-memory/prd.md) e as perguntas em
[`open-questions.md`](../features/007-workspace-memory/open-questions.md) — a Q36 (git por baixo), a
Q37 (o WAL mais magro) e a Q3.1 (identidade de volta ao repositório) são as que moveram o desenho.

### A régua grande do Compozy

- **O que era:** a ordem de validação do Compozy inteira, do jeito que o estudo dele descreve.
- **A favor:** já existe, já foi pensada, e é mais completa.
- **Contra:** o §12.6 daquele estudo recomendou **menos**.
- **Por que perdeu:** rejeitar toda crase tripla transforma o portão num obstáculo que as pessoas
  aprendem a contornar. Ficaram poucas regras, focadas — segredo/credencial, prompt injection, runas
  Unicode invisíveis — e o resto foi para `WHAT_NOT_TO_SAVE`, versionada.

### WAL com o conteúdo anterior

- **O que era:** o write-ahead log guardando o estado de antes, para poder reverter.
- **A favor:** revert sem depender de mais nada.
- **Contra:** duplica o conteúdo, e duas cópias podem divergir.
- **Por que perdeu:** a [Q36](../features/007-workspace-memory/open-questions.md) pôs **git** por
  baixo do `~/.lumem`, e com isso o conteúdo anterior **é o commit anterior**. O WAL emagreceu para
  a *decisão* — origem, regra, confiança, idempotência, resultado, e o SHA que ela produziu. Rejeição
  e no-op vivem **só** no WAL, porque não viram arquivo.

### Merge entre camadas de memória

- **O que era:** memória de workspace e de projeto se combinando no recall.
- **A favor:** o agente veria tudo que é relevante de uma vez.
- **Contra:** ninguém consegue dizer de onde veio uma afirmação combinada.
- **Por que perdeu:** **shadow, nunca merge** — a camada mais específica *esconde* a mais geral em
  vez de fundir com ela. É a única forma em que a proveniência sobrevive ao recall, e proveniência é
  o ponto todo.

### Os interruptores ligados por padrão

- **O que era:** destilação de fim de sessão, auto-learn e playbooks ativos de fábrica.
- **A favor:** a feature só mostra o que vale quando está ligada, e desligada ela parece inútil.
- **Contra:** os três gastam token sem você pedir.
- **Por que perdeu:** gastar dinheiro de alguém por padrão precisa de consentimento, não de um
  default esperto. Eles vêm desligados **e aparecem na tela** — a alternativa de vir desligado e
  escondido seria pior que ligado.

## Consequências

### Bom

- **`revert` real e replay pós-crash** existem, e são o que torna aceitável um sistema que escreve
  sozinho.
- **`git diff` do `~/.lumem` é a auditoria depois; a inbox de propostas é a revisão antes.** Duas
  chances de pegar uma memória errada, em momentos diferentes.
- *"O que dá para derivar lendo o repositório não é memória"* — e a regra vale **mesmo quando você
  pede para salvar**.

### Ruim

- **Seis passos é caro** para escrever uma linha, e o caminho é o mesmo para o comando manual que
  para o auto-learn. Um comando seu paga o preço de um agente não confiável.
- Desempate por LLM no passo 5 significa que **um caminho de escrita depende de rede**, com timeout
  e fallback `noop`.
- Três interruptores desligados significam que a parte mais elaborada do produto é a menos usada — o
  que virou a [`020-memory-dogfooding`](../features/020-memory-dogfooding/prd.md).

### Riscos

- **`superseded_by` armazenado.** A memória guarda supersessão como campo, e este repositório decidiu
  o contrário para ADR — ver
  [o número da PRD é ordem de leitura](2026-09-07-2208-prd-number-is-reading-order-not-precedence.md).
  A diferença é deliberada e vem da natureza dos dois: memória é afirmação sobre o presente e
  apodrece, então ela tem um registro que se corrige; ADR é registro de um ato e não se edita, então
  a supersessão se deriva. Se um dia o campo da memória divergir do que o recall entrega, é aqui que
  a decisão está.
- Nada disso impede uma memória **verdadeira e inútil**. O portão checa segurança e duplicata, não
  valor.
