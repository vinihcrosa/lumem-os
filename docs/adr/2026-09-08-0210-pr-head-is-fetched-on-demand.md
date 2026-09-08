---
title: A head da PR é buscada sob demanda, e não exigida do usuário
date: 2026-09-08
area: git
summary: Cortar worktree de uma PR cuja head não está no clone passa a buscar a ref no gesto, em vez de desabilitar a linha e mandar a pessoa rodar `git fetch` no terminal — que é exatamente a ida ao terminal que a feature existia para eliminar. A ordem não muda: a ref existe antes do `worktree add`, porque passar uma ref remota solta entrega HEAD destacado com sucesso.
feature: 026-worktree-from
---

## Contexto

A [`026-worktree-from`](../features/026-worktree-from/prd.md) fez o diálogo de nova worktree oferecer
quatro origens, entre elas uma pull request. Cortar da PR significa cortar da head dela, e a head
pode não estar no clone: a branch foi publicada depois do último `fetch`.

A primeira resposta — a [Q2](../features/026-worktree-from/open-questions.md) daquela feature — foi
**não buscar**. Ela se apoiava na F4.3 da
[`walking-skeleton`](../features/001-walking-skeleton/prd.md), *"sem fetch, use o que está no
disco"*, e a PR sem head local aparecia **desabilitada**, em vermelho, dizendo `não está no disco`.

O que a decisão não previu é o que o uso mostrou no mesmo dia: **a lista mostra a PR, a pessoa
clica, e a tela responde com uma proibição e uma tarefa de casa num terminal.** O Lumem existe para
tirar essa ida ao terminal do caminho — é o motivo de a feature existir. A regra que protegia um
invariante técnico produziu exatamente o gesto que a feature vinha eliminar.

## Decisão

**O daemon busca a ref que falta, dentro do gesto de criar, e só quando ela falta.**

1. `worktree.create` com `from: {kind:"pr"}` verifica se a head está no clone. Se está, nada muda.
2. Se não está, ele busca **uma** ref, do remoto do projeto, e então corta:
   - PR do próprio repositório: `fetch <remote> +refs/heads/<head>:refs/remotes/<remote>/<head>`;
   - PR de **fork**: `fetch <remote> +refs/pull/<n>/head:refs/remotes/<remote>/pr/<n>` — a convenção
     do GitHub, servida pelo próprio `origin`, sem precisar do remoto de quem abriu a PR. A branch
     nasce **sem upstream**: o repositório de onde o código veio não é onde ele vai voltar.
3. A busca roda com o `cloneEnv` que a [`011-project-from-url`](../features/011-project-from-url/prd.md)
   já escreveu — `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS` vazio, `BatchMode=yes` — porque um daemon não
   tem quem perguntar, e prompt interativo é processo pendurado até o timeout.
4. Falha de busca é **falha do gesto**: nada é criado, nada é registrado, e a mensagem é a do git. O
   vermelho passa a aparecer **depois** de tentar, sobre uma coisa que o Lumem não pode resolver —
   rede, credencial, branch apagada no host.
5. Na lista, a linha fica **clicável**, com uma nota cinza `busca ao criar`. A nota existe para a
   espera não ser surpresa, não para pedir permissão.

**O que esta decisão reafirma:** a ref continua tendo que existir **antes** do `git worktree add`.
Isso não é cerimônia — é medido: passar `origin/<ref>` solto para o `add` devolve **HEAD destacado
com código de saída zero**, e uma worktree sem branch quebra o ahead/behind, a barra de PR e o merge
enquanto desenha uma linha perfeitamente normal. O que mudou é **quem** traz a ref, não a ordem.

**O alcance é este caminho e só ele.** A F4.3 continua valendo para tudo o mais: `resolveDefaultBranch`
não busca, a barra de PR não busca, `hostOrigins` não busca, e o diálogo abre sem tocar na rede. O
único `fetch` do produto fora do clone inicial é o deste gesto, disparado por um clique explícito em
uma PR nomeada.

## Alternativas

**Manter a Q2 como estava — só oferecer o que está no disco.** É o que estava implementado, com teste
e e2e, e o argumento original está escrito por inteiro na
[Q2](../features/026-worktree-from/open-questions.md): a checagem local custa 10 ms e evita o HEAD
destacado silencioso. Perdeu porque resolve o invariante técnico e não resolve o gesto: a pessoa
continua indo ao terminal, e agora com um vermelho na tela dizendo que ela devia ter ido antes.

**Buscar tudo ao abrir o diálogo** — um `fetch` ou `fetch --all` no `hostOrigins`. Perdeu por dois
motivos: transforma **abrir um modal** em rede (a Q5a da
[`017-sidebar-actions`](../features/017-sidebar-actions/open-questions.md) já pagou o preço de uma
tela presa esperando), e paga a busca de todas as refs para usar uma. A busca de uma ref, no clique,
é a menor unidade que resolve o problema.

**Oferecer um botão `buscar` separado na linha.** Perdeu porque é o mesmo trabalho em dois gestos: o
botão só existiria para habilitar o outro botão. `criar` continua sendo a única coisa a apertar, e o
passo a mais aparece no texto dele.

**Deixar o `git worktree add` receber a ref remota e resolver sozinho.** Não é alternativa, é o
defeito: medido, ele aceita e entrega HEAD destacado.

## Consequências

- **O daemon passa a fazer rede num gesto de UI.** É o segundo lugar do produto onde isso acontece —
  o primeiro é o clone da `011` —, e por isso ele herda o ambiente e a disciplina daquele: sem
  prompt, sem askpass, `BatchMode`, timeout próprio e mensagem de erro que é a do git.
- **`criar` pode demorar por um motivo novo.** A nota cinza na linha e o texto do botão dizem qual.
- **A branch de uma PR de fork não tem upstream.** `git pull` naquela worktree não sabe de onde
  puxar. É o preço de não configurar um upstream para um repositório que não é o destino do trabalho,
  e está no [backlog](../project/backlog.md) se doer.
- **O item de backlog "fetch sob demanda" sai** — ele aconteceu.
