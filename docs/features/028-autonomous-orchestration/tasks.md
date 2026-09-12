# O orquestrador autônomo — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) ·
**Briefing de desenho:** [design-brief.md](design-brief.md) ·
**Medições:** [orchestration-measurements.md](../../project/orchestration-measurements.md)

**Status:** em execução
**Histórico:** aberto em **2026-09-12**, e **só com a F1**. O corte é decisão registrada: das seis
partes do §6, este arquivo executa **uma** — o quadro lendo a
[`022`](../022-workspace-tasks/prd.md), com a autonomia desligada. A esteira (F2), o orçamento (F3), a
supervisão (F4) e as duas pontas do tracker (F5, F6) ficam para um `tasks.md` seguinte, e o §0 diz
por quê. A fase 0 está **entregue**: o desenho sincronizado e o estudo do §11 escrito, e ele mudou
duas coisas antes de existir código.

A ordem tem uma regra: **o modelo antes da leitura, a leitura antes da tela** — e a tela por último
porque é a mais barata de refazer e a única represada pelo Open Design, que desta vez já entregou.

---

## 0. Por que só a F1

A `028` inteira é a maior feature do repositório: quadro, esteira, orçamento, supervisão, entrada de
tracker e escrita no tracker. Três coisas decidiram cortá-la aqui:

1. **O §11 da PRD guardou nove conversas técnicas, e seis continuam guardadas.** O
   [estudo](../../project/orchestration-measurements.md) mediu três. Duas das que sobraram — de onde
   vem o segredo do tracker, e o que passa de uma sessão para outra — **não têm resposta, e uma delas
   exige ADR novo** porque contradiz o [ADR de
   2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). Escrever tasks de F5 e
   F6 agora seria escrever contra um vazio.
2. **A F1 não depende de nenhuma delas.** O quadro lê a `022`, que está entregue. Com a autonomia
   desligada — que é o **default do produto** — ele desenha o estado real do workspace sem uma linha
   de esteira.
3. **O desenho já mediu que o quadro é a feature** (§2 da PRD). Ter a tela antes da autonomia é a
   ordem certa: sem um lugar que responda *"o que está acontecendo"*, autonomia é uma forma de
   descobrir o problema tarde.

**O que a F1 entrega:** o quadro, com o cartão, o selo, o arrasto, os filtros e o piso de largura. O
selo nasce quase sempre em `manual — ninguém pega`, e é exatamente por isso que ele precisa existir —
sem ele, um quadro com a autonomia desligada desenha o mesmo pixel de uma esteira travada (§10.2 da
PRD).

**O que a F1 não entrega:** ninguém pega nada sozinho. Nenhuma seta é movida pela máquina, exceto a
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
| `dropped` sai do quadro | §6/F1 — vira arquivo, não sétima coluna |
| o Lumem não guarda segredo | o [ADR de 2026-08-30](../../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md). Sem F5, nada aqui encosta em tracker |
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
> Nenhuma seta do quadro pode depender do transporte — e isso vale para a F2, não para a F1, que não
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

## Fase 2 — a leitura

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

> **O teste de que ele é derivado é o teste de que ninguém o escreveu.** É o mesmo par de casos que o
> §12 da PRD pede, e o único dos dois que a F1 alcança.
>
> **E "sessão viva" não é "processo vivo".** A T1 mediu: 7 dos 15 transcripts não têm um único turno.
> Uma sessão aberta e nunca usada desenharia `implementando há 3 h` se o critério fosse o processo.

---

## Fase 3 — a tela

#### T8: As colunas, e o piso de largura

**What**: o quadro na tela do workspace. Coluna de **200px** (`--size-board-col`), trilho de **36**
(`--size-board-rail`), `Backlog` e `Done` recolhidos por padrão — **cinco colunas e dois trilhos**, o
default medido em 1440.
**Where**: `packages/web/src/components/Board/`
**Done when**: bate com `lumem-board.html`; cinco cartões cabem numa coluna de 682px sem rolar, quatro
quando todos têm linha viva; e **nenhum literal de cor, espaço ou tipografia** — só `var(--token)`.
**Gate**: `pnpm gate:quick`

#### T9: Abaixo de 1418px, o quadro diz que está rolando

**What**: rolagem horizontal com a faixa *"2 colunas fora da tela"*, em vez de fingir que cabe
([Q37](open-questions.md)).
**Where**: `packages/web/src/components/Board/`
**Done when**: em 1418 as cinco colunas e os dois trilhos cabem sem faixa; em 1200 a faixa aparece com
o número certo; e **encolher a coluna abaixo de 200 não é a saída** — o título vira três linhas e a
linha viva perde o nome do arquivo.
**Gate**: `pnpm gate:quick`

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

---

## Fase 4 — o portão

#### T12: O e2e do quadro

**What**: a spec que prova o que a F1 entrega, com **zero token** — nenhum agente real sobe.
**Where**: `e2e/`
**Done when**: quatro caminhos passam —
**(a)** um workspace com tarefas nos sete estados desenha sete colunas, com as duas pontas
recolhidas; **(b)** arrastar entre colunas persiste a coluna e a ordem, e arrastar para `In Progress`
é recusado com o motivo visível; **(c)** abrir uma sessão ligada a uma tarefa `open` move o cartão
para `In Progress` **e acende o selo**, e matar a sessão apaga o selo sem mover o cartão de volta;
**(d)** em 1200px a faixa de rolagem aparece dizendo quantas colunas ficaram fora.
**Gate**: `pnpm gate:full`

> **O (c) é o que paga por esta fase.** Ele prova as duas metades da T7 de uma vez: o cartão se move
> por fato derivado, e o selo **volta sozinho na leitura seguinte** sem ninguém ter escrito nada.
>
> **E o (d) pergunta `document.elementFromPoint`, não `toBeVisible`** — a lição da
> [`023`](../023-composer-menus/prd.md): contra um elemento recortado por ancestral, o segundo fica
> verde.

---

## O que fica para o `tasks.md` seguinte

| O quê | O que destrava |
|---|---|
| **F2 — a esteira** | a resposta de *"três sessões por tarefa: o que passa de uma para outra"*, e o laço do implementador que a T1 provou ser necessário (turno acabado ≠ tarefa acabada) |
| **F3 — orçamento** | nada. `max_turn_requests` já chega ao daemon, e o `rateLimitOf` foi consertado pela [`027`](../027-adapter-provenance/prd.md). É a que está mais perto |
| **F4 — supervisão** | a F2, e o corolário desconfortável do §2.4 do estudo: o selo `aguardando você` **não é derivável do transporte** |
| **F5 e F6 — o tracker** | um **ADR**. O precedente do `gh` não é portável — não existe `linear` na máquina —, e as três opções que sobram estão no §3.4 do estudo. Uma delas contradiz o ADR de 2026-08-30 de frente |
