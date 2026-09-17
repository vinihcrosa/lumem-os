# A tela de configurações — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** em execução
**Histórico:** escritas em **2026-09-17**, junto com a PRD. **16 tasks em 5 fases**; a **fase 0
entregou a T1 e a T3** no mesmo dia — as quatro perguntas que travavam foram respondidas, duas contra
a proposta, e a folha `lumem-settings` existe, foi renderizada e foi medida.

A ordem foi invertida a pedido: o desenho veio **antes** de as outras cinco perguntas terem resposta.
Isso não fura a regra — o que ela proíbe é código antes do desenho —, e pagou por si mesmo: a folha
achou **quatro defeitos de desenho** que nenhuma leitura de código pegaria, e o mais reaproveitável
deles não é desta feature (a largura da coluna mora no `.body`, não na `.sidebar`).

---

## Antes de começar

**As nove respondidas em 2026-09-17** — e as cinco que travavam foram as primeiras: [Q1](open-questions.md) **tela cheia**,
[Q3](open-questions.md) **etiqueta por controle** (contra a proposta), [Q4](open-questions.md)
**escreve**, [Q5](open-questions.md) **a terceira linha da `SidebarNav`** (contra a proposta), e a
[Q2](open-questions.md) **o N1, à mão** — com o N3 virando a
[LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030).
As outras quatro fecharam na sequência: [Q6](open-questions.md) **não sobra nada no rodapé** (contra
a proposta), [Q7](open-questions.md) o `rem` nasce no Open Design, [Q8](open-questions.md) o mapa de
colunas é leitura, [Q9](open-questions.md) a métrica de cerimônia fica na tela de tarefas.

**Nada trava mais.** A única pergunta aberta é a [Q6a](open-questions.md), que a Q6 abriu — sem
rodapé, onde aparece que um agente caiu — e ela é de **outra** feature: quem remove o rodapé é a
LUM-57.

**O que muda, se as propostas passarem como estão:**

| Onde | O quê |
|---|---|
| `packages/web/prototype/lumem-settings.html` e `.css` | cópia do Open Design, uma tela por arquivo |
| `packages/web/src/lib/route.ts` | novo: lê `location.pathname`, escreve com `pushState`/`replaceState`, ouve `popstate` — ~40 linhas, sem dependência |
| `packages/web/src/App.tsx` | `workspaceView` deixa de ser `useState` e passa a ser derivado do caminho |
| `packages/web/src/components/SettingsPanel.tsx` | novo: a tela, quatro seções |
| `packages/web/src/components/TaskList.tsx` | saem as 79 linhas de configuração; **a métrica de cerimônia fica** ([Q9](open-questions.md)) |
| `packages/web/src/components/SidebarNav.tsx` | a terceira linha, `⚙ Configurações`, e o `aria-label` reescrito |
| `packages/web/src/components/AgentLogin.tsx` | **nada, nesta feature.** A [Q6](open-questions.md) decidiu que o rodapé **some**, e quem o remove é a LUM-57 |
| `packages/server/src/routers/workspace.ts` | **nada** — `setBudget` já existe, testado e sem chamador |
| `e2e/settings.spec.ts` | endereço, `F5`, botão voltar e a escrita dos tetos |

**O que não muda** — e cada um tem uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| o `project.toml` ser o dono do `[scripts]` e do mapa de colunas | [Q8](open-questions.md) |
| a métrica de cerimônia sair da lista de tarefas | [Q9](open-questions.md) — ela não é configuração |
| o `tokens.css` ganhar `rem` | [Q7](open-questions.md) — nasce no Open Design, não aqui |
| o workspace ativo entrar na URL | [Q2](open-questions.md) — é o N2, e ele foi **pulado**; o workspace continua no `localStorage` |
| o checkout ganhar endereço | [Q2](open-questions.md) — é o N3, e virou a [LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030) |

**A armadilha, e ela é nova neste repositório:** esta é a **primeira rota** do produto. Todo teste de
componente é jsdom, e jsdom tem `history` — então um teste de componente **passa** contra um router
que nunca tocou a barra de endereço do navegador de verdade. O que prova rota é `F5` e o botão
voltar, e os dois só existem no e2e.

---

## Fase 0 — a decisão e o desenho

#### T1: responder as quatro perguntas que travam · **entregue em 2026-09-17**

As quatro do desenho — [Q1](open-questions.md), [Q3](open-questions.md), [Q4](open-questions.md) e
[Q5](open-questions.md) —, com a resposta escrita **dentro da proposta que ela derrubou** nos dois
casos em que houve derrubada. A [Q2](open-questions.md) ficou de fora de propósito: ela decide a
forma do roteamento, e o desenho não depende dela.

A [Q5](open-questions.md) foi a que mais mudou: a pergunta tratava o `aria-label="Telas do
workspace"` como regra, e ele é **descrição** — escrita quando as duas telas que existiam eram do
workspace. O que decidiu não foi isso, foi a [Q6](open-questions.md): pôr a porta da tela nova dentro
do rodapé que a LUM-57 e a LUM-58 vão esvaziar é construir a entrada dentro da sala em demolição.

**Done when:** as quatro têm `**R (data):**`, e as que mudaram o [§4](prd.md#4-escopo) já mudaram a
PRD. ✔

#### T2: decidir se a rota vira ADR · **decidido em 2026-09-17: não, e não agora**

O roteamento parecia passar nos três testes, e o que o derrubou foi o **primeiro**: o N1 **não é
difícil de reverter**. `/settings` continua válido nos três níveis — é a rota sem escopo —, e trocar
~40 linhas por uma biblioteca é uma tarde. A assimetria é toda para um lado: adotar `react-router`
seria difícil de desfazer; não adotar, não.

O que fecha porta é o **N3**, e ele saiu daqui: id opaco na URL, link morto para worktree removida
(o caso **comum**, porque worktree é efêmera), e quem manda quando a URL e o `localStorage`
discordam. **As ADRs de roteamento nascem na
[LUM-63](https://linear.app/lumem-os/issue/LUM-63/rotas-de-verdade-workspace-projeto-e-checkout-na-url-o-n3-que-a-030).**

A regra está no [CLAUDE.md](../../../CLAUDE.md): falhou um dos três testes, é **nota na PRD** — e ela
está no [§4](prd.md#4-escopo), dentro da F1. ✔

#### T3: o desenho, no Open Design · **entregue em 2026-09-17**

Projeto `lumem-os`, folha `lumem-settings` — quatro quadros: a tela, o campo de teto, a etiqueta e o
glifo, e a conta. Ela está sincronizada em `packages/web/prototype/`.

**A folha foi renderizada e medida, e achou quatro defeitos de desenho** — os quatro estão no
[§2a](prd.md#2a-o-que-o-desenho-decidiu-e-o-que-ele-achou-renderizando) da PRD e num quadro da
própria folha. O mais reaproveitável não é desta feature: **a largura da coluna mora no `.body`**, e
uma sidebar montada num `flex` encolhe para 188,6px — qualquer folha futura que a monte fora do
`.body` mede uma coluna que o produto não tem.

**Done when:** a folha existe, `design:sync` a traz e o `--check` fica limpo. ✔

#### T4: conferir que nenhum token novo é preciso · **entregue em 2026-09-17**

Campo de número, rótulo, seção e etiqueta de dono — tudo já existia no `lumem-ds.css` e no
`lumem-shell.css`. A folha **não pediu nenhum token novo**, e a `.own` foi desenhada com
`--text-caption` mais `--tracking-caps`, que já existem.

Conferido no arquivo: **zero literal de cor e zero literal de tipografia** no `lumem-settings.css`. O
único valor em `px` no código é `height: 620px`, e ele é a **moldura do quadro da folha** — não
atravessa para o produto. Para comparação, o `lumem-sidebar-nav.css` tem 6 linhas com `px` e o
`lumem-second-agent.css`, 7.

**Done when:** os tokens usados pela folha estão conferidos contra o `tokens.css` deste lado. ✔

---

## Fase 1 — o endereço

#### T5: `route.ts` — ler, escrever e ouvir

Quatro coisas e nada mais: o caminho atual, `navigate(path)` com `pushState`, `navigate(path, {
replace: true })` com `replaceState`, e um `popstate` que avisa. O `useActiveWorkspace` é o molde —
ele já faz o mesmo contrato contra o `localStorage`, inclusive o `try` que a navegação privada exige.

**Sem biblioteca**, pela [Q2](open-questions.md). E **sem parâmetro de rota**: três caminhos
literais. Uma função de casamento genérica aqui seria escrever metade do N3 sem as perguntas dele
respondidas.

**Done when:** `navigate("/settings")` muda a barra de endereço sem recarregar, a variante `replace`
**não** cria entrada no histórico, `popstate` devolve, e o teste de unidade cobre os quatro.

#### T6: o `App` deriva de onde está, e tem **uma** resposta

Hoje são duas fontes: `selection` e `workspaceView` — a [`029`](../029-sidebar-nav/prd.md) juntou
`board` no `App` exatamente para isso. Com rota, `workspaceView` **deixa de ser estado** e passa a
ser leitura do caminho, ou volta a haver duas — e duas é o defeito que aquela feature pagou para
tirar.

**E selecionar um checkout usa `replace`**, não `push`: ele é seleção, não lugar. Com `push`, o
botão voltar viraria *desfazer seleção* e uma sessão normal de trabalho encheria o histórico.

**Done when:** `/`, `/tasks` e `/settings` desenham as três telas; clicar nas linhas da sidebar muda
a barra de endereço; selecionar um checkout **não** acrescenta entrada no histórico; e não existe
mais nenhum `useState` decidindo qual tela do workspace está na frente.

#### T7: `/settings` sobrevive a `F5` e ao botão voltar

O servidor já responde — medido: **200 `text/html`** no vite, e o shell no daemon instalado por
`wantsAppShell`. O que falta é o cliente montar a tela certa no primeiro render, sem piscar o Home
antes.

**Done when:** abrir `/settings` direto na barra de endereço mostra a tela de configurações **no
primeiro quadro**, e o botão voltar sai dela para onde se estava.

---

## Fase 2 — a tela

#### T8: `SettingsPanel`, quatro seções e o dono de cada uma

A frase de escopo é da [Q3](open-questions.md) e ela é **conteúdo**, não decoração: é o que impede a
falha da A16 de mudar de endereço junto com o resto.

**Done when:** as quatro seções estão na tela, cada uma diz de quem é com o nome próprio do dono, e
o workspace citado é o **ativo**.

#### T9: os três tetos viram campo, com `null`, `0` e vazio distintos

`workspace.setBudget` já existe, já valida (`nonnegative`, `int` no de turnos) e já tem `check` no
SQLite. O que não existe é quem o chame.

`null` é *sem teto*, `0` é *bloqueia tudo* e campo vazio é o gesto de **apagar** o teto. Três estados,
e a tela não pode colapsar dois.

**Done when:** escrever `3.00`, recarregar e ler `3.00`; apagar o campo e ler **sem teto**; escrever
`0` e ler `0` — os três com teclado, sem mouse.

#### T10: o paralelismo vira campo, ao lado dos degraus

Hoje a tela só o **carrega junto** no `setAutonomy`, com `?? 2` quando a leitura ainda não voltou.
Com campo, o `?? 2` sai: o valor mandado é o que está na tela.

**Done when:** mudar o paralelismo para 3 e ligar a esteira manda **3**, e não o que o `TaskList`
tinha em cache.

#### T11: o interruptor da Q27 e os degraus da esteira mudam de casa

Texto inteiro junto — *"PR mesclada sempre remove a worktree, inclusive com arquivo não commitado"* —,
e **separado** dos tetos pelo motivo que a `028` escreveu: ligar a autonomia não pode parecer que
autoriza apagar rascunho.

A permissão de notificar continua sendo pedida **no clique que liga a esteira**, e não na abertura da
tela — Q55 da [`028`](../028-autonomous-orchestration/open-questions.md), e o motivo é o mesmo: é o
único instante em que o pedido tem frase honesta.

**Done when:** os três degraus e o interruptor funcionam de `/settings`, e ligar `assistido` daqui
pede a permissão de notificação uma vez.

#### T12: as seções `agentes`, `integrações` e `exibição`, no tamanho que a fase 0 decidir

Esta feature **cria o lugar**; LUM-57 e LUM-58 mudam o conteúdo de casa. O que entra aqui é a seção
com o que já se sabe ler: quais agentes existem, qual versão do adaptador o daemon fixou, e quais
credenciais estão guardadas.

A seção `exibição` entra **sem o controle** se a [Q7](open-questions.md) mandar o `rem` para o Open
Design — com a frase dizendo o que falta, e não com um botão que não faz nada.

**Done when:** as três seções existem, nenhuma promete um controle que não funciona, e a versão do
adaptador é a que o daemon tem **no disco** (`027`), e não a do PATH.

---

## Fase 3 — o que sai de onde estava

#### T13: as 79 linhas saem da lista de tarefas — e a medida fica

Do `TaskList.tsx:278` ao `:356`. **Removidas, não duplicadas** — duas telas com o mesmo interruptor
são duas telas para divergir.

**A métrica de cerimônia fica** ([Q9](open-questions.md)): ela não é configuração, e o lugar dela é
onde ela incomoda. Então o `<p class="tlist__budget">` **não desaparece — ele encolhe**, e o que
sobra provavelmente deixa de ser um parágrafo de orçamento; o nome da classe mente a partir daí, e o
`gate:quick` não pega nome de classe mentiroso.

**Done when:** a lista abre com a lista no topo; nenhum teto, degrau ou interruptor sobrou no JSX da
lista; a linha de cerimônia continua lá; e os testes que cobriam os controles apontam para
`SettingsPanel`, tendo sido vistos **vermelhos** antes.

#### T14: a entrada, uma e só uma

Onde é a [Q5](open-questions.md). O que esta task garante é a unicidade: se a linha nasceu no rodapé,
ela não nasce também na topbar.

**Done when:** existe **um** elemento que leva a `/settings`, e `document.elementFromPoint` no centro
dele devolve ele.

---

## Fase 4 — a prova

#### T15: o e2e, porque jsdom tem `history` e não tem barra de endereço

Cinco perguntas, e três delas nenhum teste de componente pode fazer:

1. `/settings` aberto direto abre a tela — e **não** pisca o Home antes;
2. o botão voltar sai de `/settings` para onde se estava;
3. `F5` em `/settings` volta em `/settings` (o caso que a `production.spec.ts` prova para o daemon
   instalado, e que aqui precisa valer para o cliente);
4. escrever `US$ 3,00` no teto por tarefa, recarregar, e o valor estar lá — o caminho que **nenhum
   código da web percorreu até hoje**;
5. apagar o campo grava `null` e a tela lê `sem teto`.

**Done when:** os cinco passam, e cada um foi visto **vermelho** contra o código de antes.

#### T16: fechar a documentação

O [índice](../../README.md), o [backlog](../../project/backlog.md) — a entrada *"Tela de
preferências"* e a linha *"Rotas de verdade na aplicação"*, que esta feature cobra — e o §Estado
atual do [CLAUDE.md](../../../CLAUDE.md).

Se a fase 0 produziu ADR, ele entra no índice junto.

**Done when:** `pnpm docs:check` passa, e o `Status:` dos dois arquivos desta pasta concorda com o
disco.
