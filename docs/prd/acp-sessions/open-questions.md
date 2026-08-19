# A sessão vira conversa — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Estado:** 15 perguntas · **14 respondidas · 1 aberta**

**Rodada 1 (2026-08-17):** dez seguiram a proposta. Duas não: a **A9** trocou o default de permissão
para `auto` (e o §C registra o que isso cobra), e a **A6** pediu número antes de decidir — o número
está lá, medido nas suas próprias transcrições.

**Rodada 2 (2026-08-19):** o protótipo da fase 2 levantou duas perguntas que não existiam no papel
— as duas só apareceram quando a tela foi renderizada de verdade: **A13** (a descrição do modo é
string do agente, em inglês) e **A14** (interrompido não é nenhum dos quatro estados que o PRD lista).
As duas seguiram a proposta, então a tela já está desenhada com a decisão dentro.

**Rodada 3 (2026-08-19):** a fase 4 abriu a **A15** — trocar de modo no meio de um turno. Implementei
como recusa, que é o que a task declarava, e a pergunta está aberta porque o caso contrário tem
argumento real.

**Como usar:** responda embaixo, no `**R:**`. Cada pergunta traz uma **proposta pra reagir** —
discordar dela é mais rápido que escrever do zero.

> As decisões de **transporte** já estão fechadas em [pty-vs-acp.md](../../project/pty-vs-acp.md)
> (**TA1–TA6** lá — prefixo `T` de transporte, para não colidir com as **A1–A12** deste arquivo).
> Aqui é o que sobra: a **tela**, o modelo de sessão, e o que fazer com o que o protocolo
> oferece a mais.

---

## A. A tela

### [x] A1 — A conversa substitui o terminal na aba, ou divide espaço com ele?

Hoje a aba é um terminal, e a [right-panel](../right-panel/prd.md) já abre um split para o arquivo. A
conversa pode **ocupar o lugar** do terminal, ou nascer como um terceiro tipo de painel.

**Proposta pra reagir:** ocupa o lugar. Sessão de agente com `transport: acp` desenha conversa; com
`transport: pty`, desenha terminal. É a mesma aba, com dois renderizadores — e o split de arquivo
continua funcionando igual nos dois.

**R:** ocupa o lugar do terminal

**Decisão:** a mesma aba, dois renderizadores, escolhidos por `transport`. O split de arquivo da
`right-panel` continua funcionando igual nos dois.

---

### [x] A2 — Qual é o mínimo para a conversa ser usável no dia a dia?

A F2 tem oito itens. O menor conjunto que já substitui o terminal, na minha leitura: **mensagem +
ferramenta + permissão**. Plano, modos, comandos de barra e uso podem vir depois sem tornar a tela
inútil.

**Proposta pra reagir:** fase 3 entrega os três, e só. O resto é fase 4.

**R:** concordo

**Decisão:** o mínimo é **mensagem + ferramenta + permissão**. Plano, modos, comandos de barra e uso
são fase 4. É o que define o tamanho da fase 3 do PRD.

---

### [x] A3 — Raciocínio aparece?

O `agent_thought_chunk` é o "pensando" do modelo. Mostrar sempre polui; esconder sempre tira o sinal
de que algo está acontecendo.

**Proposta pra reagir:** colapsado por padrão, com uma linha viva enquanto ele escreve ("pensando…"),
e expansível. É o que os clientes ACP fazem, e é o que o terminal te dá hoje.

**R:** concordo

**Decisão:** raciocínio colapsado por padrão, com uma linha viva enquanto escreve.

---

### [x] A4 — Como a chamada de ferramenta é mostrada?

Um cartão por chamada, com estado e resultado. As perguntas de verdade: o **resultado** aparece
inteiro, truncado, ou só sob clique? E `read_file` de 2.000 linhas?

**Proposta pra reagir:** cabeçalho sempre (ferramenta, alvo, estado), corpo **colapsado** com teto de
altura, e o diff de escrita renderizado com o mesmo componente da `right-panel` — que já sabe pintar
patch.

**R:** concordo.

**Decisão:** cabeçalho sempre visível (ferramenta, alvo, estado), corpo colapsado com teto de altura, e
diff de escrita renderizado pelo componente que a `right-panel` já tem.

---

### [x] A5 — O terminal que o agente pede vive dentro da conversa ou vira aba?

`terminal/create` é o agente pedindo um shell. Dentro da conversa mantém a narrativa; em aba separada
aproveita o terminal que já existe e é melhor para comando longo.

**Proposta pra reagir:** dentro da conversa, com o `xterm` embutido no cartão — porque o resultado
pertence ao turno que o pediu. Comando que vira interativo é o caso que precisa de saída, e aí sim
"abrir em aba".

**R:** concordo.

**Decisão:** o terminal do agente vive **dentro do cartão**, com o `xterm` embutido. "Abrir em aba"
fica para o comando que vira interativo.

---

## B. Sessão e modelo de dados

### [x] A6 — O que fica no banco: transcrição inteira ou só o resumo?

O protocolo entrega tudo, e o Compozy guarda um SQLite por sessão. Guardar a transcrição inteira
permite busca e destilação; e é volume de verdade.

**Proposta pra reagir:** guardar os eventos, num banco por sessão — é o que a memória (parte 07) vai
consumir, e é o único jeito de reabrir uma conversa. Retenção fica para depois, com número medido.

**R:** eu quero a ordem de grandeza quão pesado ficaria guardar a transcrição inteira, depois eu decido o que guardar.

#### O número, medido nas suas transcrições

Amostra real: `~/.claude/projects`, **675 sessões em 42 dias** (2026-07-06 a 2026-08-17), 461 MB.
Não é estimativa — é o seu uso.

| | |
|---|---|
| Ritmo | **16,1 sessões/dia** |
| Sessão mediana | **372 KB** |
| p75 · p90 · p99 | 696 KB · 1,2 MB · 5,7 MB |
| Maior sessão | **24,2 MB** |
| Volume | **11 MB/dia · 329 MB/mês · 3,9 GB/ano** |

**Onde o volume mora:** na cauda. A sessão mediana é pequena; as maiores dominam o total. Na maior
delas, 21 dos 24 MB são eventos `user` — que é onde o resultado de ferramenta volta. O texto do
agente é 1,8 MB dos 24.

**O que eu testei e não funciona:** pôr teto no campo de resultado de ferramenta (32 KB por
resultado) economiza **5%**. O grosso não está num campo isolado, está no conteúdo da mensagem.

**O que funciona:** compressão.

| | Original | gzip -6 | Razão |
|---|---|---|---|
| mediana | 372 KB | 73 KB | **5,1×** |
| p90 | 1,2 MB | 301 KB | 4,1× |
| maior | 24,2 MB | 13,2 MB | 1,9× (anexo em base64 não comprime) |

**Ordem de grandeza para decidir:**

| Política | Custo no seu ritmo |
|---|---|
| Guardar tudo, cru | 329 MB/mês · **3,9 GB/ano** |
| Guardar tudo, comprimindo o que passou de N dias | ~80 MB/mês · **~1 GB/ano** |
| Guardar só mensagem e chamada de ferramenta, sem resultado | ordem de 30–50 MB/mês, e perde o material da destilação |

**Proposta pra reagir:** guardar **tudo**, num banco por sessão (purge e arquivamento ficam triviais),
comprimindo o que passou de 30 dias. 1 GB/ano é barato demais para justificar jogar fora o insumo que
a [parte 07 da memória](../workspace-memory/roadmap.md) vai consumir — e o que for jogado fora não
volta.

Ressalva honesta: o fluxo ACP deve ser **menor** que este, porque o `.jsonl` do Claude Code carrega
`file-history-snapshot` e anexos que o protocolo não repassa. Trate como teto, não como previsão.

**Dado novo do prompt real (§2.3 do PRD):** um turno trivial reportou 39.200 tokens — quase tudo
escrita e leitura de cache do system prompt. Se cada sessão carrega esse peso na abertura, a
transcrição de uma sessão curta é **pequena em bytes** e **cara em tokens**; são dois eixos
diferentes, e o que esta pergunta decide é só o dos bytes.

**R (rodada 2):** guarda tudo, o custo é baixo.

---

### [x] A7 — `session/load` é usado para quê, exatamente?

O spike confirmou `loadSession: true` e as capacidades de `resume`, `fork` e `list`. Isso permite
"continuar a conversa de ontem" — e também **forkar** uma conversa, que é uma feature de produto que
nenhuma referência tem.

**Proposta pra reagir:** v1 usa só o `resume` (reabrir a aba de ontem). `fork` vira item de
[backlog](../../project/backlog.md), porque é desenho de produto, não de transporte.

**R:** concordo.

**Decisão:** v1 usa `resume` (reabrir a conversa de ontem). `fork` vai para o
[backlog](../../project/backlog.md) — é desenho de produto, não de transporte.

---

### [x] A8 — Quem é dono do modo e do modelo: a sessão ou o `agent_config`?

`configOptions` traz `mode`, `model`, `effort`, `fast`, `agent`. Dá para fixar no `agent_config`
("este agente é Opus em modo plan") ou deixar a sessão trocar na hora.

**Proposta pra reagir:** o `agent_config` define o **default**, a sessão troca e a troca **persiste
naquela sessão**. É o que o usuário espera de um seletor.

**R:** concordo.

**Decisão:** `agent_config` define o default; a sessão troca e a troca persiste naquela sessão.

---

## C. Permissão

### [x] A9 — Qual é o default de permissão do Lumem?

O protocolo oferece `auto`, `default` (pergunta), `acceptEdits`, `plan`, `dontAsk`. O CLI hoje é
seu; o Lumem passa a escolher.

**Proposta pra reagir:** `default` (pergunta) no v1, sem exceção — inclusive porque é o modo que
exercita o diálogo da F2.4, que é o item que mais quebra se ninguém usa.

**R:** auto.

**Decisão: `auto`** — o modo em que um classificador aprova ou nega os pedidos, em vez de perguntar
sempre.

**O que isso cobra, e precisa de aceite:**

1. **O diálogo de permissão continua obrigatório na fase 3.** O `auto` não elimina o pedido — ele
   decide sozinho o que consegue decidir, e o resto sobe para você. Um Lumem sem diálogo trava nesse
   resto;
2. **o diálogo passa a ser exercitado pouco**, que é exatamente como um caminho quebra sem ninguém
   ver. Ele precisa de teste próprio, não de uso casual;
3. **a guarda de caminho (F4.1) vira a rede principal.** Com menos confirmação humana, o que impede o
   agente de escrever fora do checkout é código, não atenção. Ela não pode ter exceção;
4. o seletor continua oferecendo `default` (Manual), `plan`, `acceptEdits` e `dontAsk` — o default é
   ponto de partida, não prisão.

---

### [x] A10 — Pedido de permissão fora da aba visível: como avisa?

Um agente rodando em outra aba pode travar esperando você. Sem sinal, ele fica parado sem ninguém
saber.

**Proposta pra reagir:** marcador na aba e contagem na sidebar — o mesmo lugar onde a worktree já
mostra estado. Notificação de sistema fica para depois.

**R:** concordo. Mas coloca notificação nas features do futuro.

**Decisão:** marcador na aba e contagem na sidebar no v1. **Notificação de sistema foi para o
[backlog](../../project/backlog.md)** — e ela ficou mais importante com a A9: em `auto`, o que sobe
para você é o caso raro, e caso raro é o que passa despercebido.

---

## D. Escopo e risco

### [x] A11 — O que acontece com o `agent_config` que hoje aponta para `claude` em PTY?

Depois da migração, existe configuração antiga com `transport` implícito.

**Proposta pra reagir:** migração escreve `transport: 'pty'` em tudo que existe, e a configuração nova
de Claude nasce `acp`. Ninguém perde sessão, e a troca é explícita.

**R:** concordo.

**Decisão:** a migração escreve `transport: 'pty'` em toda configuração existente; configuração nova
de Claude nasce `acp`. Ninguém perde sessão, e a troca é explícita.

---

### [x] A12 — Versão do adaptador: fixa ou `@latest`?

`npx -y @agentclientprotocol/claude-agent-acp@latest` sempre pega o mais novo — e o repo publica quase
todo dia. Fixar dá reprodutibilidade e envelhece.

**Proposta pra reagir:** **fixar** a versão no `agent_config`, com a atualização sendo ação sua. Um
adaptador que muda sozinho debaixo de uma sessão em andamento é a definição de falha invisível.

**R:** concordo, deixa fixado.

**Decisão:** versão **fixa** no `agent_config` (hoje `@0.69.0`), atualização como ação sua. O spike já
rodou contra versão fixa, então o número medido no PRD tem significado.

---

## E. O que o protótipo levantou

> As duas perguntas desta seção nasceram na **fase 2** — o protótipo em
> `packages/web/prototype/lumem-acp-conversation.html`. Nenhuma delas era visível lendo o PRD; as duas
> apareceram ao olhar o pixel. O protótipo já mostra a proposta funcionando, então discordar aqui
> custa uma rodada de CSS, não uma refatoração de React.

### [x] A13 — Texto que vem do agente: cola como veio, ou traduz?

O `configOptions` entrega `description` por opção, e vem em inglês: `"Use a model classifier to
approve/deny permission prompts"`, `"Bypass all permission checks"`. O mesmo vale para
`available_commands_update` e para os nomes de modo (`Accept Edits`, `Plan Mode`).

O repositório fala português na interface. Mas esse texto **não é nosso** — é dado que o agente manda,
e ele muda de versão para versão do adaptador.

**Proposta pra reagir:** **colar como veio**, sem traduzir. Três motivos: traduzir cria uma tabela de
tradução que envelhece a cada release do adaptador; o texto é a fonte da verdade sobre o que a opção
faz, e uma tradução nossa que discorda dele é pior que inglês; e um agente que não é o Claude vai
mandar outras strings, então a tabela nunca fecharia. O que é **nosso** — rótulo de campo, estado,
mensagem de erro — continua em português.

**R:** Concordo.

**Decisão:** texto que vem do agente vai **verbatim**, sem tradução — `description` de
`configOptions`, nome de modo, e a lista de `available_commands_update`. O que é do Lumem — rótulo de
campo, estado de cartão, mensagem de erro, tudo que a tela inventa — continua em português. A fronteira
é a origem do texto, não o idioma dele.

---

### [x] A14 — `stopReason: cancelled` é falha?

O PRD lista quatro estados para o cartão de ferramenta: pendente, rodando, ok, falhou
([F2.3](prd.md)). Interromper o turno não é nenhum dos quatro. No protótipo, pintar o cartão
interrompido de vermelho ficou errado ao olhar: nada quebrou, **você** parou.

**Proposta pra reagir:** um **quinto estado**, `tool/cancelled`, em neutro claro (`neutral/400`) — mais
claro que `pendente` porque é estado **final** e final se nota, e sem cor de status porque não é nem
sucesso nem falha. Consequência: o `stopReason` do protocolo passa a mapear para cinco estados, não
quatro, e `session/cancel` deixa de produzir um cartão que parece bug.

**R:** concordo.

**Decisão:** **quinto estado**, `tool/cancelled` em `neutral/400`, já no `tokens.css`. `session/cancel`
produz cartão neutro e final, não cartão vermelho. O mapa de `stopReason` para estado de cartão passa a
ter cinco entradas, e `cancelled` é a única que não é nem sucesso nem falha.

---

### [ ] A15 — Trocar de modo ou de modelo no meio de um turno: recusa, ignora, ou vale pro próximo?

O protocolo não diz o que `session/set_mode` significa na metade de um turno, e o agente pode já ter
agido sob o valor antigo. Três saídas:

1. **Recusar**, dizendo por quê.
2. **Aplicar ao próximo turno**, dizendo que é isso que vai acontecer.
3. **Aplicar já** e aceitar que o efeito é indefinido.

A 3 está fora: deixa o usuário acreditar que mudou a regra do que está acontecendo agora, e é a única
das três que mente.

**O que está implementado:** a **1**. `AcpManager.setConfig` recusa com `BLOCKED` e as pílulas ficam
desabilitadas com o motivo no `title`.

**O caso contra:** ver uma chamada perigosa e querer apertar o modo **naquele instante** é um desejo
legítimo. Hoje a resposta é o diálogo de permissão — que resolve *aquela* chamada, não a política do
resto do turno. Se você usar isso e sentir falta, a **2** é a próxima menos ruim: a pílula mostraria o
valor novo com uma marca de "a partir do próximo turno", e o daemon guardaria a troca para aplicar no
`session/prompt` seguinte.

**Custo de mudar depois:** baixo. É uma condição no `setConfig` e um estado a mais na pílula; nada do
contrato muda.

**R:**

---

### [ ] A16 — Onde vive a configuração de agente na tela, se ela é global e a sidebar é do workspace?

`agent_config` não tem coluna de workspace: uma configuração vale para o daemon inteiro. A ação de
criar uma nasceu no **rodapé da sidebar**, ao lado de `adicionar projeto` — que é ação de workspace.

Isso conta uma mentira pequena: sugere que o agente pertence ao workspace aberto. Três saídas:

1. **Rodapé da sidebar**, como está. Descobrível — é onde o usuário está quando percebe que falta o
   agente — e reusa o formulário em linha que o `AddProjectDialog` já desenhou.
2. **Tela de preferências** própria, alcançada pela topbar. Sem mentira nenhuma, e é uma tela nova:
   protótipo primeiro, e um lugar no `App` que hoje só o `FirstRun` ocupa.
3. **Configuração por workspace**, tornando a mentira verdade. Muda schema e é decisão de produto:
   "o mesmo Claude em todo workspace" é provavelmente o que se quer.

**O que está implementado:** a **1**, com a mentira nomeada aqui em vez de escondida.

**Custo de mudar depois:** baixo para a **2** — o componente é um formulário e uma lista, e mudar de
lugar é mudar quem o renderiza. Alto para a **3**: é coluna nova, migração, e uma pergunta de produto
antes disso.

**Volta quando:** existir uma segunda coisa para configurar globalmente. Aí a tela de preferências
deixa de ser exagero e passa a ser o lugar óbvio das duas.

**R:**
