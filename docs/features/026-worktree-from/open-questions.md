# De onde cortar — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

**Nove perguntas: as 5 do pedido, todas respondidas na fase 0, mais 4 que a medição abriu.** Três
respostas contrariam o que o pedido propunha, e duas delas só existem porque a bancada rodou antes do
código — o §3 do PRD tem os números.

| # | Pergunta | Estado |
|---|---|---|
| [Q1](#q1--issue--nome-de-branch-o-gh-monta-ou-nós-montamos) | issue → nome de branch: `gh issue develop` ou aqui? | ✅ aqui |
| [Q2](#q2--cortar-da-head-de-uma-pr-exige-rede) | PR exige rede — fetch sob demanda? | ✅ não, e só oferece o que está no disco |
| [Q3](#q3--glab-é-esta-feature-ou-outra) | `glab` é esta feature? | ✅ outra |
| [Q4](#q4--quanto-custa-abrir-o-modal) | quanto custa abrir o modal? | ✅ uma leitura, ~0,7 s, depois de abrir |
| [Q5](#q5--branch-remota-que-já-tem-worktree) | branch já usada por outro checkout: erro? | ✅ não é erro — leva para lá |
| [Q6](#q6--dwim-nunca) | usar a forma DWIM do `worktree add`? | ✅ nunca |
| [Q7](#q7--quando-apagar-a-branch-órfã) | quando apagar a branch órfã? | ✅ se ela não existia antes |
| [Q8](#q8--o-código-de-saída-do-git-é-contrato) | classificar recusa pelo `exit code`? | ✅ não |
| [Q9](#q9--o-nome-da-worktree-ainda-é-a-branch) | nome da worktree continua sendo a branch? | ✅ não, quando a origem é branch |

---

## Q1 — issue → nome de branch: o `gh` monta ou nós montamos?

**Resposta: nós montamos, localmente.** `<numero>-<slug-do-titulo>`, a mesma forma que o GitHub
gera, pré-preenchida no campo e **editável**.

Medido (§3.3 do PRD): `gh issue develop <n>` **escreve no host** — cria uma *linked branch* no
repositório remoto. Ele não é um gerador de nomes com um efeito colateral; o efeito remoto é o que
ele faz. E o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md) fixou
que o Lumem escreve no host **dois** verbos — mesclar e criar PR — cada um atrás de um portão que o
daemon relê antes de escrever.

Um terceiro verbo de escrita disparado por *digitar um nome num modal de criação de worktree*, sem
portão, seria a mesma decisão tomada ao contrário. Montar o nome aqui não escreve nada, e produz a
mesma string.

**O que a resposta abriu:** `gh issue develop --list <n>` é leitura pura (medido: `exit=0`) e
responde *"esta issue já tem branch no host?"* — informação boa, custo de uma chamada por issue.
Fora do v1, no [backlog](../../project/backlog.md).

## Q2 — cortar da head de uma PR exige rede?

**Resposta: sem fetch. Só se oferece PR cuja head já esteja no disco.** A que não estiver aparece
desabilitada, dizendo *"a branch `x` não está no disco; rode um fetch neste projeto"*.

A pergunta chegou como *"fetch sob demanda, ou só o que está em disco?"*, tratando as duas como
igualmente disponíveis. A medição mostrou que a escolha real é outra: `git worktree add <path>
origin/<branch>` **não falha** quando a branch não está local — ela entrega uma worktree com **HEAD
destacado e `exit=0`** (caso B do §3.1). Ou seja, o caminho "sem fetch e sem cuidado" não produz um
erro que dá para tratar: produz uma worktree quebrada que se anuncia como sucesso.

Com isso, manter o *"sem fetch, use o que está no disco"* da
[001-walking-skeleton](../001-walking-skeleton/prd.md) fica **barato**: a checagem é
`refs/remotes/*/<headRefName>`, que é a leitura de 10 ms que o `hasRemoteBranch` já faz. A F4.3 fica
de pé sem revisão, e o fetch vai para o [backlog](../../project/backlog.md) com gatilho.

## Q3 — `glab` é esta feature ou outra?

**Resposta: outra.** `PrHost` está pronto para receber a segunda implementação, e nada nesta feature
depende dela. Ela tem escopo próprio — autenticação, formato de resposta, fixtures — e a
[013](../013-pull-request-status/prd.md) já escreveu o motivo de não haver duas implementações antes
de existir um repositório de verdade para exercitar a segunda: *abstração desenhada contra
imaginação é abstração errada*.

## Q4 — quanto custa abrir o modal?

**Resposta: uma leitura de rede, ~0,7 s, começando depois de o modal existir.**

O pedido falava de *"três listagens por abertura"*. Medido (§3.2 do PRD), não são três:

| Origem | Custo real | Quando |
|---|---|---|
| branch | **10 ms**, disco, `for-each-ref` | síncrono, no primeiro quadro |
| PR | **0** na maioria das aberturas — o `PrCache` já mantém por projeto, TTL 15/60 s | do cache |
| issue | **~730 ms**, `gh issue list`, 12,8 KB para 50 itens | depois de abrir |

Então: nenhuma listagem entra no caminho de abrir o modal, e o campo de nome está utilizável no
primeiro quadro (F3.5). Issues entram no `PrCache` — ou num irmão dele, o que a
[T8](tasks.md) decide com o código na mão — porque o TTL, o backoff e a chave por projeto já estão
escritos e testados lá.

## Q5 — branch remota que já tem worktree

**Resposta: não é erro. A branch não é oferecida como origem — ela aparece marcada com o checkout que
a tem, e escolhê-la leva para lá.**

Medido (caso E do §3.1): `fatal: 'feature-a' is already used by worktree at '<path>'`, `exit=128`. A
mensagem até carrega o caminho, mas deixar o git responder seria deixar a recusa acontecer **depois**
do gesto. `listWorktrees` já dá o mapa branch → checkout, e a política de responder antes já está
escrita em comentário na própria `preview` do router: *"a recusa é mais barata antes"*.

E "ir para a worktree que já existe" não é uma feature nova: selecionar worktree é o gesto que a
sidebar faz o dia inteiro.

## Q6 — DWIM, nunca

**Nasceu da medição.** `git worktree add <path> <nome>` tem uma forma esperta: se o nome não existe
local mas existe em **exatamente um** remoto, o git cria a branch local rastreando a remota (caso C —
funciona, e é conveniente).

**Resposta: o Lumem não usa essa forma.** Sempre explícito:

```
branch local   →  git worktree add <path> <ref>
branch remota  →  git worktree add --track -b <nome> <path> <remote>/<ref>
```

Dois motivos medidos, e nenhum é estética:

1. **Ambiguidade mente.** Com o mesmo nome em dois remotos, o DWIM falha com `fatal: invalid
   reference: feature-amb` (caso I) — sobre uma referência que existe **duas vezes**. Repassar esse
   `stderr` é repassar informação falsa, e a alternativa (traduzir) exige adivinhar qual das duas
   causas produziu a mesma frase.
2. **A forma explícita é a única que qualifica o remoto**, e um projeto com `origin` mais um `fork` é
   normal.

A forma `origin/<branch>` **sem** `-b` fica proibida pela mesma decisão: ela é o caso B, o do HEAD
destacado silencioso.

## Q7 — quando apagar a branch órfã?

**Nasceu da medição, e contraria o pedido.** A issue escreveu que o `git branch -D` de limpeza (hoje
em `GitService.ts:356`) *"só vale quando **nós** criamos a branch"*.

**Resposta: a pergunta certa é se a branch existia antes do nosso comando.** O daemon consulta
`branchExists` **antes** de rodar, e o `branch -D` do `catch` só roda se ela não existia.

O princípio do pedido estava certo; a conclusão, não. Medido (caso G): no caminho DWIM **o git cria a
branch** e a deixa para trás quando o alvo está ocupado — `feature-b` continuava local depois da
falha. Quem criou foi o git, mas foi o nosso comando que causou, e a branch órfã faz a próxima
tentativa com o mesmo nome falhar em *"branch already exists"* — que é exatamente o defeito que a
limpeza de hoje existe para evitar.

Com a [Q6](#q6--dwim-nunca) o DWIM sai de cena e quem cria é o `-b`, mas a condição fica escrita
assim de propósito: ela é verdadeira independentemente de qual forma do comando roda.

## Q8 — o código de saída do git é contrato?

**Nasceu da medição. Resposta: não.** Duas recusas legítimas e vizinhas devolvem códigos diferentes —
branch já usada por worktree é `exit=128` (caso E), branch já existente com `-b` é `exit=255` (caso
F). Nada na documentação do git promete essa distinção, e ela é a única coisa que separaria as duas
sem ler `stderr`.

O daemon continua classificando por **pré-checagem nossa** — `branchExists` e `listWorktrees` — e não
por código de saída. Vale só para o `git`; o `gh` continua com o `classify` que a
[013](../013-pull-request-status/prd.md) escreveu, onde o `exit=4` **é** documentado e já está coberto
(medido: sem autenticação dá `exit=4` mais `gh auth login` no `stderr`, e o `classify` traduz os
dois).

## Q9 — o nome da worktree ainda é a branch?

**Nasceu da leitura do código. Resposta: não, quando a origem é uma branch que já existe.**

A [001-walking-skeleton](../001-walking-skeleton/prd.md) fixou *o nome é também a branch*, e o
produto inteiro foi construído com os dois iguais. Cortar de `feature-a` quebra isso: a branch é a
que existe, e o nome é o que a pessoa digitar (pré-preenchido com a branch).

Custo verificado antes de responder: **zero migração.** `worktree.name` e `worktree.branch` são
colunas separadas em `db/schema.ts:98`, e o único índice único é `(project_id, name)`. A divergência
já era representável — só não tinha acontecido nunca.

O que ela cobra é **na tela**: onde hoje um nome só serve para as duas coisas, passa a existir uma
worktree cuja branch não se lê do nome. É a F1.5, e é assunto da folha do Open Design
([T4](tasks.md)).
