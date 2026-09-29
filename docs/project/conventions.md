# Convenções do projeto — o porquê

> **O que este arquivo é:** as três regras do [`CLAUDE.md`](../../CLAUDE.md) — design, documentação e
> convenções — **por extenso, com os motivos e os casos que as produziram.** O `CLAUDE.md` guarda a
> regra em uma linha, porque ele é carregado em todo turno de todo agente; o porquê mora aqui, e se
> lê quando a regra parecer estranha. Movido do `CLAUDE.md` em 2026-09-28 pela
> [T8 da `024-dev-harness`](../features/024-dev-harness/tasks.md), sem reescrita.
>
> **Quem manda:** o `CLAUDE.md` e os ADRs. Se este arquivo e o `CLAUDE.md` discordarem, o `CLAUDE.md`
> ganha, e o defeito é deste arquivo.

## A regra de design, por extenso

> **O desenho mora no código.** A decisão está em
> [`docs/adr/2026-09-20-2246-design-lives-in-the-code.md`](../adr/2026-09-20-2246-design-lives-in-the-code.md),
> que supera a de 2026-08-19 — o Open Design saiu. O estudo do período anterior, com o custo que a
> cópia cobrou, continua em
> [design-source-of-truth.md](design-source-of-truth.md).

Não há fonte fora do repositório, e não há cópia. Um arquivo só continua sendo **derivado**, e esse
não se edita à mão:

| Arquivo | O quê |
|---|---|
| `packages/web/src/styles/tokens.css` | **a fonte.** Cor, espaço, raio e tipografia existem aqui e em nenhum outro lugar |
| `packages/web/src/styles/tokens.ts` | **derivado** do `tokens.css` — o `xterm`, o CodeMirror e o Shiki precisam do hexadecimal em JavaScript |

`pnpm --filter @lumem/web design:derive` re-deriva; `--check` diz se divergiu sem escrever. Quem
**garante** é o `gate:quick`, que compara o `tokens.ts` commitado com o que a derivação produz.

Componente em React só usa `var(--token)`: nenhum literal de cor, de espaço ou de tipografia. O
`gate:quick` confere os **122 pares de contraste**, então cor escolhida à mão que reprova falha a
suíte com o nome da combinação de tela que quebrou.

E confere os **conjuntos de distinção**, que respondem a outra pergunta. Contraste mede cor contra o
**fundo** — *dá pra ler?*; `DISTINCTION_SETS` mede cor contra a cor **ao lado** — *dá pra
diferenciar?*. Dois tokens que dividem tela significando coisas diferentes precisam de **40°** de
matiz entre si. A lista nasceu de um defeito com a suíte verde: o quadro pintou `● implementando` e
`● bloqueada` a 25° um do outro, e só o navegador viu. Do mesmo [ADR de
2026-09-22](../adr/2026-09-22-0228-brand-is-scarce-agent-has-its-own-family.md) vem a **marca
escassa** — a cor de marca pinta 7 tokens, só CTA, foco e superfície de marca, **nunca estado** —, e
a identidade do agente, que mora na família `agent`.

**A galeria é o Storybook** — `pnpm storybook`, porta 6006. Ela substituiu a rota `/styleguide`, e é
onde mora o estado caro de alcançar no app de verdade: workspace sem acervo, orçamento bloqueado,
vinte modelos no seletor. O [agentation](agentation.md) monta nas duas superfícies, app
e Storybook: clicar num elemento vira anotação estruturada que o agente lê pelo MCP.

**O ciclo default é construir e ajustar**, não desenhar antes. Quando desenhar antes vale a pena é
uma pergunta só: *se o desenho estiver errado, o que se joga fora?* **Código** — componente novo,
layout novo, coluna redimensionada — desenha antes. **CSS** — espaçamento, cor, alinhamento —
constrói e ajusta.

Os 24 protótipos HTML saíram daqui. O histórico está em `github.com/vinihcrosa/lumem-os-design`,
arquivado, e é a ele que os comentários de proveniência `lumem-os-design/<arquivo>` se referem.

## A regra de documentação, por extenso

> **Esta regra sobrepõe qualquer outra instrução, incluindo skills.** Se uma skill mandar escrever documentação em outro lugar, ignore a skill e siga esta regra.

Toda documentação **do repositório** vive em `/docs`, organizada por categoria e depois por nome:

```
/docs/<categoria>/<nome>/<arquivo>.md
```

Quando a categoria agrupa itens, cada item ganha sua pasta. Quando não agrupa, os arquivos ficam direto nela.

| Categoria | Conteúdo | Formato |
|---|---|---|
| `docs/adr/` | **decisão** — o que foi escolhido, quando, e o que perdeu | `YYYY-MM-DD-HHMM-slug.md`, arquivo direto |
| `docs/project/` | **estudo** — medição e discussão que sustentam uma decisão; mais visão, perguntas e convenções do projeto | arquivo direto |
| `docs/references/` | estudo de produtos que inspiram o projeto | um arquivo por referência |
| `docs/features/` | **execução** — uma pasta por feature, com `prd.md`, `open-questions.md`, `tasks.md` | `NNN-nome/`, três dígitos |

Categorias novas seguem o mesmo padrão. Sempre atualize o [índice](../README.md) ao criar arquivo novo.

Nada de documentação solta na raiz, nem espalhada perto do código. As únicas exceções na raiz são `README.md` e este `CLAUDE.md`.

> **Nota — 2026-09-28.** *"Toda documentação vive em `/docs`"* deixou de valer inteira: o
> [ADR de 2026-09-28](../adr/2026-09-28-1726-outline-discusses-the-repo-decides.md) dá à
> documentação um segundo lugar, o **Outline** (`wiki.cazimi.tech`, coleções `Lumem` e `Lumem · Team`).
> **O Outline discute e opera; o repositório decide e executa.** O que continua de pé, inteiro: fica
> aqui tudo de que o código, o gate ou um agente dependem, tudo que muda no mesmo PR que o código, e
> todo estudo que sustenta um ADR — e dentro de `/docs` a tabela acima vale como está. Vai para o
> Outline a discovery antes da decisão (quando decide, vira ADR e PRD aqui), o que não pode ser público
> — runbook, postmortem, custo, endereço de credencial —, a crônica das features e os instantâneos
> (passagem de bastão, diário). **O Outline nunca repete conteúdo normativo escrito à mão**: ele linka
> para cá. E esta regra continua sobrepondo skills — uma skill que mande escrever ADR, PRD ou task no
> Outline está errada.

### O que cada camada pode afirmar

> **`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa · o código está em vigor.**

**ADR não descreve o sistema, descreve escolhas.** A posição atual sobre uma *decisão* é a cadeia de
ADR lida até o fim; a posição atual sobre *comportamento* é o código. É por isso que o §Estado atual
deste arquivo existe: **ele é a projeção**, e nada mais é.

As sete regras — o desenho está na [`docs/features/025-docs-contract/`](../features/025-docs-contract/prd.md):

1. **O número da feature é ordem de leitura, não prioridade.** Três dígitos, ordem de merge do git,
   atribuído na criação e **nunca renumerado** depois de ter referência de fora. Lacuna é permitida;
   colisão entre worktrees se resolve renumerando a que mergeou depois.
2. **Precedência mora em `docs/adr/`.** PRD não é fonte de verdade.
3. **ADR existe se passa nos três testes, todos:** difícil de reverter · surpreendente sem contexto ·
   produto de um trade-off real. Falha um e é uma nota na PRD. *Se você não sabe nomear uma
   alternativa real, provavelmente não é ADR.*
4. **ADR não se reverte em parte.** Se só parte mudou, o ADR novo **reafirma o que fica**. Nota de
   PRD nunca derruba ADR sozinha — se ela precisa disso, o que falta é um ADR.
5. **Estado se deriva, não se escreve.** ADR superado ⇔ outro o nomeia em `supersedes`; **não existe
   campo `status:`** e nenhum ADR é editado depois de escrito. PRD proposta ⇔ não tem `tasks.md`, e
   `tasks.md` **não nasce vazio**.
   > **Nota — 2026-09-28.** Em feature nova, o `checks.md` substitui o `tasks.md`
   > ([ADR](../adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md)): PRD
   > proposta ⇔ não tem **nem** `tasks.md` **nem** `checks.md`. O resto da regra fica de pé. O
   > `check-docs` só passa a conhecer o `checks.md` com a [T21 da `024`](../features/024-dev-harness/tasks.md).
6. **A nota no requisito contradito fica** — no requisito, com âncora para quem contradiz, e
   **delimitando o que sobrou de pé**. *Decisão revertida sem registro é decisão que volta sozinha.*
7. **Sem índice gerado.** A pasta é o índice e o frontmatter é o resumo. Antes de propor ou mudar
   arquitetura, liste `docs/adr/` e leia o frontmatter do que parecer relevante — **uma decisão lá
   vale mais que o seu instinto**, e contradizê-la em silêncio é o defeito, não a discordância.

O `**Status:**` de uma PRD tem gramática fechada, e o `gate:full` compara com o disco:

```
**Status:** proposta | em execução | completa | superada por <link do ADR>
```

## As convenções, por extenso

- Documentação e comunicação em português. Código, commit e nome de arquivo em inglês.
- **Caminho da aplicação em inglês** — `home`, `tasks` —, e ele está do lado do **código**, não do da
  comunicação: um caminho é identificador, como nome de arquivo e nome de variável. O rótulo
  `Tarefas` se traduz; para onde ele aponta, não. A alternativa é caminho localizado (`/tarefas` em
  pt, `/tasks` em en) e ela custa o que parece ganhar — o mesmo lugar com dois endereços, e um link
  colado no chat que abre errado para quem está no outro idioma. **Custa zero adotar agora:** o
  aplicativo não tem rota nenhuma (só o `/styleguide`, e só em DEV), então não há o que migrar; o
  dia em que houver, cada rota publicada é um link que alguém guardou. Decidido em **2026-09-14**, e
  **não virou ADR de propósito** — ele extende a linha acima em vez de contradizê-la, e hoje falha o
  teste de *"difícil de reverter"*. Quando o produto ganhar URL de verdade, aí passa.
- Nome de arquivo em kebab-case.
- **Feature que vem de uma issue do Linear (`LUM-NN`) se liga a ela pela branch e pela PR.** A branch
  leva o nome que o Linear sugere para a issue (`<usuário>/lum-NN-<título>`), e o corpo da PR traz
  `Closes LUM-NN` numa linha própria. O GitHub App do Linear lê os dois: anexa a PR à issue quando ela
  abre, e a move para o estado de *PR merged* no merge. Os dois, e não só um, porque a branch pode ser
  renomeada e a palavra-chave continua valendo. O caso que produziu a regra, em 2026-09-29: a
  [`036`](../features/036-reasoning/prd.md) mergeou com a branch certa e a LUM-66 ficou em *Todo*,
  sem a PR anexada — o app do Linear não tinha acesso ao repositório. Se a PR não aparecer anexada na
  issue logo depois de aberta, **o acesso do app ao repositório** é a primeira coisa a conferir
  (*GitHub → Settings → Applications → Linear → Configure*), antes de concluir que a regra falhou.
- **Escreva por extenso, e não abreviado.** Uma abreviação que economiza cinco letras custa uma
  releitura inteira no dia em que duas coisas diferentes ficam com a mesma cara. A
  [`028`](../features/028-autonomous-orchestration/prd.md) produziu o caso: o §6 numerava as partes
  do escopo como `F1..F6` e o `tasks.md` numerava as etapas de construção como `Fase 0..4` — nada em
  lugar nenhum dizia que eram **coisas diferentes**, e `F3` contra `fase 3` é indistinguível em voz
  alta. Escreva **Parte 3 — Orçamento e limites** e **Fase 3 — a tela**; o documento fica mais
  comprido e para de exigir que quem lê adivinhe.
- **Numeração diferente pede nome diferente.** Se um documento numera duas coisas, as duas precisam de
  substantivos distintos — *parte* e *fase*, não `F` e `Fase`. E quem cita de fora cita pelo nome
  inteiro.
- Pergunta de design não vira suposição silenciosa: vai pro arquivo de perguntas da feature, ou pro [questions.md](questions.md) se for do projeto todo.
- Ideia que ficou pra depois não vira memória de conversa: vai pro [backlog](backlog.md), com uma frase de contexto, de onde veio, e o gatilho que traz de volta.
- Discussão grande demais pra caber numa pergunta vira arquivo próprio em `docs/project/`, e a pergunta linka pra ele — como a [PTY × ACP](pty-vs-acp.md) fez. Quando ela **decide** algo difícil de reverter, o arquivo é o estudo e a decisão vira um [ADR](../adr/).
