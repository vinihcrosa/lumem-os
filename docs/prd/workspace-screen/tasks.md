# A tela do workspace — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **nove tasks entregues; a T8 nasceu do uso e está aberta.** Entrar num projeto era um beco
sem saída — o painel do workspace só aparece com nada selecionado, e nada desfazia a seleção. O desenho
do caminho de volta está feito ([W7](open-questions.md)); a implementação é a fase 5. Três caixas ficaram marcadas sem prova
por um dia — auditoria própria as devolveu para aberto, e depois elas foram fechadas com teste. As
telas foram desenhadas no Open Design (`lumem-workspace.html`), o consumo existe e é somável nos dois
escopos. Portão verde: `gate:full` com **2.270 unit/integration + 38 e2e**. A ordem é a do
risco: o consumo primeiro, porque ele é a única parte que pode não caber.

---

## Antes de começar

**O que trava:** o **desenho**. Nada desta feature existe no Open Design, e é lá que nasce
([regra](../../project/design-source-of-truth.md)) — o §8 do PRD lista as quatro telas. Cada task de
tela desenha lá primeiro e traz pelo `design:sync`.

**O que não trava:** `workspace.rename`, `workspace.remove`, `workspace.get`,
`project.listByWorkspace` e `memory.list` por workspace já existem e já têm teste.

**O que a W4 acrescentou:** o consumo **não é** uma query nova sobre dado existente — é um dado que
não é gravado (§6 do PRD). Então a fase 1 é daemon, e nenhuma tela depende de palpite sobre o que o
número significa.

---

## Fase 1 — o consumo passa a existir

#### C1: A medição, gravada

**What**: Cada `usage_update` vira uma linha somável, com projeto e worktree resolvidos.
**Where**: `db/schema.ts`, migração, `usage/record.ts` (ou `sessions/usage.ts`) + testes

**Done when**:
- [x] Tabela com **delta de tokens** e **custo do turno**, carimbo de tempo, `sessionId`, `projectId` e
      `worktreeId` — resolvidos na escrita, porque agregar depois seria join polimórfico em
      `session.scope_id`
- [x] O delta é `used - último used da sessão`, com piso zero: somar `used` cru conta o mesmo token N
      vezes, e é a armadilha que o §6 nomeia
- [x] Sessão **retomada** começa a janela de novo, e o primeiro delta dela é o valor inteiro — quem
      retoma paga o contexto recarregado
- [x] `cost` soma direto: ele já é por turno
- [x] Quem escreve é o `AcpManager.watchEvents` que a `workspace-memory` instalou — **nenhum caminho
      novo**, e falha dele não atrapalha o turno
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(sessions): gravar o consumo de cada turno, por projeto e worktree`

---

#### C2: A soma, por escopo e por janela

**What**: `usage.byProject` e `usage.byWorktree`, com a janela resolvida no daemon.
**Where**: `usage/query.ts`, `routers/usage.ts` + testes

**Done when**:
- [x] Janela por **enum** — `1d`, `7d`, `1m`, `6m`, `1y` —, e o corte calculado no servidor: o relógio
      do cliente não decide o que "últimos 7 dias" quer dizer, senão duas telas dão duas respostas
- [x] `byProject` agrupa por projeto dentro de um workspace; `byWorktree` agrupa por worktree dentro de
      um projeto
- [x] Projeto sem consumo aparece com **zero**, e não desaparece: "não gastou" é resposta
- [x] Tokens e custo separados — custo pode não vir (agente que não reporta dinheiro não pode parecer
      grátis)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): somar consumo por projeto e por worktree, com janela de tempo`

---

### O que a fase 1 achou

| # | O quê | Onde |
|---|---|---|
| **U1** | **`count(*)` num `LEFT JOIN` conta a linha vazia.** O projeto que não gastou nada reportava "1 turno", porque o join produz a linha dele com o consumo todo nulo. `count(<coluna>)` ignora nulo, que é exatamente a pergunta | `usage/query.ts` |
| **U2** | **O corte de tempo mora no `JOIN`, não no `WHERE`.** No `where` ele elimina a linha do projeto que só gastou fora da janela — e a lista volta a esconder quem não gastou, que é o oposto do que a decisão pede | `usage/query.ts` |
| **U3** | **A soma das worktrees não fecha com o total do projeto**, porque sessão de escopo `project` grava `worktree_id = ''`. Então `byWorktree` devolve as worktrees **e** o `outside` na mesma resposta: em duas chamadas, a tela poderia mostrar uma sem a outra e o número faltando não teria explicação | `routers/usage.ts` |
| **U4** | **Sessão que o daemon sobe para si não é cobrada de ninguém.** Destilação de memória e agente de pesquisa do auto-learn não têm linha em `session`, então não têm projeto. O consumo delas é real, e atribuí-lo a um projeto seria contar como trabalho seu algo que o sistema fez sozinho — fica de fora, e a decisão está no código | `usage/record.ts` |
| **U5** | **Janela que encolheu não vira consumo negativo.** O adaptador reporta menos depois de compactar a conversa, e o delta tem piso zero | `usage/record.ts` |

---

## Fase 2 — a porta

#### T1: O painel do workspace existe

**What**: O painel central quando nenhuma worktree está selecionada.
**Where**: `packages/web/src/App.tsx`, `components/WorkspacePanel.tsx`, CSS do Open Design + testes

**Done when**:
- [x] `selecione uma worktree` deixa de ser a resposta a "onde eu estou"
- [x] Cabeçalho com o nome do workspace, e os projetos como **estado** — não como navegação
      duplicada da sidebar
- [x] Workspace **sem projeto nenhum** tem estado próprio: é o caso em que hoje nada é alcançável
- [x] Só `var(--token)`, e a auditoria de porte do CSS cobre as classes novas
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o workspace ganha uma tela`

---

#### T2: O consumo na tela do workspace

**What**: A linha de cada projeto com o que ele gastou, e o seletor de janela.
**Where**: `components/WorkspacePanel.tsx`, `hooks/useUsage.ts`, Open Design + testes

**Done when**:
- [x] Seletor de janela — `1d`, `7d`, `1m`, `6m`, `1y` — no padrão do segmentado que já existe
- [x] Tokens e custo por projeto, na mesma linha em que ele aparece como estado
- [x] Sem gráfico e sem série: é soma por escopo, e o §7 do PRD é a defesa disso
- [x] Agente que não reporta custo mostra tokens e **diz** que não há custo — nunca `US$ 0,00`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o consumo de cada projeto, na tela do workspace`

---

#### T3: A memória do workspace, pelo componente que já existe

**What**: A `MemoryPanel` no escopo do workspace.
**Where**: `components/WorkspacePanel.tsx` + testes

**Done when**:
- [x] **O mesmo componente**, com `projectId: null` — nenhuma segunda tela de memória, nenhuma segunda
      semântica de precedência (§5 do PRD)
- [x] Mostra `workspace` e `você`, e **não** mostra `projeto`: a ausência do grupo é a diferença
      visível entre os dois lugares
- [x] A inbox de propostas funciona daqui: aprovar e rejeitar sem projeto aberto — provado com o
      workspace **vazio**, que é o caso em que antes não havia porta. Rejeitar em duas etapas,
      inclusive: recusar sem dizer por que perde o histórico que a inbox existe para guardar
- [x] Um teste que prova o caminho que originou a feature: workspace **sem projeto**, memória de
      workspace visível e revisável
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a memória do workspace, sem precisar de um projeto aberto`

---

#### T4: O consumo por worktree, na visão do projeto

**What**: O mesmo número, um nível abaixo.
**Where**: `components/LocalPanel.tsx` ou `ScopePanel.tsx`, Open Design + testes

**Done when**:
- [x] A mesma linguagem visual do consumo por projeto: quem aprendeu a ler lá lê aqui
- [x] A mesma janela de tempo, e ela **não** é lembrada entre as duas telas — escopo diferente,
      pergunta diferente
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o consumo por worktree, na visão do projeto`

---

## Fase 3 — os gestos

#### T5: Renomear em linha

**Where**: `components/WorkspacePanel.tsx`, `hooks/useWorkspaces.ts` + testes

**Done when**:
- [x] Em linha, sem modal — o produto não usa modal
- [x] O seletor do topo e a tela concordam na hora: um nome novo em dois lugares diferentes é o
      começo de uma tela discordando de si mesma
- [x] Renomear **não** mexe em disco, e um teste prova: a memória continua sendo achada depois (W6).
      No servidor, e não no e2e — a pergunta é do daemon: o caminho é `workspaces/<id>/`, e o teste
      confere que o nome novo não aparece em caminho nenhum
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): renomear o workspace pela tela`

---

#### T6: Remover, com a guarda que o banco já impõe

**Where**: `components/WorkspacePanel.tsx` + testes

**Done when**:
- [x] Desabilitado enquanto houver projeto, **com o motivo ao lado** — o mesmo padrão do `remover
      projeto` (W2)
- [x] A recusa do daemon, se chegar, aparece como recusa e não como tela quebrada — o botão
      desabilitado cobre o caminho previsto; o teste cobre a **corrida**, o projeto entrar entre a
      leitura da lista e o clique
- [x] Remover leva a algum lugar: o seletor não pode ficar apontando para o que não existe mais, e o
      último workspace removido devolve o **primeiro acesso** em vez de uma tela vazia
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): remover o workspace, só quando ele está vazio`

---

## Fase 4 — a prova

#### T7: O e2e do caminho que originou a feature

**Where**: `e2e/workspace-screen.spec.ts`

**Done when**:
- [x] Um workspace **sem projeto**, memória de workspace escrita pela API, e revisada **pela tela**
- [x] Um turno de verdade, e o consumo dele aparecendo no projeto que o gastou. **Worktree própria
      da prova**, e é isso que faz o número ser exato — outros specs rodam turnos no mesmo projeto, e o
      total dele acumula. `39,2k`, `US$ 0,2354`, `1 turnos`, do `usage_update` do adaptador falso até
      a linha na tela
- [x] Renomear e ver o nome trocar nos dois lugares
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a memória do workspace sem um projeto aberto`

---

### O que a execução das telas achou

| # | O quê | Onde |
|---|---|---|
| **W7** | **`remover` ficava habilitado enquanto a lista de projetos carregava.** "Quantos projetos tem dentro" não tinha resposta ainda, e botão destrutivo habilitado por ignorância é o mesmo defeito do composer que mandava mensagem antes de o socket abrir. O estado passou a ser `unknown`, e não zero | `WorkspacePanel` |
| **W8** | **Dois botões `remover` na mesma tela.** O rodapé da sidebar tem o do agente; o meu virou `remover workspace`, seguindo o `remover projeto` que já existia. É ambiguidade para leitor de tela antes de ser ambiguidade em teste | `WorkspacePanel` |
| **W9** | **Uma tela nova que consulta o daemon no `mount` quebra teste antigo.** Seis suítes caíram com *"Found multiple elements with the role alert"* — elas usam `vi.resetAllMocks()`, que apaga implementação, e query sem implementação devolve `undefined`, que o `useQuery` recusa. `installTrpcDefaults()` é o remendo nomeado, e o default é sempre resposta **vazia** | `test/trpc-mock.ts` |
| **W10** | **O segmentado subiu para `ui/ui.css`** quando ganhou o segundo usuário: a terceira cópia é onde as três param de concordar. Estado é `aria-pressed` e não classe — o Open Design já tinha passado por essa decisão e a registrou | `ui/ui.css` |
| **W13** | **Três caixas marcadas sem prova.** A auditoria foi minha e um dia depois: o componente da inbox é o mesmo da aba do projeto ("provavelmente funciona" não é o que a caixa diz), a asserção de renomear saiu do e2e quando ele ganhou workspace próprio, e o e2e do consumo conferia a seção sem nunca gastar um token. As três fechadas com teste; a lição é que caixa marcada por inferência é pior que caixa vazia | `tasks.md` |
| **W12** | **Um teste passou por acidente, e a mutação mostrou.** O "depois de remover, o seletor aponta para o que sobrou" passava sem a validação contra a lista: com nada no `localStorage` o ativo é o primeiro, então depois da remoção ele já seria o certo sem ninguém validar. Selecionar explicitamente antes de remover é o que faz o teste medir o que ele diz medir | `workspace-ui.test.tsx` |
| **W11** | **O e2e de renomear ganhou workspace próprio.** A primeira versão renomeava o `e2e` compartilhado e devolvia o nome no fim; uma falha no meio deixaria todos os specs seguintes procurando um nome que não existe mais | `e2e/workspace-screen.spec.ts` |

---

## Fase 5 — o caminho de volta (W7)

Levantada pelo uso, **depois** da feature entregue: entrar num projeto era um beco sem saída. O
desenho está no Open Design (`lumem-workspace.html`, tela 4); falta implementar.

#### T8: O breadcrumb navega

**What**: Todo segmento menos o último leva ao escopo dele.
**Where**: `App.tsx`, `components/{WorktreePanel,LocalPanel}.tsx`, `ui.css` + testes

**Done when**:
- [ ] O nome do workspace no breadcrumb leva ao painel do workspace — de dentro de um projeto **e** de
      dentro de uma worktree
- [ ] O nome do projeto, na tela de uma worktree, leva ao projeto: resolver só o workspace deixaria o
      mesmo beco um nível abaixo
- [ ] O último segmento continua sendo onde você está — sem clique, sem sublinhado
- [ ] `<button>` e não `<div onClick>`: é navegação, e teclado tem que alcançar
- [ ] Um teste que fecha o beco: entrar no projeto, voltar, e a tela do workspace estar lá
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o breadcrumb navega, e o projeto deixa de ser um beco`

---

## O que fica fora, e onde foi anotado

| O quê | Onde |
|---|---|
| Tela de preferências (configuração de agente é **global**, não do workspace) | [backlog](../../project/backlog.md), buraco 1 do Open Design |
| Mover projeto entre workspaces | fora: é a operação mais destrutiva que o modelo permite, e ninguém pediu |
