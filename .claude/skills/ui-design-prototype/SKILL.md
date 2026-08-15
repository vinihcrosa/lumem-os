---
name: ui-design-prototype
description: Desenha e itera interface como protótipo HTML+CSS sobre design tokens, verifica renderizando de verdade, e só então implementa em React. Use quando pedirem para desenhar, prototipar, mockupar, redesenhar ou explorar uma tela, ajustar visual/densidade/hierarquia, criar ou revisar design system, gerar paleta ou tokens — ou frases como "faz o design de", "como isso vai ficar", "protótipo", "mockup", "melhora essa tela". NÃO use para implementar UI direto em React sem protótipo aprovado, nem para lógica de negócio, backend ou refactor sem impacto visual.
---

# Protótipo de interface antes da implementação

## Por que esta skill existe

Implementar UI é caro; refazer UI implementada é mais caro ainda. Iterar em HTML+CSS
é barato. Então: **converge o desenho num protótipo descartável, depois implementa uma vez.**

O protótipo não é uma representação da interface — ele é escrito na mesma tecnologia
do produto final. Quando o desenho fecha, o CSS vai junto inteiro para o React. Não
existe passo de tradução, então não existe passo onde algo se perde.

**Regra que sustenta tudo isso:** o protótipo e o app compartilham o mesmo
`tokens.css`. Se o protótipo tem algum valor literal de cor, espaçamento ou tamanho,
essa promessa quebra e o port vira retrabalho.

---

## Fluxo

```
Fase 0  Fundações (só na primeira vez do projeto)
Fase 1  Protótipo em HTML+CSS
Fase 2  Verificação por renderização  ← obrigatória, nunca pule
Fase 3  Iteração com o usuário
Fase 4  Consolidação → plano aprovado → implementação em React
```

---

## Fase 0 — Fundações (uma vez por projeto)

Pule esta fase se `tokens.css` já existe. Nunca recrie tokens que já existem.

### 0.1 Gere a paleta programaticamente, não à mão

Cores escolhidas a olho produzem rampas com saltos irregulares de luminosidade e
contraste imprevisível. Use `scripts/generate_palette.py`: ele gera rampas em OKLCH
(perceptualmente uniforme) e **valida contraste WCAG dos pares reais de uso**.

```bash
python3 .claude/skills/ui-design-prototype/scripts/generate_palette.py
```

Regras não negociáveis:

- **A escala de luminosidade é compartilhada por todas as rampas.** `success/400` e
  `danger/400` precisam ter o mesmo peso visual, senão o estado da interface parece
  variar de importância sem motivo.
- **Contraste é verificado, não estimado.** O script lista cada par
  (texto/fundo, botão/label, borda/superfície) com sua razão e o mínimo exigido.
  **Se algo reprovar, ajuste a escala e rode de novo.** Não siga com reprovação.
- **A escada de cinzas precisa ser monotônica.** Número maior = mais escuro, sempre.
  Um `960` mais claro que um `950` é um bug que envenena todo o resto. O script checa.
- Interface escura precisa de degraus finos entre superfícies
  (base → painel → cartão → input) para separar camadas sem depender de borda.

### 0.2 Duas camadas de token, sempre

| Camada | Exemplo | Papel |
|---|---|---|
| **Primitiva** | `--neutral-900`, `--lumen-500` | Matéria-prima. **Nunca usada em componente.** |
| **Semântica** | `--color-bg-surface`, `--color-text-primary` | O que o componente consome. Sempre um alias de primitiva. |

Componente lê semântica. Só a camada semântica lê primitiva. Isso é o que permite
trocar a marca inteira mudando uma rampa.

### 0.3 Tokens de domínio

Além de bg/text/border, crie tokens para os conceitos **do produto**. É isso que
separa um design system genérico de um que serve ao app. Identifique o vocabulário do
domínio e dê token a ele. Exemplos de uma ferramenta de dev:

```
--color-status-running / waiting / error / queued / idle / stopped
--color-git-added / removed / modified / conflict / branch
--color-accent-workspace / project / worktree / session
```

Vantagem prática: quando o usuário disser "o estado *aguardando* precisa gritar mais",
existe **um** lugar para mudar.

### 0.4 Escala, calibrada por uma âncora

Escolha uma âncora concreta e derive o resto dela. Para app denso de dev, a âncora
costuma ser a altura da linha de lista (ex.: 28px); para app de conteúdo, o corpo de
texto.

- Espaçamento base 4. **Nomeie pelo valor em px** (`--space-12` = 12px): sem
  ambiguidade e sem meio-passo.
- Alturas de controle explícitas (`--size-control-sm/md/lg`), não improvisadas com padding.
- Tipografia: uma família de interface e uma monoespaçada. Em ferramenta de dev, a
  mono é cidadã de primeira classe — path, branch, id, saída de terminal, diff.
- Tracking levemente negativo em tamanhos grandes, levemente positivo em maiúsculas pequenas.

### 0.5 Saída da fase

`tokens.css` com `:root` contendo primitivas e semânticas, e — se o projeto for
TypeScript — `tokens.ts` com os mesmos nomes. Ambos gerados pelo script, nunca
escritos à mão, para não divergirem.

---

## Fase 1 — Protótipo

**Um arquivo HTML único e autocontido.** Sem build, sem dependência, sem framework.
Abre com duplo clique.

Estrutura:

```html
<style>
  /* 1. conteúdo integral de tokens.css, colado */
  /* 2. estilos do protótipo — só var(), nenhum literal */
</style>
<!-- 3. marcação das telas -->
<!-- 4. JS mínimo: só troca de tela/aba. Nada de lógica real. -->
```

### Regras de qualidade

**Nenhum valor literal.** Nada de `#1a1a1a`, `padding: 12px`, `height: 28px`.
Sempre `var(--color-bg-surface)`, `var(--space-12)`, `var(--size-control-md)`.
Exceções toleradas: valores óticos de 1–2px sem token (`translate(-1px)`), e gradientes
decorativos que referenciam primitivas.

**Dados falsos realistas.** É o que mais separa protótipo convincente de protótipo
inútil. Nada de "Lorem ipsum", "Item 1", "Foo". Use nomes, caminhos, branches, números
e mensagens plausíveis do domínio real. Inclua **um caso feio**: nome longo que trunca,
lista vazia, número grande, erro. Design que só foi testado no caso bonito quebra na
primeira semana.

**Mostre os estados, não só o estado feliz.** Se existe estado de sessão, todos
aparecem em algum lugar da tela. Carregando, vazio, erro e offline são parte do
desenho, não detalhe posterior.

**Densidade real.** Se o app é denso, o protótipo é denso. Protótipo espaçoso que vira
app apertado desperdiça a iteração inteira.

**Múltiplas telas, um arquivo.** Abas simples no topo trocando `.screen.is-active`.
Permite comparar telas lado a lado sem gerenciar arquivos.

---

## Fase 2 — Verificação (obrigatória)

**Nunca entregue protótipo sem ter olhado o pixel.** Erros de CSS não aparecem lendo o
código — aparecem na renderização.

```bash
node .claude/skills/ui-design-prototype/scripts/verify_prototype.mjs prototipo.html
```

O script faz duas coisas e ambas importam:

1. **Valida que todo `var(--x)` usado existe.** Reporta quebras. Variáveis definidas
   inline no elemento (`style="--indent:1"`) são esperadas e podem ser ignoradas.
2. **Renderiza em Chromium e salva PNG de cada tela.**

Então **leia o PNG com a ferramenta Read e inspecione de verdade.** Procure:

- texto cortado, sobreposto ou estourando o container
- espaçamento que não bate com a escala (sinal de literal esquecido)
- contraste ruim em uso real, não só na tabela
- alinhamento quebrado, scroll indevido
- elementos invisíveis por cor igual ao fundo

Corrija e re-renderize até estar limpo. **Só então mostre ao usuário.**

### Armadilhas que já custaram retrabalho

**Quebra de linha dentro de `<pre>` com filhos de bloco.** Se você tem
`<span class="linha">` com `display:block` dentro de `<pre>`, as quebras de linha do
código-fonte entre eles viram linhas vazias e o bloco renderiza com o dobro da altura.
Correção: `pre { white-space: normal }` e `.linha { white-space: pre }`.

**Screenshot de nó isolado engana.** Se o fundo escuro está num contêiner ancestral,
capturar só o filho renderiza sobre branco e texto claro some. Sempre capture o
elemento que carrega o fundo, ou a página inteira.

**Contraste chutado reprova.** Sempre que introduzir um par cor/fundo novo, rode a
verificação da Fase 0 de novo.

---

## Fase 3 — Iteração

Apresente com uma frase curta sobre o que mudou. Não descreva a tela — o usuário está
olhando para ela.

Cada rodada de feedback é **uma reescrita do arquivo, não um remendo**. Regenerar é
barato; CSS remendado acumula contradição.

Se o feedback for sobre um conceito do domínio ("estado de erro precisa gritar mais"),
mude o **token semântico**, não o componente. Se for sobre uma tela específica, mude o
estilo daquela tela.

Se o usuário pedir direções alternativas, gere as variações **na mesma página**, uma
abaixo da outra, para comparação direta. Não gere arquivos separados.

---

## Fase 4 — Consolidação e implementação

Só entre nesta fase com aprovação explícita do desenho.

**Antes de escrever qualquer código, entregue o plano e espere aprovação:**

- arquivos que serão criados e modificados
- componentes, com props e estados de cada um
- de onde vem cada dado (qual endpoint, qual hook)
- o que fica de fora desta rodada

O usuário lê, corta e corrige. Só depois implemente. Isso existe para ele saber o que
vai acontecer antes de acontecer — não é formalidade.

### O port

1. `tokens.css` vai para o app e é importado uma vez na raiz. É o mesmo arquivo, não uma cópia adaptada.
2. Cada bloco do protótipo vira um componente. A marcação e as classes vão praticamente
   inalteradas — é esse o ganho de ter prototipado na tecnologia final.
3. Dado falso é trocado por dado real. **A estrutura visual não muda nesse passo.**
   Se você sentiu vontade de mudar o layout ao portar, o protótipo não estava fechado.
4. Depois de implementado, Storybook (ou uma rota `/styleguide`) para varrer os estados
   do componente **real**. É aqui que Storybook entra — não antes, porque antes ele
   exigiria o componente que você ainda não quer escrever.

---

## Checklist antes de entregar qualquer protótipo

- [ ] `tokens.css` embutido integralmente, sem valores literais nos estilos do protótipo
- [ ] Todo `var()` resolve (script de verificação limpo)
- [ ] Renderizado, PNG lido e inspecionado de verdade
- [ ] Dados falsos plausíveis do domínio, incluindo pelo menos um caso feio
- [ ] Estados de carregamento, vazio e erro representados
- [ ] Densidade condizente com o produto
- [ ] Contraste conferido para qualquer par de cor novo
- [ ] Uma frase de apresentação, sem descrever o que está visível

## Nunca

- Implementar em React sem protótipo aprovado
- Entregar protótipo sem ter renderizado e olhado
- Escrever valor de cor ou espaçamento fora de `tokens.css`
- Usar primitiva direto em componente, pulando a camada semântica
- Seguir com contraste reprovado
- Usar Lorem ipsum ou "Item 1"
- Remendar CSS acumulando exceções em vez de regenerar
