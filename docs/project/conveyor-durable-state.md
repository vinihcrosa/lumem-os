# O que a esteira guarda — e o que ela já deriva de graça

> **Estudo**, e ele sustenta uma decisão: a Parte 2 da
> [`028`](../features/028-autonomous-orchestration/prd.md) — a esteira. O §11 da PRD guardou a
> conversa técnica com o nome *"lease, heartbeat e recuperação de tarefa cuja sessão morreu"*, e
> mandou ler os invariantes do [Compozy](../references/compozy.md) antes de desenhar os nossos.
>
> Li. **A maior parte deles não se aplica aqui**, e o motivo não é preguiça — é que o Compozy e o
> Lumem têm um número diferente de candidatos a dono. Este arquivo mede a diferença, e diz o que
> sobra.
>
> Escrito em **2026-09-13**.

---

## 1. A pergunta

A esteira vai pegar uma tarefa da fila, abrir uma sessão de agente para ela e esperar. Alguma coisa
tem que responder, depois:

- **quem está com esta tarefa agora?**
- **e se quem estava morreu?**

O Compozy responde as duas com um **lease**: a sessão reivindica o run atomicamente, recebe um
`claim_token_hash` e um `lease_until`, renova por `heartbeat`, e um varredor de 15 em 15 segundos
devolve à fila o que expirou, incrementando um `recovery_count` durável.

É um desenho bom, e a tentação é copiá-lo. A pergunta deste estudo é se ele responde **a nossa**
pergunta ou a de outro produto.

---

## 2. A diferença que decide: quantos podem reivindicar

| | Compozy | Lumem |
|---|---|---|
| quem reivindica | **qualquer sessão gerenciada**, inclusive em outra máquina | **o daemon**, e só ele |
| como a sessão aparece | ela chega e pede (`task next --wait`) | **o daemon a cria** — `spawn`, com a tarefa já decidida |
| quantos daemons por estado | vários processos contra o mesmo banco | **um** por `~/.lumem` |

O `claim_token_hash` existe porque, no Compozy, **duas sessões podem pedir o mesmo run no mesmo
milissegundo**, e porque `heartbeat/complete/fail` chegam de fora — de um processo que o servidor não
controla e cuja identidade ele precisa provar. É por isso que o token bruto nunca cruza a superfície
pública e as tools rejeitam qualquer payload que o carregue.

**Nenhuma das duas coisas é verdade aqui.** A sessão do implementador não pede a tarefa: ela nasce
porque o daemon decidiu abri-la, no mesmo processo que leu a fila. *"Exatamente uma sessão detém o
lease de um run não-terminal"* não é um invariante que precisamos sustentar — é uma consequência de
haver um só escritor.

> Isto é o [ADR de 2026-09-13](../adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md) aplicado
> ao contrário do usual: ele diz que o que vem de fora se adapta ao nosso modelo. Aqui o que vem de
> fora é uma **ideia** — e ela também se adapta, ou não entra.

---

## 3. O que já está de pé, e responde sozinho

### 3.1 "Quem está com esta tarefa" já é derivado, e não pode mentir

A [T7](../features/028-autonomous-orchestration/tasks.md#t7-o-selo-derivado) entregou o selo como
**função do turno em voo**, e o §4.1 da PRD escreve a razão: *"ele **não pode** divergir da
realidade, como uma coluna guardada pode"*.

A sequência é curta e está toda em código que existe:

1. `session.taskId` — a coluna da [`022`](../features/022-workspace-tasks/prd.md) — liga a sessão à
   tarefa;
2. `AcpManager.liveTurns()` devolve os turnos em voo;
3. `liveTurnsByTask` cruza os dois, e `sealOf` decide.

Um lease seria uma **quarta** fonte para a mesma pergunta, e guardada. Ela poderia discordar das
outras três — que é exatamente o defeito que o selo derivado existe para não ter.

### 3.2 A recuperação já é grátis, e tem teste

O `seal.test.ts` prova a propriedade em uma frase: **matar a sessão faz o selo voltar na leitura
seguinte, sem nenhuma escrita.** Um turno que morre apaga `promptInFlight` — o que a
[T17](../features/028-autonomous-orchestration/tasks.md#t17-cota-não-é-orçamento--pausada) consertou
como defeito de verdade —, então a tarefa volta a *"etapa devida, sem trabalhador"*, que é a definição
da fila do §4.1.

Ou seja: **o varredor de leases expirados do Compozy, aqui, é a própria leitura da fila.** Não existe
estado velho para varrer, porque não existe estado.

> **E um lease pioraria isso.** Com `lease_until` guardado, uma tarefa cuja sessão morreu ficaria
> presa até o relógio vencer — inventando uma espera que hoje não existe. A propriedade que temos é
> melhor que a que copiaríamos.

---

## 4. O que **não** é grátis, e é o resto do estudo

### 4.1 Quantas vezes já se tentou

Sem número guardado, uma tarefa que mata a sessão toda vez volta à fila **para sempre**, e cada volta
gasta. É o `recovery_count` do Compozy, e é a única peça da tabela dele que este produto precisa
inteira, porque é a única que **não** é derivável: o que aconteceu antes não está em lugar nenhum
depois que o processo morreu.

O Compozy escala para `needs_attention` em `attempt + recovery_count >= max_attempts`. Nós já temos
para onde escalar: o selo `bloqueada`, com o motivo, que a
[T19](../features/028-autonomous-orchestration/tasks.md#t19-o-cartão-bloqueado-nomeia-o-teto) está
esperando ter o que pintar.

### 4.2 Turno acabado não é tarefa acabada

Medido, e é o achado que mais restringe o desenho da esteira. Do
[estudo de orquestração](orchestration-measurements.md):

- dos **13 `end_turn`** gravados neste repositório, **4** significaram *terminei*. Três eram o turno
  **morrendo no meio do trabalho**;
- **31%** dos turnos que commitaram deixaram pergunta em aberto no mesmo turno — *terminou* e *te
  perguntou* não são exclusivos;
- e o commit **não separa** *terminou* de *desistiu inventando*: a tarefa impossível virou commit em
  **3 de 4** execuções, com o serviço inventado junto.

A consequência para a esteira: **ela não pode tratar o fim do turno como fim da tarefa.** O que move
a seta é o fato verificável do §4.1 — a PR existe, o CI ficou verde —, e entre um turno que acabou e
um fato que ainda não aconteceu existe um laço.

O laço é a tentativa do §4.1 acima: o turno acabou, o fato não veio, ainda há tentativa — prossegue.
Não há mais tentativa — `bloqueada`, com o motivo.

### 4.3 A autonomia por tarefa

A [Q40](../features/028-autonomous-orchestration/open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão)
já decidiu que existe um interruptor por tarefa, e que **assumir** o volante o desliga. Ele é
guardado por definição — é uma escolha sua, e escolha não se deriva de nada.

---

## 5. O que sobra, lado a lado

| Invariante do Compozy | Aqui |
|---|---|
| um dono por run | **consequência**, não invariante: há um escritor só |
| 1 lease ativo por sessão | não se aplica — a sessão não pede, ela é criada |
| session fencing, `claim_token_hash` | não se aplica — nada chega de fora para ser autenticado |
| recuperação por expiração de lease | **já é grátis**: o selo é derivado, e a fila relê |
| `recovery_count` durável | **fica**, e é a única peça inteira que sobrevive |
| exaustão → `needs_attention` | **fica**, e o destino já existe: selo `bloqueada`, com o motivo |
| anti-stale (heartbeat tardio depois de recovery) | não se aplica — não há heartbeat |
| blocks tipados (`needs_input`, `capability`, `transient`) | **vale a leitura**, e vira `reason`, que a `022` já tem |
| unblock-loop breaker (contador que só zera em sucesso) | **fica a regra**, e ela é a do §4.1 acima |
| completion claim gate (verificar id criado antes do write) | **já existe**, em outro nome: a porta do agente é proposta, e [`022`] verifica |
| wake-creator | fora de escopo: a [Q47](../features/028-autonomous-orchestration/open-questions.md#q47--o-que-passa-de-uma-sessão-para-outra) decidiu que **nada passa** |
| pause em duas escalas | **fica**, e as duas já têm nome: autonomia do workspace e autonomia da tarefa |

**Três linhas de dez ficam**, e as três são sobre *quantas vezes já se tentou* — não sobre *quem é o
dono*.

---

## 6. A recomendação

> **A esteira não precisa de lease. Precisa de um contador de tentativas.**

Concretamente, e é pouco:

- **`task.attempts`** — quantas vezes a esteira abriu sessão para esta tarefa **nesta etapa**, e zera
  quando a etapa muda. O contador do Compozy que *"só zera em conclusão bem-sucedida"* é a mesma
  regra: aqui, mudar de etapa **é** a conclusão bem-sucedida daquela etapa;
- **`task.autonomy`** — o interruptor da [Q40](../features/028-autonomous-orchestration/open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão),
  por tarefa;
- **nada mais guardado.** Quem está com a tarefa continua sendo derivado, e a recuperação continua
  sendo a leitura seguinte.

O que isso custa, escrito para não ser descoberto depois: **duas esteiras no mesmo `~/.lumem`
quebrariam a conta**, porque o *"um escritor só"* deixaria de valer. Hoje o produto não tem esse caso
— um daemon por estado é o desenho desde o walking-skeleton, e a
[`014`](../features/014-distribution/prd.md) empacota exatamente isso. Se um dia tiver, **é aqui que
o lease volta**, e este arquivo é o gatilho.

---

## 7. O que este estudo **não** decidiu

- **quantas tentativas** — é número, e número sem uso é chute. Ele nasce na PRD com o valor do
  Compozy (`2`) e muda quando a esteira rodar contra trabalho de verdade;
- **o que a segunda tentativa vê.** A worktree ficou com o trabalho pela metade, e a
  [Q47](../features/028-autonomous-orchestration/open-questions.md#q47--o-que-passa-de-uma-sessão-para-outra)
  diz que **nada passa de uma sessão para outra**. Então a segunda sessão abre num checkout que já
  tem mudança e não sabe de onde ela veio. Isso é pergunta de desenho e está na rodada da Parte 2;
- **o CI como portão** — nomeado no §4.1 da PRD e no §4.2 acima, e ele depende do `gh`, que o
  [ADR de 2026-08-30](../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md) já governa.
