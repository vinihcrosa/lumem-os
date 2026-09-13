# O orquestrador autônomo — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) ·
**Briefing de desenho:** [design-brief.md](design-brief.md) ·
**Medições:** [orchestration-measurements.md](../../project/orchestration-measurements.md)

**Status:** em execução
**Histórico:** **as seis partes estão entregues**  — a **Parte 1** (12 tasks, fases 0–4), a
**Parte 3** (8, fases 5–9), a **Parte 2** (13, fases 10–15), a **Parte 4** (8, fases 16–20) e as
**Partes 5 e 6** juntas (7, fases 21–24). São **48 tasks**, todas de 2026-09-12 e 2026-09-13, e
**uma delas é parcial** — a T48, com o motivo escrito nela. O corte é decisão registrada: das seis
partes do §6, este arquivo executa **uma** — o quadro lendo a
[`022`](../022-workspace-tasks/prd.md), com a autonomia desligada. A esteira (Parte 2), o orçamento (Parte 3), a
supervisão (Parte 4) e as duas pontas do tracker (Parte 5, Parte 6) ficam para um `tasks.md` seguinte, e o §0 diz
por quê. A fase 0 está **entregue**: o desenho sincronizado e o estudo do §11 escrito, e ele mudou
duas coisas antes de existir código.

A ordem tem uma regra: **o modelo antes da leitura, a leitura antes da tela** — e a tela por último
porque é a mais barata de refazer e a única represada pelo Open Design, que desta vez já entregou.

> **Por que continua `em execução` com as seis partes entregues.** Duas tasks são **parciais**, e as
> duas por falta de fonte e não de tempo: a **T17** espera uma cota de verdade esgotada para
> reconhecer a recusa — *"o protocolo não tem código para isso"* —, e a **T48** espera um jeito de
> testar o caminho feliz do tracker sem inventar uma opção de produto que só o teste usa. Chamar a
> feature de `completa` com a primeira em aberto seria dizer que a `pausada` da
> [Q32](open-questions.md#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio) existe inteira, e ela
> não existe.
>
> **É o Vinicius quem fecha esse número**, não este arquivo: o `Status:` é da PRD, e a gramática do
> [`025`](../025-docs-contract/prd.md) não tem um valor para *"entregue com duas ressalvas
> escritas"*.

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

### Fase 7 — o portão · **T16 entregue · T17 parcial**

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
**Status**: ⚠️ **parcial** (2026-09-13) — a metade que tem fonte de dado está de pé; a outra metade
**não tem como ser escrita hoje**, e a nota diz por quê.

> **O que entrou:** `pausedUntil` deriva a pausa do que o agente **relata** — a janela gasta
> (`utilization >= 1`) e ele **não** em excedente. Com excedente ele continua respondendo, e pausar
> seria inventar uma parada que não existe; é para isso que o `isUsingOverage` está no contrato. A
> pausa **vence** o turno em voo no selo, que é a Q32 em uma linha: quem espera cota **liberou a
> vaga**, e dizer `implementando há 12 min` de algo que espera seria o selo mentindo sobre quem está
> com ela. Sem `resetsAt` não há pausa: *"pausada até ~??:??"* não é uma frase, e o cartão fica
> `manual` com o relógio de encalhe cobrando — pior aviso, aviso honesto.
>
> **O que não entrou, e não é esquecimento: as 3 tentativas com espera crescente e o corte de 4 h.**
> Elas dependem de reconhecer um `session/prompt` **recusado por cota**, e o protocolo não tem código
> para isso — não existe o equivalente ao `-32000` que o login usa, e é por código que o daemon
> reconhece o login justamente porque *"o texto é do adaptador e pode estar traduzido"*. Adivinhar a
> forma desse erro é o que esta feature vem punindo desde a fase 0.
>
> **É medível, e não por mim sob demanda:** precisa de uma cota de verdade esgotada. A
> [Q46](open-questions.md#q46--como-o-daemon-reconhece-uma-recusa-por-cota) foi respondida **como
> instrumento**: todo `session/prompt` que falha passa a escrever um retrato com etiqueta estável
> (`tag=turn-failed`), levando junto o último relato de cota daquela sessão — sem ele a amostra não
> teria rótulo, e não daria para saber se a falha foi cota. Escrever o caso já ensinou metade: o erro
> atravessa JSON-RPC como **`-32603`**, o código genérico, com o texto do adaptador em `data.details`.
> **Não é só que falta código para cota — o que existe não diz nada.**
>
> **E o caso achou um defeito de verdade**, que só a `028` torna visível: um `session/prompt` que
> falhava deixava `promptInFlight` **ligado para sempre**. Desde que o selo do quadro passou a ser
> derivado disso, um turno morto no primeiro segundo pintaria `implementando há 3 h`.

> **Emenda (2026-09-13): o retrato agora tem onde ficar.** Como entregue, ele saía pelo logger do
> Fastify — que não tem destino em arquivo — e ia para `stdout`. Ou seja, o instrumento não
> instrumentava nada: a cota fecha durante trabalho autônomo, que é quando ninguém está olhando o
> terminal. O mesmo retrato passa a ser escrito também em `~/.lumem/_system/turn-failures.jsonl`,
> uma linha por falha, e a Q46 aponta para lá. Log de daemon que não persiste — o problema geral —
> foi para o [backlog](../../project/backlog.md).

> **O `rateLimit` só voltou a existir na [`027`](../027-adapter-provenance/prd.md)**, que consertou o
> `rateLimitOf` — ele exigia `utilization` na raiz e o `0.75.1` a aninhou em
> `unifiedWindows.<janela>`. Antes dela, esta task não teria dado de onde ler, e o defeito estava
> apagado em **todo** transcript do repositório sem nada falhar.

---

### Fase 8 — a tela · **entregue** (a T19 destravou na Parte 2)

#### T18: O teto aparece, e diz onde se muda

**What**: os três tetos na tela do workspace, com o valor atual e o lugar de mudar.
**Where**: `packages/web/src/components/WorkspacePanel.tsx`, `workspace.css`
**Done when**: um teto `null` aparece como **sem teto** e não como vazio; e a linha diz onde mudar,
como a `022` já faz com o `LUMEM_TASKS_BUDGET`.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13) — e ela cresceu, porque **faltava um escritor**.

> **Lacuna desta fase, achada executando-a: nada escrevia os tetos.** A T14 fez o modelo e a T18 a
> leitura, e entre as duas não havia gesto — a fatia entregaria uma tela que mostra três `sem teto`
> para sempre. É a mesma família da lacuna do arrasto na Parte 1. Entrou o `workspace.setBudget`, com
> os três campos **obrigatórios**: um `Partial` faria *"não mandei"* e *"mandei nada"* serem a mesma
> coisa, e desligar um teto deixaria de ter gesto.

> *"Teto que você não vê é teto que parece bug quando recusa"* — a frase é da `022` e vale igual aqui.

#### T19: O cartão bloqueado nomeia o teto

**What**: o selo `bloqueada` do quadro carrega **qual** teto segurou e o número, com um verbo que leva
à tela onde ele mora ([Q36](open-questions.md#q36--qual-dos-dois-tetos-segurou)).
**Where**: `packages/web/src/components/TaskCard.tsx`, `board.css`
**Done when**: o motivo cabe nos **151px** medidos da caixa do selo, ou trunca dizendo que trunca; e
o cartão bloqueado **não pinta uma fatia de quarta linha** — o corte mora no filho, não na caixa com
`padding` (§10.2).
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13) — **destravada pela Parte 2**, que é o que ela esperava.

> **Nenhum caminho produz um selo `bloqueada` hoje.** O `block` do teto só sai com o condutor
> `esteira` ([Q45](open-questions.md#q45--o-teto-vale-para-a-sessão-que-você-está-conduzindo)), e a
> esteira é a Parte 2 — o `budget-source.ts` passa `human` em toda chamada, porque toda sessão que
> existe é uma que você abriu.
>
> Escrever a marcação e o CSS agora recriaria **exatamente** o defeito que a Parte 1 pagou: 13 classes
> portadas para marcação que não existe, achadas pela direção contrária do
> `board-css.test.ts`. A regra que saiu de lá vale aqui — *cada uma volta com a fase que a pinta*.
>
> **O que ela vai precisar já existe:** a frase do bloqueio é montada pela `tasks/budget.ts`, que
> nomeia o teto e o valor, e os três casos dela estão verdes.

> Esta task traz de volta as classes `tcard--blocked`, `tcard__ask` e `tcard__ask-t`, que saíram do
> `board.css` na Parte 1 por não terem marcação — exatamente como a fase 3 registrou que voltariam.

---

### Fase 9 — o portão · **entregue**

#### T20: O e2e do teto

**What**: a spec que prova que o teto para, com **zero token**.
**Where**: `e2e/`
**Done when**: três caminhos passam — **(a)** com teto de turnos em 1, o segundo prompt de uma sessão
que **você conduz** avisa e **não** é recusado, com o número na tela; **(b)** subir o teto apaga o
aviso sem reabrir nada; **(c)** com os três tetos em `null`, não há aviso nenhum — que é o
comportamento de quem nunca pediu teto.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue (2026-09-13) — `e2e/budget.spec.ts`, três casos, **zero token**, e a mutação
confere: emitir só o bloqueio derruba dois.

> **O teto é conferido antes do `session/prompt`, então o agente falso nem precisa responder** — o
> pedido de permissão aparecer **é** a prova de que o turno passou do portão.
>
> **Teto de zero turno é o caminho mais curto até o aviso**, e não depende de nenhum consumo ter sido
> gravado: o primeiro prompt já passou dele. Sem isso o caso teria que esperar `session_usage`
> encher, que é testar o contador em vez do portão.

> **O (c) é o que impede o pior defeito desta fatia:** um teto que nasce valendo transformaria o
> produto de todo mundo num produto que recusa trabalho, e um teste que só exercita o caminho de
> avisar fica verde contra isso.
>
> **O ramo `bloqueia` não aparece aqui de propósito** — ele não tem chamador até a Parte 2, e um e2e
> que o exercitasse teria que inventar um. Ele é coberto na [T16](#t16-a-decisão-do-teto-e-ela-é-uma-função-pura),
> onde é uma função pura e o teste é honesto.

---

## Parte 2 — A esteira

> **Aberta em 2026-09-13**, depois da Parte 3 e pelo motivo que a Parte 3 escreve: *ligar a autonomia
> antes de ter o teto de pé é ligar a autonomia sem freio*. O teto está de pé.

**O que esta fatia entrega:** o daemon **puxa da fila sem ninguém pedir**, prepara o checkout, abre a
sessão do encaixe e **move a seta por fato verificável** — com a autonomia nascendo desligada, o
degrau `assistido` no meio, e um teto de quantas de uma vez.

**O que a Fase 0 dela decidiu, e restringe tudo abaixo:**

| Decisão | Onde |
|---|---|
| **a esteira não tem lease** — tem `task.attempts` e `task.autonomy`, e nada mais guardado | [ADR](../../adr/2026-09-13-0412-the-conveyor-has-no-lease.md) · [estudo](../../project/conveyor-durable-state.md) |
| a segunda tentativa **vê o fato** do checkout sujo, e nenhum resumo | [Q49](open-questions.md#q49--o-que-a-segunda-tentativa-vê) |
| comentário de tarefa **não** passa pelo portão da inbox — a proveniência fica | [Q50](open-questions.md#q50--comentário-de-tarefa-passa-pelo-portão) |
| o `assistido` **não abre sessão** — prepara worktree, `setup` e prompt | [Q51](open-questions.md#q51--o-assistido-abre-a-sessão-ou-não) |
| teto de paralelismo no workspace, `NOT NULL`, default **2**, contando **turno em voo** | [Q52](open-questions.md#q52--quantas-de-uma-vez-e-onde-mora-o-número) |
| o portão é o **`test` do `project.toml`**, e o check da PR quando há PR | [Q53](open-questions.md#q53--e-num-projeto-sem-ci) |
| **nada passa de uma sessão para outra** | [Q47](open-questions.md#q47--o-que-passa-de-uma-sessão-para-outra) |
| a esteira abre em `bypassPermissions`, declarado na `spec` do adaptador | [Q41](open-questions.md#q41--em-que-modo-a-esteira-abre-a-sessão-e-quem-escolhe) · [Q43](open-questions.md#q43--qual-dos-cinco-modos-do-claude-é-o-automático) |

**O que ela não entrega:** a supervisão e o volante (Parte 4), e as duas pontas do tracker (Parte 5 e
Parte 6), que continuam esperando o ADR do segredo.

A ordem é a mesma das outras duas fatias — **o modelo antes da leitura, a leitura antes do laço, e a
tela por último**.

---

### Fase 10 — o que a esteira guarda · **entregue**

#### T21: A tarefa ganha comentário

**What**: entidade nova `task_comment` — a tarefa não tem onde registrar nada hoje, e a
[Q47](open-questions.md#q47--o-que-passa-de-uma-sessão-para-outra) fechou a lista do que passa entre
sessões contando com ela. Corpo, autor (`human` | `agent`) e a sessão que escreveu, com a mesma regra
de proveniência da [`022`](../022-workspace-tasks/prd.md).
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/repositories/task.ts`,
`packages/shared/src/`
**Done when**: um comentário de agente **não** pode existir sem sessão e um de pessoa **não** pode ter
uma, cobrado por `CHECK` como o `task_agent_provenance`; apagar a sessão **anula o ponteiro** em vez
de recusar o apagamento; e a leitura devolve em ordem de escrita.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **Dois achados, e os dois do teste.** O `created_by_session` **não tem
> estrangeiro**, e não é descuido: escrito com `references(session, onDelete:
> "set null")`, a ação do estrangeiro é um `UPDATE`, e `created_by = 'agent'` com
> sessão nula viola o `CHECK` de proveniência — as duas restrições se contradizem
> e apagar a sessão vira **impossível** depois que um agente comentou. `RESTRICT`
> é a mesma prisão dita em voz alta, e a `022` já a recusou.
>
> E a leitura **desempata por `rowid`**: `created_at` tem resolução de
> milissegundo, e resumo e parecer saem no mesmo turno. O teste do empate o
> **força** em vez de torcer — a primeira versão escrevia três pela porta normal
> e conferia que os carimbos saíram iguais; passou sozinha e falhou na suíte
> inteira, onde a máquina está carregada. Ela estava afirmando a velocidade do
> computador.

> **Leia o `SELECT` da migração gerada.** É a terceira vez que este arquivo escreve isso, e as duas
> primeiras foram defeito de verdade: o `drizzle-kit` gera `INSERT … SELECT` lendo colunas que não
> existem na origem, e nenhum teste que começa de banco vazio pega.

#### T22: Duas colunas, e o ADR diz que são só duas

**What**: `task.attempts` (`NOT NULL DEFAULT 0`) e `task.autonomy` (`NOT NULL DEFAULT 'inherit'`, com
`off` para o que você assumiu). `attempts` **zera na mudança de etapa**, porque mudar de etapa é a
conclusão bem-sucedida daquela etapa.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/repositories/task.ts`
**Done when**: mudar o `status` zera `attempts` **na mesma escrita** — não numa segunda —, e
`autonomy` sobrevive à mudança de etapa; um `CHECK` fecha os dois valores.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **A armadilha do `drizzle-kit` pela terceira vez**, e o teste de migração a
> pega agora: ele escreve tarefas **antes** de migrar, porque com a tabela vazia
> o `SELECT` errado nunca executa uma linha.

#### T23: O catálogo de agentes nomeados, e a cascata

**What**: um agente nomeado é **nome + adaptador + modelo + instrução**, e o encaixe aponta para ele
(§5.1). A resolução é em cascata — **tarefa → projeto → workspace → default** —, e é função pura sobre
as quatro leituras.
**Where**: `packages/server/src/db/schema.ts`, `packages/server/src/agents/catalog.ts`
**Done when**: a cascata é testada nos quatro níveis e no vazio; dois projetos do mesmo workspace
podem ter revisores diferentes; e **adaptador** e **agente** não se confundem no vocabulário — o
catálogo aponta para o `ADAPTERS` da [`021`](../021-second-agent/prd.md), não o substitui
([Q35](open-questions.md#q35--o-rodapé-da-sidebar-passa-a-dizer-adaptadores)).
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> A consulta casa pelo **par** (tipo, id), e não pelo id sozinho. Uma linha
> `scope_type = 'task'` com id de projeto cairia no degrau mais alto e abriria a
> sessão do agente errado — impossível hoje com `randomUUID`, e *"é improvável"*
> não é propriedade que o schema garanta.

---

### Fase 11 — a fila · **entregue**

#### T24: A fila é uma leitura, e puxa da direita para a esquerda

**What**: *todo cartão cuja etapa é devida, que não tem trabalhador, e cuja autonomia está ligada* —
uma regra, nenhum caso especial (§4.1). A ordem é **coluna da direita para a esquerda**, e dentro da
coluna é a `position`, que é a prioridade (§4.3).
**Where**: `packages/server/src/tasks/queue.ts`
**Done when**: um cartão com turno em voo **não** entra na fila; um com `autonomy: 'off'` **não**
entra; `ready_to_merge` e `done` nunca entram, porque não são etapa da máquina; e revisar vem antes de
começar tarefa nova, provado por ordem e não por comentário.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

#### T25: O teto de paralelismo, contado do turno em voo

**What**: `workspace.autonomyMaxParallel`, `NOT NULL DEFAULT 2`
([Q52](open-questions.md#q52--quantas-de-uma-vez-e-onde-mora-o-número)). Quantas vagas há **agora** é
`teto − turnos em voo`, e `0` bloqueia tudo.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/tasks/queue.ts`
**Done when**: uma sessão de agente **sem** prompt em voo não ocupa vaga — 7 dos 15 transcripts deste
repositório nunca receberam um prompt —, e `0` devolve zero vaga sem ler a fila.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> Ele conta **só os turnos deste workspace**: sem o recorte, um workspace ocupado
> fecharia a fila de outro.

---

### Fase 12 — o laço · **entregue**

#### T26: O checkout nasce preparado, e a segunda tentativa sabe o que encontrou

**What**: a tarefa sem worktree ganha uma — a [`026`](../026-worktree-from/prd.md) já sabe cortar de
branch, issue ou PR — e o `setup` da [`012`](../012-project-scripts/prd.md) roda antes do primeiro
prompt. Na **segunda** tentativa a worktree é a mesma, e o prompt diz **o fato**
([Q49](open-questions.md#q49--o-que-a-segunda-tentativa-vê)).
**Where**: `packages/server/src/tasks/conveyor.ts`, `packages/server/src/git/`, `packages/server/src/scripts/`
**Done when**: a tentativa 2 reusa a worktree da 1 e o prompt carrega *"este checkout já tem mudanças
de uma tentativa anterior"* **quando e só quando** `git status` não está limpo; e nenhum resumo da
tentativa anterior atravessa.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> O `setup` **espera**, ao contrário do caminho da tela, que o dispara em segundo
> plano de propósito: aqui ninguém está olhando, e mandar o prompt antes de o
> `pnpm install` terminar gasta uma tentativa para descobrir que faltava
> dependência.

#### T27: O prompt do encaixe, e o laço que sabe que turno acabado não é tarefa acabada

**What**: cada encaixe tem seu prompt, montado do **fato** — corpo da tarefa, checkout, diff quando é
revisor. O laço é: turno acabou, o fato verificável não veio, ainda há tentativa → prossegue; acabou a
tentativa → `bloqueada`, com o motivo.
**Where**: `packages/server/src/tasks/conveyor.ts`, `packages/server/src/tasks/prompts.ts`
**Done when**: o `stopReason` **não** decide nada sozinho — é o §2.1 do
[estudo](../../project/orchestration-measurements.md), e dos 13 `end_turn` gravados só 4 significaram
*terminei*; a sessão abre em `bypassPermissions` vindo da `spec` do adaptador, nunca escrito à mão; e
`attempts` cresce **antes** do prompt, não depois, senão um daemon que morre no meio conta errado.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **E ele ganhou um teto de tempo que a task não pedia**, porque o e2e provou que
> faltava: quando o agente é dono do seletor de modos, o daemon **não** consulta
> a política do Lumem — manda o pedido de permissão para uma pessoa (A1 da
> [`016`](../016-session-mode/prd.md)) —, e numa sessão de esteira não há pessoa.
> O turno pendurava para sempre, com o cartão dizendo `implementando` a manhã
> inteira. O caminho normal não passa por lá; o teto é o que sobra quando **não
> deu para escolher o modo**.

#### T28: O portão, e quem move a seta

**What**: o `test` do `project.toml` é o portão local, e o check da PR entra quando há PR
([Q53](open-questions.md#q53--e-num-projeto-sem-ci)). **Quem move a seta é o daemon**, nunca um agente
(§4.1).
**Where**: `packages/server/src/tasks/gate.ts`, `packages/server/src/pr/`
**Done when**: dois verdes movem, um vermelho para com o motivo; um projeto **sem `test` declarado**
avança com o commit como único fato **e o cartão diz isso**; e nenhum caminho deixa um agente escrever
`status`.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> O commit é lido do **git**, e não de o checkout estar limpo: um turno que não
> escreveu nada também deixa o checkout limpo, e as duas situações são opostas. O
> que separa é a branch estar à frente da base.

---

### Fase 13 — os interruptores · **entregue**

#### T29: A autonomia do workspace, e a da tarefa

**What**: `manual` · `assistido` · `autônomo` no workspace, nascendo em **`manual`**; e o interruptor
por tarefa da [Q40](open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), que
**assumir** desliga.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/routers/workspace.ts`
**Done when**: um `~/.lumem` que existia antes desta fatia acorda em `manual` — nenhum acorda andando
—, e arrastar um cartão para uma coluna da máquina desliga a autonomia daquela tarefa.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **A primeira versão da regra do arrasto estava errada, e de um jeito silencioso:**
> ela contava `open` como coluna da máquina, então o gesto mais comum do quadro —
> pôr uma tarefa na fila — desligava a autonomia da tarefa recém-enfileirada, e a
> esteira ficaria permanentemente vazia sem nada falhar. Quem derrubou foi um caso
> da `queue.test.ts` que arrasta dentro da própria coluna para provar a
> prioridade. Arrastar para a To-Do é **entregar** à máquina, não tirar dela.

#### T30: `assistido` prepara e para

**What**: worktree, `setup` e **prompt montado**, sem abrir adaptador
([Q51](open-questions.md#q51--o-assistido-abre-a-sessão-ou-não)). O prompt fica visível, e enviar é o
clique.
**Where**: `packages/server/src/tasks/conveyor.ts`, `packages/web/src/components/TaskCard.tsx`
**Done when**: em `assistido` **nenhum processo de adaptador sobe** — provado contando `spawn`, não
lendo o código —, e o prompt preparado sobrevive ao reinício do daemon.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> O prompt preparado é **guardado**, e o e2e conta os `spawn`: em `assistido`
> nenhuma sessão sobe. E o clique **não remonta** o prompt — remontar abriria a
> janela em que a tarefa mudou entre preparar e clicar, e o que você aprovou não
> seria o que seguiu.

---

### Fase 14 — a tela · **entregue**

#### T31: O cartão diz o que a esteira fez

**What**: o selo `aguardando <papel>` passa a existir de verdade — hoje nada o produz; a linha da
[Q42](open-questions.md#q42--o-selo-aguardando-você-é-ortogonal-e-o-desenho-o-fez-exclusivo) já está na
folha; e a tentativa aparece quando é maior que um.
**Where**: `packages/web/src/components/TaskCard.tsx`, `board.css`, `packages/web/src/components/WorkspacePanel.tsx`
**Done when**: nenhuma classe de CSS nasce sem marcação que a use — a regra que a Parte 1 pagou com 13
classes órfãs —, e `assistido` mostra o prompt que ia ser enviado.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

#### T32: O cartão bloqueado nomeia o teto — a T19, destravada

**What**: a [T19](#t19-o-cartão-bloqueado-nomeia-o-teto) foi represada porque *"nenhum caminho produz
um selo `bloqueada` hoje"*. A esteira produz dois: teto do workspace com condutor `esteira`, e
tentativa esgotada.
**Where**: `packages/web/src/components/TaskCard.tsx`, `board.css`
**Done when**: o motivo cabe nos **151px** medidos da caixa do selo ou trunca dizendo que trunca; e o
cartão bloqueado **não pinta uma fatia de quarta linha** (§10.2).
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> O motivo aparece **duas vezes** de propósito: o selo tem 151px medidos e
> trunca, e o bloqueio que não diz do quê é um alarme, não um aviso. A linha de
> baixo é onde a frase inteira cabe, com o corte num filho — o defeito medido do
> §10.2.

---

### Fase 15 — o portão · **entregue**

#### T33: O e2e da esteira

**What**: de um cartão em To-Do a um cartão que andou, com a autonomia ligada — e com o adaptador
falso, porque a esteira é o assunto e o agente não.
**Where**: `e2e/conveyor.spec.ts`
**Done when**: o cartão atravessa uma etapa sem ninguém clicar; desligar a autonomia da tarefa
**para** a esteira nela e não nas outras; e o teto de paralelismo segura a terceira.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue (2026-09-13)

> **Ele achou dois defeitos**, e os dois estão nas tasks acima: o turno que
> pendura (T27) e o log da passada que o pino serializava sem a mensagem — a
> mesma falha que o retrato do turno já tinha pago.
>
> **O que ele não prova é a seta andando por portão verde**, e a razão é o agente
> falso: ele não commita, então o portão responde *"o turno acabou sem commit"* —
> corretamente. Esse caminho é coberto onde o portão é injetado. O que ele prova é
> a corrente inteira em volta, inclusive o bloqueio depois de duas tentativas, com
> o motivo do portão, **na mesma coluna**, e com a autonomia da tarefa desligada
> para a fila não pegá-la de volta.

---

## Parte 4 — Supervisão, bloqueio e o volante

> **Aberta em 2026-09-13**, depois da Parte 2 e por dependência: três das cinco perguntas da fase 0
> dela **só existem porque a esteira existe**. Antes dela, ninguém ficava esperando nada.

**O que esta fatia entrega:** o que você vê quando **não** está olhando. O relógio que não cobra
espera por vaga, a notificação que acontece **uma vez**, a frase que conta o que parou enquanto você
não estava, os dois verbos do volante — **assumir** e **parar** — e a limpeza do `Done`.

**O que a fase 0 dela decidiu:**

| Decisão | Onde |
|---|---|
| cartão na fila sem vaga **não encalha** — e sem coluna nova | [Q54](open-questions.md#q54--o-relógio-do-encalhe-conta-a-espera-por-vaga) |
| a notificação é **da aba**; o registro de *já avisei* é **do daemon** | [Q55](open-questions.md#q55--onde-mora-a-notificação-se-o-daemon-não-tem-tela) |
| ao voltar, quem conta é o **quadro** — uma frase que some ao ser vista | [Q56](open-questions.md#q56--o-que-você-vê-ao-voltar) |
| `parar` é **`cancel` e depois** o interruptor, nessa ordem | [Q57](open-questions.md#q57--parar-para-o-quê-exatamente) |
| quem remove a worktree é o **gesto** de mover para `done` | [Q58](open-questions.md#q58--quem-remove-a-worktree-quando-a-tarefa-termina) · [Q27](open-questions.md#q27--done-remove-a-worktree-e-se-estiver-suja) |

**O que ela não entrega:** as duas pontas do tracker (Parte 5 e Parte 6), que continuam esperando o
**ADR do segredo**.

---

### Fase 16 — o relógio honesto · **entregue**

#### T34: Espera por vaga não encalha

**What**: o `staleLevel` deixa de contar quando o cartão está **na fila e sem vaga**
([Q54](open-questions.md#q54--o-relógio-do-encalhe-conta-a-espera-por-vaga)). Mesma família do
`pausada`, que ele já trata assim.
**Where**: `packages/server/src/tasks/board.ts`, `packages/web/src/lib/board.ts`
**Done when**: com teto 2 e oito cartões devidos, os seis na fila **não** ficam âmbar; e
`ready_to_merge` continua contando desde que chegou, porque ali não há vaga para esperar.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

---

### Fase 17 — o que você vê sem estar olhando · **entregue**

#### T35: Avisar uma vez, e o registro é do daemon

**What**: `task.notifiedAt`, escrita **uma vez** por transição que merece aviso — chegar em
`ready_to_merge` e ficar `bloqueada`. A leitura do quadro diz o que ainda não foi avisado.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/tasks/notify.ts`
**Done when**: duas abas abertas **não** avisam duas vezes, e recarregar a página não renotifica —
provado contra o daemon, e não contra o navegador.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> A condição mora no `WHERE`, e não num `if` antes: ler e depois escrever deixa duas abas lerem
> `NULL` e as duas escreverem, que é exatamente o caso que a coluna existe para fechar.

#### T36: A aba notifica, e pede a permissão na hora certa

**What**: a `Notification` do navegador, com a permissão pedida **quando alguém liga a autonomia** —
o único instante em que o pedido tem uma frase honesta.
**Where**: `packages/web/src/components/TaskList.tsx`, `packages/web/src/hooks/`
**Done when**: sem permissão, nada quebra e nada é perdido — o aviso continua sendo do quadro; e
ligar a autonomia é o que pergunta.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **Sem permissão, o `markNotified` continua sendo chamado**, e isso é decisão: o que ele marca é
> *"você já teve como saber"*, e a frase do topo — que não depende de permissão — já contou. Marcar só
> com permissão faria o contador repetir para sempre em quem disse não.
>
> O mock compartilhado cobrou de novo: sem o default do `markNotified`, o `mutate` devolve `undefined`,
> o `.then` estoura **fora** do React e a tela some inteira — um `<body>` vazio num teste que fala de
> notificação.

#### T37: O que parou enquanto você não estava

**What**: uma frase no topo do quadro — *"3 pararam enquanto você não estava"* — que **some quando
você olha** ([Q56](open-questions.md#q56--o-que-você-vê-ao-voltar)).
**Where**: `packages/web/src/components/Board.tsx`, `board.css`
**Done when**: ela não é modal, não tem `✕` e não guarda preferência; e ela conta o mesmo que o
daemon diz não ter sido avisado.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

---

### Fase 18 — o volante · **entregue**

#### T38: `parar` é interromper e depois desligar

**What**: o verbo que para um turno em voo — `cancel` e **depois** o interruptor
([Q57](open-questions.md#q57--parar-para-o-quê-exatamente)). A worktree fica.
**Where**: `packages/server/src/routers/task.ts`, `packages/web/src/components/TaskCard.tsx`
**Done when**: a ordem é cobrada por teste — desligar antes deixa uma janela em que a fila já não pega
o cartão e o turno velho continua gastando; e `parar` numa tarefa sem turno em voo **não** é erro.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> A ordem é lida **de dentro** do cancelamento — no instante em que ele acontece, a autonomia ainda
> tem que estar ligada. E uma sessão que morreu entre a leitura e o cancelamento **não** aborta o
> `parar`: deixar subir deixaria o interruptor ligado, e o clique não teria feito nada.

#### T39: `assumir` é um clique que já existe

**What**: abrir a conversa do cartão desliga a autonomia daquela tarefa (UC7). Nada de novo na tela:
*"a sessão autônoma e a sessão que você conduz são a mesma sessão"*.
**Where**: `packages/web/src/components/Board.tsx`, `packages/server/src/routers/task.ts`
**Done when**: abrir a conversa de um cartão que a esteira está tocando desliga a autonomia dele e
**não** interrompe o turno — assumir não é parar, e confundir os dois custaria o turno pago.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **E ela abriu a [Q59](open-questions.md#q59--abrir-o-cartão-desliga-a-autonomia-dele-sempre), que a
> task não tinha visto.** Lido ao pé da letra, o UC7 diz que *todo* clique desliga — e aí olhar o
> quadro vira campo minado: você abre três cartões para ler e desliga a autonomia dos três, em
> silêncio. Só conta como assumir o cartão que a esteira está tocando **agora**, e quem responde isso
> é o selo, que já é derivado.

---

### Fase 19 — o `Done` que limpa · **entregue**

#### T40: Remover é do gesto, e o daemon recusa dizendo o que se perde

**What**: mover para `done` remove a worktree **se** o checkout estiver limpo e a branch mesclada; se
não, o daemon **recusa** e diz o que se perde ([Q27](open-questions.md#q27--done-remove-a-worktree-e-se-estiver-suja),
[Q58](open-questions.md#q58--quem-remove-a-worktree-quando-a-tarefa-termina)). O interruptor *"PR
mesclada sempre remove a worktree"* liga o caso sujo.
**Where**: `packages/server/src/routers/task.ts`, `packages/server/src/db/schema.ts`, `drizzle/`
**Done when**: sujo sem interruptor **não** remove e a mensagem traz o número de arquivos; com
interruptor remove; e o texto do interruptor diz o que se está autorizando.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **A Q27 não tinha decidido um quarto caso**, e a implementação teve que: o interruptor **não** vale
> para branch não mesclada. Ele se chama *"PR **mesclada** sempre remove"*, e esticá-lo seria o produto
> fazendo mais do que a frase que você leu autorizava.
>
> E `mesclada` é lido do **git** (`ahead === 0`), não do `gh`: vale para quem mesclou pela PR, para
> quem mesclou na mão e para quem nunca abriu PR — e não depende de o `gh` existir, que o
> [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md) deixa ser uma
> ausência legítima.

---

### Fase 20 — o portão · **entregue**

#### T41: O e2e da supervisão

**What**: um cartão que para enquanto ninguém olha, e o que a volta mostra.
**Where**: `e2e/conveyor.spec.ts`
**Done when**: o cartão bloqueado é contado **uma vez** e deixa de ser contado depois de visto; e
`parar` interrompe o turno sem apagar a worktree.
**Gate**: `pnpm gate:full`
**Status**: ✅ entregue (2026-09-13)

> Duas coisas que só o e2e alcança: que a **leitura do quadro** carrega o aviso — nenhum teste de
> unidade prova isso —, e que `parar` dura **mais que uma passada**: vinte segundos depois, a
> tentativa continua a mesma.

---

## Partes 5 e 6 — O tracker

> **Abertas em 2026-09-13**, e as duas juntas porque a segunda não tem como ser testada sem a
> primeira: só há o que escrever de volta numa issue que entrou por aqui.
>
> Elas estavam paradas por um motivo só — de onde vem a credencial —, e ele foi decidido **duas
> vezes no mesmo dia**. O
> [primeiro ADR](../../adr/2026-09-13-1531-tracker-credentials-come-from-the-environment.md) disse
> *"do ambiente"*, e foi **superado** pelo
> [ADR do cofre](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md), com
> [estudo](../../project/secret-store.md): **o Lumem guarda as chaves dos serviços de que depende**.
> O erro do primeiro foi generalizar duas coisas que não eram regra — o `gh` era solução daquele
> caso, e ler do ambiente era simplicidade.

**O que esta fatia entrega:** a issue do Linear que vira cartão na To-Do, e o comentário que volta
para lá nos quatro marcos. Sem credencial guardada no cofre, **nada disto aparece** — e ausência não
é erro.

**O que a fase 0 delas decidiu:**

| Decisão | Onde |
|---|---|
| a credencial mora no **cofre do Lumem**, cifrada — e o que ela protege está escrito | [ADR](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) · [estudo](../../project/secret-store.md) |
| **polling a 60 s**; webhook exige relé, e relé é a opção que o ADR recusou | [Q60](open-questions.md#q60--como-o-evento-externo-chega) |
| a chave externa mora **na tarefa**, com índice único por workspace | [Q61](open-questions.md#q61--o-que-impede-a-mesma-issue-de-virar-duas-tarefas) |
| **rótulo `lumem`**, e não identidade — identidade é uma conta paga que o produto não controla | [Q62](open-questions.md#q62--o-que-é-minha-issue-no-tracker) |
| instantâneo de **três campos**, com o corpo em hash | [Q63](open-questions.md#q63--a-tarefa-externa-que-muda-no-meio-comparada-contra-o-quê) |
| escrever de volta é **cortesia**, não portão: falhar vira aviso | [Q64](open-questions.md#q64--o-comentário-de-volta-quais-marcos-e-o-que-acontece-se-falhar) |
| o mapa de colunas mora no `project.toml`, atrás do portão de confiança | [Q65](open-questions.md#q65--o-mapa-de-colunas-mora-onde) |

**O que elas não entregam:** entrada **agendada**, que o §6 já tirou da v1 e mandou para o backlog.

---

### Fase 21 — o host, e o que ele responde · **entregue**

#### T42: O tracker é uma porta, e o Linear é a primeira implementação dela

**What**: `TrackerHost` — listar o que tem o rótulo, comentar numa issue, mover estado. O Linear por
GraphQL, com a chave vinda do **cofre do Lumem**
([ADR](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)).
**Where**: `packages/server/src/tracker/`
**Done when**: a chave **nunca** aparece em retorno, em erro ou em log — provado por teste, e não por
leitura; sem credencial guardada, o host reporta ausência em vez de falhar; e a mensagem de erro do
host passa pelo mesmo `redact` da [`009`](../009-agent-login/prd.md).
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **A redação roda até num erro de rede**, e parece exagero até você ver por quê: alguns clientes HTTP
> ecoam a requisição inteira — cabeçalhos inclusive — na mensagem de `fetch failed`. Redigir sempre
> custa uma linha; o contrário custa uma chave num log.
>
> E a tradução é **nossa**: os cinco tipos de estado do Linear viram os dois que o Lumem precisa, para
> que um sexto tipo lá não vire um sexto estado aqui.

---

### Fase 22 — a issue vira cartão · **entregue**

#### T43: A chave externa é identidade, e ela é única

**What**: `task.externalSource` e `task.externalId`, com índice único **por workspace** — duas tarefas
não podem ser a mesma issue, e a mesma issue pode virar tarefa em dois workspaces
([Q61](open-questions.md#q61--o-que-impede-a-mesma-issue-de-virar-duas-tarefas)).
**Where**: `packages/server/src/db/schema.ts`, `drizzle/`, `packages/server/src/repositories/task.ts`
**Done when**: importar a mesma issue duas vezes devolve **a mesma tarefa** e não erro — idempotência
é o requisito, não a ausência de duplicata.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> O índice é **parcial por construção**: `NULL` não colide com `NULL` no SQLite, então toda tarefa que
> não veio de tracker fica de fora sem precisar de cláusula nenhuma.

#### T44: O laço que traz, a 60 segundos

**What**: puxa o que tem o rótulo `lumem`, cria o que ainda não existe **direto na To-Do**, e guarda o
instantâneo de três campos ([Q63](open-questions.md#q63--a-tarefa-externa-que-muda-no-meio-comparada-contra-o-quê)).
**Where**: `packages/server/src/tracker/sync.ts`
**Done when**: rodar duas vezes não cria nada na segunda; o cartão nasce em `open` com o link; e uma
passada que falha **não** derruba o laço nem as outras contas.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

#### T45: Mudou no meio, e o cartão diz qual das três

**What**: reatribuída, fechada ou descrição editada → **bloqueia**, com o motivo dizendo **qual**
(§6). Nada é injetado no meio de um turno.
**Where**: `packages/server/src/tracker/sync.ts`
**Done when**: as três produzem motivos diferentes; e uma tarefa já bloqueada não é bloqueada de
novo a cada passada.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **O instantâneo é atualizado mesmo com a tarefa já bloqueada**, e essa linha é o caso que quase
> passou: sem ela, uma **segunda** mudança lá nunca seria vista — a comparação continuaria sendo
> contra o estado de três mudanças atrás.
>
> E *desatribuída* ganhou frase própria: *"reatribuída"* para ninguém não é reatribuída, e quem lê
> precisa saber que a issue ficou **sem dono**.

---

### Fase 23 — o que o tracker vê · **entregue**

#### T46: Os quatro marcos, uma vez cada

**What**: *"peguei"*, *"PR aberta"*, *"travei"*, *"pronta para mesclar"* — comentados na issue, **uma
vez por tarefa** ([Q64](open-questions.md#q64--o-comentário-de-volta-quais-marcos-e-o-que-acontece-se-falhar)).
**Where**: `packages/server/src/tracker/marks.ts`, `packages/server/src/db/schema.ts`, `drizzle/`
**Done when**: falhar **não** para nada do lado de cá; e o mesmo marco não é escrito duas vezes, com
a condição no `WHERE` como o `notified_at` da Parte 4.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **A reserva acontece antes da escrita**, e o custo disso está escrito: um marco fica registrado sem
> ter saído quando a rede recusa. É o lado certo de errar — o outro é comentar duas vezes na issue de
> outra pessoa, que é a única parte desta fatia que não tem desfazer.

#### T47: Mover estado lá, só com mapa

**What**: o mapa de colunas do `<repo>/.lumem/project.toml`, atrás do portão de confiança da
[`012`](../012-project-scripts/prd.md) ([Q65](open-questions.md#q65--o-mapa-de-colunas-mora-onde)).
**Where**: `packages/server/src/scripts/project-scripts.ts`, `packages/server/src/tracker/marks.ts`
**Done when**: **sem mapa, nada é movido** — e isso é a decisão, não o default preguiçoso; e um mapa
de projeto não confiado não vale.
**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue (2026-09-13)

> **TOML inválido aqui não lança**, ao contrário do `[scripts]` — e é a mesma regra lida nos dois
> sentidos: lá, desistir significa rodar o comando errado sem ninguém saber por quê; aqui, desistir
> significa **não mexer no tracker de alguém**, que é o que a Q65 escolhe quando há dúvida.

---

### Fase 24 — o portão · **T48 parcial**

#### T48: O e2e do tracker, com um host falso

**What**: uma issue vira cartão, o cartão anda, e o marco volta — com um `TrackerHost` falso, porque
o assunto é a costura e não o Linear.
**Where**: `packages/server/src/tracker/`, `e2e/`
**Done when**: sem credencial guardada nada acontece e nada quebra; e a segunda passada não cria nem
comenta de novo.
**Gate**: `pnpm gate:full`
**Status**: ⚠️ **parcial** (2026-09-13) — metade entregue, metade **anotada em vez de fingida**.

> **O que entrou:** o caso que só um daemon de verdade prova — sem credencial no cofre, o daemon
> **sobe, responde e continua funcionando**, com a tarefa sem origem externa e sem marco nenhum. Ausência não
> é erro, e é o boot que poderia quebrar.
>
> **O que não entrou, e não é esquecimento:** o caminho feliz ponta a ponta exigiria apontar o host
> para um servidor falso, e o endereço do Linear é **um só** — um `LUMEM_LINEAR_ENDPOINT` seria uma
> opção de produto que existe só para o teste, e este repositório acabou de recusar a mesma coisa em
> outro lugar. O `LUMEM_CONVEYOR_AGENT` da Parte 2 é diferente: ele tem um caso de produto real —
> adaptador fora do catálogo —, e o [ADR de 2026-09-08](../../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
> já abre essa exceção por escrito.
>
> **E a cobertura existe uma camada abaixo**, com banco de verdade: `sync.test.ts` roda a passada
> duas vezes contra SQLite e prova que a segunda não cria nada, e `marks.test.ts` prova que dois
> marcos simultâneos produzem **um** comentário. O que falta é o transporte HTTP até o Linear, e ele
> tem os testes dele no `LinearHost.test.ts` — com o `fetch` injetado.

---

## O que fica para o `tasks.md` seguinte

| O quê | O que destrava |
|---|---|
| ~~**Parte 2 — a esteira**~~ | **entregue em 2026-09-13**, acima — 13 tasks em 6 fases |
| ~~**Parte 4 — supervisão**~~ | **entregue em 2026-09-13**, acima — a Parte 2 destravou. O corolário do §2.4 fica de pé: o selo `aguardando você` **não é derivável do transporte**, e por isso ele não está no escopo desta fatia |
| ~~**Parte 5 e Parte 6 — o tracker**~~ | **entregues em 2026-09-13**, acima. O ADR que faltava está escrito, e ele **não** contradiz o de 2026-08-30: a quarta saída — a que nem o §11 nem a medição tinham visto — já estava implementada duas vezes no produto |
