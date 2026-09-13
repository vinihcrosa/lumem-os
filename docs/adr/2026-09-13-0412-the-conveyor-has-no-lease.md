---
title: A esteira não tem lease — ela tem um contador de tentativas
date: 2026-09-13
area: architecture
summary: O §11 da `028` guardou "lease, heartbeat e recuperação" como a peça técnica que sustenta o selo, e mandou ler os invariantes do Compozy antes de desenhar os nossos. Lidos, seis dos dez não se aplicam: eles existem porque lá **qualquer sessão** pode reivindicar um run, inclusive de outra máquina, e aqui quem reivindica é o daemon, que é um só. "Um dono por run" deixa de ser invariante e vira consequência. E a recuperação já é grátis — o selo é derivado do turno em voo, e matar a sessão o devolve na leitura seguinte, sem escrita nenhuma, com teste. O que **não** é derivável é quantas vezes já se tentou: sem esse número, uma tarefa que mata a sessão toda vez volta à fila para sempre, gastando. Fica `task.attempts` e `task.autonomy`, e nada mais guardado.
feature: 028-autonomous-orchestration
---

## Contexto

A Parte 2 da [`028`](../features/028-autonomous-orchestration/prd.md) é a esteira: o daemon puxa da
fila sem ninguém pedir, abre a sessão do encaixe, e move a seta por fato verificável.

Alguma coisa tem que responder duas perguntas depois disso: **quem está com esta tarefa agora**, e **o
que acontece se quem estava morreu**. A segunda não é hipotética — dos 13 `end_turn` gravados neste
repositório, **três foram o turno morrendo no meio do trabalho**.

O §11 da PRD guardou a conversa com nome e endereço:

> *"**lease, heartbeat e recuperação** de tarefa cuja sessão morreu — o item `G` do backlog, agora
> disparado, e a peça técnica que sustenta o selo do §4.1. O [estudo do Compozy](../references/compozy.md)
> tem os invariantes já projetados (um dono por run, fencing por sessão, devolução por expiração,
> contador de recuperação durável) e vale ler antes de desenhar os nossos."*

Lidos. O [estudo](../project/conveyor-durable-state.md) põe os dez lado a lado com o que já existe
aqui.

## Decisão

**A esteira não guarda lease, claim token, `lease_until` nem heartbeat. Ela guarda duas colunas:**

- **`task.attempts`** — quantas vezes a esteira abriu sessão para esta tarefa **nesta etapa**. Zera
  quando a etapa muda, porque mudar de etapa **é** a conclusão bem-sucedida daquela etapa — a mesma
  regra do *unblock-loop breaker* do Compozy, que *"só zera em conclusão bem-sucedida, nunca em
  unblock ou expiry"*;
- **`task.autonomy`** — o interruptor por tarefa que a
  [Q40](../features/028-autonomous-orchestration/open-questions.md#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão)
  já decidiu que existe, e que **assumir** o volante desliga.

**Quem está com a tarefa continua derivado**, e a recuperação continua sendo a leitura seguinte da
fila.

### Por que os invariantes de lá não atravessam

O `claim_token_hash` do Compozy existe porque lá **duas sessões podem pedir o mesmo run no mesmo
milissegundo**, e porque `heartbeat`/`complete`/`fail` chegam **de fora**, de processos cuja
identidade o servidor precisa provar — daí o token bruto nunca cruzar a superfície pública.

Nenhuma das duas é verdade aqui. A sessão do implementador **não pede** a tarefa: ela nasce porque o
daemon decidiu abri-la, no mesmo processo que leu a fila. Um daemon por `~/.lumem` é o desenho desde
o walking-skeleton, e a [`014`](../features/014-distribution/prd.md) empacota exatamente isso.

*"Exatamente uma sessão detém o lease de um run não-terminal"* não é um invariante que precisamos
sustentar: é o que sobra de haver **um escritor só**.

### E o lease pioraria o que já temos

O selo é **função do turno em voo** ([T7](../features/028-autonomous-orchestration/tasks.md#t7-o-selo-derivado)),
e o §4.1 escreve a razão: *"ele **não pode** divergir da realidade, como uma coluna guardada pode"*. O
`seal.test.ts` prova a propriedade: **matar a sessão faz o selo voltar na leitura seguinte, sem
nenhuma escrita.**

Um lease seria uma **quarta fonte** para a mesma pergunta — e guardada, logo capaz de discordar das
outras três. Pior: com `lease_until`, uma tarefa cuja sessão morreu ficaria presa até o relógio
vencer, **inventando uma espera que hoje não existe**. O varredor de leases expirados do Compozy,
aqui, é a própria leitura da fila.

### O que sobrevive, e é o que não se deriva

Sem contador, uma tarefa que mata a sessão toda vez volta à fila **para sempre**, e cada volta gasta
token. Esse número não está em lugar nenhum depois que o processo morreu — é a única peça da tabela
do Compozy que atravessa inteira. O destino da exaustão também já existe: o selo `bloqueada`, com o
motivo, que a [T19](../features/028-autonomous-orchestration/tasks.md#t19-o-cartão-bloqueado-nomeia-o-teto)
está represada esperando ter o que pintar.

## Alternativas

**Copiar o lease do Compozy inteiro.** É o que o §11 mandou considerar, e a fonte está citada acima
palavra por palavra. Ele resolve um problema que temos (*tarefa cuja sessão morreu*) com uma máquina
dimensionada para um problema que não temos (*vários reivindicadores, alguns em outra máquina*).
Custa duas colunas, um varredor periódico, um caminho de autenticação de chamada externa — e **uma
espera artificial** até o `lease_until` vencer, onde hoje a resposta já é instantânea. Perdeu por
piorar a propriedade que o produto já tem.

**Guardar só `claimed_by_session`, sem token nem relógio.** A versão mínima do lease: a tarefa aponta
para a sessão que a pegou. Custa menos, e mesmo assim cria a quarta fonte — a coluna diria
*"a sessão X está com ela"* depois de a sessão X ter morrido, e alguém teria que limpar. É guardar
para depois ter que varrer o que foi guardado, tendo a resposta derivada ao lado.

**Não guardar nada, nem tentativa.** O mais barato, e o que a Parte 1 teria escolhido — ela passou a
feature inteira evitando estado. Perdeu por medida: **três dos treze turnos morreram no meio do
trabalho**, e uma fila que não conta tentativa transforma cada um deles num laço que gasta até o
orçamento acabar. O teto da Parte 3 seguraria, mas *"o orçamento acabou"* é um diagnóstico muito
pior que *"esta tarefa falhou duas vezes"*.

## Consequências

- **Reafirma** o [ADR de 2026-09-13](2026-09-13-0038-our-model-is-king-outsiders-adapt.md): o modelo é
  do Lumem e o que vem de fora se adapta. Aqui o que veio de fora foi uma **ideia** de outro produto,
  e a regra valeu igual;
- o selo continua sendo a única resposta para *"quem está com ela"*, o que mantém a promessa do §4.1
  intacta na Parte 2 — que era justamente onde ela poderia ter sido quebrada;
- `task.attempts` **zera na mudança de etapa**, então uma tarefa que atravessa as três etapas tem três
  orçamentos de tentativa, e não um. É deliberado: falhar revisando não é o mesmo defeito que falhar
  implementando;
- **duas esteiras no mesmo `~/.lumem` quebram a conta**, porque *"um escritor só"* deixaria de valer.
  O produto não tem esse caso hoje; se tiver, **é aqui que o lease volta**, e o
  [estudo](../project/conveyor-durable-state.md) é o gatilho escrito.
