# Sinal de vida da conversa — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 6 perguntas · **6 respondidas** (2026-09-29), cinco a favor da proposta e a
[Q5](#x-q5--dois-prompt-na-mesma-sessão-ao-mesmo-tempo-são-permitidos) **contra**. As três primeiras o
plano já assumia; a Q4 nasceu da verificação da rodada 1, e a Q5 e a Q6 da rodada 2. A Q1 e a Q3 vêm da própria
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

---

### [x] Q4 — A pergunta fica gravada quando o adaptador morre antes de recebê-la?

Nasceu da [verificação da rodada 1](verification.md). O daemon lê o teto e a memória **antes** de
gravar a mensagem da pessoa — de propósito: o bloco da memória vem antes da pergunta, na ordem em que
o agente lê. Se o adaptador sai nesse intervalo, a saída fecha o turno, e a guarda da S1 desistia de
gravar a mensagem: a transcrição ficava com *"o agente encerrou…"* sem pergunta nenhuma, o composer já
tinha limpado o rascunho — **o texto sumia** —, e o socket mandava por cima `session <id> has exited`,
em inglês.

- **A** — gravar a mensagem antes do fecho, e não mandar o frame `error`;
- **B** — não gravar: o turno não aconteceu, e a pessoa perde o texto;
- **C** — não gravar e devolver o texto ao composer — contrato novo no `/acp`, para um caso raro.

**Proposta pra reagir:** **A.** O replay mostra o que foi perguntado e que falhou, e o texto não se
perde. O custo é o daemon guardar o texto do turno para a saída gravá-lo.

**O que a resposta muda:** os critérios 27 e 28 do plano, e os checks C28 e C29.

**R (2026-09-29): A** — a proposta.

---

### [x] Q5 — Dois `prompt` na mesma sessão, ao mesmo tempo, são permitidos?

Nasceu da [verificação da rodada 2](verification.md). As guardas da correção da rodada 1 liam qualquer
troca de `turnId` como a saída do processo — e um `prompt` novo também troca o `turnId` e sobrescreve o
gatilho que libertaria o primeiro. Resultado: o primeiro `prompt` ficava pendurado para sempre, e a
pergunta dele sumia. Em `origin/main` os dois terminavam. A janela é real: o composer só trava quando a
mensagem entra, e ela entra depois do teto e da memória — uma segunda aba, ou alguém escrevendo na
sessão da esteira, cabe nela.

- **A** — recusar o segundo enquanto há turno em voo, com `já há um turno em andamento nesta sessão`;
- **B** — permitir, como em `origin/main`, e dar a cada turno o seu próprio gatilho, disparado só pela
  saída de verdade.

**Proposta pra reagir:** **A** — o estado da sessão no `AcpManager` (`promptInFlight`, `turnStartedAt`,
`openToolCalls`) e a linha de estado supõem um turno por vez. Não verificado: se o ACP admite dois
`session/prompt` concorrentes na mesma sessão.

**O que a resposta muda:** um check novo para a rodada 3 — o primeiro `prompt` termina — e, na A, um
frame `error` com texto próprio.

**R (2026-09-29): B — permite**, contra a proposta. O comportamento de `origin/main` fica; a guarda passa
a olhar a saída de fato, com um gatilho por turno. O que o estado de turno único mostra com dois turnos
simultâneos continua como era antes desta feature, fora do escopo dela.

---

### [x] Q6 — O prompt pendente do `setup` perde o reenvio automático?

Consequência da [Q4](#x-q4--a-pergunta-fica-gravada-quando-o-adaptador-morre-antes-de-recebê-la),
achada na rodada 2. O primeiro prompt de uma worktree espera o `setup` e sai pelo `sendPendingNow`; a
pendência só se apaga quando a mensagem da pessoa **entra na transcrição** (`pending-prompt.ts`), e uma
sessão morta com a pendência de pé a reenvia sozinha na retomada (`routers/session.ts`, `resume`). Com a
Q4 em A, a saída durante a leitura do teto grava a mensagem — e isso apaga a pendência: a retomada não
reenvia mais.

- **A** — aceitar: o texto fica na transcrição, seguido de *"o agente encerrou…"*, e a pessoa o copia e
  reenvia se quiser;
- **B** — manter a pendência quando a mensagem veio do fecho pela saída: a retomada reenvia, e a
  transcrição mostra a pergunta duas vezes.

**Proposta pra reagir:** **A** — coerente com a Q4, nenhum código, e o caso pede o adaptador morrendo nos
milissegundos da leitura do teto logo depois do `setup`.

**O que a resposta muda:** na A, nada além desta nota. Na B, um sinal no evento e um check.

**R (2026-09-29): A** — a proposta.
