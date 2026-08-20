# O design é feito no Open Design

> **Decisão, 2026-08-19.** O desenho de tela do Lumem-OS passa a ser feito **inteiramente no Open
> Design**. O `packages/web/scripts/generate-tokens.py` saiu. O `tokens.css` não é mais gerado: ele é
> **sincronizado** de lá para cá.

---

## 1. Como era

Toda tela deste repositório nascia como protótipo HTML de arquivo único em
`packages/web/prototype/`, sobre tokens que um script Python gerava:

- `generate-tokens.py` continha as rampas em OKLCH num bloco `CONFIG`, calculava os hexadecimais,
  emitia `tokens.css`, `tokens.ts` e `palette.json`, e **verificava 99 pares de contraste** na
  geração — saindo com código 1 diante de qualquer par reprovado.
- Cada protótipo colava o `tokens.css` **inteiro** dentro de si. Cinco cópias, cada uma com um
  subconjunto dos tokens.
- Um teste do gate regerava tudo num tmpdir e comparava byte a byte com o commitado, o que pegava
  duas coisas de uma vez: regressão de contraste e edição à mão de arquivo gerado.

Funcionou. Achou uma cor de comentário de diff a 3,44:1 que ninguém tinha visto, e achou um medidor
de uso que nunca enchia — as duas por renderizar e olhar, não por inspeção.

## 2. Por que mudou

Desenhar tela num arquivo HTML editado por agente tem um teto baixo. O Open Design é uma ferramenta
de design de verdade: canvas, seleção, propriedades, e um catálogo — 162 skills, 460 plugins — que
inclui coisas que este repositório não tem como reproduzir, como ciência de cor e crítica pontuada de
design.

A escolha, então, é entre **ter o desenho onde se desenha** e **ter o pipeline em casa**. Ganhou a
primeira, e a segunda não some inteira: o que morre é a *geração*, não a *verificação*.

## 3. Como é

```
Open Design (a verdade)
   │  tokens.css, um por projeto, compartilhado pelas telas
   │  <tela>.html + <tela>.css, uma tela por arquivo
   ▼  pnpm --filter @lumem/web design:sync
repositório
   ├── packages/web/src/styles/tokens.css     ← cópia, não edite
   ├── packages/web/src/styles/tokens.ts      ← DERIVADO do css acima
   └── packages/web/prototype/*.html|css      ← cópia, não edite
```

**Uma direção só.** Mexer no `tokens.css` do repositório é mexer numa cópia, e o próximo sync desfaz.
Isso é a diferença entre ter uma fonte e ter duas.

**Derivado ≠ gerado.** O `tokens.ts` existe porque o tema do `xterm`, do CodeMirror e do Shiki precisa
de hexadecimal em JavaScript, e `var(--token)` não é valor que eles saibam ler. A transformação é
mecânica e sem perda: os semânticos do CSS apontam para primitiva por `var(--familia-degrau)`, que é
exatamente a indireção que o TypeScript reproduz. Nada em `tokens-from-css.ts` escolhe cor.

**A verificação de contraste ficou, e passou a valer mais.** Os 99 pares foram portados para
`packages/web/src/styles/contrast.ts` e são conferidos no `gate:quick`. Antes a conta rodava na
geração, onde as cores nasciam de uma fórmula; agora roda no gate, e o que ela vigia é cor escolhida à
mão numa ferramenta de design — que é justamente o caso que mais precisa de alguém conferindo.

## 4. O que o gate garante, e o que não

| Garante | Como |
|---|---|
| Todo par de contraste declarado passa | `tokens.test.ts` lê `tokens.ts` e roda os 99 pares |
| A escada de cinzas é monótona | número maior é sempre mais escuro; quebrar envenena toda superfície |
| O `tokens.ts` commitado é o que a derivação produz | pega edição à mão do derivado **e** sync sem derivar |
| Nenhum par aponta para token que não existe | lista envelhecendo em silêncio é o modo de falha a evitar |

**O que não garante:** que o repositório está em dia com o Open Design. O `design:sync --check`
responde isso, e é para a pessoa, não para o gate — ele exige o Open Design instalado, e gate que
depende de ferramenta de desktop é gate que falha na máquina errada.

## 5. O custo, nomeado

- **O contraste deixou de ser verificado no momento em que a cor nasce.** Quem escolher cor no Open
  Design só descobre que reprovou quando rodar a suíte aqui. O ciclo ficou mais longo; o mitigante é
  que ele ainda existe, e falha com o nome da combinação de tela que quebrou.
- **A rampa OKLCH deixou de ser calculada.** Ela está congelada no `tokens.css`: degrau novo agora é
  escolhido, não derivado de uma fórmula. Se a paleta precisar crescer muito, isso volta a doer — e o
  catálogo do Open Design tem uma skill de ciência de cor exatamente para esse caso.
- **A cópia é uma cópia.** O `git status` não sabe que o Open Design mudou. Quem esquecer o sync
  trabalha em cima de design velho, e nada avisa até o `--check`.

## 6. O que faria voltar

- O Open Design deixar de ser local, ou deixar de guardar o projeto em arquivos que o `design:sync`
  consegue ler.
- A paleta precisar crescer em rampa — muitos degraus novos coerentes entre si —, que é o que uma
  fórmula faz bem e uma escolha à mão faz mal.

Nos dois casos o caminho de volta é curto: o que saiu foi um script de 636 linhas, e o que ficou já
sabe ler `tokens.css` e conferir contraste.
