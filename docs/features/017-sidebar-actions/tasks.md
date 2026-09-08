# As ações da árvore — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Desenho:** `packages/web/prototype/lumem-sidebar-actions.html` (oito quadros)
**Status:** completa
**Histórico:** **completa** — 11 tasks, entregues em **2026-09-05**.

---

## Antes de começar

**O que travava, e como fechou.** As seis perguntas, respondidas em 2026-09-05. Duas foram
respondidas **contra a proposta e contra o desenho de 2026-09-01**: a [Q1](open-questions.md) (o `+`
passou a ser sempre visível) e a [Q5](open-questions.md) (o modal **não** fecha ao começar o clone).
O desenho foi **reescrito no Open Design** e sincronizado antes de qualquer código — a regra do
projeto não permite o contrário, e o resultado é que a tela desenhada e a tela implementada não
divergem.

**O que nunca travou:** as duas mutations. `project.add`, `project.clone` e `worktree.create` não
mudam uma linha. Esta feature é de **onde se clica**.

**O que já vinha de graça:** `project.listByWorkspace` já devolve `hasCommits` por projeto, então o
diálogo de worktree aberto da linha não precisa de uma segunda consulta para saber se o repositório
tem commit.

**A ordem é a do risco.** O `Modal` primeiro, porque ele é a peça que não existe e é a que os dois
diálogos vão herdar; o `+` da linha por último, porque ele é o que menos quebra se estiver errado. No
meio, a migração que mais quebra teste: o gatilho do `AddProjectDialog`, que 15 specs de e2e
atravessam.

---

## Fase 1 — as duas peças que não existem no design system

#### S1: O `Modal` — invólucro centrado com véu

**What**: nasce `Modal`, o invólucro que os dois diálogos vão usar. Não existia: os de hoje são
`Card` no fluxo.
**Where**: `packages/web/src/ui/Modal.tsx`, `ui/modal.css`, `ui/index.ts`, `ui/modal.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] `role="dialog"`, `aria-modal="true"` e `aria-labelledby` apontando para o título
- [x] Véu **irmão** do cartão, não pai — clicar nele fecha, e o cartão não herda o alvo de clique
- [x] `Esc`, clique no véu e `✕` fecham; o foco volta para **o elemento que abriu**
- [x] O foco entra no primeiro campo ao abrir e **circula dentro** do modal (`Tab` e `Shift+Tab`)
- [x] `dismissible={false}` desabilita os três caminhos de fechar — o `✕` fica **desabilitado, não
      ausente** — e troca a dica do rodapé pela razão ([Q5a](open-questions.md))
- [x] Cabeçalho com `where`: de onde a ação veio (`em ■ lumem-os`, `no workspace ◈ pessoal`), no
      lugar de um seletor dentro do formulário
- [x] Só `var(--token)`: nenhum literal de cor, espaço ou tipografia

#### S2: A linha da árvore ganha um slot de ação

**What**: `Row` ganha `action` — 24px reservados **em toda linha de projeto**, pintados em repouso.
**Where**: `packages/web/src/ui/Row.tsx`, `components/sidebar.css`, `ui/ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] O slot é reservado mesmo quando não há ação (`row__slot` vazio) — coluna alinhada de cima a
      baixo ([Q1](open-questions.md))
- [x] O `+` é pintado em repouso, em `--color-text-tertiary`; hover e foco **escurecem**, não
      revelam
- [x] O `count` **não cede o lugar**: `● 2  [+]` convivem ([Q1b](open-questions.md))
- [x] Clicar no slot **não** dispara `onSelect` nem `onToggle` (F1.4) — `stopPropagation` não basta,
      os botões são irmãos e o teste prova isso com os três callbacks espionados
- [x] O botão é o **último** na ordem de `Tab`: ação vem depois de navegação

---

## Fase 2 — o cabeçalho da lista, e o diálogo que saiu do rodapé

#### S3: `Projetos` ganha cabeçalho com ação, em todos os estados

**What**: o `+` de projeto nasce preso ao título, e o título passa a existir mesmo com zero projetos.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `components/sidebar.css`,
`components/project-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] O cabeçalho é desenhado **antes** de a árvore decidir o que vai abaixo dele — vale para
      carregando, erro, vazio e lista ([Q3](open-questions.md))
- [x] Com zero projetos existe **exatamente um** caminho visível para acrescentar o primeiro
- [x] O comentário do `EmptyState` que justificava não ter ação (*"a second copy would be two buttons
      for one job"*) é **reescrito**, não apagado: ele passa a dizer que a ação subiu para o
      cabeçalho
- [x] `aria-label="adicionar projeto"` — `＋` sozinho não é nome de nada

#### S4: `AddProjectDialog` vira corpo de modal, e o rodapé perde o botão

**What**: o diálogo para de carregar o próprio gatilho; o `App` hospeda; `＋ adicionar projeto` sai
do rodapé (F1.6).
**Where**: `packages/web/src/components/AddProjectDialog.tsx`, `App.tsx`, `components/sidebar.css`,
`components/project-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] O componente recebe `open`/`onClose` e não desenha mais botão nenhum quando fechado
- [x] O rodapé da sidebar fica só com o `AgentLogin` — que é do workspace, não da lista
- [x] O `prefill` (F6.10 da `project-from-url`) continua abrindo o diálogo com a URL ssh
- [x] `role="dialog"` com o título `Adicionar projeto` e o workspace no `where`

#### S5: O clone fica dentro do diálogo, e o diálogo fica aberto

**What**: [Q5](open-questions.md) e [Q5a](open-questions.md). O `CloneStatus` muda de hospedeiro, do
rodapé para dentro do modal, e o modal deixa de fechar.
**Where**: `packages/web/src/components/AddProjectDialog.tsx`, `CloneStatus.tsx`, `App.tsx`,
`components/clone.css`, `components/clone-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] `clone.mutate()` **não** fecha o diálogo; o corpo vira progresso, fase e porcentagem
- [x] Enquanto clona, `Esc`, véu e `✕` **não fecham**, e o rodapé diz `Esc não fecha enquanto clona`
- [x] Quando o clone acaba, as três voltam a valer **de verdade** — fechar por elas dispensa o
      desfecho, senão o pedido de reabrir traz o diálogo de volta no mesmo ciclo (P8)
- [x] A saída é `cancelar o clone` — a mesma `project.cloneCancel` de antes. **Nenhum caminho fica
      sem saída**
- [x] **Sucesso fecha**; falha **não** fecha — devolve o formulário com a URL onde estava, e o
      `tentar por ssh` fica a um clique
- [x] Um clone vivo encontrado ao montar **reabre** o diálogo (F1.9): sem segundo hospedeiro,
      recarregar a página não pode ser o mesmo que perder o clone de vista
- [x] O `CloneStatus` não é copiado: ele é o mesmo componente, com o hospedeiro trocado

---

## Fase 3 — o `+` da linha, e o que sai do `LocalPanel`

#### S6: A linha do projeto ganha o `+`

**What**: F1.3, F1.4 e F1.8. O `+` que cria worktree, na linha do projeto que a recebe.
**Where**: `packages/web/src/components/SidebarTree.tsx`, `App.tsx`,
`components/project-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] `aria-label="nova worktree em <projeto>"` — nome próprio, não `＋`
- [x] Projeto **sem disco** não oferece o `+`, e o slot fica vazio (F1.8): não há de onde cortar
      worktree, e alinhamento de coluna não é decoração
- [x] Clicar **não seleciona** e **não expande** (F1.4), com o projeto fechado e com ele aberto
- [x] O `+` continua clicável em repositório **sem commit** — quem explica é o diálogo, não um botão
      cinza de 24px sem motivo à vista

#### S7: `CreateWorktreeDialog` vira corpo de modal e já sabe o projeto

**What**: F1.3 e F1.5. O diálogo perde o gatilho e o seletor implícito; ganha destino.
**Where**: `packages/web/src/components/CreateWorktreeDialog.tsx`, `App.tsx`,
`components/worktree-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] `open`/`onClose`; o nome do projeto aparece no `where` do cabeçalho, não num campo
- [x] Criar **expande o projeto** e **seleciona a worktree nova** (F1.5) — o mesmo destino do caminho
      de hoje
- [x] Cancelar **não muda a seleção atual** (§5 do PRD)
- [x] O aviso de repositório sem commit e o erro de branch existente continuam com as palavras do
      daemon

#### S8: O `LocalPanel` devolve a ação

**What**: [Q4](open-questions.md). Sai o `CreateWorktreeDialog` e sai o bloco `.actions`, que existia
só para hospedá-lo.
**Where**: `packages/web/src/components/LocalPanel.tsx`, `components/worktree-ui.test.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] A aba de contexto do `local` não oferece mais criar worktree — **um caminho, um lugar**
- [x] A lista `Worktrees deste projeto` continua onde está: ler as irmãs não é criar irmãs
- [x] Nenhum import órfão fica para trás

---

## Fase 4 — o que a mudança quebra

#### S9: Os textos que apontam para os lugares antigos

**What**: o onboarding ensina onde ficam as duas ações, e as duas mudaram de lugar.
**Where**: `packages/web/src/setup/Done.tsx`, `setup/TaskStep.tsx`
**Gate**: `pnpm gate:quick`

**Done when**:
- [x] `"no rodapé da sidebar, em adicionar projeto"` passa a apontar para o `+` do cabeçalho
- [x] `"no painel do projeto, em nova worktree"` passa a apontar para o `+` da linha do projeto
- [x] O comentário do `AgentConfigDialog` que se localiza *"ao lado de adicionar projeto"* é
      corrigido: o vizinho saiu

#### S10: O e2e atravessa o caminho novo

**What**: 15 specs passam por `adicionar projeto` e por `nova worktree`. O helper absorve o que der.
**Where**: `e2e/support/app.ts` e as specs que clicam direto
**Gate**: `pnpm gate:full`

**Done when**:
- [x] `ensureProject` clica no `+` do cabeçalho
- [x] Nasce `createWorktree(page, projeto)` no helper, e as specs que clicavam em `nova worktree`
      passam por ele — o próximo movimento desta ação mexe em **um** arquivo
- [x] O e2e de primeiro acesso ([onboarding](../008-onboarding/prd.md)) continua chegando ao mesmo lugar
- [x] `pnpm gate:full` verde

---

## Fase 5 — a prova

#### S11: O e2e da feature

**What**: os cinco itens do §5 do PRD, num spec só.
**Where**: `e2e/sidebar-actions.spec.ts`
**Gate**: `pnpm gate:full`

**Done when**:
- [x] Criar worktree pelo `+` com o projeto **fechado**, e cair dentro dela
- [x] Clicar no `+` de um projeto fechado **não** o expande antes de o diálogo abrir, e cancelar
      **não** muda a seleção
- [x] `Esc` no modal devolve o foco ao `+` que o abriu
- [x] Com zero projetos, **exatamente um** caminho visível para acrescentar o primeiro
- [x] O `+` de um projeto sem disco não existe, e o da linha não seleciona nem expande

---

## O que a execução achou, e não estava no plano

Oito coisas. Três vieram do e2e, uma veio da **revisão da PR**, e as **duas primeiras** são as
que teriam chegado ao usuário — as duas do mesmo jeito: um diálogo que se recusa a ficar aberto, e um
diálogo que se recusa a fechar, os dois **sem erro nenhum no console**.

| # | O quê |
|---|---|
| **P1** | **Um clone já terminado fechava o diálogo no instante em que ele abria.** O `job store` guarda os jobs terminados **de propósito** — é o que faz uma falha sobreviver ao F5 —, então *"existe um clone e ele acabou"* é o estado normal de qualquer workspace onde alguém já clonou alguma coisa. O efeito que fecha no sucesso lia isso e fechava. Quem clonasse uma vez **nunca mais abria a tela de adicionar projeto**, sem erro nenhum no console. O e2e pegou: **55 specs de uma vez**. A correção é lembrar *qual* job este diálogo está segurando, e só fechar naquele |
| **P8** | **`✕`, `Esc` e véu ficavam habilitados e não fechavam** — achado na **revisão da PR**, não pelos testes. Com o clone terminado, `cloning` é falso e as três saídas voltam a valer; mas o `close()` não dispensava o desfecho, então o efeito da F1.9 via um `outcome` ainda não lido e pedia para abrir de novo **no mesmo ciclo**. O único caminho de saída era o `dispensar`/`entendi` de dentro do `CloneOutcome` — que é exatamente o que os testes exercitavam, e é por isso que a suíte inteira ficou verde em cima disso. `close()` passou a marcar o desfecho como lido: **fechar à mão é ler** |
| **P2** | **O `✕` no cabeçalho era o primeiro no `Tab`, e o modal abria com o foco em "fechar".** A ordem do `Tab` é a ordem do DOM, e o contrato da seção 8 do protótipo põe o `✕` no fim do anel. Ele passou a ser escrito **por último** e posicionado por CSS. Achado pelo próprio teste do `Modal`, antes de qualquer tela existir |
| **P3** | **O gatilho não some mais quando o formulário abre**, e `getByRole("button", { name: "adicionar" })` passou a casar com dois elementos — o `+` (`adicionar projeto`) atrás do véu e o submit. Na versão antiga o botão do rodapé **virava** o formulário, então só existia um por vez. Todos os locators do fluxo de projeto foram escopados no `role="dialog"` |
| **P4** | **A F6.6 tinha um teste que passava sem olhar.** Ele provava que o botão de cancelar some ao fim do download com `within(row)`; o botão mudou para o rodapé do modal, o `row` continuou existindo e continuou sem botão, e o teste continuou verde — provando a ausência num lugar onde nunca mais haveria um. Está registrado como armadilha em [testing.md](../../project/testing.md) |
| **P5** | **A F1.9 precisava valer para o clone que *falhou*, não só para o que roda.** O primeiro corte reabria o diálogo só com um clone em andamento — e isso teria apagado, sem apagar código nenhum, a razão de o job store guardar os terminados: uma falha recém-acontecida sumia num F5, que é exatamente quando ela mais precisa ser lida. Vale também para o `registrado como` da F6.4 |
| **P6** | **`close()` também limpava o campo**, e com a Q5a a falha de clone **não** fecha. Reusá-lo teria apagado a URL que o `tentar por ssh` reescreve. Separar "fechar" de "esquecer o que foi digitado" foi o que fez a F1.9 funcionar |
| **P7** | **O workspace do e2e é compartilhado, e tem um `local` por projeto.** Um `/^local/` escrito para provar "a seleção não mudou" passava sozinho e falhava com dez projetos na árvore. A âncora certa é o **caminho do repositório** dentro do painel — a mesma que o `happy-path` já usava |

E uma que **não** foi achado, e sim consequência aceita: a **A11** — um clone por vez — deixou de ser
uma frase (`pesado ainda está sendo clonado`, com o botão desabilitado) e passou a ser **estrutural**.
Com o formulário substituído pelo progresso, não existe um segundo `clonar` para apertar. Menos código
e menos texto, pela mesma garantia.
