# Briefing de desenho — o quadro

> **O desenho é feito no Open Design**, projeto `lumem-os`
> ([ADR](../../adr/2026-08-19-2247-design-is-made-in-open-design.md)). Este arquivo **não é desenho**:
> é o que entra na sessão de desenho — quais quadros, o que cada um tem que provar, e as três medidas
> que só o navegador responde. Escrito em 2026-09-11, com as 33 perguntas da
> [PRD](prd.md) respondidas.
>
> **A sessão aconteceu no mesmo dia.** O que saiu dela está no `lumem-board.html` e no
> `lumem-agents.html`, e o resumo — as três medidas com número, o que mudou e as quatro perguntas
> novas — está no [§10 da PRD](prd.md#10-o-desenho-e-o-que-ele-mediu). **Este arquivo fica como
> está**: ele é o que foi pedido, e comparar o pedido com o resultado é metade do valor dele. Os três
> lugares em que o desenho contrariou o briefing estão marcados abaixo.

## 1. Arquivos

| Arquivo no Open Design | O quê |
|---|---|
| `lumem-board.html` + `lumem-board.css` | **novo.** O quadro, o cartão, os estados e o detalhe da tarefa |
| `lumem-agents.html` + `lumem-agents.css` | **novo.** O catálogo de agentes nomeados, os três encaixes por projeto, o interruptor de autonomia e o orçamento |
| `lumem-worktree-from.html` | **edição.** A primeira aba da worktree passa a dizer para qual tarefa ela existe — **não foi feito:** depende de a `022` criar a entidade tarefa, e desenhar contra um modelo que não existe é desenhar duas vezes |
| `lumem-ds.css` | **edição.** O que for de componente — o cartão e o selo — nasce aqui, não na folha da tela — **não foi feito:** `.tcard`, `.seal` e `.col` nasceram em `lumem-board.css`, porque promover ao sistema antes de o sistema saber que está certo é como um design system apodrece, e a medida 3.1 quase derrubou a forma do cartão. Sobem quando o desenho for aprovado |

## 2. Os quadros de `lumem-board.html`

Numerados no padrão da casa (`N · título`), e cada um existe para **provar** uma coisa:

| # | Quadro | O que ele prova |
|---|---|---|
| 1 | o quadro cheio, 7 colunas, `Done` recolhida | **a densidade.** É a medida 3.1, e ela pode derrubar a forma |
| 2 | anatomia do cartão, e os **quatro estados do selo** — `aguardando <papel>`, `<papel> trabalhando há Xm`, `bloqueada: <motivo>`, `pausada até ~HH:MM` | que o selo se lê **sem abrir**, que é a aposta do §4.1 da PRD. **São cinco, e o texto do segundo não cabia:** falta `manual — ninguém pega`, que é o default do produto, e `<papel> trabalhando há Xm` pede 168px numa caixa de 152 — virou `revisando há 2 min`, porque o papel já está no cabeçalho da coluna. Isso abriu a [Q34](open-questions.md#q34--o-encaixe-se-chama-executor-ou-implementador) |
| 3 | encalhe: âmbar e vermelho, mais o filtro **"precisa de mim"** | que o custo de não ter sub-colunas está pago |
| 4 | bloqueada nas quatro razões: decisão de domínio · orçamento · reprovada no teste · tracker mudou | que "precisa de mim" **diz do quê** em uma frase |
| 5 | o detalhe da tarefa: corpo, **os três pareceres em ordem**, sessões, custo, worktree, PR, link do tracker | que a esteira deixa rastro legível — é onde se entende o que os três agentes fizeram |
| 6 | a triagem: proposta de agente (UC8) e tarefa vinda do tracker | que ela cabe ao lado da inbox de memória sem inventar uma terceira linguagem |
| 7 | o quadro vazio, e o quadro com a autonomia **desligada** | que o default (`manual`) **ensina** em vez de parecer quebrado |
| 8 | o quadro ao voltar: *"o que aconteceu enquanto você não estava"*, com o que ficou parado e há quanto tempo | a resposta da Q17 — silêncio é o único resultado inaceitável |

## 3. As três medidas que o desenho tem que responder

Medir no navegador, como a `026` e a `021` fizeram — número, não opinião.

### 3.1 Sete colunas cabem?

A coluna do meio já tem a sidebar à esquerda (263px medidos na `second-agent`). Se a largura mínima
de coluna for 240px, sete somam 1680px **antes** da sidebar. Três saídas, e o desenho escolhe com a
tela na frente:

- `Done` recolhida por default (decidido) — sobram seis;
- coluna mais estreita, e aí o cartão perde a linha viva ou o custo;
- rolagem horizontal, que é a saída que faz o quadro deixar de ser *"uma olhada de cinco segundos"*.

> **Medido: nenhuma das três.** O piso da coluna é **200px**, não 240 — e com 200 as sete pedem
> **1746px de janela**, *pior* que a conta deste parágrafo. A saída que o desenho achou é uma quarta:
> **as duas pontas recolhem**, e o motivo não é espaço — `Backlog` e `Done` são as duas únicas
> colunas sem linha viva e sem relógio. Em 1440 o default são **cinco colunas e dois trilhos**
> (mínimo 1418px). Abaixo disso não há saída boa, e isso virou a
> [Q37](open-questions.md#q37--abaixo-de-1418px-o-que-o-quadro-faz).

### 3.2 Quantos cartões cabem numa coluna sem rolar?

O cartão carrega projeto, selo, linha viva, custo, `● #87` e tempo na coluna. **Se couberem menos de
quatro, o cartão tem item demais** — e o primeiro a sair é o que se lê no detalhe.

### 3.3 O selo grita o suficiente?

É o custo aceito na [Q30](open-questions.md#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo): um
selo se vê menos que uma coluna. Desenhar lado a lado o quadro com três cartões `aguardando` e com
três `trabalhando`, e perguntar de longe qual é qual. Se não der para dizer, o âmbar de 30 min entra
mais cedo.

## 4. O que os quadros de `lumem-agents.html` precisam dizer

1. **o catálogo**: agente nomeado = nome, adaptador, modelo, instrução, faixa de permissão,
   orçamento. Um `revisor-so-leitura` tem que **parecer** incapaz de escrever, não instruído a não
   escrever;
2. **os três encaixes por projeto**, com a cascata visível — *"este projeto usa o revisor do
   workspace"* contra *"este projeto usa `revisor-severo`"*;
3. **o interruptor de autonomia** (`manual` · `assistido` · `autônomo`) junto do orçamento, porque a
   tela onde se liga é a tela onde se entende o que se está ligando;
4. **as três faixas de permissão** ([Q25](open-questions.md#q25--qual-é-a-borda-da-permissividade)), com
   a terceira — escrita no host remoto — dizendo em texto o que ela permite. Não é item de lista com
   caixinha.

## 5. Regras da casa que valem aqui

- só `var(--token)`: nenhum literal de cor, espaço ou tipografia;
- token novo nasce **no Open Design**, e o `gate:quick` confere os pares de contraste deste lado;
- toda tela precisa do estado *"o daemon não responde"* e do *"isso morreu enquanto você não
  olhava"* — e neste quadro o segundo é literal: o selo volta de `revisando` para `aguardando`
  sozinho quando a sessão morre;
- o que for componente (cartão, selo, coluna) mora em `lumem-ds.css`; o que for só desta tela, na
  folha dela.
