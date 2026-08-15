# Barra direita: arquivos e diff — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Protótipo:** `packages/web/prototype/lumem-right-panel.html` — o desenho está fechado e verificado; as tasks de cliente portam o que está lá
**Sucede:** [worktree-tabs](../worktree-tabs/tasks.md)
**Status:** não iniciada — 0 de 10
**Total:** 10 tasks em 4 fases

> **Já entregue com o desenho:** os tokens de `syntax/*`, `git/*-subtle`, `git/untracked`, `panel/right*` e `gutter/line` entraram no gerador e foram regerados, com a suíte de contraste em 46 pares. Nenhuma task precisa criá-los — e nenhuma pode escrever `tokens.css` à mão.

---

## Ordem, e por quê ela é essa

Servidor antes de cliente, e dentro do servidor a **guarda de caminho antes de qualquer leitura**. É a única parte da feature que, se sair errada, sai perigosa: o daemon lê o disco com as permissões do usuário. Nada lê arquivo antes de existir o teste que prova que `../../.ssh/id_rsa` é recusado.

Depois o git, que é a parte com mais casos de borda medíveis. Só então a casca, e por último o que aparece dentro dela.

O e2e fecha porque é o único que prova a frase do PRD inteira: agente rodando à esquerda, arquivo aberto à direita.

---

## Decisões que sustentam o resto

Detalhadas em [open-questions.md](open-questions.md); aqui só o que a implementação precisa ter na mão.

### D1 — Duas vistas de diff, com alternador

`não commitado` = árvore de trabalho vs `HEAD`, mais não rastreados.
`vs base` = `merge-base(base, HEAD)` vs árvore de trabalho — commits **e** o que ainda não foi commitado.

### D2 — A árvore lê o disco, um nível por vez

Nada é escondido: ignorado, `node_modules` e `.git` aparecem. O preço é um teto por diretório, e o truncamento é dito na tela.

### D3 — Realce por Shiki, tema vindo de `tokens.ts`

Carregado sob demanda por linguagem. Tamanho do bundle é medido, não estimado.

### D3.1 — Quebra de linha ligada por padrão

Achado na renderização: numa coluna de 360px, código de 80 colunas some do lado direito sem nem uma barra de rolagem para denunciar. Continuação recuada, número só na primeira linha visual, botão `⇄` para desligar. Vale para o arquivo e para o patch.

### D3.2 — O conteúdo abre num split da aba, não dentro da coluna

**A coluna navega; o split lê.** Clicar num arquivo — na árvore ou na lista de mudanças — abre o conteúdo ao lado da sessão, dentro da aba atual. A coluna continua na árvore, com a linha aberta marcada.

Dono de cada coisa, que é o que resolve o resto:

| O quê | Dono | Consequência |
|---|---|---|
| coluna | checkout | trocar de aba de sessão não mexe nela |
| split | aba | cada sessão tem o seu; fechar a aba fecha o arquivo |

Arquivo e patch usam o **mesmo** split e o mesmo componente de moldura. Abrir outro arquivo troca o conteúdo; nunca há dois abertos.

### D4 — A coluna é do checkout, não da aba

Trocar de sessão não mexe nela. Trocar de worktree troca tudo.

### D5 — Nenhum endpoint desta feature escreve

Não existe procedure de escrita para revisar depois.

---

## Fase 1 — O servidor lê o disco

#### R1: Guarda de caminho

**What**: Traduzir `(escopo, caminho relativo)` para um caminho absoluto **provadamente** dentro do checkout — e recusar tudo que não for.
**Where**: `packages/server/src/files/path-guard.ts` + teste, `packages/server/src/scope.ts` (o `resolveScope` que hoje vive dentro de `routers/session.ts`)
**Depends on**: nada

**Done when**:
- [ ] `resolveScope` sai de `routers/session.ts` para módulo próprio, sem mudar comportamento; o router de sessão passa a importá-lo
- [ ] Caminho absoluto é recusado
- [ ] `..` é recusado **depois** de normalizar (`a/../../b` morre)
- [ ] Verificação final por `realpath` com separador, não por prefixo de string — `/repo-malicioso` não passa como filho de `/repo`
- [ ] Symlink que resolve para fora da raiz é reconhecido como tal, com erro próprio ("aponta para fora do checkout")
- [ ] Checkout ausente do disco vira `DomainError`, não `ENOENT` cru
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 casos — absoluto, `..` normalizado, prefixo-irmão, symlink de verdade escapando, symlink de verdade interno (que **passa**), raiz ausente

**Tests**: unit, com filesystem de verdade — symlink não se simula, pela mesma política que `testing.md` aplica ao git
**Gate**: quick
**Commit**: `feat(server): guard every path against escaping its checkout`

---

#### R2: `FileService`

**What**: Listar um diretório e ler um arquivo, com os tetos e as recusas do §4 do PRD.
**Where**: `packages/server/src/files/FileService.ts` + teste
**Depends on**: R1

**Done when**:
- [ ] `listDir` devolve entradas com nome, tipo (`dir` | `file` | `other`), tamanho e se é symlink
- [ ] Diretórios antes de arquivos, cada grupo em ordem alfabética estável
- [ ] Teto de entradas por diretório, com `truncated: true` na resposta — quem consome sabe que faltou
- [ ] `readFile` devolve uma de três formas: texto, `binary`, ou `too-large` com o tamanho e o teto
- [ ] Binário detectado por byte NUL nos primeiros KiB, não por extensão
- [ ] Os tetos ficam num só lugar do módulo, nomeados ([Q8](open-questions.md))
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 5 casos — ordem, truncamento, texto, binário, grande demais

**Tests**: unit · **Gate**: quick
**Commit**: `feat(server): read directories and files inside a checkout`

---

#### R3: Router `files`

**What**: `listDir` e `read` sobre o wire, escopados.
**Where**: `packages/server/src/routers/files.ts` + teste, `routers/index.ts`
**Depends on**: R2

**Done when**:
- [ ] `files.listDir({ scopeType, scopeId, path })` e `files.read({ scopeType, scopeId, path })`
- [ ] Escopo resolve por `resolveScope`: `worktree` → path da worktree, `project` → path do projeto
- [ ] Escopo inexistente responde `NOT_FOUND`; caminho recusado responde erro de domínio com a razão legível
- [ ] Nenhuma procedure de escrita (D5)
- [ ] Gate: `pnpm gate:quick`

**Tests**: integration (caller tRPC + repositório de verdade) · **Gate**: quick
**Commit**: `feat(server): expose the checkout's files over trpc`

---

#### R4: Diff no `GitService`

**What**: A lista de arquivos mudados nas duas vistas, e o patch de um arquivo.
**Where**: `packages/server/src/git/GitService.ts` (+ parsers), `GitService.test.ts`
**Depends on**: nada — pode ir em paralelo com R1–R3

**Done when**:
- [ ] `listChanges(path, { ref, baseBranch })` devolve `{ path, oldPath?, status, additions, deletions, binary }[]`, com `ref` sendo `worktree` ou `base` (D1)
- [ ] `não commitado`: `diff --numstat HEAD` mais os não rastreados do `status --porcelain -z`
- [ ] `vs base`: `merge-base` resolvido antes, e o diff feito contra a árvore de trabalho
- [ ] Renomeado carrega o caminho antigo; binário vem marcado (o `--numstat` do git imprime `-` nas contagens)
- [ ] `filePatch(path, { ref, file })` devolve o patch unificado **de um arquivo só** (F4.4)
- [ ] HEAD não nascido (repositório sem commit) responde "tudo é novo" em vez do erro do git
- [ ] Branch base inexistente vira uma recusa nomeada, não uma falha genérica (F4.6)
- [ ] Caminho com espaço e com acento sobrevive à ida e à volta — `-z` onde o git oferece
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 7 casos — modificado, adicionado, apagado, não rastreado, renomeado, binário, HEAD não nascido

**Tests**: unit contra repositório de verdade (`testing/git-fixtures.ts`), git nunca mockado · **Gate**: quick
**Commit**: `feat(server): list and patch what changed in a checkout`

---

#### R5: Router `changes`

**What**: As duas vistas e o patch sobre o wire.
**Where**: `packages/server/src/routers/changes.ts` + teste, `routers/index.ts`
**Depends on**: R3, R4

**Done when**:
- [ ] `changes.list({ scopeType, scopeId, ref })` devolve os arquivos mais o `baseBranch` usado
- [ ] `changes.patch({ scopeType, scopeId, ref, path })` — caminho passa pela mesma guarda da R1
- [ ] Checkout ausente do disco responde o erro de domínio, não derruba o painel
- [ ] Gate: `pnpm gate:quick`

**Tests**: integration · **Gate**: quick
**Commit**: `feat(server): expose the checkout's diff over trpc`

---

## Fase 2 — A coluna

#### R6: Terceira coluna do shell

**What**: O slot à direita, o colapso, a largura arrastável — e o terminal que se remede quando ela mexe.
**Where**: `packages/web/src/layout/AppShell.tsx`, `layout.css`, `Topbar.tsx`, `packages/web/src/hooks/useRightPanel.ts` + testes
**Depends on**: nada do servidor

**Done when**:
- [ ] `AppShell` aceita um terceiro slot opcional; sem ele, a tela é exatamente a de hoje (o teste atual do shell continua passando sem mudança)
- [ ] Botão na topbar colapsa e expande; estado persistido como o `useTreeExpansion` já faz
- [ ] Largura arrastável entre mínimo e máximo, persistida
- [ ] Redimensionar **e** colapsar disparam refit do terminal (F1.5)
- [ ] Colapsada por padrão no primeiro uso
- [ ] Faixa `Arquivos` / `Mudanças` usando `TabStrip` e `Tab`
- [ ] `/styleguide` mostra a coluna em três estados: colapsada, estreita, larga
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 1 caso dedicado ao refit — é a regressão que estraga o terminal sem avisar

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): a third column for the checkout's files`

---

## Fase 3 — O que aparece dentro

#### R7: Árvore de arquivos

**What**: A árvore lazy, com marcador de status.
**Where**: `packages/web/src/components/FileTree.tsx`, `files.css`, `hooks/useFileTree.ts` + testes
**Depends on**: R3, R6

**Done when**:
- [ ] Expandir um diretório busca **só** aquele nível; colapsar não descarta o que já veio
- [ ] Diretórios antes de arquivos (D2)
- [ ] Listagem truncada aparece com a contagem e o motivo, ao pé do diretório (F2.4)
- [ ] Marcador de status por arquivo, lido do mesmo cache que a aba de mudanças usa — não uma segunda chamada
- [ ] Trocar de worktree zera a expansão (F2.6)
- [ ] Recarregar por foco da janela, por `worktree.changed` e por botão ([Q6](open-questions.md))
- [ ] Diretório vazio, sem permissão de leitura e ausente têm cada um sua frase
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): browse the checkout one level at a time`

---

#### R8: Visualizador de arquivo

**What**: Abrir o arquivo com realce, numeração, e as recusas ditas.
**Where**: `packages/web/src/components/FileViewer.tsx`, `packages/web/src/components/TabSplit.tsx`, `packages/web/src/lib/shiki-theme.ts` + testes
**Depends on**: R7

**Done when**:
- [ ] Clicar num arquivo abre o conteúdo num **split da aba**, ao lado da sessão, com numeração de linha (D3.2)
- [ ] A coluna não muda de conteúdo ao abrir: continua na árvore, com a linha aberta marcada
- [ ] Split em 50/50, divisória arrastável, `terminal/min` e `viewer/min` respeitados
- [ ] Abrir, fechar e arrastar o split remedem o terminal — mesma armadilha da R6
- [ ] Trocar de aba de sessão troca o arquivo aberto junto; fechar a aba fecha o arquivo
- [ ] Quebra ligada por padrão, continuação recuada, botão `⇄` desliga (D3.1)
- [ ] Shiki com tema montado a partir de `tokens.ts` (D3), grammar carregado sob demanda pela extensão
- [ ] Extensão desconhecida renderiza como texto puro, sem erro
- [ ] `binary` e `too-large` têm cada um sua tela, com o caminho copiável
- [ ] Voltar para a árvore preserva onde ela estava
- [ ] **Tamanho do bundle medido e escrito no PRD** — antes e depois, com o número real
- [ ] Gate: `pnpm gate:build` (é a task que traz dependência nova)

**Tests**: unit · **Gate**: build
**Commit**: `feat(web): read a file with syntax highlighting`

---

#### R9: Aba de mudanças

**What**: O alternador, a lista e o patch.
**Where**: `packages/web/src/components/ChangesTab.tsx`, `DiffView.tsx`, `files.css` + testes
**Depends on**: R5, R6

**Done when**:
- [ ] Alternador segmentado e compacto entre `não commitado` e `vs <base>` (D1)
- [ ] Lista com status, `+n`/`−n` e caminho, tudo junto do nome; renomeado mostra de → para
- [ ] Clicar abre o patch daquele arquivo no **mesmo split** do visualizador (D3.2), com a quebra da D3.1
- [ ] Binário aparece na lista, sem patch
- [ ] Base ausente desabilita só a vista `vs base`, com o motivo na tela (F4.6)
- [ ] Vazio tem frase própria por vista (F4.7)
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): read the checkout's diff without leaving the app`

---

## Fase 4 — Prova

#### R10: e2e

**What**: A frase do PRD, ponta a ponta, contra um repositório de verdade.
**Where**: `e2e/right-panel.spec.ts`, `e2e/support/`
**Depends on**: R8, R9

**Done when**:
- [ ] Abre a coluna, navega até um arquivo, abre e lê o conteúdo que o fixture escreveu — com o terminal da sessão ainda visível ao lado
- [ ] Escreve num arquivo pelo terminal da sessão, recarrega e vê a mudança na aba `Mudanças`
- [ ] Alternar entre as duas vistas mostra conjuntos diferentes de arquivos
- [ ] Colapsar a coluna e abrir o split com um terminal aberto não deixam o terminal com largura errada
- [ ] Gate: `pnpm gate:full`

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): browse files and diff from the right panel`

---

## Risco

| O quê | Por quê | Mitigação |
|---|---|---|
| Path traversal | O daemon lê com as permissões do usuário | R1 vem primeiro, com symlink de verdade no teste |
| Bundle do Shiki | O daemon serve o app sem CDN | R8 fecha com `gate:build` e o número medido no PRD |
| Terminal com largura errada | Agora são **duas** coisas que mexem na caixa que o `FitAddon` mede: a coluna e o split | *Done when* em R6, R8 e R10 |
| Diretório com dez mil entradas | `node_modules/.pnpm` | Teto na R2, truncamento dito na R7 |
| Patch gigante | `maxBuffer` de 16 MiB no `execGit` | Patch por arquivo desde a R4 |
