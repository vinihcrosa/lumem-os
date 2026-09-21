# A arquitetura do web — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 8 perguntas · **8 respondidas** em **2026-09-21** · **todas como a proposta** · nenhuma
aberta.

Respondidas no mesmo dia em que foram escritas, com a frase *"pode fazer o recomendado"*. Nenhuma
veio contra a proposta — o que é diferente das últimas cinco features, e vale registrar: elas
tinham desenho de tela para derrubar; estas têm regra de pasta, e regra de pasta se derruba no
sensor, quando a lista de exceções não encolher. A [Q5](#x-q5--o-que-substitui-o-trpc-mockts) é
a única cuja resposta **muda a PRD**: o parágrafo *"testes de tela não são reescritos na fase 3"*
caiu, e a nota está no requisito.

Cada pergunta traz a **proposta** e a **resposta**. Onde a resposta é *"como proposto"*, o que fica
escrito é o que a resposta muda no resto.

---

### [x] Q1 — Onde mora o sensor?

A [T10 da `024`](../024-dev-harness/tasks.md) vai criar `scripts/architecture.test.ts` para a
fronteira **entre pacotes**, e a Q3 de lá recomenda `scripts/` porque *"o teste lê o disco de todos
os pacotes"*. O sensor daqui lê **um** pacote — `packages/web/src` — e regula pastas dentro dele.

Dois candidatos: estender o teste da T10 quando ele existir, ou um `packages/web/src/architecture.test.ts`
próprio, agora.

**Proposta:** o arquivo **próprio, dentro do `web`**, agora. Três motivos. A `024` é proposta e não
tem data; esperar é deixar a fase 0 refém de outra feature. O teste regula o `web` e mora no `web`
— o argumento da Q3 de lá (*"morando dentro de um pacote ele inverteria a direção que defende"*)
vale para fronteira entre pacotes e não se aplica a fronteira interna. E quando a T10 existir, ela
pode **chamar** este — ou não; os dois não se pisam.

**O que a resposta muda:** um caminho de arquivo e se a fase 0 depende da `024`.

**Resposta (2026-09-21):** como proposto — `packages/web/src/architecture.test.ts`, próprio, agora. A fase 0 não depende da `024`. Quando a T10 de lá existir, a Q3 dela decide se chama este.

### [x] Q2 — Cascata organizada ou CSS Modules?

O §4 da PRD especifica os dois caminhos da fase 7. O que os separa não é gosto: é **quem lê o nome
da classe**. Hoje três coisas leem — os dez `*-css.test.ts` (afirmam sobre valores por seletor),
o `styles/contrast.ts` (119 pares por nome de classe) e o agentation (anota o elemento clicado pela
classe). Modules embaralha o nome em produção e, com `localsConvention`, também em dev.

A favor de Modules: colisão e órfã viram erro de compilação, e a cascata dependente de ordem de
montagem desaparece por construção. Contra: as três leitoras acima, e o fato de que o
[ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md) acabou de escolher
*"o componente React é o desenho"* com `var(--token)` em classe global — Modules não contradiz, mas
é uma segunda decisão sobre a mesma superfície três meses depois.

**Proposta:** **caminho A**, a cascata organizada. Ele entrega o que dói hoje — bloco duplicado e
órfã — com um teste de 60 linhas, e não toca nas três leitoras. Modules fica como pergunta para o
dia em que o `web` tiver duas equipes ou um segundo tema; o gatilho está no backlog. **Se a resposta
for B, vira ADR antes do primeiro `.module.css`** — ela passa nos três testes, e a PRD já diz por
quê.

**O que a resposta muda:** o tamanho da fase 7 (M contra G), se há ADR, e se os dez testes de CSS
são renomeados ou reescritos.

**Resposta (2026-09-21):** como proposto — **caminho A**, a cascata organizada. Sem ADR, porque a decisão é reversível: o que se escreve é um teste e dez renomes. CSS Modules vai para o [backlog](../../project/backlog.md) com o gatilho *segunda equipe ou segundo tema*.

### [x] Q3 — O mapa de features está certo?

A tabela da fase 4 propõe nove pastas a partir do que cada componente **importa hoje**. Duas
fronteiras são discutíveis:

- `SidebarTree` e `SidebarNav` estão em `workspace/` porque leem a lista de projetos e a rota do
  workspace — mas `SidebarTree` também mostra `● #19` da pull request e o ponto de sujeira da
  worktree. Alternativa: `sidebar/` própria.
- `SessionTab`, `NewSessionMenu` e `Terminal` estão em `conversation/`, mas a aba é da coluna do
  checkout (`ScopePanel` a monta). Alternativa: em `checkout/`, com a `Conversation` sendo o que a
  aba renderiza.

**Proposta:** manter o mapa como está e **decidir pelo import**: se depois da fase 3 o
`SidebarTree` importar `features/pull-request/index.js`, está certo em `workspace/` — a porta é
para isso. `SessionTab` fica em `conversation/` porque o que ela decide (conversa ou terminal,
morta ou viva, `record`) é sobre sessão e não sobre checkout. A regra geral: **uma feature é o
substantivo que o daemon tem tabela para** — workspace, task, session, memory, pull request,
agent — mais as duas que são da tela (`checkout` para a coluna do meio, `setup` para o primeiro
acesso).

**O que a resposta muda:** nomes de pasta. Nada de código.

**Resposta (2026-09-21):** como proposto — o mapa da fase 4 fica, e a regra é *uma feature é o substantivo que o daemon tem tabela para*, mais `checkout` e `setup`. Se depois da fase 3 um import contradisser o mapa, o import ganha.

### [x] Q4 — A fase 5 vem antes ou junto da LUM-63?

A LUM-63 (workspace, projeto e checkout na URL — o N3 da Q2 da [`030`](../030-settings/prd.md))
vai serializar exatamente o estado que a fase 5 põe no store: `selection`. Fazer a fase 5 antes dá à
LUM-63 um lugar para escrever; fazer junto evita mexer no `App.tsx` duas vezes; fazer depois é o
que a PRD chama de risco — mais um `useState` no App antes de ele encolher.

**Proposta:** **antes, como a primeira task da LUM-63** — a fase 5 vira a fase 0 daquela, e o
`tasks.md` dela nasce apontando para cá. Assim as ADRs de roteamento nascem lá, como a `030`
prometeu, e nascem sobre um store e não sobre oito `useState`.

**O que a resposta muda:** em qual `tasks.md` a fase 5 aparece.

**Resposta (2026-09-21):** como proposto — a fase 5 é a **fase 0 da LUM-63**. As tasks dela moram no [tasks.md](tasks.md) daqui como spec, e o `tasks.md` da LUM-63 nasce apontando para elas. Ordem: depois da fase 4, e antes de qualquer linha da URL.

### [x] Q5 — O que substitui o `trpc-mock.ts`?

Hoje: um objeto de 300 linhas, escrito à mão, com defaults de resposta vazia para toda query que
alguma tela faz no `mount`. O testing.md registra duas armadilhas dele — *"tela nova derruba testes
cujo mock não a conhece"* e *"o mock compartilhado é parte do contrato"*. Depois da fase 3 o
componente não chama `trpc`; o hook chama.

Três candidatos:

- **A — `Proxy` recursivo tipado por `AppRouter`.** `trpc.qualquer.coisa.query` devolve um
  `vi.fn()` criado sob demanda; o default é `undefined`, e `useQuery` reclama — então os defaults de
  resposta vazia continuam precisando existir para quem monta no `mount`. Mata as 300 linhas mas
  não a segunda armadilha.
- **B — mock por hook.** `vi.mock("../hooks/useAgentConfigs.js")` no teste da tela; o teste do
  hook usa o `trpc` real com `msw` ou o `Proxy`. A tela nunca vê transporte; o mock dela é a
  **interface do hook**, que é o que ela realmente consome.
- **C — manter**, e só encolher.

**Proposta:** **B para tela, A para hook.** É o que a fase 3 já torna natural: a tela depende do
hook e mocka o hook; o hook depende do `trpc` e mocka o `trpc`. A segunda armadilha morre porque
uma tela nova traz o hook novo com o mock dele — quem não a renderiza não a conhece e não precisa.
O custo é reescrever os testes de tela **na fase 3**, um recurso por vez, o que contradiz o
*"testes não são reescritos nesta fase"* da PRD — então a resposta desta pergunta decide se aquele
parágrafo fica.

**O que a resposta muda:** o critério *"trpc-mock.ts < 60 linhas"* das fases 3 e 8, e se a fase 3
toca em teste de tela.

**Resposta (2026-09-21):** como proposto — **B para tela, A para hook.** Consequência assumida: a fase 3 **reescreve os testes de tela** do recurso que migra, um recurso por PR; o parágrafo contrário da PRD ganhou nota. O `trpc-mock.ts` some no fecho da fase 3 — o critério *"< 60 linhas"* vira *"não existe"*.

### [x] Q6 — Os hooks de recurso moram em `hooks/` ou na feature?

Depois da fase 4, `useMemory` pode ficar em `hooks/useMemory.ts` (transversal, como hoje) ou em
`features/memory/queries.ts` (junto de quem o usa). O `useLiveState` e o `useAwaitingPermission` são
do app inteiro e ficam em `hooks/` de qualquer jeito.

**Proposta:** **na feature**, e `hooks/` fica só com o transversal (`useLiveState`,
`useAwaitingPermission`, `useOpenFiles`, `usePopover`, `useSettled`). A porta da feature
(`index.ts`) exporta o hook junto com o componente, e outra feature que precise do dado importa a
porta — que é como `SidebarTree` vai ler a pull request. O sensor troca *"fora de `hooks/`"* por
*"fora de `hooks/` e de `features/*/queries.ts`"*.

**O que a resposta muda:** uma linha do sensor e o destino de 13 arquivos no `git mv` da fase 4.

**Resposta (2026-09-21):** como proposto — na feature, em `features/<x>/queries.ts`. A fase 3 os cria em `hooks/` (a pasta `features/` ainda não existe) e a fase 4 os move com o resto; `hooks/` fica só com o transversal.

### [x] Q7 — Como o sensor distingue "inferido" de "espelhado"?

A regra 5 do §3 é fácil de dizer e difícil de testar: um `interface BoardCard { ... }` no web é
espelho ou é modelo de tela? O `grep 'espelha'` da fase 2 pega os três de hoje porque o comentário
confessa; o próximo não vai confessar.

**Proposta:** **não testar por máquina**, e sim por convenção escrita no `testing.md` e na
revisão: *"tipo que aparece com o mesmo nome em `server/` e em `web/` reprova na revisão, e o
revisor pergunta por que não está em `shared/`"*. Um teste que compare nomes de interface entre os
dois pacotes é possível (o `lumem-reviewer` já lê os dois), mas dá falso positivo em `Selection`,
`Route` e outros nomes genéricos. Se a fase 2 achar um quarto espelho que não confessa, a pergunta
reabre.

**O que a resposta muda:** se a fase 0 ganha uma sexta regra.

**Resposta (2026-09-21):** como proposto — convenção escrita, sem sexta regra no sensor. Reabre se a fase 2 achar um espelho que não confessa.

### [x] Q8 — Qual é o teto de linhas de um arquivo do `web`?

A Q4 da `024` propõe **700** para arquivo novo do repositório inteiro, com mapa de exceções que só
encolhe. Um `.tsx` de 700 linhas é outra coisa: são três componentes, ou um componente e o hook
dele. A fase 6 propõe **400** para `features/`.

**Proposta:** **400 para `.tsx` e `.ts` em `features/`**, mapa com os oito que hoje passam
(`SettingsPanel` 679, `FileTree` 640, `useFileBuffer` 605, `RunDock` 601, `CreateWorktreeDialog`
547, `Board` 461, `FileViewer` 461, `WorkspacePanel` 450) e sem teto para `lib/` — `conversation-model.ts`
tem 715 e é **um** fold puro com um teste; quebrá-lo por tamanho seria piorá-lo. Se a T10 da `024`
chegar com 700 para o repositório, os dois convivem: o dela é o máximo, o daqui é o do `web`.

**O que a resposta muda:** um número no sensor e o tamanho do mapa de exceções.

**Resposta (2026-09-21):** como proposto — **400** para `.ts`/`.tsx` em `features/`, mapa com os oito, sem teto em `lib/`.
