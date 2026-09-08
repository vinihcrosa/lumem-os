---
title: O design é feito no Open Design, não neste repositório
date: 2026-08-19
area: design
summary: O desenho de tela sai do protótipo HTML editado por agente e passa a ser sincronizado de uma ferramenta de design de verdade, trocando o pipeline em casa por ter o desenho onde se desenha — e o que morre é a geração, não a verificação.
---

## Contexto

Toda tela nascia como protótipo HTML de arquivo único em `packages/web/prototype/`, sobre tokens que
`generate-tokens.py` gerava: as rampas em OKLCH num bloco `CONFIG`, os hexadecimais calculados,
`tokens.css`/`tokens.ts`/`palette.json` emitidos, e **99 pares de contraste verificados na geração**,
saindo com código 1 diante de qualquer par reprovado. Um teste do gate regerava tudo num tmpdir e
comparava byte a byte com o commitado, o que pegava duas coisas: regressão de contraste e edição à
mão de arquivo gerado.

**Funcionou** — e é isso que torna a decisão um trade-off e não uma correção. Achou uma cor de
comentário de diff a 3,44:1 que ninguém tinha visto, e um medidor de uso que nunca enchia. As duas
por renderizar e olhar, não por inspeção.

A restrição: **desenhar tela num arquivo HTML editado por agente tem um teto baixo.**

## Decisão

O desenho de tela passa a ser feito **inteiramente no Open Design**. O `generate-tokens.py` sai.
`tokens.css` não é mais gerado — é **sincronizado** de lá para cá, junto com um `<tela>.html` +
`<tela>.css` por tela. `tokens.ts` é **derivado** do `tokens.css` deste lado, porque `xterm`,
CodeMirror e Shiki precisam do hexadecimal em JavaScript. Nenhum dos três se edita à mão.

**Componente em React só usa `var(--token)`:** nenhum literal de cor, de espaço ou de tipografia. É
isso que faz tela desenhada lá ser implementável aqui sem tradução.

## Alternativas consideradas

O registro completo está em
[`docs/project/design-source-of-truth.md`](../project/design-source-of-truth.md) — §1 "Como era", §2
"Por que mudou", §3 "Como é", com o custo nomeado.

### Manter o pipeline em casa

- **O que era:** continuar com `generate-tokens.py` gerando e verificando, e o protótipo HTML como
  fonte do desenho.
- **A favor:** um comando reproduz tudo; o gate compara byte a byte; zero dependência externa; e a
  verificação de contraste roda **na geração**, então cor reprovada nunca chega a existir.
- **Contra:** o teto do desenho. Sem canvas, sem seleção, sem propriedades, sem ciência de cor, sem
  crítica pontuada — e cada protótipo colava o `tokens.css` **inteiro** dentro de si, cinco cópias,
  cada uma com um subconjunto dos tokens.
- **Por que perdeu:** a escolha é entre **ter o desenho onde se desenha** e **ter o pipeline em
  casa**, e a primeira ganha porque o gargalo era a qualidade do desenho, não a do pipeline. E o
  custo é menor do que parece: **o que morre é a geração, não a verificação** — os pares de contraste
  continuam sendo conferidos deste lado, no `gate:quick`.

### Open Design como fonte, mas gerando os tokens aqui

- **O que era:** desenhar lá, e continuar calculando as rampas com o script.
- **A favor:** ficava com as duas coisas.
- **Contra:** duas fontes para a mesma cor, e nenhuma regra dizendo qual ganha.
- **Por que perdeu:** é exatamente a forma que apodrece. Token novo tem **um** lugar de nascer, e ter
  dois garante que metade nasce no lugar errado.

## Consequências

### Bom

- Uma ferramenta de design de verdade, com um catálogo — 162 skills, 460 plugins — que este
  repositório não tem como reproduzir.
- **`design:sync --check` diz se divergiu sem escrever nada**, o que dá ao gate a mesma proteção que
  a comparação byte a byte dava, por outro caminho.
- Uma tela por arquivo, e o `tokens.css` compartilhado em vez de copiado cinco vezes.
- A regra de dependência ficou mais forte, não mais fraca: **token novo nasce no Open Design**, e cor
  escolhida à mão reprova o `gate:quick` com o nome da combinação de tela que quebrou.

### Ruim

- **A fonte do design está fora do repositório.** Um clone do `lumem-os` não contém o desenho, só a
  cópia sincronizada dele. Quem não tem acesso ao Open Design não pode alterar design — só código.
- Três arquivos passaram a ser cópia ou derivado, e a regra *"não se edita à mão"* é convenção, não
  mecanismo: nada impede uma edição direta em `tokens.css` além do `--check`.
- A verificação de contraste deixou de rodar **na geração** e passou a rodar **na conferência**. Cor
  reprovada agora consegue existir por um instante — entre desenhar lá e rodar o gate aqui.

### Riscos

- **A regra é a que mais foi testada, e passou:** duas features mudaram o desenho **depois** de a
  folha estar pronta, e nos dois casos a folha foi **reescrita antes do código** — a
  [`015-run-dock-open`](../features/015-run-dock-open/prd.md), que reverteu uma resposta registrando a
  reversão na folha, e a [`017-sidebar-actions`](../features/017-sidebar-actions/prd.md), que chegou
  com o desenho pronto e mesmo assim o mudou. O risco não é a regra ser ignorada; é ela ser seguida
  na ordem errada, e as duas vezes que isso importou ficaram escritas.
