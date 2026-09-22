---
title: A marca é escassa, e a identidade do agente tem família própria
date: 2026-09-22
area: design
summary: O sistema visual foi resemeado no vocabulário do Cursor mantendo a interface escura — matiz de lá, escada de luminosidade daqui. Com a marca em laranja, ela passou a disputar o arco quente com `warning` e `danger`, e o quadro pintou `● implementando` e `● bloqueada` a 25° de matiz um do outro, com a suíte verde. A marca passa a ser **escassa** — 7 tokens, só CTA, foco e superfície de marca —, a identidade do agente ganha a família `agent` (a lavanda da timeline do Cursor), e nasce `DISTINCTION_SETS`, o gate que responde *"dá pra diferenciar?"* ao lado do que já respondia *"dá pra ler?"*.
---

## Contexto

O pedido foi *"mudar o system design para o padrão do cursor"*, via `npx getdesign@latest add
cursor`. O comando escreve **um arquivo só** — um `DESIGN.md` de 537 linhas, na raiz — e ele não
entrou no repositório por duas razões: a raiz não aceita documentação solta, e um arquivo com cor e
tipografia próprias ao lado do `tokens.css` recria a **fonte dupla** que o [ADR de
2026-09-20](2026-09-20-2246-design-lives-in-the-code.md) acabou de matar. O template foi lido num
diretório descartável e o conteúdo dele foi portado para o `tokens.css`, que é onde o desenho mora.

O template descreve o **site** do Cursor, não o editor — o próprio arquivo diz *"whose marketing site
reads like... warm-cream editorial canvas instead of the typical dark IDE atmosphere"*. O Vinicius
escolheu manter a interface escura, então o método foi **matiz do Cursor, escada de luminosidade do
Lumem**, em OKLCH: nenhum degrau muda de claridade, e os 122 pares de contraste sobrevivem por
construção em vez de por sorte. Sete rampas foram resemeadas, com a marca em Cursor Orange `#F54E00`.

**E aí apareceu o defeito que nenhum teste pegou.** O `gate:quick` passou inteiro — 4008 testes, 122
pares, 0 reprovados — enquanto o quadro de tarefas pintava dois cartões vizinhos assim:

- `● implementando há 6 min` — `.tcard--work`, que usa `--color-session-agent`, que era a marca;
- `● bloqueada: parou no teto` — `.tcard--blocked`, que usa `--color-text-danger`.

Dois estados **opostos**, quase a mesma cor. Foi preciso abrir o navegador para ver.

A causa tem número. A separação mínima de matiz entre as famílias caiu de **40° para 26°**, e o arco
quente passou a ter três moradores onde antes tinha dois:

| | antes (marca roxa) | depois (marca laranja) |
|---|---|---|
| arco quente | `danger 26°` · `warning 78°` | `danger 13°` · **`brand 38°`** · `warning 72°` |
| a marca | `292°`, sozinha | `38°`, encaixada entre as duas |
| menor separação | 40° (`accent`↔`success`) | **26°** (`danger`↔`brand`) |

Isto não é consequência de ter escolhido mal a laranja. É consequência de escolher **qualquer**
laranja como marca num produto que já gasta laranja em *aviso* e vermelho em *erro*. O Cursor não
tem esse problema porque o site dele não tem UI semântica densa; o Lumem tem.

## Decisão

Três coisas, e a primeira é do próprio template.

### 1. A marca é escassa

*"Cursor Orange is reserved for primary CTAs and the wordmark. **Used scarcely**."* No Lumem isso
deixa de ser estilo e vira regra: a laranja pintava **18** tokens semânticos e passa a pintar **7** —
`bg/brand`, `bg/brand-hover`, `bg/brand-subtle`, `bg/brand-muted`, `border/brand`, `border/focus` e
`text/brand`. Só CTA, foco e superfície de marca. **Nenhuma cor de estado.**

### 2. A identidade do agente tem família própria: `agent`

O que era identidade — turno, cursor do editor, palavra-chave, modo, elo, escopo de workspace, o selo
do cartão — sai da marca e vai para uma **oitava família de primitivas**, semeada na lavanda
`#C0A8DD`: a quinta pastilha da timeline do Cursor, a única das cinco que não tinha casa nas rampas
já resemeadas. É o que o template chama de *"in-product agent visualization"* e reserva justamente
para as pastilhas pastel.

Ela fica a **305°**, quase exatamente onde o roxo estava (292°), e **herda a escada de claridade e
croma do roxo** em vez de ganhar uma nova — é isso que mantém de pé todo par de contraste que citava
a marca. `accent` fica **intocado** no oliva: o template só tem cinco matizes, a lavanda virou
`agent`, e quem usa o oliva (branch do git, literal de string, custo) precisa cair longe dela.

### 3. Nasce `DISTINCTION_SETS`, irmão de `CONTRAST_PAIRS`

`CONTRAST_PAIRS` responde **"dá pra ler?"** — cor contra o fundo. O repositório não tinha gate nenhum
para a outra pergunta, **"dá pra diferenciar?"** — cor contra a cor ao lado. É por isso que a suíte
ficou verde: os dois selos passavam no contraste com folga, cada um contra o seu fundo.

`DISTINCTION_SETS` declara **adjacência real** — tokens que dividem tela significando coisas
diferentes —, e `checkDistinction()` exige **40° de separação de matiz** entre os cromáticos de cada
conjunto. Nove conjuntos na abertura.

O limiar vem de duas medições, não de gosto: **26°** é o defeito, e **46°** é o conjunto mais
apertado que o produto tem hoje e está certo (`syntax/string` contra `syntax/type`). O limiar tem de
reprovar o primeiro e aprovar o segundo.

**Token acromático sai da conta de propósito**, e isso não é folga: matiz de um cinza é um número sem
significado, e quem separa dois cinzas é a claridade, que `CONTRAST_PAIRS` já governa. Eles são
listados no conjunto para serem reconhecidos e ignorados, em vez de esquecidos em silêncio.

Some-se a isso uma segunda guarda, mais barata: o conjunto de semânticos que apontam para a família
`brand` é **fixado em teste**, e a lista só encolhe. Quem escrever `--color-turn-thought:
var(--brand-400)` recria a colisão, e sem ela nada falharia — `checkDistinction` só olha os conjuntos
que alguém lembrou de declarar.

**Isto reafirma, sem mudar,** o [ADR de 2026-09-20](2026-09-20-2246-design-lives-in-the-code.md): o
desenho mora no código, `tokens.css` é a fonte, `tokens.ts` é derivado e nunca editado à mão, e
componente React só usa `var(--token)`. A única nota é aritmética — aquele ADR fala em **119** pares
de contraste e o array está em **122**; ADR não se edita depois de escrito, e o piso do teste foi
corrigido junto com esta decisão.

## Alternativas consideradas

### Não criar família nova: `accent` vira a lavanda e quem usava o oliva se muda

- **O que era:** a primeira tentativa, e ela chegou a ser escrita. Sete rampas, sem oitava.
- **Por que perdeu:** **foi medida e falhou.** Com `accent` em lavanda, `agent` e `accent` ficam os
  dois a 305° — a colisão só muda de lugar. E rehospedar quem usava o oliva abre duas colisões novas
  que não existiam: `syntax/keyword` contra `syntax/string`, e `scope/workspace` contra
  `scope/worktree`. Custa mais do que a oitava família, que custa onze linhas.

### Manter a laranja larga e empurrar `danger` mais para o rosa

- **A favor:** zero família nova. O `#CF2D56` do template já é mais rosado que o vermelho anterior do
  Lumem, então a direção existe.
- **Por que perdeu:** não resolve. Mesmo com `danger` em 13° — que é onde ela já está —, a separação
  para a marca é **25°**, e para `warning` são 34°. O arco quente continua com três moradores, e o
  problema é a lotação, não a posição de um deles.

### Não usar a laranja do Cursor literalmente

- **A favor:** o defeito desaparece na origem, e todas as outras seis rampas seguem o template.
- **Por que perdeu:** a laranja `#F54E00` é a única cor que o template **nomeia** como *a* marca.
  Trocá-la é entregar o pedido pela metade e chamar de decisão de design o que foi uma dificuldade
  de implementação.

### Aceitar os 26° e confiar na revisão humana

- **Por que perdeu:** a revisão humana é exatamente o que **falhou** aqui. O `gate:quick` estava
  verde, o diff era um arquivo de tokens, e a colisão só apareceu porque alguém abriu o navegador
  numa story — que não é obrigação de ninguém. Regra sem sensor é regra que volta sozinha.

## Consequências

### Bom

- **A pergunta nova tem gate.** *"Dá pra diferenciar?"* deixa de depender de alguém abrir a galeria.
  As duas guardas foram provadas **vermelhas contra o dado real**: repontar `--color-session-agent`
  de volta para a marca faz as duas falharem, uma nomeando as duas cores e os graus, a outra
  nomeando o token que entrou na lista.
- **A escassez é a mesma regra do template**, então ela não é invenção local que alguém vai querer
  discutir depois — está escrita em *Do's and Don'ts*.
- **Custo zero de migração.** A família `agent` herdou a escada do roxo, então os 122 pares passaram
  sem um único ajuste de valor.

### Ruim

- **Oito famílias de primitivas em vez de sete.** `brand` e `agent` são as duas "cores de destaque"
  do sistema, e a diferença entre elas é de *papel*, não de aparência — é exatamente o tipo de
  distinção que se perde quando ninguém lê o comentário. O mitigante é o teste da escassez, que
  falha com o nome do token.
- **O limiar de 40° tem só 6° de folga** contra o conjunto mais apertado de hoje. Um degrau de rampa
  mexido sem cuidado pode fazer a suíte reprovar um conjunto que está visualmente bem — e a resposta
  certa aí é discutir o conjunto, não baixar o número.

### Riscos

- **`DISTINCTION_SETS` só vê o que foi declarado.** Uma adjacência nova na tela que ninguém
  acrescentar à lista não é vigiada por nada — é o mesmo risco que `CONTRAST_PAIRS` sempre teve, e a
  mesma mitigação: o conjunto entra quando a combinação entra na tela, e o piso do `length` impede
  apagar para calar.
- A separação `danger`↔`brand` continua em **25°**, abaixo do limiar. Ela só não reprova porque os
  dois não aparecem no mesmo conjunto declarado — e é a escassez que garante isso. Se a marca voltar
  a ser cor de estado, o número volta a doer.
