# PRD — Worktree a partir de branch, PR ou issue

> **Status:** desenho — nenhuma task executada
> **Versão:** v0.2 — a v0.1 detectava provedor por hostname e previa um override por projeto ([Q20](open-questions.md), [Q23](open-questions.md))
> **Perguntas:** [open-questions.md](open-questions.md) — 23, **todas respondidas**
> **Tasks:** [tasks.md](tasks.md)
> **Sucede:** [project-from-url](../project-from-url/prd.md)

---

## 1. Objetivo

Hoje uma worktree nasce de um jeito só: branch nova, cortada da default, com o nome que você digitou. É literalmente o que o contrato permite — `worktree.create({ projectId, name })`, e o `name` é também a branch.

Só que quase todo trabalho já existe em algum lugar antes de você começar: uma branch que alguém empurrou, um PR em review esperando conserto, uma issue aberta ontem. Nenhum deles entra por aqui. Você abre um terminal, `git fetch`, `git worktree add`, e o Lumem descobre depois — ou nunca, porque worktree criada por fora não tem linha no banco.

Esta feature põe a **origem** na criação. Quatro:

| Origem | O que acontece |
|---|---|
| **branch nova** | o que já existe hoje — corta da default |
| **branch existente** | local ou remota, com rastreamento |
| **PR / MR** | inclusive de fork |
| **issue** | branch nova, com a issue registrada e no contexto |

E entrega a worktree **já trabalhando**: o prompt digitado na criação abre uma sessão de agente na worktree recém-nascida e entrega o texto a ela.

**Critério de sucesso em uma frase:** você lê uma issue no GitHub, cola o número no Lumem, escreve *"resolve isso"*, e meio minuto depois tem um checkout novo com o agente rodando dentro — sem terminal, sem `git fetch`, sem copiar o número duas vezes.

---

## 2. O que isto muda no que já existe

| Peça | Hoje | Depois |
|---|---|---|
| `worktree.create` | `{ projectId, name }` | ganha `source` (união discriminada), `name` **opcional**, `prompt` e `agentConfigId` |
| `GitService.addWorktree` | um caminho: `worktree add -b <branch> <path> <base>` | **três**: branch nova, branch local existente, branch remota rastreada |
| `GitService` | não busca nada na rede | ganha `fetchRef` — busca **alvejada**, não `fetch` inteiro |
| Linha do `worktree` | `name`, `branch`, `path`, `state` | ganha `source_kind`, `source_ref`, `source_url`, `source_title`, `initial_prompt` |
| Linha do `agent_config` | `command`, `args`, `env` | ganha `prompt_transport` — como o texto chega ao agente |
| Binários externos | `git`, e o comando do agente | **e `gh`/`glab`** |
| Diálogo de worktree | um campo de nome | quatro abas, busca, nome opcional, prompt e escolha de agente |

### 2.1 "O nome é a branch" deixa de valer sempre

O F4.2 do walking-skeleton amarrou os dois: o nome da worktree **é** o nome da branch. Isso deixa de ser verdade em três das quatro origens:

- **branch existente** — a branch é a que você escolheu; o nome da worktree é derivado dela;
- **PR** — a branch é a do PR, que você não escolheu e pode ter qualquer forma (`user:feature/x`);
- **issue** e **branch nova** sem nome digitado — a branch é **sorteada**.

O que torna isso barato: **o schema já separava os dois**. `worktree.name` e `worktree.branch` são colunas distintas desde o walking-skeleton; era o router que as igualava. Nada de migração para isto — só o router deixa de forçar.

O que continua valendo, e vira regra explícita: **o nome é único por projeto** (`worktree_name_per_project`) e é o **último segmento do diretório**. Uma branch com barra vira diretório aninhado, comportamento que a UI já anuncia hoje.

### 2.2 O nome sorteado

A [Q4](open-questions.md) decidiu que campo de nome vazio não é erro — é sorteio. O que se sorteia é a [Q19](open-questions.md): **sobrenomes de gente que fez a física e a computação de que este produto é feito**, no mínimo **150 deles** — `fresnel`, `huygens`, `planck`, `schrodinger`, `noether`, `dirac`, `lovelace`, `hopper`, `roentgen`, `fraunhofer`. Combina com o nome do produto, e não é a lista de cidades do Conductor.

Nome difícil é escolha, não descuido: a resposta diz que *"faz parte"*. O que ele obriga é o gesto de **copiar** onde o nome aparece — quem for digitar `fraunhofer` num `cd` vai errar. O `⧉` já existe, veio da project-from-url.

E obriga uma regra de dados: **a lista é ascii minúscula, transliterada** — `schrödinger` → `schrodinger`, `röntgen` → `roentgen`, `poincaré` → `poincare`. Acento em nome de branch não é feiura, é a classe de bug de caminho que o `execGit` já documenta. Um teste percorre a lista **inteira** provando isso; amostra não serve.

Três regras que o sorteio obedece:

1. **Nunca colide.** Sorteia contra o que já existe: `branchExists` e o nome de worktree do projeto. Esgotado, sufixa `-2`, `-3` — o mesmo precedente da [Q6 da project-from-url](../project-from-url/open-questions.md).
2. **Só entra quando não há nome.** Nome digitado ganha sempre; origem que já traz uma branch (existente, PR) ganha do sorteio.
3. **É mostrado antes de criar.** O placeholder do campo exibe o nome que será usado. Sorteio invisível é o usuário perdendo a worktree de vista na sidebar cinco minutos depois.

### 2.3 O daemon passa a executar um terceiro binário

Até aqui o daemon roda `git` e o comando do agente. Agora roda `gh` ou `glab` — decisão da [Q2](open-questions.md), e ela compra muito: zero OAuth, zero token no SQLite, zero fluxo de login, e funciona no dia um porque a máquina do usuário já tem os dois autenticados.

O preço, dito por extenso porque é ele que sustenta o §9: o daemon passa a **ler o GitHub privado do usuário com o token do usuário**, e continua sem autenticação nenhuma na própria porta ([P1](tasks.md)).

---

## 3. Forma

O botão "nova worktree" continua onde está e continua tomando a barra de ações — o que muda é o que ele abre:

```
┌─ nova worktree ─────────────────────────────────────────────┐
│                                                             │
│  de:  [ branch nova ] [ branch ] [ PR ] [ issue ]           │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ 🔎 número, título ou descrição                        │  │
│  └───────────────────────────────────────────────────────┘  │
│                                                             │
│   #418  worktree não some da sidebar depois de remover      │
│         aberta há 2 dias · bug                              │
│   #402  clone de repositório grande estoura o timeout       │
│         aberta há 6 dias                                    │
│                                                             │
│  nome     ┌─────────────────────────┐                       │
│           │ fresnel                 │  ← sorteado; edite    │
│           └─────────────────────────┘                       │
│                                                             │
│  prompt   ┌───────────────────────────────────────────────┐ │
│           │ resolve a issue #418                          │ │
│           └───────────────────────────────────────────────┘ │
│           agente: [ claude ▾ ]                              │
│                                                             │
│                        [ criar ]  [ cancelar ]              │
└─────────────────────────────────────────────────────────────┘
```

Cinco coisas que a forma decide:

1. **A origem é a primeira escolha, não a última.** Ela muda o que o resto do formulário significa — com `branch` o nome vem de graça, com `issue` ele é sorteado.
2. **A busca é o corpo do diálogo nas três origens de fora.** Em `branch nova` não há lista: o formulário é o de hoje.
3. **O nome é opcional e o placeholder mostra o que vai acontecer.** Nunca em branco e nunca mentindo.
4. **O prompt é um campo comum, editável, e vem pré-preenchido com uma referência curta** (`resolve a issue #418`) — nunca com o corpo da issue. O porquê está no §9.
5. **Nada aqui é modal bloqueante.** Cortar worktree é rápido; o que pode demorar é o `gh`, e o que a lista mostra enquanto espera é esqueleto, não bloqueio.

### O que a renderização achou

O protótipo (`packages/web/prototype/lumem-worktree-source.html`, oito telas) foi verificado renderizando, não lendo o HTML. Seis correções saíram daí, e três são de significado, não de acabamento:

| O que apareceu | O que mudou |
|---|---|
| As três razões de forge indisponível estavam em **cores diferentes** — uma neutra, duas amarelas | Elas são **pares**: mesma gravidade, ações diferentes. Cor distinta inventava uma hierarquia que não existe. Agora as três são neutras e o que as separa é a frase |
| A recusa da [Q22](open-questions.md) estava em **vermelho**, igual à de repositório sem commit | Ela não é falha: é escolha adiada. Virou aviso, e ganhou o botão **`atualizar`** dentro — a ação que resolve estava a três parágrafos de distância |
| A marca `remota` estava na cor de "atrás do remoto" | Procedência não é urgência. Amarelo ali lia como aviso sobre uma branch que não tem nada de errado |
| `tentar de novo` sem borda | Lia como legenda do estado vazio, não como botão. Ganhou contorno |
| `aberta em huygens` saía **`aberta emhuygens`** | O `inline-flex` da marca engole o espaço entre nós de texto |
| Branch longa quebrava a linha do item de PR em duas | Fica anotado para a implementação: truncar com reticências, e o título nunca ceder espaço para a branch |

---

## 4. As quatro origens

Cada uma é uma sequência de comandos diferente, e cada uma tem uma armadilha própria. Elas estão aqui e não na task porque três delas corrompem estado se forem esquecidas.

### 4.1 Branch nova — o que já existe

```
git worktree add -b <nome> <path> <default_branch>
```

Inalterado, inclusive o `branch -D` de limpeza quando o `add` falha depois de criar a branch. É o caminho que a `blank` continua percorrendo.

### 4.2 Branch existente, local

```
git worktree add <path> <branch>
```

**A armadilha:** o git recusa checar a mesma branch em duas worktrees — `fatal: '<branch>' is already used by worktree at <path>`. Isso não é erro raro, é o caso comum: você quer abrir uma branch que já está aberta.

O Lumem recusa **antes**, e a recusa **diz qual worktree** já tem a branch — o dado está no banco e em `git worktree list`. "Já está aberta em `fresnel`" é uma frase que resolve; a do git manda o usuário procurar um caminho absoluto no meio do stderr.

### 4.3 Branch existente, remota

```
git fetch origin <branch>                       (alvejado, só se pedido)
git worktree add --track -b <local> <path> origin/<branch>
```

**A armadilha:** o DWIM do git aqui depende de configuração (`checkout.guess`, `--guess-remote`) e, sem ela, `worktree add <path> <nome-remoto>` produz **HEAD destacado** em vez de branch rastreada — e o usuário só descobre no primeiro push. `--track -b` explícito não depende de config nenhuma.

**Segunda armadilha:** a branch local pode já existir e ter divergido do remoto. A [Q22](open-questions.md) fechou em **recusar dizendo o atraso** — *"a branch local `feature/x` está 3 commits atrás de `origin/feature/x`"*, com o número vindo do `getAheadBehind` que a right-panel já usa. Usar a local em silêncio abriria a worktree em código velho; resetá-la seria escrever por cima de trabalho.

### 4.4 PR / MR

```
git worktree add --detach <path> <default_branch>
gh pr checkout <numero>          (cwd = a worktree nova)
```

**Por que não fazer na mão:** um PR de **fork** não tem a branch no `origin`. Dá para buscar `refs/pull/<n>/head` no GitHub e `refs/merge-requests/<iid>/head` no GitLab, mas o resultado é uma branch local sem upstream — quem tentar empurrar a correção descobre isso depois de fazê-la. O `gh pr checkout` já resolve remoto, refspec e rastreamento, por provedor, e é mantido por quem mantém o provedor. Reimplementar isso é assumir manutenção de uma matriz de casos que não é nossa. ([Q7](open-questions.md).)

O `--detach` na criação existe para a worktree nascer **sem** branch: o `gh` cria e checa a dele em seguida. Se o `gh` falhar, a worktree detached é removida junto com o registro — mesma regra de rollback que o `worktree.create` já tem hoje.

**A armadilha:** `gh pr checkout` escreve em `.git/config` do repositório, que é **compartilhado por todas as worktrees**. Na prática ele adiciona um refspec ou um remote — inofensivo e cumulativo. Fica nomeado como [P5](tasks.md) em vez de descoberto por alguém daqui a três meses.

### 4.5 Issue

```
git worktree add -b <nome> <path> <default_branch>
```

Mecanicamente é o §4.1. O que a issue muda é **o registro e o contexto**: número, título e URL vão para as colunas `source_*` e para o prompt pré-preenchido.

**O que ela não faz:** `gh issue develop`. Aquilo cria branch **no remoto** e vincula à issue lá — e a [Q023 do questions.md](../../project/questions.md) ("o Lumem mexe no git sozinho?") está aberta. Escrever no remoto sem que essa pergunta tenha resposta seria decidi-la por acidente, numa feature que não é sobre isso.

---

## 5. O forge é um CLI

### 5.1 Qual, e como se descobre

**Perguntando ao CLI se ele conhece o host** ([Q23](open-questions.md)):

```
gh   auth status --hostname <host>     → sai 0: o gh responde por este host
glab auth status --hostname <host>     → sai 0: o glab responde por este host
```

O host sai de `project.remote_url`, já sanitizada. `github.com` pergunta ao `gh` primeiro e `gitlab.com` ao `glab` — mas isso é **ordem**, não decisão: quem decide é quem responde 0.

Por que não a tabela de hostname que a [Q12](open-questions.md) tinha fechado: ela deixava de fora exatamente o caso que a [Q20](open-questions.md) descreve — uma máquina com `gh` autenticado num GitHub Enterprise, ou `glab` num GitLab interno, **já configurados**, e ainda assim sem abas de forge. O teste certo não é o nome do host; é quem responde por ele.

Isso funde numa coisa só o que o desenho tratava como duas — qual provedor, e se está autenticado. É mais fiel ao que a Q20 pediu: *"só o gh e o glab, se estiverem configurados na máquina"*.

**E não há override.** Nenhum campo de provedor no projeto, nenhum seletor, nenhum passo a mais por repositório. O Lumem não autentica nada e não guarda credencial nenhuma — as credenciais são da máquina, como no §4.3 da [project-from-url](../project-from-url/prd.md).

### 5.2 O que o Lumem não faz

**Não descobre `owner/repo`.** O `gh` e o `glab` rodam com `cwd = project.path` e descobrem sozinhos, pelo `origin`. Parsear URL de repositório para extrair dono e nome é uma família de bug (SSH scp-like, subgrupos do GitLab, `.git` sobrando) que já está resolvida dentro do binário que vamos chamar de qualquer jeito.

### 5.3 Três falhas, três frases

Nunca uma só. São situações diferentes com ações diferentes:

| Situação | Como se detecta | O que a tela diz |
|---|---|---|
| projeto sem remoto conhecido | `remote_url` nulo | *"este projeto não tem origem registrada"* |
| nenhum CLI instalado | `isCommandAvailable` — o mesmo helper do F6.5 | *"nem `gh` nem `glab` estão no PATH do servidor"* |
| nenhum CLI responde pelo host | os dois `auth status --hostname` saem != 0 | *"nenhum CLI configurado nesta máquina responde por `<host>` — rode `gh auth login --hostname <host>`"* |

A terceira é a que a [Q23](open-questions.md) reescreveu: ela era *"não reconheço o provedor"*, uma recusa sem saída. Agora diz o comando que resolve — e resolve **na máquina**, que é onde a [Q20](open-questions.md) decidiu que a autenticação mora.

Mesma doutrina do F6.5: recusado **antes** da tentativa, com a frase que diz o que fazer. O servidor devolve **causa**; a frase é da tela.

### 5.4 A chamada

```
gh pr list   --json number,title,headRefName,author,updatedAt,isDraft,state --limit 30 [--search <q>]
gh issue list --json number,title,author,updatedAt,state,labels             --limit 30 [--search <q>]
```

- **argv, sempre.** Nunca string de shell. A busca do usuário é **um** item do argv, e a lista de campos `--json` é constante do código.
- **zod na fronteira.** JSON de CLI é entrada externa como qualquer outra; campo faltando é falha de contrato com mensagem, não `undefined` vazando para a tela.
- **timeout de 15 s.** É listagem, não clone: não há job, não há progresso, não há cancelamento.
- **sem cache.** A lista é buscada a cada consulta, com debounce no cliente. Rate limit é [P6](tasks.md).

---

## 6. O prompt inicial

### 6.1 Dois transportes, declarados

O texto chega ao agente de um de dois jeitos, e **qual deles é propriedade do agente**, não do Lumem — daí a coluna nova em `agent_config`:

| `prompt_transport` | Como | Quando |
|---|---|---|
| `arg` | o prompt vira um item do argv, substituindo `{prompt}` nos `args` ou anexado ao fim | o CLI aceita o prompt na linha de comando |
| `type` | escrito no PTY depois que o agente sobe | TUI que só lê do terminal — o default |

`arg` é o preferido sempre que existir: é atômico, não depende de timing e não passa por interpretação de terminal.

### 6.2 O `type`, que é onde mora o risco

Escrever no PTY logo depois do `spawn` perde o texto: o TUI ainda não instalou o handler de entrada. A sequência:

1. espera o **primeiro byte de saída** do PTY;
2. espera **300 ms de silêncio** depois dele — o TUI terminou de desenhar;
3. escreve o prompt entre `ESC[200~` e `ESC[201~` (**bracketed paste**), porque prompt de várias linhas sem isso envia sozinho na primeira quebra;
4. escreve `\r` separado, depois de um respiro.

Teto de 10 s para os dois primeiros passos: estourado, escreve mesmo assim e registra. Melhor um prompt possivelmente perdido do que uma worktree presa esperando.

**Isto é heurística, não medição.** Os números vieram do desenho. Fica como [P3](tasks.md), com o mesmo tratamento que a [P6 da project-from-url](../project-from-url/tasks.md) recebeu: número escolhido é número dito.

### 6.3 O prompt é texto, e só

O Lumem **nunca olha para dentro do prompt** ([Q21](open-questions.md)). `pnpm dev` digitado ali é uma string que o agente vai ler, não um comando que alguém vai executar. Sem detecção de comando, sem "isto parece um shell", sem caminho especial.

E o prompt **só abre agente**. Sessão de shell não recebe nada: shell executa o que chega, sem ninguém para interpretar, e essa conveniência merece a conversa que ela ainda não teve.

### 6.4 O que acontece quando dá errado

**A worktree fica.** Agente indisponível, prompt não entregue, `gh` que sumiu no meio — nada disso desfaz um checkout que o git já criou com sucesso. O erro aparece na aba da worktree, o prompt fica guardado em `initial_prompt`, e abrir o agente de novo é um clique.

O contrário — desfazer a worktree porque o agente não subiu — apagaria trabalho por causa de um binário faltando. ([Q14](open-questions.md).)

---

## 7. Requisitos funcionais

### F7.1 — Quatro origens num diálogo só
Abas `branch nova`, `branch`, `PR`, `issue`. A escolha da origem muda a lista e o significado do campo de nome, nunca o botão de criar.

### F7.2 — Busca por número, título ou descrição
Nas abas `PR` e `issue`, com debounce, trinta primeiros resultados, e o texto indo como um argv só para o CLI do provedor.

### F7.3 — Branches vêm do disco; a rede é pedida
A aba `branch` lista `refs/heads` e `refs/remotes`, ordenadas pelo commit mais recente, dizendo quais já estão abertas em worktree. Um botão `atualizar` faz `git fetch --prune`. Sem fetch automático: o F4.3 do walking-skeleton usa o que está no disco, e a lista não é motivo para mudar isso.

### F7.4 — Branch já aberta é recusada dizendo onde
Antes do git falhar, e nomeando a worktree que a tem.

### F7.5 — Branch remota vira branch local rastreando
`--track -b` explícito. HEAD destacado por acidente é defeito.

### F7.6 — PR de fork funciona
Via `gh pr checkout` dentro da worktree recém-criada. Falha dele remove a worktree e o registro, nessa ordem.

### F7.7 — Issue vira branch nova com a issue registrada
Número, título e URL nas colunas `source_*`. O prompt vem pré-preenchido com a referência — **não** com o corpo.

### F7.8 — Nome é opcional; vazio sorteia
E o sorteado aparece no placeholder antes de criar. Colisão sufixa e diz.

### F7.9 — A origem fica registrada e aparece
A aba e o painel da worktree mostram de onde ela veio, com link clicável quando há URL.

### F7.10 — O prompt abre o agente e entrega o texto
Sessão de agente na worktree nova, prompt entregue pelo transporte que a configuração declara, `Enter` incluído ([Q3](open-questions.md)).

### F7.11 — Agente que não sobe não custa a worktree
O checkout fica, o prompt fica guardado, o erro aparece na aba.

### F7.12 — Sem remoto, sem CLI e host não configurado são três frases
Nunca um "erro" genérico, sempre antes da tentativa, e a terceira **diz o comando** que resolve na máquina do usuário.

### F7.13 — Projeto sem remoto conhecido mostra o que dá
As duas abas de git funcionam; as duas de forge explicam por que não.

### F7.14 — Falha de rede no forge não trava o diálogo
A lista mostra o erro e um `tentar de novo`; as outras abas continuam usáveis.

### F7.15 — Nada pergunta nada ao terminal
O `fetch` desta feature herda o `cloneEnv` da project-from-url: sem askpass, `BatchMode=yes` composto. Um `fetch` que abre prompt de senha pendura o daemon.

---

## 8. Contrato

```ts
type WorktreeSource =
  | { kind: "blank" }
  | { kind: "branch"; branch: string; remote: string | null }
  | { kind: "pr"; number: number }
  | { kind: "issue"; number: number };

interface CreateWorktreeInput {
  projectId: string;
  source: WorktreeSource;
  /** Vazio sorteia (F7.8). Ignorado quando a origem já traz uma branch. */
  name?: string;
  /** Até 8 KiB. Vazio não abre agente nenhum. */
  prompt?: string;
  /** Obrigatório quando há prompt. */
  agentConfigId?: string;
}

type ForgeProvider = "github" | "gitlab";
type ForgeBlocked = "no-remote" | "no-cli" | "host-not-configured";

interface ForgeStatus {
  provider: ForgeProvider | null;
  ready: boolean;
  /** Preenchido quando `ready` é falso. Um por frase do F7.12. */
  blocked: ForgeBlocked | null;
  /** O host, que entra na frase e no `gh auth login --hostname` que ela sugere. */
  host: string | null;
}

interface ForgeItem {
  number: number;
  title: string;
  url: string;
  author: string | null;
  updatedAt: number;
  state: string;
  /** Só em PR. */
  branch?: string;
  draft?: boolean;
}

interface BranchItem {
  name: string;
  remote: string | null;
  lastCommitAt: number;
  /** O nome da worktree que já a tem aberta, F7.4. */
  usedBy: string | null;
}
```

Procedures:

| Procedure | O quê |
|---|---|
| `worktree.create` | a de hoje, com o input acima |
| `project.listBranches` | F7.3, do disco |
| `project.fetch` | o botão `atualizar` |
| `forge.status` | F7.12 e F7.13 |
| `forge.listPullRequests` | F7.2 |
| `forge.listIssues` | F7.2 |

**Um `create` só**, não quatro procedures ([Q18](open-questions.md)) — pelo mesmo motivo do D5 da project-from-url: dois caminhos de criação seriam duas definições de worktree válida, e a segunda envelheceria.

---

## 9. Segurança

### 9.1 Execução

- **argv sempre**, shell nunca. Número de PR é `z.number().int().positive()`, não string.
- Timeout em toda chamada de CLI (15 s), e `fetch` alvejado com o `cloneEnv` (F7.15).
- Prompt limitado a 8 KiB; com transporte `arg` ele é **um** item do argv.

### 9.2 Texto de terceiro na sua tela

Título de PR, corpo de issue e nome de autor são escritos por quem você não controla. Valem as mesmas regras do §4.5 da project-from-url: ANSI e bytes de controle removidos, truncados, renderizados como texto e nunca como marcação.

### 9.3 Prompt injection, dita em voz alta

Esta feature liga **texto escrito por estranhos** a **um agente que executa comandos**. Não é hipótese: é o desenho.

A mitigação da v1 é uma só, e é de fronteira, não de conteúdo: **o corpo da issue e do PR nunca entra no prompt.** O que entra é referência — número, título, URL — num campo que o usuário lê e edita antes de apertar criar. Se o agente quiser o corpo, ele que peça: ele tem `gh` e tem terminal, e aí o texto chega como resultado de ferramenta, que é o lugar onde um agente já sabe desconfiar.

Isso reduz a superfície, não a elimina — título de issue também é texto de estranho. Fica como [P2](tasks.md), e é a [Q088](../../project/questions.md) do questions.md chegando cedo: *"se o agente vai ler PR e issue de terceiro, isso importa?"*. O que esta feature responde é a metade barata da [Q089](../../project/questions.md) — conteúdo externo entra como **dado**, nunca como instrução — sem o escaneamento que a pergunta inteira pede.

### 9.4 A dívida que isto amplifica

| Risco | Estado |
|---|---|
| Daemon sem autenticação, agora **lendo o GitHub privado do usuário** com o token dele | [P1](tasks.md), herdada da file-editor e amplificada pela terceira feature seguida. Não é paga aqui |
| Daemon agora **escreve no stdin de um processo agente** a partir de uma string vinda da rede local | novo, e é o §9.3 |

---

## 10. Não-objetivos

1. **Abrir, fechar ou comentar PR.** Ler, sim; escrever no remoto, não — a [Q023](../../project/questions.md) está aberta.
2. **`gh issue develop`**, pelo mesmo motivo.
3. **API HTTP com token.** A [Q2](open-questions.md) escolheu CLI, e a interface do adapter é desenhada para trocar depois sem mexer no resto.
4. **Autenticar qualquer coisa.** Nem token, nem OAuth, nem override de provedor por projeto ([Q20](open-questions.md)). Se `gh`/`glab` não estão configurados na máquina, as abas de forge dizem isso e o comando que resolve.
5. **Remoto que não seja `origin`.**
6. **Listar repositórios de uma organização.** Isso é a project-from-url querendo crescer, e não é aqui.
7. **Estado de PR na sidebar** — CI, review, mergeabilidade. Outra feature, e ela precisa de polling.
8. **Reaproveitar a worktree existente** quando a branch já está aberta. A v1 recusa e aponta; navegar até lá é [P7](tasks.md).
9. **Prompt inicial em sessão de shell** ([Q21](open-questions.md)).

---

## 11. Riscos

| Risco | Mitigação |
|---|---|
| A heurística de prontidão do TUI perde o prompt | teto de 10 s, prompt guardado em `initial_prompt`, reenvio por um clique. E a [P3](tasks.md) admite que os números não foram medidos |
| `gh` muda o formato do `--json` | zod na fronteira falha com mensagem em vez de renderizar vazio; os campos pedidos são os mais antigos e estáveis da ferramenta |
| `gh pr checkout` polui `.git/config` | [P5](tasks.md), nomeada. Cumulativa e inofensiva, mas conhecida |
| Rate limit da API do provedor | debounce no cliente e `--limit 30`. Sem cache na v1 ([P6](tasks.md)) |
| Prompt de estranho vira instrução de agente | §9.3 — corpo fora, campo editável, e a dívida com nome |
| A união discriminada faz `worktree.create` inchar | é o preço de um caminho só. Cada origem é uma função pequena; o router escolhe e o registro é comum |

---

## 12. Critérios de aceite

1. Criar worktree de **branch local** existente funciona e, se ela já estiver aberta, a recusa **diz em qual worktree**.
2. Criar de **branch remota** produz branch local rastreando `origin/<branch>` — verificado por `git rev-parse --abbrev-ref @{upstream}`, não por inspeção visual.
3. Criar de **PR de fork** produz um checkout na branch do PR.
4. Criar de **issue** registra número, título e URL, e pré-preenche o prompt com a referência — nunca com o corpo.
5. Campo de nome vazio **sorteia**, o sorteado aparece no placeholder antes de criar, e não colide com branch nem worktree existente.
6. Com prompt preenchido, a worktree nasce com uma sessão de agente rodando e o texto entregue.
7. Agente indisponível **não** desfaz a worktree, e o erro aparece na aba.
8. Sem remoto, sem CLI e com host que nenhum CLI reivindica produzem **três frases diferentes**, e a terceira nomeia o `gh auth login --hostname <host>`.
9. Projeto sem remoto conhecido mantém as duas abas de git funcionando.
10. `pnpm gate:full` verde, com e2e cobrindo branch existente e issue contra um `gh` de mentira no PATH.
