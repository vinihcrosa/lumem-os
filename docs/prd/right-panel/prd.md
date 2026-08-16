# PRD — Barra direita: arquivos e diff

> **Status:** desenho fechado, tasks prontas para execução
> **Versão:** v0.1
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Protótipo:** `packages/web/prototype/lumem-right-panel.html` — abra no navegador
> **Sucede:** [worktree-tabs](../worktree-tabs/tasks.md)

---

## 1. Objetivo

Uma terceira coluna, à direita, que mostra **os arquivos do checkout selecionado** e **o que mudou nele**. Clicar num arquivo abre o conteúdo ali mesmo, com realce de sintaxe. Uma segunda aba mostra o diff do repositório.

Isto é a primeira vez que o Lumem lê **conteúdo** do repositório. Até aqui o daemon só tocou em metadado: caminho, branch, contagem de arquivos sujos, ahead/behind. Nenhum byte do trabalho em si chegou à tela — o único jeito de ver o que o agente escreveu é pedir a ele, ou abrir um `cat` no terminal.

**Critério de sucesso em uma frase:** com um agente rodando na aba do meio, você acompanha pela direita o que ele está mexendo, abre o arquivo e lê o diff — sem sair do Lumem e sem digitar um comando.

O item *"diff e status da worktree como UI, não só terminal"* do §8 do PRD da [ui-shell](../ui-shell/prd.md) é exatamente esta feature.

---

## 2. Forma

```
┌──────────┬─────────────────────────────────┬──────────────────┐
│ sidebar  │ cabeçalho da worktree           │ [Arquivos][Mudanças]
│          ├─────────────────────────────────┤                  │
│ projetos │ [contexto][◆ claude][● shell]   │  › docs          │
│ worktrees├────────────────┬────────────────┤  ▾ src           │
│          │  ◆ claude      │ frontmatter.ts │    ▸ lore        │
│          │  (terminal)    │ (split da aba) │      frontmatter.ts ←
│          │                │                │      loader.ts M │
└──────────┴────────────────┴────────────────┴──────────────────┘
     coluna navega  ·  split lê  ·  aba continua sendo a aba
```

**A coluna navega; o split lê.** Clicar num arquivo **não** o abre dentro da coluna: abre num split ao lado da sessão, dentro da aba atual — e a coluna continua mostrando a árvore, com o arquivo aberto marcado. É isso que permite abrir o próximo arquivo sem fechar este, e ler o código com o agente trabalhando à vista.

Cada coisa pertence a um dono diferente, e isso é a regra que resolve todas as dúvidas de comportamento:

| O quê | Pertence a | Consequência |
|---|---|---|
| A coluna (árvore e mudanças) | ao **checkout** | trocar de aba de sessão não mexe nela |
| O split com o arquivo aberto | à **aba** | cada sessão tem o seu; fechar a aba fecha o arquivo junto |

Coluna colapsável, com largura arrastável e persistida; colapsada por padrão no primeiro uso. O split abre em 50/50, também arrastável, e fecha no `✕`.

### Como o desenho foi feito

Protótipo em HTML+CSS antes de qualquer React, seguindo a skill `ui-design-prototype` — o mesmo processo da [ui-shell](../ui-shell/prd.md) e da [worktree-tabs](../worktree-tabs/tasks.md). Cinco telas em um arquivo: a árvore, um arquivo aberto no split da aba, a lista de mudanças, um patch no mesmo split, e uma galeria dos estados degradados.

O protótipo lê o **mesmo** `tokens.css` que o app lê. Quando o desenho fecha, o CSS vai junto inteiro; não existe passo de tradução.

#### Tokens que esta feature acrescentou

Gerados, não escritos à mão: entraram no bloco `CONFIG` de `packages/web/scripts/generate-tokens.py` e saíram na regeração, com contraste verificado. A suíte foi de 31 para **46 pares**, todos AA ou melhor.

| Grupo | Tokens | Por quê |
|---|---|---|
| `syntax/*` | keyword, string, number, comment, function, type, punctuation | O tema do Shiki é montado a partir deles, pelo mesmo motivo que o do xterm foi. Todos verificados sobre `bg/inset`, o poço do terminal. |
| `git/added-subtle`, `git/removed-subtle` | fundo da linha do diff | Sutil de propósito: quem carrega o sinal é o texto. Verificados com `text/code` por cima. |
| `git/untracked` | o `?` da árvore e da lista | Faltava um estado de git que a UI agora mostra. |
| `panel/right`, `-min`, `-max`, `gutter/line` | 360 / 260 / 720 / 44px | Estrutura de tela é token, não número solto no componente. |
| `viewer/min` | 360px | Largura mínima do lado do split que mostra o arquivo. Abaixo disso ele quebra mais do que mostra. |

#### O que a renderização achou

Cada um destes saiu de olhar o PNG, não de ler o código — e é o argumento para a fase de verificação existir:

| Achado | Correção |
|---|---|
| **Código de 80 colunas some numa coluna de 360px.** Sem barra de rolagem visível, a linha simplesmente terminava no vazio | Quebra de linha **ligada por padrão**, com continuação recuada e um botão `⇄` para desligar. Vale para o arquivo e para o patch |
| `direction: rtl` para truncar o caminho pela esquerda movia a barra final: `src/lore/` virava `/src/lore` | `unicode-bidi: plaintext` junto — o texto continua LTR, só o corte muda de lado |
| Diretório com caret **e** ícone de pasta: dois glifos de seta seguidos | Só o caret. Diretório se distingue por ele e pela cor |
| Marcador `M` e contagem `+4 −61` grudados na borda direita, a meia coluna do arquivo que descrevem | Andam junto do nome; o vazio vai para o fim da linha |
| Alternador com botões esticados ocupava a largura inteira da coluna | Segmentado compacto, num trilho, alinhado à esquerda |
| Lista de mudanças **e** patch na mesma rolagem: dois conteúdos longos disputando a mesma coluna | O patch substitui a lista, com `‹` de volta — a mesma gramática do visualizador de arquivo |
| Tamanho e contagem de linhas no cabeçalho competiam com o caminho e eram cortados | Foram para o rodapé, junto da linguagem e do "lido há 12 s" |
| **O arquivo abria dentro da coluna** — e aí ou você via a árvore, ou via o arquivo, nunca os dois; e o agente rodando sumia da vista | Corrigido pelo Vinicius com a referência na mão: o arquivo abre num **split da aba**. A coluna navega, o split lê |

---

## 3. Escopo

### F1 — A coluna

**F1.1** `AppShell` ganha um terceiro slot. Grid de três colunas: sidebar fixa, meio flexível, direita com largura própria.
**F1.2** Colapsar e expandir por um botão na topbar, com o estado persistido como o `useTreeExpansion` já faz.
**F1.3** Largura arrastável entre um mínimo e um máximo, também persistida.
**F1.4** Faixa de abas própria: `Arquivos` e `Mudanças`. Reusa `TabStrip`/`Tab` da [worktree-tabs](../worktree-tabs/tasks.md).
**F1.5** Redimensionar ou colapsar a coluna **remede o terminal**. O `FitAddon` calcula colunas a partir da caixa; sem um refit a sessão fica reportando uma largura que não existe mais. Vale igual para abrir, fechar e arrastar o split da F3.

### F2 — Árvore de arquivos

**F2.1** Lê o disco, um nível por vez, só do diretório expandido (D3).
**F2.2** Diretórios antes de arquivos, cada grupo em ordem alfabética estável.
**F2.3** Nada é escondido: `node_modules`, `.git` e ignorados aparecem. A árvore mostra o que existe.
**F2.4** Diretório com mais entradas que o teto é truncado, e a árvore **diz** que truncou. Silêncio aqui leria como "acabou".
**F2.5** Arquivo com mudança não commitada ganha marcador de status (`A`/`M`/`D`/`?`), lido do mesmo `git status` que a aba de mudanças usa.
**F2.6** Expansão da árvore é por checkout e não sobrevive à troca de worktree — caminho de uma não existe na outra.

### F3 — Visualizador, no split da aba

**F3.1** Clicar num arquivo abre o conteúdo **num split da aba atual**, ao lado da sessão, com numeração de linha. A coluna permanece na árvore, com a linha do arquivo aberto marcada — clicar em outro arquivo troca o conteúdo do split, não abre um segundo.
**F3.2** Realce de sintaxe por Shiki, com tema montado a partir de `tokens.ts` — o mesmo argumento que fez o tema do xterm sair dos tokens (§7 do PRD da ui-shell).
**F3.3** Linguagem deduzida da extensão. Extensão desconhecida renderiza como texto puro, não como erro.
**F3.4** Arquivo acima do teto de tamanho não é lido: a tela diz o tamanho e oferece o caminho para copiar.
**F3.5** Arquivo binário é detectado e dito, não despejado.
**F3.6** O split é da aba: cada sessão tem o seu, trocar de aba troca o que está aberto, e o `✕` devolve a largura inteira à sessão. Fechar a aba fecha o arquivo junto.
**F3.8** Split abre em 50/50, com divisória arrastável. O lado da sessão nunca desce de `terminal/min`; o do arquivo, de `viewer/min`.
**F3.7** Quebra de linha ligada por padrão, com a continuação recuada e o número de linha só na primeira. O botão `⇄` desliga e devolve a rolagem horizontal.

### F4 — Mudanças

**F4.1** Duas vistas num alternador (D1):
- **não commitado** — árvore de trabalho contra `HEAD`, mais os não rastreados;
- **vs `<base>`** — do `merge-base` com a branch base até a árvore de trabalho, ou seja commits **mais** o que ainda não foi commitado. Responde "o que esta worktree fez".

**F4.2** Lista de arquivos com status, `+n`/`−n` e caminho. Renomeado mostra de → para.
**F4.3** Clicar num arquivo abre o patch unificado dele **no mesmo split** que o visualizador usa — um lugar só onde conteúdo é lido, uma gramática só. As linhas usam `git/added-subtle` e `git/removed-subtle` de fundo, com o sinal em `git/added` e `git/removed`. A quebra da F3.7 vale aqui também.
**F4.4** Patch é pedido **por arquivo**. Um diff inteiro de uma refatoração grande estoura o `maxBuffer` de 16 MiB do `execGit` e derruba a aba inteira por causa de um arquivo.
**F4.5** Arquivo binário na lista aparece com o status e sem patch.
**F4.6** Branch base que não existe mais desabilita a vista `vs base` com o motivo na tela. A vista `não commitado` continua funcionando — foi para isso que o `getAheadBehind` já engoliu esse erro no `getDetail`.
**F4.7** Nenhuma mudança: estado vazio com a frase certa para cada vista ("nada não commitado" ≠ "idêntica à base").

### F5 — Servidor

**F5.1** `files.listDir({ scopeType, scopeId, path })` — uma listagem, um nível.
**F5.2** `files.read({ scopeType, scopeId, path })` — devolve texto, ou o motivo de não devolver (binário, grande demais).
**F5.3** `changes.list({ scopeType, scopeId, ref })` — a lista de arquivos com contagens, para as duas vistas.
**F5.4** `changes.patch({ scopeType, scopeId, ref, path })` — o patch de um arquivo.
**F5.5** Escopo resolve para um diretório pelo mesmo caminho que o `session.create` já usa: `worktree` → `path` da worktree, `project` → `path` do projeto. A função sai de dentro do router de sessão e vira código compartilhado.
**F5.6** Checkout ausente do disco responde com o mesmo erro de domínio que o resto do app já sabe pintar, não com um stack trace de `ENOENT`.

---

## 4. Segurança do caminho

Esta é a parte que merece cuidado. Toda a feature é "o cliente manda um caminho e o daemon lê o disco" — e o daemon roda com as permissões do usuário, com acesso a tudo que ele tem.

As cinco regras, todas verificadas no servidor e nenhuma confiada ao cliente:

1. **Caminho é sempre relativo à raiz do escopo.** Absoluto é rejeitado, não reinterpretado.
2. **`..` é rejeitado após normalizar**, não antes — `a/../../b` normaliza para fora e tem que morrer aí.
3. **A verificação final é por `realpath` com separador**, não por prefixo de string. `/repo-malicioso` tem `/repo` como prefixo e não está dentro dele. O `isGitRepo` já resolve por `realpath` pelo motivo vizinho (o `/tmp` → `/private/tmp` do macOS) e o argumento é o mesmo.
4. **Symlink que aponta para fora da raiz é listado e não é lido.** Aparece na árvore com o que é; abrir responde "aponta para fora do checkout".
5. **Nenhum endpoint desta feature escreve.** Não é uma promessa de código, é ausência de caminho: não existe procedure de escrita para revisar depois.

Mais dois tetos, que não são segurança e sim sobrevivência: máximo de entradas por diretório e máximo de bytes por arquivo. `node_modules/.pnpm` tem diretório com milhares de entradas e o repositório tem lockfile de megabytes.

---

## 5. Não-objetivos

Cada linha é uma tentação que vai aparecer durante a implementação.

> **Revertido depois:** as duas primeiras linhas desta tabela — editar, criar, renomear e apagar — foram reabertas pela [file-editor](../file-editor/prd.md), com o argumento de cada lado registrado no §2 daquele PRD. A decisão **D5** ("nenhum endpoint desta feature escreve") continua verdadeira sobre *esta* feature: a escrita entrou por procedures novas, e a guarda de caminho ganhou uma irmã em vez de ser afrouxada.

| Fora | Por quê |
|---|---|
| Editar e salvar arquivo | O editor é o agente. Escrita no daemon é uma superfície inteira de risco por um ganho que outra ferramenta já dá. |
| Criar, renomear, apagar arquivo | Idem. A coluna é de leitura. |
| Stage, unstage, commit, revert | A aba `Review` do print é feature própria. Diff é ler; git é agir. |
| Diff lado a lado | Unificado primeiro. Lado a lado é outro componente inteiro, não uma variação. |
| Busca por conteúdo (grep) | Merece desenho próprio, incluindo o que fazer com repositório grande. |
| Busca por nome na árvore | A árvore é lazy: buscar exige varrer o que não foi carregado. Ver [Q5](open-questions.md). |
| Watcher de filesystem | v1 recarrega por foco, por evento de worktree e por botão. Ver [Q6](open-questions.md). |
| Histórico, blame, log | É outra coluna, com outro modelo mental. |
| Abrir arquivo de fora do checkout | O escopo do painel é o checkout. Sair dele é a regra 3 do §4. |

---

## 6. Riscos

| O quê | Por quê | Mitigação |
|---|---|---|
| Path traversal | O daemon lê o disco com as permissões do usuário. Um `..` que escapa lê `~/.ssh`. | §4 inteiro, com teste dedicado por regra — inclusive symlink real, não simulado (a política de `testing.md` para git vale aqui: filesystem de verdade) |
| ~~Bundle do Shiki~~ — **medido** | Grammars completos passam de 6 MB, e o daemon serve o app sem CDN | 16 gramáticas atrás de imports próprios. O bundle inicial foi de **709,5 KB para 721,8 KB** (+12,2 KB; +3,6 KB em gzip) e o `dist` inteiro ficou em 1,9 MB. A primeira tentativa usava `import("shiki/langs")` e produzia 9,1 MB de chunks — o registry inteiro, incluindo emacs-lisp e cpp |
| Terminal com largura errada | A coluna rouba pixels do meio; o `FitAddon` mede uma caixa que mudou de tamanho | F1.5 é *Done when* da task da coluna, com teste de que o resize dispara refit |
| Diretório com 10 mil entradas | `node_modules/.pnpm` trava a árvore e o JSON | Teto por listagem, com o truncamento dito na tela (F2.4) |
| Patch gigante | `execGit` tem `maxBuffer` de 16 MiB e o erro derruba a aba | Patch por arquivo (F4.4), com o limite tratado como resposta e não como falha |
| Repositório sem commit nenhum | `git diff HEAD` falha com `unknown revision`, e a worktree recém-criada é o caso comum | Detectar HEAD não nascido e responder "tudo é novo" em vez do erro do git |

---

## 7. Custo nos testes

Baixo, para variar. A feature **acrescenta** colunas e procedures em vez de mudar as existentes — nada do que os testes atuais assertam sai da tela.

O que muda é o `AppShell`, que ganha um terceiro slot opcional; e `resolveScope`, que sai do router de sessão. Ambos com teste próprio já existente e assinatura preservada.

O que a feature traz de novo em teste: as cinco regras do §4, uma por caso; a árvore lazy; o alternador; e um e2e que abre um arquivo de verdade num repositório de verdade.

---

## 8. Depois desta versão

- Watcher de filesystem, se o recarregar manual doer
- Busca por nome e por conteúdo
- Stage/commit pela UI — a aba `Review`
- Diff lado a lado
- Histórico do arquivo aberto
