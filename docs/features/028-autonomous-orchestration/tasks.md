# O orquestrador autônomo — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) ·
**Briefing de desenho:** [design-brief.md](design-brief.md) ·
**Medições:** [orchestration-measurements.md](../../project/orchestration-measurements.md)

**Status:** em execução
**Histórico:** **as 12 tasks das 5 fases estão entregues** (2026-09-12) — e este arquivo cobre **só a
Parte 1**. O corte é decisão registrada: das seis
partes do §6, este arquivo executa **uma** — o quadro lendo a
[`022`](../022-workspace-tasks/prd.md), com a autonomia desligada. A esteira (Parte 2), o orçamento (Parte 3), a
supervisão (Parte 4) e as duas pontas do tracker (Parte 5, Parte 6) ficam para um `tasks.md` seguinte, e o §0 diz
por quê. A fase 0 está **entregue**: o desenho sincronizado e o estudo do §11 escrito, e ele mudou
duas coisas antes de existir código.

A ordem tem uma regra: **o modelo antes da leitura, a leitura antes da tela** — e a tela por último
porque é a mais barata de refazer e a única represada pelo Open Design, que desta vez já entregou.

> **Por que `em execução` com as 12 entregues.** A gramática do
> [`025`](../025-docs-contract/prd.md) tem quatro valores — `proposta`, `em execução`, `completa`,
> `superada por` — e o `gate:full` cobra que a PRD e o `tasks.md` **concordem**. Esta é a primeira
> feature cuja PRD é fatiada em mais de um `tasks.md`: a Parte 1 fechou, e a Parte 2 a Parte 6 nem começaram.
> `completa` aqui obrigaria a PRD a dizer `completa` também, o que seria afirmar que a esteira existe.
>
> **O estado da fatia mora no §Histórico e nos `Status:` de cada task**, que é onde ele é verificável.
> Isso é uma lacuna da gramática, não uma folga: ela não sabe dizer *"esta lista acabou, a PRD
> não"*. Anotada no [backlog](../../project/backlog.md).

---

## 0. Por que só a Parte 1

A `028` inteira é a maior feature do repositório: quadro, esteira, orçamento, supervisão, entrada de
tracker e escrita no tracker. Três coisas decidiram cortá-la aqui:

1. **O §11 da PRD guardou nove conversas técnicas, e seis continuam guardadas.** O
   [estudo](../../project/orchestration-measurements.md) mediu três. Duas das que sobraram — de onde
   vem o segredo do tracker, e o que passa de uma sessão para outra — **não têm resposta, e uma delas
   exige ADR novo** porque contradiz o [ADR de
   2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). Escrever tasks de Parte 5 e
   Parte 6 agora seria escrever contra um vazio.
2. **A Parte 1 não depende de nenhuma delas.** O quadro lê a `022`, que está entregue. Com a autonomia
   desligada — que é o **default do produto** — ele desenha o estado real do workspace sem uma linha
   de esteira.
3. **O desenho já mediu que o quadro é a feature** (§2 da PRD). Ter a tela antes da autonomia é a
   ordem certa: sem um lugar que responda *"o que está acontecendo"*, autonomia é uma forma de
   descobrir o problema tarde.

**O que a Parte 1 entrega:** o quadro, com o cartão, o selo, o arrasto, os filtros e o piso de largura. O
selo nasce quase sempre em `manual — ninguém pega`, e é exatamente por isso que ele precisa existir —
sem ele, um quadro com a autonomia desligada desenha o mesmo pixel de uma esteira travada (§10.2 da
PRD).

**O que a Parte 1 não entrega:** ninguém pega nada sozinho. Nenhuma seta é movida pela máquina, exceto a
que já é movida hoje — `open` → `in_progress`, derivada do primeiro prompt.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `packages/web/src/styles/tokens.css`, `tokens.ts` | **já sincronizados** (T2) — `--size-board-col: 200px` e `--size-board-rail: 36px` |
| `packages/web/prototype/lumem-board.*`, `lumem-agents.*`, `lumem-tasks.*` | **já sincronizados** (T2), 19 quadros |
| `packages/server/src/db/schema.ts` | dois estados novos no CHECK do `task.status`, a fronteira `backlog`, e a coluna de ordem |
| `packages/server/src/repositories/task.ts` | o que cada ator pode escrever, com os estados novos |
| `packages/server/src/routers/task.ts` | a leitura do quadro, e o `move` |
| `packages/web/src/components/` | `Board`, `BoardColumn`, `TaskCard`, `TaskSeal` |
| `packages/shared/src/` | o contrato do cartão |
| `e2e/` | a spec do quadro |

**O que não muda** — cada um com o motivo:

| Não muda | Por quê |
|---|---|
| a derivação de `in_progress` | `tasks/progress.ts:56` continua sendo `WHERE status = 'open'`. A [T4](#t4-quem-escreve-cada-estado-do-quadro) não mexe nela — só **cobre com teste** que ela não atropela o que você pôs à mão |
| a fila de **Propostas** | é da [`022`](../022-workspace-tasks/prd.md) (T4), e o §10.4 da PRD registra que a superfície é de lá. `proposed` **não é coluna do quadro** |
| `dropped` sai do quadro | §6, Parte 1 — vira arquivo, não sétima coluna |
| o Lumem não guarda segredo | o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). Sem Parte 5, nada aqui encosta em tracker |
| `PrCache` e `IssueCache` | o `● #87` do cartão lê o cache que a [`013`](../013-pull-request-status/prd.md) já mantém. Zero processo novo |

---

## Fase 0 — desenho e medida · **entregue**

#### T1: O estudo que o §11 pedia

**What**: medir, deste repositório e desta máquina, as três conversas do §11 que tinham o que medir —
o que o fim do turno informa, de onde o evento externo pode vir, e o que já existe de esteira.
**Where**: [`docs/project/orchestration-measurements.md`](../../project/orchestration-measurements.md),
mais a linha no [índice](../../README.md)
**Done when**: o arquivo tem os números com procedência, diz o que **não** mediu e por quê, e nomeia
o que muda por causa deles.
**Gate**: nenhum — não toca código
**Status**: ✅ entregue — e mudou **duas** coisas antes de existir código:

> **(a) O §4.1 da PRD deixou de ser cautela e virou restrição dura.** O `StopReason` do ACP tem cinco
> valores e nenhum é *"estou esperando você"*: dos **13 `end_turn`** gravados neste repositório,
> **4 significaram "terminei"** — 31%. Quatro eram pergunta, dois eram espera sem interrogação, e
> **três eram o turno morrendo no meio do trabalho** (*"4 failures. Let me see them:"*). A heurística
> do ponto de interrogação pega 4 dos 9 que não terminaram: **44% de recall**, errando no caso caro.
> Nenhuma seta do quadro pode depender do transporte — e isso vale para a Parte 2, não para a Parte 1, que não
> move seta nenhuma.
>
> **(b) O modelo da `022` não comporta o quadro.** Sete colunas contra quatro estados úteis: faltam
> `testing` e `ready_to_merge`, e `Backlog`/`To-Do` colapsariam no mesmo `open` — apagando
> exatamente a fronteira de autorização que a coluna existe para marcar. É a [T3](#t3-o-modelo-ganha-as-colunas-que-faltam).
>
> De brinde, **7 dos 15 transcripts não têm nenhum turno** — sessão aberta que nunca recebeu prompt.
> É o que o selo desenharia errado se fosse derivado de *"existe processo"* em vez de *"existe turno
> em voo"*.

#### T2: O desenho entra no repositório

**What**: `pnpm --filter @lumem/web design:sync`, trazendo os dois tokens novos, o `tokens.ts`
re-derivado e os seis arquivos de protótipo.
**Where**: `packages/web/src/styles/`, `packages/web/prototype/`
**Done when**: `design:sync --check` sai limpo, e `gate:quick` continua verde — os 119 pares de
contraste incluídos.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — 8 arquivos, **nenhum deles de cor**: os dois tokens novos são
de tamanho, então a verificação de contraste não tinha o que reprovar. `lumem-tasks.*` veio junto
porque o `lumem-board.html` linka a folha da `022` desde que a cópia `.tri` foi apagada (§10.4).

---

## Fase 1 — o modelo comporta o quadro · **entregue**

#### T3: O modelo ganha as colunas que faltam

**What**: `task.status` passa a aceitar `backlog`, `testing` e `ready_to_merge`. `backlog` é o estado
novo de **entrada**, e `open` continua sendo a To-Do — a fila autorizada. Migração `drizzle-kit`,
conferida à mão.
**Where**: `packages/server/src/db/schema.ts`, `repositories/task.ts`, a migração
**Done when**: as sete colunas do §4 têm um estado cada; nenhuma tarefa existente muda de coluna (toda
`open` de hoje continua na To-Do, **não** vai para o Backlog); e o CHECK recusa um oitavo valor.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — e a armadilha **não** mordeu: os três estrangeiros, os dois
índices e os quatro CHECKs sobreviveram à recriação. Quatro casos de migração cobrem isso, incluindo
apagar tarefa **anular** o ponteiro da sessão em vez de recusar, que é o defeito exato da `022`.

> **A migração é a armadilha desta fase, e ela já mordeu uma vez.** A fase 1 da
> [`022`](../022-workspace-tasks/prd.md) achou uma migração que o `drizzle-kit` gerou **sem a ação do
> estrangeiro**. Leia o SQL gerado antes de rodar: um CHECK novo em SQLite é tabela recriada, e tabela
> recriada é onde FK e índice desaparecem em silêncio.
>
> **E `backlog` é estado novo, não renomeação.** Colapsar as duas pontas seria o defeito que o T1
> mediu: a To-Do é onde mora a autorização (§4 da PRD), e uma tarefa que chega no Backlog não é
> trabalho autorizado.

#### T4: Quem escreve cada estado do quadro

**What**: fechar quem pode escrever os três estados novos, e **cobrir com teste** a propriedade que
faz o arrasto do §4 funcionar — só o agente tem allowlist; você não tem.
**Where**: `packages/server/src/repositories/task.ts`, `routers/task.test.ts`
**Done when**: um agente é recusado em `backlog`, `testing` e `ready_to_merge`, e continua podendo
dizer `review`; **você move para qualquer uma das sete, `in_progress` incluído**; e a derivação não
atropela o que você pôs à mão.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — cinco casos, todos verdes ao nascer, e por isso conferidos por
mutação em vez de acreditados.

> **Nenhum dos cinco casos nasceu vermelho, e é isso que a task é.** O comportamento já estava certo
> — `AGENT_MAY_SET` é a **única** lista, então tudo que não é do agente passa pelo seu caminho — e
> **nada o cobria**. Era verdadeiro por acidente, e a primeira pessoa a "arrumar" o guard o quebraria
> sem nada ficar vermelho. Os cinco foram conferidos por mutação: alargar a allowlist do agente
> derruba dois, bloquear `in_progress` no caminho humano derruba um.
>
> **A [Q38](open-questions.md#q38--arrastar-para-in-progress-se-ele-é-derivado) registra que eu li
> isso errado duas vezes** — primeiro a proposta, depois a premissa. O que ela produziu de útil não
> foi código: foi a [Q40](open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão)
> e o comentário da `022`, que descrevia intenção e era lido como mecanismo.

#### T5: Arrastar, e a ordem dentro da coluna

**What**: a coluna de ordem (`position`), porque **a posição na coluna é a prioridade e não existe
campo de prioridade** (§4.3) — e hoje não existe coluna nenhuma que guarde ordem. Mais o arrasto,
para as sete colunas.
**Where**: `packages/server/src/db/schema.ts`, `repositories/task.ts`, `routers/task.ts`
**Done when**: reordenar dentro de uma coluna persiste e sobrevive a recarregar; mover entre colunas
escreve o estado **e** a posição na mesma transação; **arrastar para `In Progress` funciona** e o
cartão fica com o selo `manual — ninguém pega`; e nenhum caminho de agente move coluna.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — e ela custou uma decisão que não estava escrita: **`move` é
procedure própria, não um `setStatus` com um campo a mais.** As duas respondem perguntas diferentes —
*"em que etapa isto está"* contra *"onde eu soltei"* —, e uma só teria que fingir que `index` é
opcional em metade das chamadas. O portão que as duas compartilham foi extraído, porque a regra em
dois lugares é duas regras, e a segunda a divergir seria a do arrasto.
>
> Duas coisas mecânicas que o código cobrou: transação em `better-sqlite3` é **síncrona** (ela recusa
> callback que devolve promessa), e o backfill da migração é **escrito à mão** — o `drizzle-kit` só
> sabe o `DEFAULT`, e com todas as linhas em zero a coluna nasceria na ordem que o SQLite escolhesse.
>
> Ordinal contíguo, e não aritmética de ponto médio: a coluna tem dezenas de cartões, e o preço do
> ponto médio é um rebalanceamento que vence depois e em silêncio.

> **A restrição é só de mão única** (§4): você move para qualquer uma das sete, a máquina nunca move
> para as suas. Não há coluna com exceção — a [Q38](open-questions.md#q38--arrastar-para-in-progress-se-ele-é-derivado)
> chegou propondo que `In Progress` fosse uma, e a proposta estava errada; o escritor que faltava é a
> [T4](#t4-quem-escreve-cada-estado-do-quadro).

---

## Fase 2 — a leitura · **entregue**

#### T6: A consulta do quadro

**What**: uma leitura que devolve todas as tarefas do workspace agrupadas pelas sete colunas, com
tudo que o cartão do §4.2 lê sem abrir: projeto, worktree, custo até aqui, `● #87` com a cor do CI,
há quanto tempo está nesta coluna, e de onde veio.
**Where**: `packages/server/src/repositories/task.ts`, `routers/task.ts`, `packages/shared/src/`
**Done when**: uma chamada serve o quadro inteiro — **não uma por coluna** —, o custo vem do
`session_usage` somado por tarefa (a `022` já o liga), o estado da PR vem do `PrCache` sem disparar
processo novo, e um workspace com zero tarefa devolve sete colunas vazias em vez de erro.
**Gate**: `pnpm gate:quick`

#### T7: O selo, derivado

**What**: os **cinco** estados do §4.1 — `manual — ninguém pega` · `aguardando <papel>` ·
`<verbo> há Xm` · `bloqueada: <motivo>` · `pausada até ~HH:MM` — calculados na leitura, nunca
guardados.
**Where**: `packages/server/src/tasks/`, `packages/shared/src/`
**Done when**: com a autonomia desligada toda tarefa sem sessão viva diz `manual — ninguém pega`; uma
tarefa com sessão viva e turno em voo diz o verbo com os minutos; **matar a sessão faz o selo voltar
na próxima leitura, sem nenhuma escrita**; e o selo guarda o **verbo** (`implementando`, `revisando`,
`testando`) e devolve o substantivo só quando está esperando.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — `sealOf` é **função pura**, e é isso que torna os cinco estados
testáveis sem subir agente.

> **A medição da fase 0 decidiu o critério.** O selo é derivado de **turno em voo**, não de processo
> vivo: 7 dos 15 transcripts deste repositório nunca receberam um prompt, e cada um deles pintaria
> `implementando há 3 h` se o critério fosse *"existe sessão"*. O `AcpManager` ganhou
> `turnStartedAt` e `liveTurns()` por causa disso.
>
> **O par que o §12 pede está provado**, e é o teste de que ele é derivado: o turno some da lista e o
> selo volta para `manual` na leitura seguinte, **sem nenhuma escrita**. Conferido por mutação —
> tirar o curto-circuito do `manual` derruba dois casos.
>
> Duas decisões pequenas com motivo escrito: com dois turnos na mesma tarefa o relógio conta do
> **mais antigo** (contar do mais recente faria ele andar para trás), e numa coluna **sem papel** —
> você assumiu o volante em `ready_to_merge` — o selo é `working` com `role: null`, porque inventar
> um quarto papel seria inventar um quarto encaixe, que o §6 tirou de escopo.

> **O teste de que ele é derivado é o teste de que ninguém o escreveu.** É o mesmo par de casos que o
> §12 da PRD pede, e o único dos dois que a Parte 1 alcança.
>
> **E "sessão viva" não é "processo vivo".** A T1 mediu: 7 dos 15 transcripts não têm um único turno.
> Uma sessão aberta e nunca usada desenharia `implementando há 3 h` se o critério fosse o processo.

---

## Fase 3 — a tela · **entregue**

#### T8: As colunas, e o piso de largura

**What**: o quadro na tela do workspace. Coluna de **200px** (`--size-board-col`), trilho de **36**
(`--size-board-rail`), `Backlog` e `Done` recolhidos por padrão — **cinco colunas e dois trilhos**, o
default medido em 1440.
**Where**: `packages/web/src/components/Board/`
**Done when**: bate com `lumem-board.html`; cinco cartões cabem numa coluna de 682px sem rolar, quatro
quando todos têm linha viva; e **nenhum literal de cor, espaço ou tipografia** — só `var(--token)`.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12), com **três defeitos achados no navegador** e nenhum deles visível
lendo o código.

> **O `board.css` é recorte, e recorte deixa órfão.** O `board-css.test.ts` achou **13 classes**
> portadas para marcação que não existe deste lado — a linha viva, a pergunta que travou, o
> `aguardando você`. Cada uma volta com a fase que a pinta. É o defeito mais silencioso que existe em
> CSS, e a única coisa que o pega é a direção contrária do teste.
>
> **A coluna colapsava na altura do conteúdo.** Medido: 356px de coluna dentro de 1282 de painel. O
> `.pane` do produto é **grade**, não coluna flex — então o `flex: 1` do `.bd` não valia nada, e o
> `align-content: start` do `.wsp` anulava o `1fr`. Sem isso `.col__body` nunca rola, quem rola é a
> página, e a medida *"cinco cartões sem rolar"* deixa de querer dizer alguma coisa.
>
> E a conta do desenho **reproduziu**: a faixa de colunas pede **1152px**, mais os 264 fixos da
> sidebar dão **1416** contra os 1418 medidos no Open Design.

#### T9: Abaixo de 1418px, o quadro diz que está rolando

**What**: rolagem horizontal com a faixa *"2 colunas fora da tela"*, em vez de fingir que cabe
([Q37](open-questions.md)).
**Where**: `packages/web/src/components/Board/`
**Done when**: em 1418 as cinco colunas e os dois trilhos cabem sem faixa; em 1200 a faixa aparece com
o número certo; e **encolher a coluna abaixo de 200 não é a saída** — o título vira três linhas e a
linha viva perde o nome do arquivo.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — e ela **mudou de critério** durante a implementação.

> **A janela não é o que decide.** A medida do desenho é de janela (1418px), e eu escrevi
> `window.innerWidth` atrás dela. Errado: a sidebar recolhe e o painel direito abre, e nos dois casos
> o quadro muda de largura com a janela parada — o aviso ficaria calado justo no caso em que a coluna
> sumiu por causa de outra coisa que **você** abriu. A faixa passou a derivar do transbordo da própria
> faixa de colunas, que é o mesmo raciocínio do selo e do relógio de encalhe.
>
> **E medir a caixa não basta.** O `ResizeObserver` vê a caixa da faixa, e na primeira pintura ela
> está vazia — a consulta não voltou. Quando os cartões chegam, quem muda é o **conteúdo**: a caixa
> fica igual, o observador não dispara, e a faixa nunca aparece. Medido no navegador: 836px de espaço
> para 1152 de colunas, **sem aviso nenhum**. Pior: nesta máquina o `ResizeObserver` não entregou uma
> única notificação em nenhum dos dois sentidos, e a faixa ficava **acesa** com
> `scrollWidth === clientWidth`. A medida repete a cada pintura, mais o `resize` da janela — que é o
> único caminho que não passa pelo React.

> **Este é o primeiro requisito de largura mínima do produto.** Ele existe porque o quadro é a
> primeira tela que precisa mostrar sete coisas ao mesmo tempo, e os três números — 1418, 1582, 1746 —
> são busca binária no navegador, não aritmética.

#### T10: O cartão e o selo, na tela

**What**: o cartão do §4.2, a barra de 2px carregando **um eixo só** (o selo), o encalhe no relógio do
rodapé, a agregação no ponto do cabeçalho da coluna. Origem é **glifo**, não cor: `◆` agente,
`↗` tracker, `◈` memória.
**Where**: `packages/web/src/components/Board/TaskCard.tsx`, `TaskSeal.tsx`
**Done when**: `aguardando implementador` cabe nos **151px** da caixa — ele mede **148**, com 3px de
folga —; o cartão bloqueado não pinta uma fatia de quarta linha; e `aguardando você` é **luminância**
(branco), não matiz, distinto do vermelho de *"algo deu errado"*.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — **parcial no que a Parte 1 não alcança**, e a nota diz o quê.

> O cartão, o selo e os cinco estados estão de pé, com os limiares de encalhe do §6, Parte 1 e a origem
> como **glifo** (`◆` agente, `↗` tracker). O que **não** entrou: `aguardando você` e o cartão
> bloqueado com a pergunta — os dois pedem a supervisão (Parte 4), que não é desta fatia, e as classes
> deles saíram do `board.css` em vez de ficarem esperando marcação que não existe.
>
> **A linha viva também não entrou**, e ela é do §4.2: *"o que ele está fazendo neste momento"* pede a
> chamada de ferramenta aberta, que só existe com a esteira andando.

> **Os 3px são o teste.** Sem um caso que os cobre, alguém engorda o ponto do selo e quebra a linha
> sem que nada fique vermelho — que é o que aconteceu com o menu recortado da
> [`023`](../023-composer-menus/prd.md) por três features seguidas.

#### T11: Os filtros, e o que é a visão mais usada

**What**: filtro por projeto, por agente e por **"precisa de mim"** — que é provavelmente a visão mais
usada do produto (§4).
**Where**: `packages/web/src/components/Board/`
**Done when**: *"precisa de mim"* devolve exatamente os cartões cujo selo é `aguardando você` ou
`bloqueada`; os três filtros compõem; e a escolha sobrevive a recarregar.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-12) — com o `Done when` **emendado**, e a emenda fica aqui.

> O critério escrito era *"selo `aguardando você` ou `bloqueada`"*, e ele é curto demais: com a
> autonomia desligada **nenhum** cartão tem esses dois selos, então o filtro mais usado do produto
> devolveria zero em todo quadro que a Parte 1 desenha. O que ele filtra é a frase do desenho — *"o que só
> existe porque você existe"*: o bloqueio, **o encalhe**, e **a sua vez** (as colunas que você move).
>
> O filtro por projeto e por agente ficou de fora: projeto já tem o seu na lista da `022`, e agente
> **não existe no cartão** enquanto a esteira não atribuir um.

---

> **Lacuna desta fase, achada executando-a: nenhuma T8–T11 entrega o arrasto.** A Parte 1 promete *"o
> quadro, com o cartão, o selo, **o arrasto**, os filtros e o piso de largura"*, a T5 entregou o
> `move` do lado do daemon, e a T12 testa arrastar — mas a fase da tela não tinha task para ele. Foi
> entregue junto da T10, com `draggable` do HTML5 e não uma biblioteca: o gesto é soltar um cartão
> numa lista, e a parte difícil — onde soltou vira índice — é do daemon, que renumera a coluna numa
> transação. **E não é otimista:** pintar a ordem antes da resposta seria desenhar um palpite sobre a
> única coisa desta tela que tem dono.

---

## Fase 4 — o portão · **entregue**

#### T12: O e2e do quadro

**What**: a spec que prova o que a Parte 1 entrega, com **zero token** — nenhum agente real sobe.
**Where**: `e2e/`
**Done when**: quatro caminhos passam —
**(a)** um workspace com tarefas nos sete estados desenha sete colunas, com as duas pontas
recolhidas; **(b)** arrastar entre colunas persiste a coluna e a ordem, e arrastar para `In Progress`
**funciona** — o cartão fica com o selo `manual — ninguém pega`; **(c)** abrir uma sessão ligada a uma tarefa `open` move o cartão
para `In Progress` **e acende o selo**, e matar a sessão apaga o selo sem mover o cartão de volta;
**(d)** em 1200px a faixa de rolagem aparece dizendo quantas colunas ficaram fora.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue (2026-09-12) — `e2e/board.spec.ts`, **quatro casos, zero token**, e os quatro
conferidos por mutação em vez de acreditados: guardar o selo em vez de derivá-lo derruba o (c);
fazer a faixa nunca zerar derruba o (d).

> **A janela do turno em voo é o pedido de permissão.** O agente falso para ali e espera, então o
> selo fica estável o bastante para ser lido — sem isso, um turno que abre e fecha em milissegundos
> não é observável, e o caso viraria um `sleep` disfarçado.
>
> Três coisas que o e2e cobrou e nenhuma era do quadro: **`e2e` só é botão na migalha** (sem projeto
> aberto o workspace é um `combobox` na sidebar, e clicar numa opção de `select` não é clicar num
> botão); a conversa mora na **worktree** e é a **segunda** aba, porque a primeira é o checkout
> (`018`); e a suíte compartilha daemon, então *"três na To-Do"* vira quatro sem ninguém ter feito
> nada — daí o `clearBoard` no `beforeEach`, com as duas portas, porque `remove` recusa tarefa que
> teve sessão e `dropped` sai do quadro.

> **O (c) é o que paga por esta fase.** Ele prova as duas metades da T7 de uma vez: o cartão se move
> por fato derivado, e o selo **volta sozinho na leitura seguinte** sem ninguém ter escrito nada.
>
> **E o (d) pergunta `document.elementFromPoint`, não `toBeVisible`** — a lição da
> [`023`](../023-composer-menus/prd.md): contra um elemento recortado por ancestral, o segundo fica
> verde.

---

## Parte 3 — Orçamento e limites

> **Aberta em 2026-09-13**, e ela vem **antes** da Parte 2 (a esteira), invertendo a ordem que o §6
> sugere. O motivo é a [Q43](open-questions.md#q43--qual-dos-cinco-modos-do-claude-é-o-automático),
> medida: dos cinco modos do Claude, **só `bypassPermissions` fecha o laço** — e ele é o único que
> **nunca pergunta**. Então a segurança da esteira não pode vir do modo de permissão; tem que vir do
> CI, do orçamento e do teto de turnos. **Ligar a autonomia antes de ter o teto de pé é ligar a
> autonomia sem freio.**

**O que esta fatia entrega:** os tetos do **workspace** — custo por tarefa, custo por dia, turnos por
sessão — cobrados sobre a sessão que **existe hoje**, aquela que você abre com a mão. Mais a
`pausada` por limite de taxa, e o bloqueio que **nomeia qual teto segurou**.

**O que ela não entrega, e por quê:**

| Fora | Por quê |
|---|---|
| teto de tarefas **em paralelo** | conta tarefas que a esteira pegou, e nada pega. É da Parte 2 |
| teto de **duas voltas** da esteira | idem — não existe volta sem esteira |
| teto **por agente** ([Q33](open-questions.md#q33--agentes-nomeados-e-papel-por-projeto)) | o agente nomeado com papel é o *encaixe* do §5, que é da Parte 2. Sobra o teto do workspace, e o bloqueio já nomeia qual dos dois é |

---

### Fase 5 — o que dá para cobrar · **entregue**

> A numeração de fases **continua** em vez de reiniciar, e isso é decisão: duas fases 1 no mesmo
> arquivo seriam a mesma armadilha que *parte × fase* acabou de produzir. Fase é única no documento;
> parte é o agrupamento.

#### T13: O que cada adaptador relata sobre dinheiro

**What**: responder, antes de escrever qualquer teto, em que **unidade** ele pode ser cobrado — e a
resposta já existe medida, sem gastar nada.
**Where**: nenhum arquivo de produto; a conclusão vai para a PRD e para as perguntas
**Done when**: a unidade do teto está escolhida com o motivo, e a pergunta que ela abre está no
arquivo de perguntas.
**Gate**: nenhum — não toca código
**Status**: ✅ entregue (2026-09-13) — e o achado muda o desenho antes de existir código:

> **Um teto em dinheiro não é cobrável contra todo adaptador.** A [fase 0 da
> `021`](../021-second-agent/prd.md) mediu que o Codex atravessa um turno inteiro com **`cost: null`**
> — ele não relata dinheiro. O Claude relata: a [medição da
> Q39](../../project/orchestration-measurements.md) somou **US$ 0,2461** em cinco turnos de Haiku e
> **US$ 2,2140** em cinco de Opus.
>
> **O que todo adaptador relata é token e turno**, e isso está no contrato: no evento `usage`,
> `used` e `size` são **obrigatórios** (`acp-protocol.ts:361`) e só `cost` é `nullish`. O `turn_end`
> chega sempre.
>
> Então o teto tem **duas unidades, e não uma**: dinheiro quando o agente informa, e token ou turno
> como o chão que sempre existe. Um produto que só soubesse cobrar em dólar teria um workspace com o
> Codex rodando **sem teto nenhum** e sem nada na tela dizendo isso —, que é a pior forma de um limite
> falhar. Daí sai a [Q44](open-questions.md#q44--o-teto-tem-duas-unidades-qual-delas-a-tela-mostra).

---

### Fase 6 — o modelo do teto · **entregue**

#### T14: Onde os tetos moram

**What**: os tetos do workspace no banco — custo por tarefa, custo por dia, turnos por sessão —, com
`null` querendo dizer **sem teto** e não zero.
**Where**: `packages/server/src/db/schema.ts`, a migração, `repositories/workspace.ts`
**Done when**: um workspace criado antes desta migração acorda **sem teto**, e não com um teto
inventado; `0` e `null` são distinguíveis e querem dizer coisas diferentes (`0` bloqueia tudo,
`null` não bloqueia nada).
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13) — e a armadilha da fase **mordeu**, exatamente onde o
`migrations.test.ts` avisa que ela mora.

> **O `drizzle-kit` gerou o `SELECT` com as colunas da tabela nova, lendo da velha:**
> `SELECT "budget_cost_per_task" FROM workspace` num banco onde essa coluna, por definição, ainda não
> existe. É o mesmo defeito que o `0001` pagou, e nenhum teste que começa de um banco vazio o pega —
> porque num banco vazio não há linha para copiar. A lista foi reescrita à mão, e o caso foi
> conferido **ficando vermelho de propósito**: com o SQL gerado, os quatro falham com
> `no such column: "budget_cost_per_task"`.

> **A armadilha é o default.** Um teto que nasce valendo é um produto que passa a recusar trabalho
> num `pnpm dev` de alguém que nunca pediu teto nenhum — e o §6 da PRD já diz que os três
> interruptores que gastam token **vêm desligados**. `null` é a única forma de a migração não mudar
> o comportamento de ninguém.

#### T15: O contador, e ele lê do que já existe

**What**: quanto esta tarefa já gastou, quanto este workspace gastou hoje, e quantos turnos esta
sessão teve — sem tabela nova.
**Where**: `packages/server/src/usage/query.ts`
**Done when**: os três números saem de `session_usage` e de `turn_end`, o de tarefa reusa o
`usageByTask` que a Parte 1 já estendeu com `"all"`, e o de dia reusa a janela `1d` que a
[`010`](../010-workspace-screen/prd.md) já resolve **no daemon**.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13) — `budgetSpend`, três números, nenhuma tabela nova.

> **Nenhum contador guardado**, e é o mesmo argumento do selo: um número somado na hora não pode
> divergir do que o aconteceu, e um contador incrementado pode — basta um turno que morreu entre o
> gasto e o incremento.

---

### Fase 7 — o portão · **T16 entregue**

#### T16: A decisão do teto, e ela é uma função pura

**What**: antes de `session/prompt`, o daemon confere os três tetos e decide entre **três** saídas —
`passa`, `avisa`, `bloqueia` —, a partir de quem está conduzindo
([Q45](open-questions.md#q45--o-teto-vale-para-a-sessão-que-você-está-conduzindo)). Quem conduz é
avisado e decide; a esteira para, com o número, sem reduzir nem continuar, e a worktree fica.
**Where**: `packages/server/src/tasks/budget.ts` (novo, puro), `packages/server/src/acp/AcpManager.ts`
**Done when**: a decisão é uma função sem I/O, com os **três** ramos cobertos; a mensagem nomeia o
teto e o valor (*"parou no teto do workspace — US$ 2,00 por tarefa"*); quem conduz **não** é
interrompido; e a conta é feita **antes** do prompt.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13) — `tasks/budget.ts` (pura), `tasks/budget-source.ts` (o SQL), e a
costura injetada no `bootstrap`, como o `preamble` já era.

> **Onde a conferência entra mudou durante a implementação, e o teste existente é quem mandou.** Pô-la
> *antes* de marcar `promptInFlight` abre uma janela de um microtask em que o turno está em voo para
> quem chamou e não para a sessão — e `setConfig` deixou de recusar no meio de um turno, que é uma
> garantia que a [`016`](../016-session-mode/prd.md) cobra. A marca vem primeiro; o caminho de
> bloqueio a desfaz, senão o selo do quadro desenharia `implementando há 3 h` num turno que nunca
> começou.
>
> **Um teto que não pôde ser lido não é um teto que estourou:** falha na leitura não derruba o turno,
> mesma postura da memória. Um banco travado viraria conversa inutilizável, e o produto funcionava sem
> teto nenhum até esta parte existir.
>
> **E o contrato cobrou a tela antes da hora**, do jeito certo: acrescentar a variante `budget` ao
> `AcpEvent` **quebrou o typecheck do web**, porque o `reduceConversation` é exaustivo. O teto passou a
> ter uma linha na conversa — turno próprio e `meta`, como o núcleo da memória, porque não é o agente
> dizendo, é o daemon dizendo o que fez por conta própria.
>
> **A mutação achou um teste fraco meu**, e ele virou um caso: *"um teto em dólar contra um agente que
> não relata dólar"* continuava verde tratando `null` como zero, porque `0 >= 1` é falso de qualquer
> jeito. Com o teto em `0` a diferença aparece — e é o caso que agora existe.

> **Antes do prompt, e não depois do turno**, que é a diferença entre um teto e um relatório: conferir
> no fim significa que o turno que estourou já foi pago.
>
> **Função pura, como o `decidePermission` e o `sealOf`.** O motivo é o que aquele arquivo já escreve:
> *"a parte interessante é uma decisão, e o manager é uma pilha de I/O — toda ramificação aqui é uma
> frase com que alguém pode discordar, e nenhuma delas precisa de um processo para ser exercitada"*.
>
> **O ramo `bloqueia` nasce sem chamador**, porque a esteira é a Parte 2. Isso é aceitável numa função
> pura com os dois ramos testados — é um contrato escrito — e **não** seria em CSS, que foi o defeito
> que a Parte 1 achou com 13 classes órfãs. Quando a Parte 2 chegar, ela passa `esteira` no lugar de
> `você`, e nada mais muda.

#### T17: Cota não é orçamento — `pausada`

**What**: limite de taxa do agente produz `pausada`: **não consome orçamento nem turno**, retoma
sozinha e não notifica. Sem sinal de quando reabre, **3 tentativas** com espera crescente e depois
bloqueia; espera maior que **4 h** vira bloqueio
([Q32](open-questions.md#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio)).
**Where**: `packages/server/src/acp/`, `packages/server/src/tasks/seal.ts`
**Done when**: o selo `pausada até ~HH:MM` sai do `rateLimit` que o evento `usage` carrega; uma pausa
não mexe em nenhum contador; e 4 h de espera vira `bloqueada` com o motivo.
**Gate**: `pnpm gate:quick`

> **O `rateLimit` só voltou a existir na [`027`](../027-adapter-provenance/prd.md)**, que consertou o
> `rateLimitOf` — ele exigia `utilization` na raiz e o `0.75.1` a aninhou em
> `unifiedWindows.<janela>`. Antes dela, esta task não teria dado de onde ler, e o defeito estava
> apagado em **todo** transcript do repositório sem nada falhar.

---

### Fase 8 — a tela

#### T18: O teto aparece, e diz onde se muda

**What**: os três tetos na tela do workspace, com o valor atual e o lugar de mudar.
**Where**: `packages/web/src/components/WorkspacePanel.tsx`, `workspace.css`
**Done when**: um teto `null` aparece como **sem teto** e não como vazio; e a linha diz onde mudar,
como a `022` já faz com o `LUMEM_TASKS_BUDGET`.
**Gate**: `pnpm gate:quick`

> *"Teto que você não vê é teto que parece bug quando recusa"* — a frase é da `022` e vale igual aqui.

#### T19: O cartão bloqueado nomeia o teto

**What**: o selo `bloqueada` do quadro carrega **qual** teto segurou e o número, com um verbo que leva
à tela onde ele mora ([Q36](open-questions.md#q36--qual-dos-dois-tetos-segurou)).
**Where**: `packages/web/src/components/TaskCard.tsx`, `board.css`
**Done when**: o motivo cabe nos **151px** medidos da caixa do selo, ou trunca dizendo que trunca; e
o cartão bloqueado **não pinta uma fatia de quarta linha** — o corte mora no filho, não na caixa com
`padding` (§10.2).
**Gate**: `pnpm gate:quick`

> Esta task traz de volta as classes `tcard--blocked`, `tcard__ask` e `tcard__ask-t`, que saíram do
> `board.css` na Parte 1 por não terem marcação — exatamente como a fase 3 registrou que voltariam.

---

### Fase 9 — o portão

#### T20: O e2e do teto

**What**: a spec que prova que o teto para, com **zero token**.
**Where**: `e2e/`
**Done when**: três caminhos passam — **(a)** com teto de turnos em 1, o segundo prompt de uma sessão
que **você conduz** avisa e **não** é recusado, com o número na tela; **(b)** subir o teto apaga o
aviso sem reabrir nada; **(c)** com os três tetos em `null`, não há aviso nenhum — que é o
comportamento de quem nunca pediu teto.
**Gate**: `pnpm gate:full`

> **O (c) é o que impede o pior defeito desta fatia:** um teto que nasce valendo transformaria o
> produto de todo mundo num produto que recusa trabalho, e um teste que só exercita o caminho de
> avisar fica verde contra isso.
>
> **O ramo `bloqueia` não aparece aqui de propósito** — ele não tem chamador até a Parte 2, e um e2e
> que o exercitasse teria que inventar um. Ele é coberto na [T16](#t16-a-decisão-do-teto-e-ela-é-uma-função-pura),
> onde é uma função pura e o teste é honesto.

---

## O que fica para o `tasks.md` seguinte

| O quê | O que destrava |
|---|---|
| **Parte 2 — a esteira** | a resposta de *"três sessões por tarefa: o que passa de uma para outra"*, e o laço do implementador que a T1 provou ser necessário (turno acabado ≠ tarefa acabada) |
| **Parte 4 — supervisão** | a Parte 2, e o corolário desconfortável do §2.4 do estudo: o selo `aguardando você` **não é derivável do transporte** |
| **Parte 5 e Parte 6 — o tracker** | um **ADR**. O precedente do `gh` não é portável — não existe `linear` na máquina —, e as três opções que sobram estão no §3.4 do estudo. Uma delas contradiz o ADR de 2026-08-30 de frente |
