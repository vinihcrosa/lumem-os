---
title: O desenho mora no código, e a galeria é o Storybook
date: 2026-09-20
area: design
summary: Decisão do Vinicius. O Open Design sai. O desenho deixa de ser feito fora e copiado para cá, e passa a ser o próprio componente React, olhado no Storybook e corrigido pelo agentation. O `tokens.css` deixa de ser cópia e vira original; `design:sync` morre e sobra `design:derive`; os 24 protótipos HTML saem do repositório e ficam no `lumem-os-design`, arquivado. A fase de desenho não morre — deixa de ser o default, e o gatilho é *"se o desenho estiver errado, o que se joga fora: código ou CSS?"*.
supersedes: 2026-08-19-2247-design-is-made-in-open-design
---

## Contexto

O [ADR de 2026-08-19](2026-08-19-2247-design-is-made-in-open-design.md) decidiu **duas** coisas de uma
vez, e só uma delas envelheceu:

1. **o desenho é feito numa ferramenta de design de verdade** — canvas, seleção, ciência de cor;
2. **a ferramenta é a fonte, e o repositório é cópia**, trazida por `design:sync`.

A primeira funcionou. A segunda é a que cobra, e ela cobra das três formas que o §5 do
[estudo](../project/design-source-of-truth.md) já tinha nomeado — *"a cópia é uma cópia"*, *"a cópia
pode ser editada à mão"*, *"o `git status` não sabe que o Open Design mudou"*. Agora com número:

- **67 divergências** entre a pasta do Open Design e `packages/web/prototype/` no dia desta decisão,
  medidas por `diff -rq`. Quase toda tela. Um refactor de camadas do lado de lá — `lumem-ds.css` com
  734 regras, 24 telas, uma galeria — **nunca entrou no repositório**, e nada falhou por isso.
- **Uma pasta só**, em `~/Library/Application Support/`. Com o produto sendo um harness de worktrees
  paralelas, duas worktrees desenhando ao mesmo tempo escrevem no mesmo lugar, e a segunda
  sobrescreve a primeira **em silêncio**.
- **O clone não contém o desenho.** Isso estava escrito como consequência ruim desde o primeiro dia.

O pedido que abriu esta decisão foi *"quero o design junto do código, versionado, e separado por
worktree"*, e depois *"quero parar de usar o Open Design"*. As três propriedades pedidas são
exatamente as três que a direção da cópia nega.

## Decisão

**O desenho mora no código.** Não há mais fonte fora do repositório, e não há mais cópia.

- **O Open Design sai.** `design:sync` morre com ele. O que sobra é `design:derive`, que só faz o
  `tokens.ts` a partir do `tokens.css` — a única transformação que o JavaScript precisa.
- **`packages/web/src/styles/tokens.css` deixa de ser cópia e vira original.** A regra *"não edite à
  mão"* cai, porque não há mais original em outro lugar para desfazer a edição.
- **Os 24 protótipos HTML saem do repositório.** O histórico deles está preservado em
  `github.com/vinihcrosa/lumem-os-design`, que já era um repositório git com 17 commits — **arquivado,
  não apagado**. Comentário de proveniência no CSS do React passa a citar `lumem-os-design/<arquivo>`,
  que é aquele repositório.
- **A galeria é o Storybook**, e ele substitui a rota `/styleguide`. As 19 seções daquela página
  viraram 19 stories, com o mesmo JSX.
- **O ciclo default passa a ser construir e ajustar:** escreve o React, roda `pnpm dev`, anota o que
  estiver ruim com o agentation — que já monta no `main.tsx` e agora monta também no `preview.tsx` do
  Storybook — e o agente conserta pelo MCP.

**A fase de desenho não morre; deixa de ser o default.** O gatilho é uma pergunta: *se o desenho
estiver errado, o que se joga fora?* Se for **código** — componente novo, layout novo, uma coluna
redimensionada —, desenha antes. Se for **CSS** — espaçamento, cor, alinhamento —, constrói e ajusta.

**Isto reafirma, sem mudar:** componente React só usa `var(--token)`, nenhum literal de cor, espaço ou
tipografia; `tokens.ts` é **derivado** e nunca editado à mão; e os **119 pares de contraste** são
conferidos no `gate:quick`, falhando com o nome da combinação de tela que quebrou.

## Alternativas consideradas

### Ficar no Open Design, com um projeto por worktree via symlink

- **O que era:** inverter só a seta. O desenho passaria a morar em `packages/web/design/` dentro da
  worktree, e a pasta `data/projects/<id>` do Open Design viraria um **symlink** para lá — um projeto
  por checkout.
- **A favor:** entrega as três propriedades pedidas e mantém o canvas. E **funciona**: foi medido
  nesta máquina antes de ser recusado — projeto criado sem pasta (dá para pôr o symlink antes do
  primeiro `write`), `get_project` lendo através, `write_file` gravando dentro da worktree, preview
  HTTP servindo `200`, e `.file-versions/` já ignorado pelo `.gitignore` de lá.
- **Por que perdeu:** não foi recusada por não funcionar. O Vinicius pediu para sair da ferramenta, e
  a alternativa a mantém no centro do fluxo — com um symlink para dentro do diretório de outro
  programa como peça obrigatória, e um projeto órfão no `app.sqlite` a cada `git worktree remove`.

### Figma

- **Contra:** nuvem. Não versiona junto do código, não separa por branch, não entra no diff da pull
  request. Regride nas três propriedades que motivaram a mudança.

### Pencil (`.pen`)

- **Contra:** arquivo **cifrado**. Fica no repositório e mesmo assim não tem diff, não tem merge e não
  tem revisão. Regride mais que o Figma.

### Só o `/styleguide`, sem Storybook

- **A favor:** já existia, 557 linhas, **zero** dependência. E a instalação do Storybook custa **+57
  pacotes** (medidos com o `pnpm` deste monorepo, não os 276 de uma pasta vazia).
- **Por que perdeu:** o que se ganha é o **isolamento**. Estado caro de alcançar no app de verdade —
  workspace sem acervo, orçamento bloqueado, vinte modelos no seletor — vira uma story endereçável, e
  sem isso o ciclo "constrói e ajusta" só alcança o que o app consegue mostrar naquele instante. A
  galeria à mão dava a lista de primitivas; ela não dá endereço para estado.

## Consequências

### Bom

- **Uma fonte.** O `git diff` da pull request contém o desenho. A worktree paralela tem a própria
  cópia, sem combinar nada.
- **A divergência protótipo × implementação some por construção**, porque não há mais protótipo: o que
  a galeria mostra é o componente que a tela usa.
- O agentation funciona nas duas superfícies — app e Storybook — sem configuração nova: ele monta
  fora da árvore da aplicação, e o `preview.tsx` chama o mesmo `mountAgentation()`.

### Ruim

- **Perde-se a atenção agendada.** A fase de desenho era um momento marcado para olhar uma superfície
  inteira, e foi assim que a [`023`](../features/023-composer-menus/prd.md) achou um `overflow:
  hidden` que estava **vivo no produto havia três features**, com teste de componente verde. O
  agentation é oportunista: pega o que se olha. O mitigante é um item de checklist — quando a feature
  mexe numa superfície, olhar a superfície inteira antes de fechar —, e um item de checklist é mais
  fraco que uma fase.
- **Perde-se o canvas.** Sem seleção, sem propriedades, sem as skills de ciência de cor. Degrau novo
  de rampa volta a ser escolhido à mão, com o `gate:quick` conferindo depois em vez de a fórmula
  garantir antes.
- **+57 pacotes** e um segundo servidor de desenvolvimento para subir.

### Riscos

- O maior é o que o `/styleguide` já tinha: **galeria que ninguém abre não guarda nada.** A mitigação
  não é uma regra — é o Storybook ser o lugar onde o estado difícil mora, porque aí abrir deixa de ser
  virtude e vira o caminho mais curto.
- `tokens.css` editável à mão é exatamente o que o ADR anterior evitava. O que segura é o
  `gate:quick`: 119 pares de contraste mais a escada de cinzas monótona, e `tokens.ts` comparado com o
  que a derivação produz.
