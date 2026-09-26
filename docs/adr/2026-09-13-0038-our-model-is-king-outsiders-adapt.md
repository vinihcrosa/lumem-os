---
title: O modelo é do Lumem, e o que vem de fora se adapta a ele
date: 2026-09-13
area: architecture
summary: Nenhuma camada do produto depende diretamente de um ente externo — nem do ACP, nem do banco, nem do `gh`, nem de um provider de modelo. O core tem vocabulário próprio e cada coisa de fora entra por um tradutor, com as capacidades que ela tem ou não tem **declaradas**. A fronteira já existe num lugar (`translate.ts`, *"tudo com forma de ACP para aqui"*) e vaza em três, com prova — e é a Q41 da `028` que cobrou a regra em voz alta.
feature: 028-autonomous-orchestration
---

## Contexto

O Lumem fala com cinco coisas que ele não controla: dois adaptadores ACP (Claude e Codex), o `gh` da
máquina, o SQLite por baixo do `drizzle`, e — quando a
[`028`](../features/028-autonomous-orchestration/prd.md) chegar na F5 — um tracker de terceiros. Cada
uma tem vocabulário próprio, versão própria e um conjunto de capacidades que muda sem avisar.

A pergunta que forçou a regra a ser escrita é pequena e concreta. A
[Q41](../features/028-autonomous-orchestration/open-questions.md#q41--em-que-modo-a-esteira-abre-a-sessão-e-quem-escolhe)
perguntou **em que modo a esteira abre a sessão**, e descobriu medindo que o `lumemMode` é **inerte**
para um agente que tem modos próprios: com `ask` e com `free` igualmente, o turno pendura no primeiro
`Edit`, para sempre. O que destrava é `bypassPermissions`, que é vocabulário do **Claude** — e não
existe no Codex.

Escrever a esteira em cima do vocabulário de um provider é escrever uma esteira que só funciona com
ele.

### A fronteira já existe — num lugar

O `acp/translate.ts` diz, no comentário do topo:

> *"Everything ACP-shaped stops here: `_meta`, optional fields, ACP's own status names, and variants
> this version of Lumem does not render. The client downstream never has to know which adapter
> version produced a frame."*

Isso é exatamente a regra, aplicada a uma costura. O `acp-protocol.ts` é o vocabulário do Lumem, e o
catálogo `ADAPTERS` da [`021`](../features/021-second-agent/prd.md) é a nossa `spec` que cada
adaptador preenche.

### E vaza em três, medido

| Onde | O vazamento | O que ele já custou |
|---|---|---|
| `acp-protocol.ts:163` | `acpStopReasonSchema`, com o comentário *"Passed through from ACP's `StopReason`"* | a [Q39](../features/028-autonomous-orchestration/open-questions.md#q39--quem-diz-que-o-agente-está-esperando-você) mediu que essa palavra **não responde a pergunta do produto**: `end_turn` cobre terminar, perguntar e morrer no meio |
| `schema.ts:211` | `session.mode` e `session.model` são `text()` guardando a string crua do agente | é onde a Q41 e a [Q43](../features/028-autonomous-orchestration/open-questions.md#q43--qual-dos-cinco-modos-do-claude-é-o-automático) tropeçam: o produto não tem como perguntar *"este agente tem modo automático?"* sem conhecer os cinco nomes do Claude |
| `schema.ts:958` | `TaskRow = typeof task.$inferSelect` — o tipo do **domínio** é derivado da tabela do `drizzle` | mudar armazenamento muda a assinatura de tudo que lê tarefa. É o banco decidindo a forma do modelo |

## Decisão

> **O nosso modelo é rei. Nenhuma camada do produto depende diretamente de um ente externo.**

Vale para **qualquer** coisa de fora — um adaptador ACP, um banco de dados, o `gh`, um tracker, um
provider de modelo. A regra tem três partes, e as três são verificáveis:

1. **O core tem vocabulário próprio.** O que o produto pergunta é escrito nos termos do produto:
   *"o turno acabou porque terminou, porque perguntou, ou porque estourou o teto?"* — e não
   `end_turn`. *"Este agente aceita trabalhar sozinho?"* — e não `bypassPermissions`.

2. **Tudo que vem de fora entra por um tradutor**, e o tradutor é o único lugar que conhece as duas
   línguas. `translate.ts` é o modelo do que isso é: a forma do estrangeiro **para ali**.

3. **Capacidade é declarada, não descoberta no turno.** Um provider tem features habilitadas ou não,
   e a `spec` dele diz quais. O produto pergunta à `spec`; ele não tenta e vê o que acontece.

**Isto é regra geral, não decisão desta feature.** Adaptador novo, banco novo, host novo — o mesmo
desenho. Quem escreve um caminho que fala a língua do estrangeiro dentro do core está contradizendo
esta decisão, e contradizê-la em silêncio é o defeito.

### O que isto **não** derruba

Três decisões em vigor ficam inteiras, e vale dizer quais porque a regra soa mais larga do que é:

- [A sessão de agente é ACP, não PTY](2026-08-17-1812-agent-session-is-acp-not-pty.md) — **continua.**
  ACP é o **transporte** escolhido, e escolher um transporte não é adotar o modelo dele. A decisão de
  hoje diz que o vocabulário do ACP para na tradução, não que o ACP saia;
- [O status de PR vem do `gh` da sua máquina](2026-08-30-0416-pr-status-comes-from-your-own-gh.md) —
  **continua**, e é um exemplo da regra, não uma exceção: o `pr/verdict.ts` já traduz a saída do `gh`
  para o veredito do produto (*dá pra mesclar?*), que é uma pergunta que o `gh` não faz;
- [O adaptador é a cópia que o daemon instalou](2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
  — **continua**, e reforça: o daemon é dono da cópia **e** da forma com que fala com ela.

### O que isto contradiz

A [`016-session-mode`](../features/016-session-mode/prd.md), §2.1, diz que quando o modo é do agente
*"o Lumem **não interpreta** o valor"*. **Esta decisão contradiz essa frase** e deixa o resto do §2.1
de pé: os dois donos continuam existindo, a pílula continua dizendo de quem é a regra, e o modo do
agente continua mudando *o que ele tenta fazer* enquanto o do Lumem muda *o que passa*.

O que muda é que o Lumem passa a ter **uma noção própria de postura** — a esteira precisa perguntar
*"este agente sabe trabalhar sozinho?"* — e a resposta é um mapeamento declarado na `spec` de cada
adaptador, não um `if` sobre o nome do modo espalhado pelo código. A nota está no requisito
contradito.

## Alternativas

**Seguir o vocabulário do agente, que é o que a `016` escolheu.** Não é hipótese: é o desenho em
vigor, e o motivo dele está escrito — *"o modo do agente muda o que ele tenta fazer"*, e traduzir
correria o risco de o Lumem afirmar uma equivalência entre modos de providers diferentes que não
existe. É um argumento bom e ele perde por **medição**: a Q41 mostrou que sem a noção própria o
produto não consegue nem formular a pergunta que a esteira precisa fazer, e a Q43 mostrou que a
escolha entre `acceptEdits` e `bypassPermissions` é a diferença entre um laço que fecha e um que
pendura no `git commit`. O risco de uma equivalência errada é real; o custo de não ter equivalência
nenhuma é não ter feature.

**Adotar o ACP como modelo do produto** — o `AcpEvent` ser o `session/update` e pronto. É a
alternativa barata, e o `translate.ts` já a recusou uma vez, com o motivo escrito: sem ele, *"o
cliente lá embaixo teria que saber qual versão de adaptador produziu o frame"*. A
[`027`](../features/027-adapter-provenance/prd.md) é a fatura desse tipo de acoplamento cobrada em
outro lugar — o `rateLimitOf` quebrou porque o `0.75.1` aninhou um campo que o `0.40.0` tinha na
raiz, e o rodapé de limite ficou apagado em **todo** transcript do repositório sem nada falhar.

**Uma camada de abstração completa, escrita antes de precisar.** É o extremo oposto e o erro clássico:
inventar a interface de três providers tendo dois, e descobrir no terceiro que ela estava errada. A
regra aqui **não** pede isso — ela pede que a fronteira exista e que o vocabulário seja nosso, e a
interface cresce quando um caso real a cobra. O catálogo `ADAPTERS` nasceu assim, de duas constantes
viraram uma `spec` quando o segundo agente chegou.

## Consequências

- **Três vazamentos nomeados viram dívida com endereço**, e nenhum deles é urgente: `stopReason`,
  `session.mode`/`session.model`, e `TaskRow` derivado do `drizzle`. Consertar os três de uma vez
  seria refatorar o produto inteiro sem um caso que cobre; cada um volta quando a feature que o
  encosta chegar. A F2 encosta nos dois primeiros.
- **A F2 da `028` ganha a pergunta certa**: a `spec` de cada adaptador passa a declarar se ele tem
  postura autônoma e qual é o nome dela naquele provider. O daemon pergunta à `spec`, e a
  [Q43](../features/028-autonomous-orchestration/open-questions.md#q43--qual-dos-cinco-modos-do-claude-é-o-automático)
  vira o preenchimento dela para o Claude.
- **Um provider novo passa a ter um formulário para preencher** em vez de um caminho novo para
  escrever. É o que torna *"OpenRouter"* uma linha de catálogo e não uma feature.
- **Custo real, e é o que a alternativa cobrava:** toda capacidade nova de um provider chega ao
  produto com um turno de atraso — alguém tem que traduzi-la. O `effort` e o `agent` que o `0.75.1`
  expôs estão no backlog exatamente por isso, e sob esta regra é assim que deve ser: o produto não
  ganha uma pílula só porque um adaptador começou a relatar um campo.
- **O `gate:full` não confere nada disto**, e é bom saber: a regra é de revisão, não de teste. O que
  existe hoje é o `unknown-updates.ts`, que loga o que o ACP manda e o Lumem não conhece — e isso é
  meia prova, porque pega o estrangeiro entrando e não o nosso vocabulário vazando.
