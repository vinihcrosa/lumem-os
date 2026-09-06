# PRD — A barra da pull request

> **Status:** em implementação — as 11 perguntas fecharam em 2026-09-05
> **Versão:** v0.3 — a **Q3** e a **Q4** trocaram o corte da feature: ela lê **e escreve**. A v0.2
> tinha mudado a estrutura (a v0.1 punha a barra acima do cabeçalho da worktree; o Vinicius mudou
> ([§2.1](#21-a-mudança-de-estrutura)), e a barra foi para o painel direito), e o rebase em cima da
> `main` trouxe a [project-scripts](../project-scripts/prd.md), que ancorou um **rodapé de execução**
> no mesmo painel — absorvido no §2.2
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Protótipo:** `packages/web/prototype/lumem-pr-bar.html` — abra no navegador
> **Sucede:** [workspace-screen](../workspace-screen/prd.md)
>
> **Nota de 2026-09-05 — a feature passou a escrever.** As onze perguntas foram respondidas de uma
> vez, e **duas delas contra a proposta escrita aqui**: a [Q3](open-questions.md) põe o `Merge` no v1
> e a [Q4](open-questions.md) faz o Lumem **criar** a PR. O corte *"ler, não agir"* — que era a
> decisão mais cara do desenho, e a que fazia o §5 curto e o §4 barato — **caiu**. O que muda:
>
> - a frase *"nenhum caminho desta feature escreve no remoto"* some do PRD. Ela era metade da
>   resposta de segurança; o [§4.2](#42-e-agora-ela-escreve) é o que entra no lugar;
> - `mesclar` e `criar PR` saem do §5 e viram a **F7**, com portão, confirmação e um teste que prova
>   que o portão não é decorativo;
> - o desenho da barra **não cobre** os dois gestos novos — a tela 9 do protótipo é literalmente *"o
>   que esta barra não faz"*, e ela está desatualizada. Os botões entram no `prbar__acts`, que já
>   existe e já é `.btn`, sem token novo e sem CSS novo; a tela 9 fica como dívida de desenho,
>   registrada no §10.
>
> **Nota de 2026-09-01:** a barra **não está implementada** — nenhuma das 16 tasks foi iniciada, e
> não há uma linha de código de PR no daemon nem no web. Uma PR aberta hoje (foi a
> [#29](https://github.com/vinihcrosa/lumem-os/pull/29)) não aparece em lugar nenhum porque não há o
> que a leia: o que existe é este desenho. A feature segue **travada na [Q1](open-questions.md)**
> (`gh` instalado × API do host com token nosso).
>
> **A Fase 1 saiu daqui.** A estrutura da coluna do meio (§2.1, F0) virou feature própria —
> [worktree-first-tab](../worktree-first-tab/prd.md) —, porque ela não depende de saber ler PR e esta
> depende de uma pergunta que não fechou. A **Q11** foi junto. Esta feature passa a **depender**
> daquela, e as tasks E1–E3 daqui saem de escopo.

---

## 1. Objetivo

Quando a worktree tem uma pull request aberta, o Lumem responde **uma pergunta** no topo do painel
direito: **dá pra mesclar?** Verde quando nada impede, vermelho quando algo impede, âmbar enquanto
ainda não se sabe — e o motivo escrito ao lado, sempre. Ao lado do número, um `↗` que abre a PR no
navegador.

O que isto resolve não é "ver PR bonito dentro do editor". É o modo de trabalho que o produto inteiro
existe para servir: **várias worktrees em paralelo**, cada uma com um agente, cada uma virando uma PR.
Hoje descobrir qual delas está pronta e qual quebrou custa uma ida ao navegador **por worktree** — e
como o custo é por worktree, ele cresce exatamente com a coisa que o Lumem promete deixar crescer.

**Critério de sucesso em uma frase:** com oito worktrees na sidebar, você sabe quais estão prontas e
qual quebrou sem abrir o navegador nenhuma vez — e quando quiser agir, um clique te põe na PR.

A [vision](../../project/vision.md) pede isso em uma linha: *"ter um sistema de controle de git, se
abrir uma PR poder ver, mas não apenas no github, poder ver no gitlab, e em outros lugares"*. O
backlog guardava como **[Abstração de git host](../../project/backlog.md)**, com o gatilho
"quando a aba de review existir" — este PRD tira o item de lá. O corte que o item pedia era *"ler, não
agir"*; a [Q3](open-questions.md) e a [Q4](open-questions.md) o moveram uma casa: **ler tudo, e
escrever dois verbos** — mesclar e criar —, cada um atrás de um portão. Reexecutar, aprovar e comentar
continuam fora.

---

## 2. Forma

```
┌──────────────┬─────────────────────────────┬────────────────────────────┐
│ sidebar      │ pessoal / lumem-os / pr-bar │ [#19 ↗] ● pronta p/ merge  │
│              ├─────────────────────────────┤ 5 verificações · aprovada  │
│ ◇ pr-bar     │ [◇ pr-bar•][◆ claude][● sh] ├────────────────────────────┤
│      ● #19   ├─────────────────────────────┤ Arquivos Mudanças Mem. PR✓5│
│ ◇ acp-fs     │  ◇ pr-bar        worktree   ├────────────────────────────┤
│      ● #18   │  branch  ● pr-bar           │  ✓ lint                    │
│ ◇ memory-inb │  base    main ↑7 ↓0         │  ✓ typecheck               │
│      ● #17   │  estado  ● suja · 3 arquivos│  ✓ unit                    │
└──────────────┴─────────────────────────────┴────────────────────────────┘
   de longe          a worktree é a 1ª aba        a PR mora aqui
```

### 2.1 A mudança de estrutura

Duas coisas mudam de lugar, e a feature nasce dentro delas:

1. **A coluna do meio começa nas abas.** Acima delas fica só o caminho
   (`workspace / projeto / worktree`). Título, branch, sujeira, caminho em disco, distância da base e
   as ações da worktree **saem do cabeçalho fixo** e viram o conteúdo da **primeira aba** — a aba da
   worktree, que hoje se chama `contexto` e passa a se chamar pelo nome dela, com o losango do escopo.
2. **A barra da PR mora no topo do painel direito**, acima da faixa de abas dele. Ela não é uma faixa
   da largura da tela: é um bloco de 360px, e por isso **empilha em duas linhas** — identidade e
   veredito em cima, motivo e idade embaixo.

**O que a mudança cobra**, dito onde dói: o `ScopePanel` de hoje mantém o cabeçalho **acima** da faixa
de abas com uma justificativa escrita no código — *"uma sessão nova não muda a branch, o caminho, nem
se a árvore está suja; trocar de aba não pode fazer essa informação se mexer"*. Com a mudança, ela se
mexe: **com uma aba de sessão na frente, branch e sujeira somem da vista.**

Quem paga a conta são dois sinais que sobrevivem a qualquer aba:

| Sinal | Onde | O que carrega |
|---|---|---|
| **o ponto na aba da worktree** | faixa de abas do meio | a árvore está suja |
| **o marcador `● #19`** | linha da worktree na sidebar | o estado da PR |

O que se ganha em troca: no cabeçalho fixo tudo aquilo tinha de caber em duas linhas e virava fila de
chips truncados — e a informação que mais sofria, **o caminho em disco**, agora cabe inteira e dá para
copiar.

### 2.2 O painel direito agora tem quatro andares

A [project-scripts](../project-scripts/prd.md) entrou na `main` enquanto esta feature era desenhada, e
a decisão **S1** dela ancorou o rodapé de execução (`Setup`, `Run`, `Terminal`) **no painel direito** —
*"o repositório em cima, o que ele faz embaixo"*. Somando com esta feature, a coluna passa a ter, de
cima para baixo:

| Andar | De quem | Altura |
|---|---|---|
| a barra da PR | esta feature | ~52px (duas linhas) |
| a faixa de abas | `right-panel` | 40px |
| o conteúdo | a aba em foco | o que sobrar |
| o rodapé de execução | `project-scripts` | do usuário, arrastável |

**É essa conta que faz a barra ter duas linhas e não três.** A contagem das verificações, que numa
faixa larga seria uma terceira linha ou um botão à direita, virou o distintivo da aba `PR` — cabe onde
já havia lugar, e nasce sendo um alvo clicável em vez de virar um depois.

O `RightPanel` já é um quadro de slots (`actions`, `dock`, `footLeft`, `footRight`), então a barra
entra como **mais um slot**, acima do `rp__bar`. Nenhum dos andares existentes muda de dono.

### 2.3 A regra de cor

**A cor é a resposta; a palavra confirma; o motivo explica.** Os três existem porque cor sozinha não é
sinal acessível, e porque um vermelho que não diz o que houve manda você para o navegador — que é
exatamente a ida que a feature promete evitar.

| Cor | Quando | Por quê |
|---|---|---|
| **verde** | nada impede o merge | é o único estado em que a próxima ação é sua e é uma só |
| **vermelho** | algo impede, e é **definitivo** — check reprovado, conflito, mudanças pedidas, regra da base | precisa de você agora |
| **âmbar** | ainda não se sabe — verificação rodando ou na fila | metade da vida de uma PR é isso; pintar de vermelho seria gritar lobo, e lobo que grita sozinho para de ser lido |
| **neutro** | não há o que decidir — sem PR, rascunho, fechada sem merge, sem integração | ausência é resposta, e resposta não é erro |
| **brand** | mesclada | acabou. Não é sucesso de CI, é fim de vida — e é o sinal de que a worktree pode ser removida |

### 2.4 O desenho

Feito **inteiramente no Open Design** ([regra](../../project/design-source-of-truth.md)), no projeto
`lumem-os`, e trazido pelo `design:sync`: `lumem-pr-bar.html` + `lumem-pr-bar.css`. Nove telas em um
arquivo (§8).

**Zero token novo.** Os estados caem em cima das rampas semânticas que já existem (`success`,
`danger`, `warning`, `brand`, `neutral`). O que a feature acrescenta à verificação de contraste são
**pares** — combinações que ninguém tinha usado ainda.

O desenho previu cinco; a implementação acrescentou **doze**, e a diferença tem motivo: o motivo e a
idade são texto **secundário e terciário sobre a faixa colorida**, e os pares antigos só mediam esses
tons sobre a superfície. Os cinco previstos:

| Par | Razão | Mínimo |
|---|---|---|
| `text/success` sobre `bg/success-subtle` | **8,20:1** | 4,5 |
| `text/danger` sobre `bg/danger-subtle` | **7,59:1** | 4,5 |
| `text/warning` sobre `bg/warning-subtle` | **7,74:1** | 4,5 |
| `text/brand` sobre `bg/brand-subtle` | **7,72:1** | 4,5 |
| `text/secondary` sobre `bg/neutral-subtle` | **7,16:1** | 4,5 |

#### O que a renderização achou

Cada um saiu de olhar a tela renderizada, não de ler o código:

| Achado | Correção |
|---|---|
| **A quarta aba não cabe.** Com o nome `Verificações`, as quatro abas do painel somam ~352px numa faixa de ~348 úteis a 360px — e a quarta ficava atrás de uma barra de rolagem horizontal, que é o pior lugar possível para o único aviso de que algo quebrou | A aba se chama **`PR`**. Cabe com folga, é o mesmo termo que a barra logo acima usa (`#19`), e sobra espaço para a contagem, que é o que se procura. Ver [Q10](open-questions.md) |
| **`.app` já existe no design system**, com altura de viewport e duas linhas de grid. O protótipo reusou o nome e os três painéis foram parar dentro da primeira linha, de 40px | A maquete virou `.appmock`. Vale como aviso para a implementação: nome de classe do sistema é do sistema |
| **`.rtab` também já existe**, com sublinhado e `.rtab--active` — e o protótipo tinha escrito uma segunda implementação, com fundo e `aria-selected` | Ficou a do sistema, inteira. A quarta aba só acrescenta **cor na contagem** (`✕1` vermelho, `●2` âmbar, `✓5` verde) |
| Uma linha só era desenho de faixa larga; em 360px o motivo truncava sempre | Duas linhas, e a ordem de sacrifício declarada no CSS (§ da largura) |
| `abrir PR no GitHub` é `<a>` com cara de `.btn` — e veio **sublinhado** | `.prbar .btn { text-decoration: none }`. Metade das ações desta barra é âncora, porque levam para fora do Lumem |
| O ponto pulsando em "rodando" chamava mais atenção que o vermelho de "falhou" ao lado | Pulso lento (1,6 s), desligado em `prefers-reduced-motion` |

---

## 3. Escopo

### F0 — A estrutura (pré-requisito, e não efeito colateral)

**F0.1** A coluna do meio passa a ser: **caminho → faixa de abas → conteúdo da aba**. O `ScopePanel`
deixa de receber um `header` com título e chips; recebe só o caminho.
**F0.2** A primeira aba é a da worktree: **fixa, primeira, sem `✕`** — fechar a worktree dentro da
worktree não quer dizer nada. Rotulada com o nome do checkout e o losango do escopo.
**F0.3** Ela mostra o que era o cabeçalho **mais** o que não cabia: nome, tipo, branch, base com
`↑/↓`, estado da árvore, caminho em disco inteiro (e copiável), quando foi criada e de qual commit,
sessões da worktree, e as ações (nova sessão, remover worktree).
**F0.4** Um **ponto** na aba quando a árvore está suja — é o resto do estado que sobrevive com outra
aba na frente.
**F0.5** Fechar a última sessão devolve a seleção para a aba da worktree, que é o único lugar que não
some.

### F1 — A barra, no topo do painel direito

**F1.1** Bloco no topo do `RightPanel`, **acima** da faixa de abas dele, em duas linhas. Entra como um
slot novo do quadro que já existe — os outros três andares (§2.2) não mudam de dono nem de altura.
**F1.2** Sete estados: `sem PR`, `rascunho`, `verificando`, `pronta`, `bloqueada`, `mesclada`,
`fechada`. Cada um com cor, palavra e motivo.
**F1.3** A pastilha `#<número>` **é o link**: abre a PR no navegador, com o `↗` separado por uma divisa
dizendo para onde leva. Um alvo só, ≥24px.
**F1.4** Bloqueio nomeia a **causa de maior prioridade** — conflito > verificação reprovada > mudanças
pedidas > regra da base — e o culpado por nome (`e2e (macOS)`, `joao`, `main`). Quatro motivos
empilhados não cabem em 360px, e você resolve um por vez de qualquer forma.
**F1.5** A idade do dado aparece **sempre** (`há 12 s`), e não só quando envelhece: número que só existe
no erro é número que ninguém aprende a ler. Acima do limite ele fica âmbar.
**F1.6** Sem PR e com a branch publicada, a barra oferece **abrir a tela de comparação do host** — que
não cria nada, só leva você ao lugar onde se cria (F5.4).
**F1.7** Ordem de sacrifício **declarada** entre 260px e 720px: em 260 some a idade e o motivo cai para
uma linha; em 720 tudo cabe numa linha só. Número, ponto, palavra do estado e `↗` nunca saem.
**F1.8** A barra não some sozinha por erro. Só some quando não há o que dizer **e** você mandou não
mostrar mais (host sem integração, CLI ausente).

### F2 — A aba `PR` do painel

**F2.1** Quarta aba do painel direito, e **só existe quando existe PR** — aba permanente que passa a
vida vazia ensina o olho a pular a faixa inteira.
**F2.2** Ela carrega a **contagem** por conclusão (`✓5`, `✕1`, `●2`), colorida pelo pior estado. A barra
diz o veredito; a aba diz de quantas coisas ele saiu.
**F2.3** Lista agrupada, com **o que precisa de você primeiro**: reprovadas, em andamento, passadas,
ignoradas. Reprovado abaixo de trinta linhas verdes é reprovado invisível.
**F2.4** Cada linha: glifo de estado (com a palavra no leitor de tela), nome, quem executou
(`GitHub Actions`, `Vercel`) **abaixo do nome** — em 360px não cabe ao lado —, duração, e um `↗`
próprio que abre **aquela** execução: a diferença entre "vi que quebrou" e "vi o log".
**F2.5** Rodapé dizendo de quando é a leitura e **o que a aba não faz**: reexecutar e mesclar se fazem
no navegador.

### F3 — O marcador na sidebar

**F3.1** Worktree com PR ganha `● #19` na linha, com a cor do mesmo veredito da barra.
**F3.2** Worktree sem PR não ganha nada. Marcador cinza em cinco linhas ensina o olho a ignorar a
coluna inteira.
**F3.3** O marcador vem da **mesma** resposta do daemon que a barra usa — nenhuma segunda consulta, e
nenhuma chance de a sidebar dizer verde com a barra dizendo vermelho.
**F3.4** Ele é o **único** sinal de PR que sobrevive ao painel direito colapsado — e o painel nasce
colapsado no primeiro uso. Isso o move de enfeite para requisito.

### F4 — O daemon: o adaptador de host

**F4.1** Uma interface `PrHost` com um método que interessa: *dadas as branches deste repositório, o
que o host sabe?* Uma implementação no v1 — **GitHub via `gh`** (Q1).
**F4.2** O host é descoberto do `remote` do repositório, pelo `git-url.ts` que a
[project-from-url](../project-from-url/prd.md) já escreveu e já testou. Host desconhecido → sem
integração, dito na tela.
**F4.3** **A consulta é por projeto, não por worktree.** Um `gh pr list` traz todas as PRs abertas do
repositório de uma vez; oito worktrees do mesmo projeto custam **um** processo, não oito. É a diferença
entre uma feature que escala com o paralelismo e uma que o pune.
**F4.4** **O veredito é derivado no daemon**, não no cliente. `ready | blocked | pending | none |
draft | merged | closed` mais uma `reason` estruturada saem de uma função pura, testada por tabela. Se
a regra morasse na tela, a barra e o marcador poderiam discordar — e a resposta para "dá pra mesclar?"
teria duas versões.
**F4.5** Cache em memória por projeto, com TTL, **single-flight** (dez componentes pedindo ao mesmo
tempo = uma execução) e retorno imediato do último valor conhecido enquanto revalida.
**F4.6** Ritmo adaptativo: `15s` com verificação rodando, `60s` sem, **pausado** com a janela oculta.
Falha de rede aumenta o intervalo progressivamente até um teto.
**F4.7** Nenhuma falha desta feature derruba tela: sem CLI, sem autenticação, sem rede, limite de API e
host não suportado são **respostas**, com o que fazer escrito.

### F5 — O que sai do Lumem

**F5.1** Abrir a PR, abrir uma execução de verificação e abrir a tela de comparação — três links. Eles
continuam existindo depois da F7: o host tem tela para tudo que o Lumem não tem.
**F5.2** Quem abre é o **cliente** (`window.open`), não o daemon: o Lumem roda no navegador servido
pelo daemon, então não existe motivo para o processo do daemon aprender a chamar `open`.
**F5.3** **Toda URL é validada antes de virar link** (§4). Ela veio da internet.
**F5.4** A tela de comparação é **montada pelo daemon** a partir do host, da base e da head — não vem
do payload. Ela é a saída para quem quer o formulário completo do host (template, reviewers, labels),
e não some por causa da F7.

### F7 — Os dois verbos que escrevem ([Q3](open-questions.md), [Q4](open-questions.md))

**F7.1** `pr.merge` e `pr.create`, e **nada mais**. A lista de verbos é a fronteira de segurança
inteira (§4.2), e ela é curta o suficiente para caber numa revisão de código.
**F7.2** **O portão do merge é o veredito, e ele é relido no daemon.** Uma PR cujo veredito não é
`ready` é recusada — mesmo que o cliente peça, mesmo que o cliente diga que está verde. Um botão
escondido na tela é conforto; a recusa no daemon é a garantia, e o teste que a prova chama a
procedure direto, sem passar pela tela.
**F7.3** Mesclar **pergunta antes**, e a pergunta diz o que vai acontecer: o número, a base, a
estratégia e o destino da branch. As estratégias oferecidas são as que **o repositório permite** — o
Lumem lê `mergeCommitAllowed`, `squashMergeAllowed` e `rebaseMergeAllowed` do host e não inventa
nenhuma.
**F7.4** Depois de mesclar, a barra vira `mesclada` e diz o que a v0.2 já dizia: *esta worktree pode
ser removida*. Remover continua sendo gesto seu, na aba do checkout — mesclar não apaga worktree.
**F7.5** Criar PR exige **branch publicada**. Quando ela não está, o mesmo gesto oferece publicar, e
a confirmação diz que vai fazer um `git push -u` antes — porque isso também é escrita no remoto.
**F7.6** O formulário de criação **propõe e não decide**: título vindo do assunto do último commit
da branch, corpo vazio, e `rascunho` como caixa. Reviewers, labels e template ficam no host, atrás
do `↗`.
**F7.7** Falha de escrita é **resposta**, não erro genérico: PR já existe, branch protegida, sem
permissão, conflito que apareceu entre a leitura e o clique. Cada uma com o que fazer escrito, e
nenhuma com `stderr` cru (§4.1.4).
**F7.8** Escrita **invalida o cache na hora** (F4.5) e publica o evento — a barra não pode continuar
verde depois de o merge acontecer.

### F6 — Contrato

**F6.1** `PullRequestView` em `packages/shared`: número, URL, título, estado derivado, motivo,
contagem de verificações, lista de verificações, autor da última revisão, carimbo de leitura.
**F6.2** `pr.getByWorktree({ worktreeId })` e `pr.listByProject({ projectId })`, ambos servidos do mesmo
cache.
**F6.3** Evento de invalidação no barramento que o `events.ts` já tem, para a tela não depender só do
relógio dela.

---

## 4. Confiança: o dado vem da internet, e o comando é de terceiro

Esta é a primeira feature em que o Lumem **executa um binário que não é o `git`**, **renderiza texto
que veio de fora da sua máquina** e — desde a [Q3](open-questions.md) e a
[Q4](open-questions.md) — **escreve no repositório de outra gente**. As três merecem regra escrita.

### 4.1 Ler

**Executar o `gh`:**

1. **`argv` fixo.** Nenhuma string de UI entra na linha de comando. O que varia é `cwd` (a worktree, já
   resolvida pelo `resolveScope`) e, no máximo, um nome de branch vindo do **git local** — nunca do
   cliente. O argumento é o mesmo do `ext::` do `git-url.ts`: o que decide se isto vira execução
   arbitrária é a lista, não a esperança.
2. **Timeout e `maxBuffer`**, como o `execGit` já faz. Um repositório com 300 PRs não pode travar o
   daemon nem estourar a memória dele.
3. **Nenhum segredo nosso.** O `gh` tem a própria autenticação, no keychain da sua máquina. O Lumem
   **não guarda token, não pede token e não lê token** — e essa ausência é a maior parte da resposta de
   segurança desta feature. Ver [Q1](open-questions.md).
4. **`stderr` do `gh` nunca vai cru para a tela nem para o log.** Ele pode conter URL com credencial em
   remoto mal configurado. Vai a mensagem que o adaptador classificou.

**Renderizar o que veio de lá:**

5. **Título de PR, nome de check, nome de autor e nome de branch são texto de gente desconhecida.** Vão
   para a tela como **texto**, nunca como HTML, e sempre truncados. O React já faz o escape; o que esta
   regra proíbe é a exceção esperta que alguém acrescenta depois.
6. **URL é validada antes de virar link:** esquema `https`, e host **igual ao host do remote** do
   projeto. Uma PR pode conter link para qualquer lugar; o `↗` do Lumem só leva ao host de onde o dado
   veio. Fora disso, a linha aparece sem link e diz por quê.
7. **Nada do que vem do host entra em prompt de agente nesta feature.** Se um dia entrar — "peça ao
   agente para corrigir o check que falhou" —, o texto passa a ser instrução vinda de fora, e isso é
   uma decisão própria, com portão próprio. Fica registrado aqui porque é a tentação óbvia da v2.

### 4.2 E agora, ela escreve

Mesclar e criar PR são **irreversíveis para o time inteiro**, e a regra do §4.1 — *"nenhuma string de
UI entra na linha de comando"* — não sobrevive intacta a um título de PR que a pessoa digitou. Ela
não some: ganha a forma que aguenta o caso.

8. **Um verbo por procedure, e cada verbo é uma `mutation`.** `pr.merge` e `pr.create`, e nada de um
   `pr.run({ command })` genérico. A lista de verbos é a fronteira, e ela é curta o suficiente para
   caber numa revisão de código.
9. **Valor de UI viaja como `--flag=valor`, num único token de `argv`.** Um valor solto pode ser lido
   como flag quando começa com `-`; colado à flag, não pode. Não há shell em lugar nenhum do caminho
   (`execFile` com vetor), então o que sobra a defender é **injeção de flag**, e é isso que a forma
   colada fecha.
10. **O corpo da PR vai por arquivo**, `--body-file`, e não por argumento. Um corpo de PR tem
    quebras de linha, tem markdown e tem tamanho — e argumento longo esbarra em `ARG_MAX` numa
    máquina e não na outra, que é o defeito que só aparece na de outra pessoa.
11. **Caractere de controle é recusado antes de virar `argv`.** Mesma lista do `git-url.ts`, mesmo
    motivo: um `\n` num título parte um argumento em dois para qualquer coisa que um dia escreva
    isto em arquivo ou log.
12. **Nome de branch e número de PR nunca vêm do cliente.** Eles vêm do **git local** e do cache do
    daemon. O cliente diz *qual worktree*; quem traduz worktree em branch é o daemon, como já
    traduz em diretório.
13. **O portão é o veredito, e ele é do daemon.** `pr.merge` recusa uma PR cujo veredito não é
    `ready` — e recusa **relendo**, não confiando no que o cliente mandou. Um botão escondido na tela
    é conforto; a recusa no daemon é a garantia.
14. **Criar PR exige branch publicada, e publicar é dito em voz alta.** O `git push` que precede o
    `gh pr create` é escrita no remoto também, e aparece na confirmação como o que é.

---

## 5. Não-objetivos

Cada linha é uma tentação que vai aparecer durante a implementação. A primeira é a decisão mais cara
do desenho.

| Fora | Por quê |
|---|---|
| ~~**Mesclar pela barra**~~ | **Entrou**, pela [Q3](open-questions.md). Virou a F7, com portão pelo veredito e confirmação que diz a estratégia e o destino da branch |
| ~~**Criar PR**~~ | **Entrou**, pela [Q4](open-questions.md). Virou a F7 também — propondo título e deixando reviewers, labels e template no host |
| Reexecutar verificação, aprovar, comentar | Escrita, e nenhuma delas é o **fim do trabalho** — que é o argumento que fez o merge entrar. Cada uma com o seu modo de falha, e cada uma uma superfície própria |
| Escolher reviewers, labels e template ao criar | É a tela do host, e ela é boa. O Lumem cria o esqueleto e o `↗` leva ao resto |
| Ler log de CI dentro do Lumem | O `↗` da linha abre a execução. Trazer log para dentro é outra tela, com streaming e retenção |
| Review inline, threads, sugestões | É a aba `Review` inteira, que já estava no backlog e continua lá |
| GitLab, Bitbucket, Gitea | O **adaptador** existe desde o v1 e é a porta. A segunda implementação entra quando houver um repositório de verdade para exercitá-la — senão é abstração desenhada contra imaginação |
| PR de outras pessoas, lista de PRs do repositório | A barra é da **sua** worktree. Uma lista de PRs é outra tela e outro modelo mental |
| Token do Lumem para a API do host | O `gh` já resolveu autenticação. Guardar segredo é uma superfície inteira por zero ganho — ver §4.1.3. Vale para a leitura **e** para a escrita: quem assina o merge é o seu `gh`, com a sua conta |
| Notificação de sistema quando a PR fica verde | Tentador e barato de errar: exige política de ruído. Vai para o backlog |
| **Mexer no que a aba da worktree mostra além do que já existia** | A F0 **move** informação e acrescenta o que já estava no daemon (caminho, criação, sessões). Consumo de tokens, memória e diff continuam onde estão |

---

## 6. Riscos

| O quê | Por quê | Mitigação |
|---|---|---|
| **A mudança de estrutura quebrar tela que já funciona** | A F0 mexe no `ScopePanel`, que é o esqueleto de **todas** as telas de checkout, e nos testes da [worktree-tabs](../worktree-tabs/tasks.md) | A F0 é a **primeira fase**, entregue e verde antes de qualquer coisa de PR entrar. Nenhuma informação some no caminho: o que sai do cabeçalho reaparece na aba, e o teste que provava o cabeçalho passa a provar a aba |
| **Estado da worktree ficar invisível** com uma sessão na frente | É o custo nomeado no §2.1, e ele é real | Dois sinais persistentes (ponto na aba, marcador na sidebar) e um clique para o resto. Ver [Q11](open-questions.md) |
| **O `gh` não existir, não estar autenticado, ou mudar de saída** | É dependência de máquina, e a saída `--json` é contrato de outro projeto | A fase 1 é um **spike** que mede a saída real e vira fixture. Ausência e falta de auth são estados de tela desenhados, não erros |
| **Tempestade de processos** | Oito worktrees × poll = oito processos por ciclo, e o `gh` custa centenas de ms | F4.3 (consulta por projeto), F4.5 (single-flight + TTL) e F4.6 (ritmo adaptativo e pausa com janela oculta) são *Done when* de task, não intenção |
| **Limite de API do host** | Poll agressivo com várias worktrees queima cota, e a cota é a mesma do seu `gh` no terminal | Intervalo mínimo, backoff progressivo, e o limite **dito na tela** com o horário de volta |
| **Verde mentiroso** | Cache velho pintado de verde é pior que nenhuma cor: manda mesclar | A idade aparece sempre (F1.5), fica âmbar quando passa do limite, e "sem rede desde HH:MM" entra no motivo |
| **A regra de "pronta" divergir do host** | `mergeable` do GitHub tem estados que não são sim/não, e branch protection muda a resposta | O veredito é uma função pura testada por tabela (F4.4), e a frase **cita a regra do host** em vez de reimplementá-la |
| **Mesclar a PR errada, ou mesclar de um estado que não estava verde** | Desde a [Q3](open-questions.md) o Lumem escreve, e a escrita é irreversível para o time | Três coisas, e nenhuma é comentário: o **número da PR nunca vem do cliente** (§4.2.12), o **portão relê o veredito no daemon** (F7.2) e a confirmação **diz o número, a base e a estratégia** antes de qualquer coisa |
| **Injeção de flag num título de PR** | Título e corpo vêm da tela, e um título que começa com `-` é lido como flag por qualquer CLI | `--flag=valor` colado num token só, corpo por `--body-file`, e recusa de caractere de controle antes de virar `argv` (§4.2.9–11). Não há shell no caminho, então isto é o que sobra |
| **Texto de fora na tela** | Título e nome de check vêm da internet | §4.5 e §4.6 |
| **A barra roubar altura do painel** | Ela nasce no topo do painel direito, e o `FitAddon` do terminal mede a coluna do meio | Menor que na v0.1 — a barra não fica mais sobre o terminal —, mas a F0 muda a altura do meio: **aparecer e sumir remede o terminal** continua sendo *Done when*, agora da F0 |
| **Quatro andares num painel de 260px de largura** | A barra da PR chegou depois do rodapé de execução, e os dois comem altura do conteúdo (§2.2) | A barra tem duas linhas e some quando não há PR; a contagem foi para a aba em vez de virar terceira linha; e o **terminal do rodapé remede** quando a barra aparece ou some — mesmo *Done when* da P6 |

---

## 7. Custo nos testes

Maior que na v0.1, e a diferença tem nome: a **F0 mexe em tela que já funciona e já é testada**.

- **`ScopePanel` e as telas de checkout**: o cabeçalho sai, a aba entra. Os testes que asseguram que
  branch, caminho e sujeira aparecem **continuam existindo** — mudam de alvo, e ganham um irmão que
  prova que a aba da worktree é a que abre por padrão e que ela não fecha;
- **o `gh` não pode ser chamado em teste.** A política de [testing.md](../../project/testing.md) diz
  que git nunca é dublado, porque `git worktree` tem comportamento que nenhum dublê reproduz. Aqui o
  argumento vira do avesso: o `gh` fala com a **rede** e com a **sua conta**, então chamá-lo em teste é
  teste que falha no avião e polui uma conta real.

O desenho de teste que sai disso:

- **Seam de execução**, como o `GitExec` já é: o adaptador recebe quem executa;
- **Fixtures capturadas de uma execução real** no spike, commitadas — e uma task de *recaptura* que diz
  como refazê-las quando o `gh` mudar;
- **Tabela de veredito**: cada combinação de (`mergeable`, `reviewDecision`, rollup, `isDraft`,
  `state`) → estado e motivo. É a parte que a tela toda depende e a única que é pura;
- **e2e com um `gh` falso**: um script executável num diretório temporário na frente do `PATH`. Processo
  de verdade, saída de verdade, zero rede — o mesmo espírito de "filesystem de verdade" que o resto do
  repositório usa.

---

## 8. As telas

| # | Tela | O que ela decide |
|---|---|---|
| 1 | a tela inteira, três colunas, com o rodapé de execução no painel | onde cada coisa passa a morar, e a conta de altura da coluna da direita |
| 2 | a aba da worktree, sozinha | o que era cabeçalho, com espaço para respirar |
| 3 | os cinco estados, na largura do painel | duas linhas, e a contagem indo para a aba |
| 4 | as quatro causas de bloqueio + rascunho | vermelho é definitivo; rascunho não é bloqueio |
| 5 | a aba `PR` | agrupamento, reprovado no topo, `↗` por linha |
| 6 | os seis estados degradados | o que dizer quando não dá para saber |
| 7 | o painel fechado | por que o marcador na sidebar é requisito |
| 8 | 260 e 720 | a ordem de sacrifício |
| 9 | o que a barra não faz | a ausência do `Merge`, escrita na própria tela |

---

## 9. Depois desta versão

- **O segundo host** (GitLab por `glab`), que é o teste real do adaptador;
- **As ações de escrita que ficaram de fora** — reexecutar verificação, aprovar, comentar —, cada uma
  com o seu portão. Mesclar e criar já entraram, pela Q3 e pela Q4;
- **Notificação** quando a PR fica verde ou quebra, com política de ruído;
- **A aba `Review`**, que continua no [backlog](../../project/backlog.md) e é outra feature inteira;
- **"O check quebrou, peça ao agente para consertar"** — a ponte entre esta barra e a sessão ACP. É a
  ideia mais valiosa da lista e a mais perigosa: põe texto da internet dentro de um prompt (§4.7).

---

## 10. Dívida de desenho

Uma, e ela é consequência direta da [Q3](open-questions.md) e da [Q4](open-questions.md).

**A tela 9 do protótipo está errada.** Ela se chama *"o que esta barra não faz"* e o texto dela é a
ausência do `Merge`, argumentada. Os dois gestos entraram, então a tela descreve uma decisão que foi
revertida — e o protótipo é **cópia do Open Design** ([regra](../../project/design-source-of-truth.md)),
que não se edita à mão deste lado.

O que a implementação faz enquanto isso, e por que é seguro:

- os dois botões entram no `.prbar__acts`, que **já existe** no desenho e já é `.btn` — é o mesmo
  lugar de onde saem `abrir PR no GitHub`, `tentar de novo` e `não mostrar mais`;
- **zero token novo e zero classe nova**: o gesto novo não pede pixel novo, pede um botão a mais numa
  fila de botões que já estava desenhada;
- o diálogo de confirmação usa o mesmo componente dos outros diálogos do produto.

O que fica devendo: as telas de **confirmação de merge** e de **criação de PR**, desenhadas no Open
Design, e a tela 9 reescrita para dizer o que a barra passou a fazer e o que ela continua não fazendo.
