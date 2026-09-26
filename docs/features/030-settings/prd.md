# PRD — A tela de configurações: um lugar para o que se ajusta uma vez por mês

> **Status:** completa
> **Histórico:** v0.1 — proposta em **2026-09-17**, a partir da
> [LUM-55](https://linear.app/lumem-os/issue/LUM-55/settings-a-tela-de-configuracoes-rota-layout-e-as-quatro-secoes),
> que é a tarefa-guarda-chuva de um projeto de cinco issues. Ela nasceu das anotações **1, 4 e 5**
> feitas na tela `/` (viewport 3060×1362), as mesmas nove que já viraram a
> [`015`](../015-run-dock-open/prd.md), a [`017`](../017-sidebar-actions/prd.md), a
> [`013`](../013-pull-request-status/prd.md) e a [`018`](../018-worktree-first-tab/prd.md)
> **Perguntas:** [open-questions.md](open-questions.md) — **10 perguntas, todas respondidas** em
> **2026-09-17**, e **quatro contra a proposta**. A décima nasceu de uma resposta e foi respondida no
> mesmo dia, derrubando a premissa da própria pergunta
> **Cria uma feature:** a resposta da [Q2](open-questions.md) parou no **N1** e mandou o N3 — workspace,
> projeto e checkout na URL — para a
> [LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030),
> onde as ADRs de roteamento vão nascer
> **Tasks:** [tasks.md](tasks.md) — **16 tasks em 5 fases, todas entregues** em 2026-09-17
> **Depende de:** a [`029-sidebar-nav`](../029-sidebar-nav/prd.md), que é o bloco onde a entrada
> provavelmente mora e a feature que **mediu que o aplicativo não tem rota nenhuma**; a
> [`028` Parte 3](../028-autonomous-orchestration/prd.md), que desenhou os três tetos; a
> [`017-sidebar-actions`](../017-sidebar-actions/prd.md), que decidiu **modal centrado** para os dois
> diálogos de criação; e a [`021-second-agent`](../021-second-agent/prd.md), cuja A16 nomeou a mentira
> que esta tela existe para desfazer
> **Desenho:** `lumem-settings` no Open Design — **feito em 2026-09-17**, quatro quadros, e ele veio
> **antes** do React ([regra de 2026-08-19](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)).
> A ordem foi invertida a pedido — *"quero ver como fica, só depois eu tenho certeza de tudo"* —, e o
> repositório já tem o precedente: a [`029`](../029-sidebar-nav/prd.md) desenhou antes de escrever a
> PRD, e a [`017`](../017-sidebar-actions/prd.md) chegou com desenho pronto e **mudou o desenho**

---

## 1. O problema, em uma frase

**O produto não tem tela de configuração**, então cada ajuste foi parar na superfície mais próxima de
onde ele foi escrito — e o resultado é que **dado de configuração divide pixel com dado de
acompanhamento**.

O caso mais visível está em `packages/web/src/components/TaskList.tsx`: um único
`<p className="tlist__budget">` ocupa as **linhas 278–356** — 79 linhas de JSX num arquivo de 486 —
e acumula os três tetos de custo, o nome de uma variável de ambiente, os três degraus da esteira, o
paralelismo, o interruptor de limpeza de worktree e a métrica de cerimônia. Tudo isso **acima** da
lista que a pessoa abriu a tela para ler.

Ajuste se faz uma vez por mês; a lista se lê todo dia. Eles não deveriam disputar espaço.

**Critério de sucesso em uma frase:** existe **um** endereço que responde *"onde eu mudo isso?"*, e
quem chega nele sabe **para quem** a mudança vale antes de clicar.

## 2. O que se mediu antes de escrever

Seis medições, feitas em **2026-09-17** contra o código deste checkout. **Quatro delas mudam o
pedido**, e estão marcadas.

**As duas pontas da rota já existem; falta o meio.** `GET /settings` no vite de desenvolvimento
devolve **200 `text/html`** (medido em `127.0.0.1:4318`), e o daemon instalado devolve o shell pela
`wantsAppShell` do `packages/server/src/web/static.ts` — o que a `production.spec.ts` já prova com
`/qualquer/rota/da/aplicacao`. O que **não** existe é o cliente ler o caminho: isso acontece em **um
lugar só**, o `main.tsx`, e apenas em DEV, para o `/styleguide`. A rota desta feature não é um
servidor novo — é uma leitura de `location.pathname` do lado do cliente.

**Um router de biblioteca custa 4,79 MB e dois pacotes para três endereços.** `react-router@7.18.4`
são **4 794 391 bytes** desempacotados mais `cookie` e `set-cookie-parser`; `react-router-dom` é um
atalho de **5 398 bytes** que só depende dele. `wouter@3.11.0` são **77 371 bytes** e **nenhuma**
dependência. À mão são `location.pathname`, `history.pushState` e `popstate` — o mesmo tamanho de
problema que o `useActiveWorkspace` já resolve com `localStorage`. Não é que 4,8 MB quebre o pacote
que a [`014`](../014-distribution/prd.md) publica; é que carregar um roteador de dados inteiro para
**três** endereços precisa ser um requisito, e não um hábito. **[muda o pedido]**

**Os três tetos são somente-leitura no produto, e o paralelismo também.** `workspace.setBudget` existe
no router, tem repositório e tem teste — e **nenhum chamador na web**: `grep setBudget packages/`
devolve `routers/workspace.ts`, `repositories/workspace.ts` e `routers/task.test.ts`, e mais nada. A
única forma de pôr um teto hoje é um teste. `autonomyMaxParallel` está no mesmo estado: o `TaskList`
só o **carrega junto** no `setAutonomy`, com `?? 2` quando a leitura ainda não voltou. A `028` Parte 3
escreveu *"teto que você não vê é teto que parece bug quando recusa"* e entregou a metade que **mostra**
— a metade que **ajusta** é esta tela. Então isto não é mudança de lugar: a tela de configurações é o
**primeiro escritor** de dois dos controles que ela hospeda. **[muda o pedido]**

**Tamanho de fonte não tem alavanca.** O `tokens.css` tem **111 valores em `px` e zero `rem`** — as
duas ocorrências de "rem" são `--color-git-removed`. Mudar `html { font-size }` não move um pixel. E
o `tokens.css` é **cópia do Open Design**, que não se edita à mão
([ADR de 2026-08-19](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)). Fora do CSS ainda
há um `TERMINAL_FONT_SIZE = 13` literal em `lib/xterm-theme.ts`, porque o xterm mede em pixel. A
LUM-59 não é uma preferência numa tela: é uma mudança no **sistema de design**, e ela nasce lá.
**[muda o pedido]**

**Os assuntos têm quatro donos, e não três.** A issue conta workspace, global e navegador; o quarto é
o **repositório**. O mapa de colunas do tracker mora no `<repo>/.lumem/project.toml`
(`scripts/project-scripts.ts`, `readColumnMap`) pela Q65 da
[`028`](../028-autonomous-orchestration/open-questions.md) — *o que é do repositório é do time* — e
viaja com o clone, que é metade do valor dele. A seção `integrações`, sozinha, mistura credencial de
**máquina** (o cofre em `~/.lumem/_system`, pelo
[ADR do cofre](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)) com mapa de
**repositório**. **[muda o pedido]**

**As duas casas candidatas para a entrada já têm regra escrita, e as duas dizem não.** A `Topbar`
declara em comentário que *nada escopado mora ali* — um controle que só existe dentro de um checkout
diz, por estar lá, que pertence ao produto. E a `SidebarNav` da [`029`](../029-sidebar-nav/prd.md) tem
`aria-label="Telas do workspace"`: uma terceira linha `Configurações` ali afirma que a configuração é
do workspace, e metade dela não é. É exatamente o defeito que a **A16** da
[`021`](../021-second-agent/prd.md) já nomeou no rodapé da sidebar — o `agent_config` é global e mora
na coluna do workspace.

## 2a. O que o desenho decidiu, e o que ele achou renderizando

A folha é `lumem-settings` no Open Design, com quatro quadros — a tela, o campo de teto, a etiqueta e
o glifo, e a conta. Ela foi **renderizada e medida no navegador**, e é de lá que saem os números
abaixo.

**Três medidas que a PRD passa a afirmar:**

- o bloco de navegação vai de **65px para 93px** com a terceira linha — três `.row` de 28px mais o
  padding e a borda. Os 28px saem da árvore, que é a mesma conta que a `029` aceitou e pagou uma vez;
- as etiquetas de dono terminam **todas no mesmo `x` (1238px)** em toda a tela, nas quatro seções —
  é isso que faz a repetição virar **coluna** em vez de ruído, e é a razão de a largura ser fixa e
  não `auto`;
- a coluna do meio é o `.detail` de sempre: **880px**, sem ponto de quebra novo.

**E a conta da coluna fecha positiva**, o que só se soube depois da [Q6](open-questions.md): a
terceira linha do bloco cobra **28px** da árvore, e o rodapé — que deixa de existir quando a LUM-57 e
a LUM-58 saírem — devolve **73px** medidos nesta folha (um agente, nenhuma credencial) e **105px**
com dois agentes, que é o número da [`021`](../021-second-agent/prd.md). Saldo de pelo menos **45px**,
mais de uma linha e meia de árvore.

**Quatro defeitos que só o navegador achou**, e nenhum deles estava no código — estavam no desenho:

1. **A largura da coluna não mora na `.sidebar`.** Ela mora no `.body`, que é
   `grid-template-columns: var(--size-sidebar-width) 1fr`. Montada num `flex`, a sidebar encolhe para
   o conteúdo — **188,6px** na primeira versão da folha —, e o quadro passa a medir uma coluna que o
   produto não tem. É a medida mais reaproveitável desta feature: vale para qualquer folha futura que
   monte a sidebar fora do `.body`. *(De quebra, os 188,6px são a largura que o conteúdo pede: a
   palavra `Configurações` cabe nos 264px com folga.)*
2. **`US$ sem teto`.** O prefixo de unidade ficou ao lado de uma palavra, afirmando que aquilo era um
   valor. O `US$` some no estado vazio.
3. **O chip `bloqueia tudo` desalinhava a coluna de controle** — justamente na linha que ele existia
   para destacar. Quem diz *bloqueia tudo* passou a ser a **descrição da linha**, que já muda com o
   valor e não move nada.
4. **O valor e a etiqueta liam como duas etiquetas.** `4 colunas` e `repositório`, no mesmo cinza, a
   40px um do outro. O valor é dado e a etiqueta é escopo: um degrau de cor separa os papéis sem
   acrescentar matiz.

**E três decisões de tela que a folha tomou e a PRD adota:**

- **sem abas internas.** Quatro seções numa rolagem só: uma tela que se abre para procurar onde está
  uma coisa não pode esconder três quartos dela;
- **sem botão salvar.** Grava no gesto, como o autosave do editor e o interruptor da esteira já
  fazem. O que isso cobra é o **retorno** da linha, e o vocabulário já existe — os quatro
  `--color-save-*` do editor;
- **o glifo da terceira linha é `⚙`.** Ele é o único que não precisa ser aprendido, e é o único que
  sai da família geométrica — esse é o custo, e foi aceito: numa coluna onde `◎` e `▥` também não
  dizem nada sozinhos, um terceiro símbolo mudo faria o bloco inteiro depender do rótulo. A condição
  é que ele renderize como **texto**, herdando a cor da linha — conferido no navegador, e é o que o
  impediria de ser a única coisa colorida da coluna.

## 3. Os quatro donos, que é a decisão de leitura da tela

| Dono | O que é dele | Onde mora hoje |
|---|---|---|
| **workspace** | os três tetos, os degraus da esteira, o paralelismo, o interruptor da Q27 | `workspace` (SQLite), lido por `task.settings` |
| **máquina** (a instalação) | `agent_config` e o pino do adaptador; as credenciais do cofre | `~/.lumem`, um por instalação |
| **repositório** | o mapa de colunas do tracker, o `[scripts]` | `<repo>/.lumem/project.toml`, versionado |
| **navegador** | tamanho de fonte, e o que já usa `localStorage` (largura do painel, rodapé, árvore) | `localStorage` |

**Três donos diferentes na mesma tela precisam ser legíveis como tais**, ou a pessoa vai achar que
mudou uma coisa para todo mundo quando mudou para um workspace só. Com quatro, a frase vale mais.
Como isso fica legível é a [Q3](open-questions.md).

## 4. Escopo

**F1 — Três endereços, escritos à mão: `/`, `/tasks` e `/settings`.** Caminho em inglês pela
convenção de **2026-09-14** do [CLAUDE.md](../../../CLAUDE.md) — *caminho é identificador; o rótulo
`Configurações` é que se traduz*. A [Q6](../029-sidebar-nav/open-questions.md) da `029` decidiu o
**idioma**; a [Q2](open-questions.md) desta decide a **forma**, e ela para no primeiro dos três
níveis que mediu.

`workspaceView` **deixa de ser `useState`** e passa a ser derivado do caminho — senão o `App` volta a
ter duas respostas para *onde eu estou*, que é o que a [`029`](../029-sidebar-nav/prd.md) acabou de
consertar.

**O checkout continua sendo seleção, e não lugar:** selecionar usa `replaceState`, não `pushState`.
`/` quer dizer *o lugar de trabalho* — Home, ou o que estiver selecionado —, e o botão voltar nunca
contradiz a tela. Ele não perde endereço nenhum: `selection` é `useState`, então recarregar já joga
em *nenhuma worktree selecionada* hoje.

**Sem biblioteca.** Três endereços, zero parâmetros. O que `wouter` (77 KB) entrega a mais é
justamente o que o N3 vai precisar, e é lá que ele deve ser escolhido — na
[LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030),
com os parâmetros na mesa. A assimetria é o argumento: trocar 40 linhas por uma biblioteca depois é
uma tarde; tirar `react-router` (4,79 MB, duas dependências) depois não é.

**F2 — Quatro seções, uma por assunto**, na ordem da issue:

| Seção | O quê | Dono |
|---|---|---|
| **esteira e orçamento** | autonomia, paralelismo, os três tetos, o interruptor da Q27 | workspace |
| **agentes** | login, instalação, versão do adaptador | máquina |
| **integrações** | tracker, hospedeiro de git, cofre de chaves | máquina **e** repositório |
| **exibição** | tamanho de fonte | navegador |

**F2a — O dono é dito por controle, e não por seção** ([Q3](open-questions.md), respondida contra a
proposta). A seção `integrações` **não tem um dono** — a chave é da máquina e o mapa de colunas é do
repositório —, então uma frase de escopo no topo teria que mentir logo na terceira das quatro. A
etiqueta é texto num vocabulário fechado de quatro palavras, sem caixa e sem matiz próprio, numa
coluna de largura fixa.

**F3 — A seção do workspace ganha campo, e não só endereço.** É o que a terceira medição cobra: os
três tetos e o paralelismo passam a ser **editáveis**, com `null` = *sem teto* e `0` = *bloqueia
tudo* preservados como coisas diferentes — a distinção é do banco e a `028` a defendeu explicitamente.
Sem isto, mover a linha entrega uma tela nova que continua não respondendo *"onde eu mudo isso?"*.

**F4 — Uma entrada, e uma só: a terceira linha do bloco de navegação.** A [Q5](open-questions.md)
foi respondida **contra a proposta** — o rodapé da sidebar perdeu porque a [Q6](open-questions.md)
está prestes a esvaziá-lo. O `aria-label="Telas do workspace"` da [`029`](../029-sidebar-nav/prd.md)
é **reescrito**: ele era descrição, não regra, e deixou de ser verdade. A regra *uma ação, um lugar*
da [`017`](../017-sidebar-actions/prd.md) vale aqui inteira.

**F5 — O que sai de onde estava, sai — menos a medida.** O `<p class="tlist__budget">` perde as **79
linhas de configuração**, e elas não são duplicadas: duas telas com o mesmo interruptor são duas
telas para divergir, e a [`023`](../023-composer-menus/prd.md) já pagou o preço de uma superfície que
ninguém olhava.

**A métrica de cerimônia fica** ([Q9](open-questions.md)). A régua não é *de quem é o dado*, é *o que
se faz com ele*: configuração se ajusta, medida se olha — e uma medida cuja utilidade depende de ser
vista sem ser procurada não pode morar numa tela que só se abre de propósito.

### Fora de escopo

- **Tamanho de fonte de verdade.** A quarta medição o move para o sistema de design: sem `rem` no
  `tokens.css`, a preferência não tem onde pegar. A seção `exibição` entra nesta feature como
  **desenho e endereço**; a alavanca é a [Q7](open-questions.md), e a resposta pode ser *"vira issue
  no Open Design primeiro"*.
- **Mover o login de agentes e as credenciais** (LUM-57 e LUM-58). São issues próprias, e a
  [Q6](open-questions.md) mudou o que elas são: **não sobra nada** no rodapé, então elas passam a
  *remover* o `.sidebar__foot` em vez de esvaziá-lo. O `.foot-head`, o `.foot-row` e o `.pip` saem
  junto, ou viram as 13 classes órfãs que a Parte 1 da
  [`028`](../028-autonomous-orchestration/prd.md) já pagou uma vez.
- **Redesenhar a lista de tarefas** (LUM-60). Só faz sentido depois que a F5 tirar as 79 linhas de
  cima dela.
- **Configuração por projeto.** O `[scripts]` e o mapa de colunas são do repositório e já têm lugar —
  o `project.toml`. Trazê-los para cá é a [Q8](open-questions.md), e a proposta é **não**.
- **Workspace, projeto e checkout na URL** — o N3 da [Q2](open-questions.md). É a
  [LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030),
  e é lá que ficam as perguntas que fecham porta: id opaco na URL, link morto para worktree removida
  — que é o caso **comum**, não o raro —, e quem manda quando a URL e o `localStorage` discordam.
- **O sinal passivo de agente caído.** A [Q6a](open-questions.md) o recusa por **escala**: uma linha
  por agente são +28px cada, e com seis agentes é um terço da coluna; dar rolagem ao bloco o faria
  ocupar espaço **e** deixar de cumprir a função. O lugar disso é uma superfície que agrega —
  **notificações** —, que entrou no [backlog](../../project/backlog.md) com o gatilho. Até lá, agente
  sem login se descobre tentando usá-lo.
- **Internacionalizar a interface.** Continua no [backlog](../../project/backlog.md), com o gatilho.

## 5. Como se prova

- `/settings` carregado direto na barra de endereço abre a tela — **com `F5`**, que é a diferença
  entre rota e estado;
- o botão *voltar* do navegador sai de `/settings` e volta para onde se estava;
- selecionar um checkout **não** cria entrada no histórico — voltar depois disso sai de `/tasks` ou
  `/settings`, e não *desfaz a seleção*;
- cada seção diz **de quem** ela é, e a frase é lida sem abrir nada;
- pôr `US$ 3,00` no teto por tarefa e recarregar a página mostra `US$ 3,00` — hoje **nada** na web
  escreve esse campo;
- apagar o campo do teto grava `null` e a tela lê **sem teto**; escrever `0` grava `0` e a tela lê
  `0` — as duas coisas continuam diferentes;
- o `<p class="tlist__budget">` **não existe mais** na lista de tarefas, e a suíte que o cobria
  aponta para o lugar novo;
- a entrada é **uma**, e `document.elementFromPoint` no centro dela devolve ela — a pergunta que a
  [`023`](../023-composer-menus/prd.md) ensinou a fazer, contra `toBeVisible`.

## 6. Riscos

**A rota é a parte que quase não era desta feature.** O aplicativo não tinha roteamento, e a tela de
configurações é a primeira coisa que o pede. O risco era esta feature carregar uma migração de
navegação inteira; a [Q2](open-questions.md) o cortou parando no N1 e mandando o resto para a
[LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030).

**O que sobra de risco é o `App`.** `workspaceView` deixa de ser estado e passa a ser derivado do
caminho, e é aí que se paga o preço de ter **uma** resposta para *onde eu estou* — a `029` acabou de
juntar as duas que existiam, e um router mal encaixado as separa de novo.

**Quatro seções com quatro donos é um convite a uma tela que ninguém lê inteira.** O risco não é
estético: uma pessoa que muda um teto achando que mudou para a máquina é a falha que a A16 já
nomeou, e mudar de endereço não a conserta sozinha.

**A `028` Parte 3 é um precedente contra pressa.** Os tetos foram desenhados com a decisão de
*função pura de três saídas*, e escrever os campos agora significa **validar entrada** onde antes só
havia leitura — `null`, `0` e vazio são três coisas, e a tela tem que distinguir as três com teclado.

## 7. As issues irmãs

Esta é a guarda-chuva: ela cria o *lá*; as outras movem conteúdo para cá.

| Issue | O quê | Depende desta em |
|---|---|---|
| LUM-56 | os tetos e a esteira saem da lista de tarefas | F1, F2, F3 |
| LUM-57 | o login de agentes sai do rodapé da sidebar | F2, e a [Q6](open-questions.md) |
| LUM-58 | as integrações num lugar só | F2, e a [Q8](open-questions.md) |
| LUM-59 | preferência de tamanho de fonte | a [Q7](open-questions.md) — e o Open Design antes |
| LUM-60 | redesenho da lista de tarefas | F5 |
