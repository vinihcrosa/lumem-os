# PRD — O visualizador vira editor

> **Status:** desenho aberto — protótipo é a primeira task
> **Versão:** v0.1
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Sucede:** [right-panel](../right-panel/prd.md)

---

## 1. Objetivo

O split da aba hoje **lê** um arquivo. Esta feature o faz **escrever**: editar o conteúdo ali mesmo, com autosave, e criar, renomear e apagar arquivos pela árvore da coluna direita.

Hoje, quando você lê o que o agente escreveu e vê que uma linha está errada, o gesto seguinte é sair do Lumem: abrir o editor de fora, ou pedir ao agente para corrigir uma coisa que você corrigiria mais rápido do que descreveria. O Lumem já tem o arquivo na tela e já sabe onde ele está — falta a permissão de mudá-lo.

**Critério de sucesso em uma frase:** com um agente rodando na aba, você corrige uma linha do arquivo aberto ao lado, e a correção aparece na aba `Mudanças` sem você ter tocado em outra ferramenta.

---

## 2. Isto reverte um não-objetivo declarado

O §5 do [PRD da right-panel](../right-panel/prd.md) lista, em primeiro lugar:

> | Editar e salvar arquivo | O editor é o agente. Escrita no daemon é uma superfície inteira de risco por um ganho que outra ferramenta já dá. |

E a decisão D5 daquela feature era categórica: *"não existe procedure de escrita para revisar depois"*.

A reversão é deliberada e o argumento mudou nos dois lados:

| Então | Agora |
|---|---|
| "outra ferramenta já dá" | Trocar de ferramenta custa o contexto inteiro: qual worktree, qual caminho, o agente rodando à vista. Uma correção de uma linha não paga esse preço, então ela não é feita — ou vira um pedido ao agente, que é mais caro ainda |
| "o editor é o agente" | O agente continua sendo o editor **do trabalho**. Isto é o editor **da correção** — outra escala de gesto |
| "superfície inteira de risco" | Continua verdade, e é por isso que o §4 desta feature é maior que o da anterior. A resposta a risco é desenho, não abstinência |

O que **não** muda: a guarda de caminho da right-panel continua sendo a única porta, e ganha uma irmã para escrita. Nenhuma regra do §4 daquele PRD é afrouxada; todas ganham um caso a mais.

Ao fechar esta feature, o §5 da right-panel é corrigido apontando para cá — não-objetivo revertido sem registro é dívida de documentação.

---

## 3. Forma

```
┌──────────┬─────────────────────────────────┬──────────────────┐
│ sidebar  │ [contexto][◆ claude][● shell]   │ [Arquivos][Mudanças]
│          ├────────────────┬────────────────┤  ▾ src           │
│ projetos │  ◆ claude      │ loader.ts  ● ● │    ▸ lore        │
│ worktrees│  (terminal)    │ ────────────── │      loader.ts M │
│          │                │  1 import …    │      frontmatter.ts
│          │                │  2 ▏           │  [＋][✎][🗑]      │
└──────────┴────────────────┴────────────────┴──────────────────┘
      coluna navega · split edita · disco é a verdade
```

A gramática da right-panel é preservada inteira. **A coluna navega; o split lê — e agora escreve.** Nada muda de dono:

| O quê | Pertence a | Consequência |
|---|---|---|
| A coluna (árvore e mudanças) | ao **checkout** | trocar de aba de sessão não mexe nela |
| O split com o arquivo aberto | à **aba** | cada sessão tem o seu; fechar a aba fecha o arquivo |
| O **buffer** de edição | ao **arquivo aberto naquela aba** | trocar de aba não perde o que foi digitado, porque nesse instante o buffer já foi para o disco (D2) |

O que a tela ganha é um indicador de estado do arquivo, no rodapé da moldura que a right-panel já desenhou: `salvando…`, `salvo há 3 s`, `não deu para salvar`, `mudou no disco`. Nunca "não salvo" por muito tempo — com autosave, esse estado dura o debounce e some.

### Desenho antes de React

Mesmo processo das três features anteriores (skill `ui-design-prototype`): protótipo HTML+CSS lendo o **mesmo** `tokens.css` do app, verificado por renderização, antes de qualquer componente. Arquivo: `packages/web/prototype/lumem-file-editor.html`.

Estados que o protótipo tem que mostrar, porque são eles que o desenho pode errar:

1. arquivo em edição, cursor visível, linha ativa realçada;
2. os quatro estados de salvamento no rodapé;
3. **conflito** — o disco mudou embaixo do buffer, com as duas saídas na tela;
4. as recusas que continuam existindo (binário, grande demais), agora com "somente leitura" dito como motivo, não como default;
5. criar, renomear e apagar na árvore, incluindo o diálogo de confirmação;
6. arquivo dentro de `.git`, aberto e **não** editável, com o motivo.

#### Os tokens que o desenho pediu

Dez tokens novos, todos pelo gerador (`packages/web/scripts/generate-tokens.py`), nenhum escrito à
mão. A suíte de contraste foi de **46 para 59 pares**, todos AA ou melhor.

| Grupo | Tokens | Para quê |
|---|---|---|
| `editor/*` | `cursor`, `selection`, `active-line`, `line-number`, `line-number-active`, `readonly` | O tema do CodeMirror é montado em TypeScript (D1), então estes nomes precisam existir em `tokens.ts` e não só em CSS — é o que impede a E8 de escrever uma cor literal |
| `save/*` | `saving`, `saved`, `failed`, `stale` | Os quatro estados do rodapé. Um lugar para mudar cada um, e o `stale` é o mesmo do conflito: conflito **é** o `stale` mostrado por extenso |

#### O que a renderização achou

Cada um destes saiu de olhar o PNG, não de ler o código:

| Achado | Correção |
|---|---|
| **A medianiz do visualizador dá 2,96:1** sobre o poço — abaixo até do mínimo de objeto gráfico. Vinha de `text-disabled`, escolhido quando número de linha era enfeite; num editor ele é para onde o erro do teste aponta | Token próprio, `editor/line-number` (6,49:1, AA), com o par entrando na suíte. A E8 leva o valor para o gutter do CodeMirror |
| **O estado do salvamento trocava de lado**: `salvando…` e `salvo há Ns` no canto direito, `falhou` e `mudou no disco` no esquerdo — porque só a falha precisava da largura para o motivo do daemon. Quatro estados, dois pontos de fixação | O estado é sempre o **primeiro** item do rodapé, à esquerda. Tamanho, linhas e linguagem vão depois do vão; na falha eles somem e o motivo herda a largura |
| **`🔒` e `🗑` são emoji**: voltam com a cor da fonte do sistema e ignoram `color` — os únicos elementos da tela fora dos tokens | Glifos de texto, `⊘` e `✕`, que herdam `currentColor` |
| **A galeria da árvore renderizava em ~620px**, e nessa largura o nome, o marcador, o `⋯` e o campo de renomear cabem sempre. O teste de densidade passava sem ter acontecido | As caixas da árvore fixadas em `--size-panel-right-min` (260px) e `--size-panel-right` (360px) — as larguras reais da coluna |
| **O menu de ações tapava a própria linha** que ele descreve, escondendo o `⋯` que o abriu: estava ancorado no contêiner de rolagem, não na linha | Ancorado na linha (`top: 100%`), com largura de conteúdo em vez de fixa — numa coluna de 260px um menu de largura fixa ou sai da tela ou cobre o alvo |
| **O aviso de conflito repetia os próprios botões** ("as duas saídas perdem alguma coisa — escolha qual") e custava uma linha do código que a escolha vai destruir | Frase cortada. O aviso encolheu e o buffer aparece duas linhas mais |
| A continuação de uma linha quebrada alinha **à esquerda** do código indentado que ela continua — herdado do visualizador, e visível em linha com quatro níveis de indentação | Aceito por ora: é o mesmo truque de `text-indent` negativo que a E8 precisa aplicar em `.cm-line`, porque o `lineWrapping` do CodeMirror alinha a continuação na coluna 0, que é pior |

---

## 4. Escopo

### F1 — O editor no split

**F1.1** O conteúdo do arquivo abre num CodeMirror 6, não num `<div>` de linhas (D1). Numeração, cursor, seleção, undo/redo, indentação e busca vêm do motor.
**F1.2** Realce continua sendo o do Shiki, com o **mesmo** tema montado a partir de `tokens.ts` — a ponte `@shikijs/codemirror` existe para não haver um segundo conjunto de gramáticas nem um segundo tema no bundle (D1.1).
**F1.3** Quebra de linha continua ligada por padrão, com o botão `⇄` (D3.1 da right-panel). No CodeMirror isso é `EditorView.lineWrapping`.
**F1.4** Arquivo binário, grande demais, ou dentro de `.git` abre **somente leitura**, com o motivo dito. Somente leitura passa a ser um estado nomeado, não a ausência de um.
**F1.5** O patch (`PatchViewer`) continua somente leitura e **não** vira editor. Editar um diff é outra feature, com outro modelo mental.
**F1.6** Fim de linha e ausência de quebra final são preservados: arquivo CRLF volta CRLF, arquivo sem `\n` final não ganha um (D4).

### F2 — Autosave

**F2.1** O buffer vai para o disco sozinho, com debounce, depois que a digitação para (D2).
**F2.2** Digitação nunca se perde por desmontar: trocar de aba, fechar o split, fechar a aba, perder o foco da janela e desmontar o componente **descarregam o pendente antes** de sumir.
**F2.3** O estado do salvamento é dito no rodapé: `salvando…`, `salvo há Ns`, e a falha com o motivo do daemon.
**F2.4** Falha de escrita **não** descarta o buffer. O texto continua na tela e a próxima tentativa continua de onde parou.
**F2.5** Salvar não pode disparar um ciclo: a gravação invalida o cache de `changes` e do `listDir`, e **não** o `files.read` do arquivo aberto — que voltaria do disco por cima do que está sendo digitado.

### F3 — Concorrência com o agente

Esta é a parte que justifica a feature ter PRD próprio. O agente escreve no mesmo checkout, ao mesmo tempo, sem saber que existe um editor aberto.

**F3.1** Toda leitura de arquivo devolve uma **revisão** — o hash do conteúdo lido (D3).
**F3.2** Toda escrita manda a revisão em que o buffer se baseia. O daemon compara com o disco **no momento da escrita** e recusa se mudou.
**F3.3** A recusa é **resposta, não exceção**: `{ ok: false, reason: "stale" }`, pelo mesmo argumento que fez `readFile` devolver `binary` e `too-large` em vez de lançar. Conflito é um caso previsto, não uma falha.
**F3.4** Diante do conflito, o autosave **para** e a tela oferece as duas saídas, nomeadas pelo que perdem: *recarregar do disco* (perde o que você digitou) e *sobrescrever* (perde o que o agente escreveu). Nenhuma delas é o default (D3.1).
**F3.5** Com o buffer **limpo**, uma mudança externa é adotada: o arquivo na tela segue o disco, como hoje.
**F3.6** Com o buffer **sujo**, mudança externa nunca sobrescreve o que está sendo digitado — vira o aviso de F3.4.

### F4 — CRUD na árvore

**F4.1** Criar arquivo e criar pasta, a partir do diretório clicado, com o nome digitado na própria linha da árvore.
**F4.2** Renomear no lugar. Renomear é mover: `a/b.ts` → `c/d.ts` é uma operação só, e o diretório de destino tem que existir.
**F4.3** Apagar, com confirmação que **nomeia** o que vai sumir. Diretório só é apagado com a contagem do que tem dentro dita antes.
**F4.4** Toda operação nomeia o alvo já existente em vez de sobrescrever: criar sobre um nome ocupado, ou renomear para um nome ocupado, é `DUPLICATE`.
**F4.5** Depois de qualquer operação a árvore mostra o resultado sem recarregar tudo — invalida o diretório afetado e a lista de mudanças.
**F4.6** Apagar o arquivo aberto no split fecha o split. Renomear o arquivo aberto reaponta o split para o novo caminho.

### F5 — Servidor

**F5.1** `files.read` passa a devolver `revision` junto do conteúdo. Mudança aditiva; o cliente atual continua compilando.
**F5.2** `files.write({ scopeType, scopeId, path, text, baseRevision })` → `{ ok: true, revision }` ou `{ ok: false, reason: "stale", revision }`.
**F5.3** `files.create({ …, path, kind: "file" | "dir" })`.
**F5.4** `files.rename({ …, from, to })`.
**F5.5** `files.remove({ …, path, recursive })`.
**F5.6** Escrita é atômica: arquivo temporário no **mesmo diretório** e `rename` por cima, com o modo do original preservado. Meio arquivo no disco é pior que nenhuma escrita, e o agente pode estar lendo exatamente nesse instante.

---

## 5. Segurança do caminho, agora com escrita

O §4 da right-panel continua valendo palavra por palavra. Ele foi escrito para leitura; escrita acrescenta casos, não relaxa nenhum.

O que continua igual — e é verificado no servidor, nunca no cliente:

1. caminho sempre relativo à raiz do escopo; absoluto é recusado;
2. `..` recusado **depois** de normalizar;
3. verificação final por `realpath` com separador, não por prefixo de string;
4. symlink que aponta para fora da raiz não é lido — **e agora também não é escrito**.

O que a escrita acrescenta:

| Regra | Por quê |
|---|---|
| **O alvo pode não existir; o pai tem que existir e estar dentro.** | Criar arquivo é escrever num caminho que ainda não está lá. `resolveInsideRoot` exige existência — a right-panel já tropeçou nisso com o patch de arquivo apagado e criou `normalizeRelative`. A escrita precisa do terceiro caso: resolver o **pai** e checar o nome |
| **Escrita dentro de `.git` é recusada.** | Um `rm -rf` acidental do `.git` destrói a worktree e o histórico não commitado junto. A árvore continua **mostrando** `.git` (F2.3 da right-panel: nada é escondido) — mostrar e deixar escrever são coisas diferentes |
| **Escrever através de symlink escreve no alvo, não substitui o link.** | Por isso a escrita atômica resolve o `realpath` **antes** de escolher onde colocar o temporário. Um `rename` sobre o caminho literal transformaria o link em arquivo comum, silenciosamente |
| **O teto de bytes vale na entrada.** | O mesmo 1 MiB do `MAX_FILE_BYTES`. Sem isso o teto de leitura é contornável escrevendo |
| **Apagar diretório exige `recursive` explícito.** | Um `rmdir` que vira `rm -rf` por omissão de parâmetro é o tipo de acidente que não tem desfazer |
| **A raiz do checkout não é apagável nem renomeável.** | Caminho vazio é o checkout. Nenhuma operação de escrita aceita alvo vazio |

Um ponto que **não** é resolvido aqui e está declarado: o daemon não tem autenticação. Quem alcança a porta do daemon já podia ler qualquer arquivo do checkout; agora também pode escrever. Isso é uma mudança real de superfície e a resposta certa é autenticação do daemon, que é feature própria — ver [Q7](open-questions.md).

---

## 6. Não-objetivos

| Fora | Por quê |
|---|---|
| Editar o patch / editor de diff | O split lê o diff e edita o arquivo. Editar hunk é outro modelo mental |
| Stage, unstage, commit, revert | Continua sendo a aba `Review`, continua sendo feature própria |
| Autocomplete, LSP, ir-para-definição | Isso é uma IDE. O gesto aqui é corrigir uma linha, não desenvolver dentro do Lumem |
| Múltiplos arquivos abertos ao mesmo tempo | O split é um. Abrir outro arquivo troca o conteúdo — regra da right-panel, preservada |
| Desfazer depois de salvo, histórico de versões, lixeira | O `undo` é o do editor, dentro da sessão. Para o resto, o git é o histórico — ver [Q5](open-questions.md) |
| Editar arquivo fora do checkout | O escopo do painel é o checkout. Regra 3 do §5 |
| Resolver conflito com merge de três vias | O conflito é dito e resolvido escolhendo um lado. Merge é feature própria |
| Watcher de filesystem | Continua a [Q6 da right-panel](../right-panel/open-questions.md). O conflito é detectado na escrita, que é onde ele importa |

---

## 7. Riscos

| O quê | Por quê | Mitigação |
|---|---|---|
| **Sobrescrever o trabalho do agente** | Autosave grava sozinho; o agente grava o mesmo arquivo sem saber do editor | F3 inteiro: revisão em toda leitura, comparada em toda escrita, conflito como resposta. Teste com escrita concorrente de verdade, não simulada |
| **Perder o que foi digitado** | Autosave em debounce + desmontar componente = janela onde o texto só existe na memória | F2.2 é *Done when* com teste por gatilho: trocar de aba, fechar split, fechar aba, blur |
| **Refetch pisando no buffer** | `worktree.changed` invalida `["files"]`, e `files.read` refetch com o usuário digitando devolveria o disco por cima | F2.5 e F3.6: com buffer sujo, o disco vira aviso, nunca conteúdo |
| **Escrita parcial** | O agente pode estar lendo o arquivo no instante da gravação | Temp + `rename` no mesmo diretório (F5.6), modo preservado |
| **Apagar o que não devia** | `.git`, diretório com conteúdo, ou a raiz | Três regras do §5, cada uma com teste próprio |
| **Bundle do CodeMirror** | O daemon serve o app sem CDN, e a right-panel já pagou 12,2 KB pelo Shiki com o número medido | Task de editor fecha com `gate:build` e o número real escrito neste PRD, como a R8 fez |
| **Dois sistemas de realce** | Shiki para o patch, o do CodeMirror para o arquivo, com paletas que divergem | D1.1: a ponte `@shikijs/codemirror` usa o tema e as gramáticas que já existem. Se ela não servir, a decisão volta para a mesa antes de entrar uma segunda gramática |

---

## 8. Custo nos testes

Maior que o da right-panel, e concentrado em um lugar: **a suíte precisa de um caso de escrita concorrente**. Um teste que escreve o arquivo por fora entre a leitura e a gravação, com filesystem de verdade — pela mesma política que faz o git nunca ser mockado.

O resto é aditivo. `files.read` ganha um campo; `FileService` ganha métodos; a árvore ganha ações. Nada do que os 685 testes atuais assertam sai da tela — com uma exceção honesta: `file-viewer.test.tsx` passa a montar um CodeMirror, e o que ele assertava sobre `<div className="l">` muda de forma. É reescrita de teste, não perda de cobertura.

---

## 9. Depois desta versão

- Autenticação do daemon ([Q7](open-questions.md)) — a dívida que esta feature torna visível
- Watcher de filesystem, que transforma o conflito de "descoberto ao salvar" em "avisado na hora"
- Busca e substituição no arquivo aberto (o CodeMirror já traz metade)
- Stage/commit pela UI — a aba `Review`
- Editar o patch, hunk a hunk
