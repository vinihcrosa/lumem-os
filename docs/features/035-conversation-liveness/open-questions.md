# Sinal de vida da conversa — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 3 perguntas · **3 respondidas** (2026-09-29), as três **a favor da proposta**. O plano já
estava escrito com elas, então nenhuma resposta mudou critério. A Q1 e a Q3 vêm da própria
[LUM-67](https://linear.app/lumem-os/issue/LUM-67/conversa-sinal-de-vida-saber-se-o-agente-ainda-esta-trabalhando)
(*"o que decidir antes de escrever"*); a Q2 nasceu do plano.

---

### [x] Q1 — O limiar do silêncio é 90 s?

Com turno em voo, sem ferramenta rodando e sem permissão pendente, depois de quanto tempo sem evento
a linha fica âmbar (critério 23)?

O que já se sabe: o raciocínio longo do Claude manda `agent_thought_chunk` enquanto pensa, então um
agente pensando **não** fica em silêncio; o silêncio sem ferramenta é o intervalo entre o fim de uma
chamada e o próximo pedaço de texto, e isso raramente passa de dezenas de segundos. Ferramenta longa
não conta — ela tem a sua própria frase (critério 24).

**Proposta pra reagir:** **90 s, uma constante no `web`**, e reavaliar depois de uma semana de uso.
Curto o bastante para aparecer antes de a pessoa desistir de esperar; longo o bastante para não
disparar no intervalo normal entre dois passos — o alarme que dispara à toa é o que todo mundo
aprende a ignorar (o §8 da [`028`](../028-autonomous-orchestration/prd.md) diz isso sobre o encalhe).

**O que a resposta muda:** o número do critério 23 e do teste que o prova. Configurável em `/settings`
está no *Out of scope* do plano até uma semana de uso dizer que precisa.

**R (2026-09-29): 90 s, uma constante no `web`** — a proposta. Reavaliar depois de uma semana de uso.

---

### [x] Q2 — A reconexão desiste algum dia?

Quando o `/acp` cai sem `4404`, o web reabre a 0,5 s, 1 s, 2 s, 4 s, 8 s e depois a cada 10 s
(critério 8). Isso para em algum momento?

**Proposta pra reagir:** **não desiste enquanto a aba está montada.** O daemon é local, e a causa
mais comum de queda é ele reiniciando — `pnpm dev` recompilando, ou a pessoa reabrindo o pacote. Uma
aba que desistiu depois de N tentativas pede um clique para voltar, e esse clique é exatamente o
*"parece viva e parada ao mesmo tempo"* que a Parte 2 existe para acabar. O custo de não desistir é
uma tentativa a cada 10 s, por aba aberta, contra `127.0.0.1`.

Alternativa: desistir após ~2 min e mostrar `↻ reconectar`. Faz sentido se o daemon deixar de ser
local — que é a porta que a [`019-daemon-auth`](../019-daemon-auth/prd.md) abre, e ainda não abriu.

**O que a resposta muda:** o critério 8, e um botão novo no aviso se a resposta for desistir.

**R (2026-09-29): não desiste enquanto a aba está montada** — a proposta. Volta a ser pergunta quando
a `019-daemon-auth` tirar o daemon da máquina de quem olha.

---

### [x] Q3 — O turno interativo ganha teto de tempo?

A esteira desiste de um turno em 30 min (`TURN_TIMEOUT_MS`, em `tasks/conveyor.ts`); o caminho
interativo não tem teto nenhum.

**Proposta pra reagir:** **não — só o aviso.** Quem está olhando decide, e o aviso de silêncio é o
que dá a essa pessoa o dado para decidir. Um teto no interativo mataria o `pnpm test` de 40 minutos
que ela pediu de propósito, e a esteira tem teto porque **ninguém** está olhando.

**O que a resposta muda:** hoje nada — o teto está no *Out of scope* do plano. Se a resposta for
*sim*, ele volta como critério de uma fatia nova, com o número e o que a conversa diz quando ele cai.

**R (2026-09-29): não — só o aviso** — a proposta. O teto fica no *Out of scope* do plano.
