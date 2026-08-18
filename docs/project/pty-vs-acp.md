# PTY ou ACP — como o Lumem-OS fala com o agente

> **Status:** **DECIDIDO em 2026-08-17 — migrar para ACP. Discussão encerrada, A1–A6 respondidas.**
> O registro da decisão, o que ela obriga e o que ela derrubou estão no §9. Os §§1–7 ficam como
> estavam: é o material que sustentou a escolha, inclusive a recomendação contrária, que perdeu.
> **Não há gatilho formal de reabertura** (A6) — a garantia é o `transport` continuar sendo coluna.
> **Origem:** [Q1 da workspace-memory](../prd/workspace-memory/open-questions.md). **Responde** as
> [Q002, Q029, Q030 e Q031 do projeto](questions.md).
> **Por que existe:** a memória do workspace depende de o daemon **entender** a sessão, e hoje ele só
> vê bytes de terminal. Antes de decidir como aprender, é preciso decidir o que dá para ver.
>
> Este arquivo responde as duas perguntas que você fez, nesta ordem: **(1) quanto custa migrar** e
> **(2) prós e contras de cada um desconsiderando a migração**. A recomendação do §7 era **não
> migrar**; ela perdeu, e ficou registrada — decisão sem o contra-argumento por perto vira dogma.

---

## 1. O que está em jogo

Um harness de agente tem que escolher **o que é uma sessão de agente**:

- **PTY** — a sessão é um **terminal**. O daemon lança o CLI num pseudo-terminal e transporta bytes.
  O CLI desenha a própria interface; o Lumem é uma moldura em volta.
- **ACP** — a sessão é uma **conversa estruturada**. O daemon lança o mesmo binário em modo agente e
  troca JSON-RPC pelo stdin/stdout: mensagens, chunks de raciocínio, chamadas de ferramenta, pedidos
  de permissão. O Lumem desenha a interface.

Não é uma escolha de biblioteca. É a escolha de **quem desenha a tela** e de **quanto o daemon
entende do que está acontecendo**.

---

## 2. O que existe hoje, medido

Números reais deste repositório (2026-08-17), não estimativa:

| Onde | Arquivo | LOC | Teste |
|---|---|---|---|
| servidor | `pty/PtyManager.ts` | 289 | 408 |
| servidor | `pty/RingBuffer.ts` | 95 | 110 |
| servidor | `pty/websocket.ts` | 180 | 391 |
| compartilhado | `pty-protocol.ts` | 131 | sim |
| servidor | `sessions/SessionStore.ts` | 135 | 211 |
| web | `components/Terminal.tsx` | 130 | 174 |
| web | `lib/pty-socket.ts` | 126 | 182 |
| web | `terminal.css`, `xterm-theme.ts`, `terminal-refit.test.tsx` | ~180 | sim |
| **total** | | **~1.270 LOC de produção** | ~1.500 de teste |

Dependências envolvidas: `node-pty`, `ws` (servidor), `@xterm/xterm` + `@xterm/addon-fit` (web).
E-2-e que encostam nisso: `smoke`, `happy-path`, `session-survives-client`, `error-cases`.

**Um fato que muda a conversa:** o daemon já controla o `argv` e o `env` do subprocesso.
`agent_config` tem `command`, `args[]` e `env{}` (`db/schema.ts`), e o `session.createAgent` passa os
três para o `PtyManager`. Ou seja — **injetar contexto no lançamento já é possível hoje**, sem
protocolo nenhum: `--append-system-prompt`, `--mcp-config`, variável de ambiente, o que o CLI aceitar.

**Correção do que o PRD da memória dizia.** O §4 daquele PRD chama trocar PTY por ACP de "reescrever a
espinha do produto". Medido, isso está errado: o transporte são ~1.270 linhas bem isoladas atrás de
`SessionStore` e de um socket. A espinha não é o transporte — é a **tela**, e é aí que o custo mora
(§4).

---

## 3. O que é ACP, mecanicamente

Levantado no [estudo do Compozy](../references/compozy.md#agent-clis--26-providers-via-acp) (que
dirige 26 providers por ACP) e confirmado na especificação:

- **JSON-RPC 2.0 sobre stdin/stdout do processo filho.** Sem HTTP, sem WebSocket, sem shell.
- **Cliente → agente:** `initialize`, `session/new`, `session/load`, `session/prompt`,
  `session/cancel`, `session/set_mode`.
- **Agente → cliente:** `session/update` (notificação), `fs/read_text_file`, `fs/write_text_file`,
  `session/request_permission`, `terminal/create|output|kill|wait_for_exit|release`.
- **Variantes de `session/update`** — e é aqui que mora tudo que a memória quer:
  `user_message_chunk`, `agent_message_chunk`, `agent_thought_chunk`, `tool_call`,
  `tool_call_update`, `plan`, `available_commands_update`, `current_mode_update`, `usage_update`.
- **Versão 1 é estável; a v2 é rascunho** e o próprio SDK avisa que o protocolo de fio e a API podem
  quebrar em qualquer release.
- **SDK oficial em TypeScript** (`@agentclientprotocol/sdk`), com os dois lados — o que importa,
  porque o daemon é TypeScript. Não haveria FFI nem porta de protocolo escrita à mão.
- **Cobertura de agentes é por adaptador, não nativa.** `claude` roda via
  `npx @agentclientprotocol/claude-agent-acp` (uma ponte para o Claude Agent SDK, mantida pela Zed);
  `gemini --acp` é nativo; `codex` tem adaptador próprio; `cursor-agent acp`; `copilot --acp --stdio`.
  A conta a fazer: **cada adaptador é um terceiro entre você e o agente**, com release próprio.

Detalhe que o estudo do Compozy pegou e vale repetir: **não há negociação real de versão** — ele
manda uma versão e não olha o eco. E `session/set_mode` é tentativa e erro sobre uma lista de nomes
de modo por provider. A padronização é menos sólida do que a palavra "protocolo" sugere.

---

## 4. Quanto custa migrar

Em três partes, da mais barata para a mais cara.

### 4.1 Transporte — barato e isolado

| Item | O que acontece |
|---|---|
| `PtyManager` | Ganha um irmão, `AcpManager`. Não é jogado fora — sessão `shell` continua sendo PTY |
| `pty-protocol.ts` | Continua valendo para shell; ACP tem o próprio contrato |
| `SessionStore` | Ganha `transport ∈ pty \| acp` e o resto continua |
| `websocket.ts` | O stream vira evento estruturado em vez de bytes; o mecanismo de attach/detach é o mesmo |
| Sessão sobrevive ao cliente | **Continua funcionando** — o subprocesso é do daemon nos dois casos |

**Estimativa: 400–700 LOC novas no servidor**, com o SDK oficial fazendo o framing. Isso é uma fase
de tamanho normal para este repositório.

### 4.2 Tela — caro, e é aqui que a decisão dói

Com PTY, a interface do agente **é do CLI**: histórico, cores, spinner, atalhos, comandos de barra,
diff colorido, seletor de permissão, autocomplete. Tudo isso vem de graça e é mantido por outra
pessoa.

Com ACP, **o Lumem passa a desenhar isso**. A lista mínima:

| Precisa existir | Por quê |
|---|---|
| Renderizador de conversa (mensagem, chunk, raciocínio) | é o que substitui o terminal |
| Cartão de chamada de ferramenta, com estado e resultado | `tool_call` / `tool_call_update` |
| Diálogo de permissão | `session/request_permission` — sem isso o agente trava |
| Vista de plano | `plan` |
| Entrada com comandos de barra | `available_commands_update` |
| Seletor de modo | `current_mode_update` / `set_mode` |
| Terminal **dentro** da conversa | `terminal/create` — o agente pede um terminal e o resultado tem que aparecer |
| Uso e custo | `usage_update` |

Isso é uma feature do tamanho da `ui-shell` inteira, provavelmente maior — e ela substitui uma tela
que **hoje funciona**. É o oposto do que o repositório vem fazendo (acrescentar sem quebrar).

E tem um custo que não aparece em LOC: **você perde o CLI que você gosta de usar**. O modo interativo
do Claude Code, com os atalhos e o comportamento que você já conhece, não existe mais dentro do Lumem
— existe uma reimplementação sua dele.

### 4.3 Operação — o custo recorrente

| Item | Preço |
|---|---|
| Adaptador por agente | `claude-agent-acp` é um `npx` de terceiro, com versão própria e o seu bug próprio |
| Autenticação | o adaptador decide como autentica. Login por assinatura do CLI nativo pode não passar igual |
| Deriva de protocolo | v2 em rascunho; adaptador que fala mal o protocolo degrada em silêncio (queixa registrada no estudo do Compozy) |
| Agente sem ACP | some da lista. Com PTY, **qualquer** binário funciona |

---

## 5. Prós e contras, desconsiderando a migração

Aqui a pergunta é outra: se o Lumem-OS estivesse nascendo hoje, qual dos dois?

| Eixo | PTY | ACP |
|---|---|---|
| **Cobertura de agentes** | qualquer binário, inclusive o que sair mês que vem | só quem fala o protocolo, direto ou por adaptador |
| **Custo de tela** | zero — o CLI desenha | alto e recorrente — você desenha e mantém |
| **Fidelidade ao CLI** | total, é o CLI | uma reimplementação, sempre um passo atrás |
| **O que o daemon entende** | **nada** — bytes com ANSI | turno, ferramenta, permissão, plano, uso de token |
| **Captura de aprendizado** | só o que o agente escolher te contar (MCP/hook) | tudo, estruturado, sem cooperação do agente |
| **Permissão e política** | do CLI; o daemon não participa | do daemon — dá para negar escrita fora do checkout, exigir aprovação, auditar |
| **Aprovar/rejeitar diff pela UI** | impossível sem parsear tela | natural |
| **Custo por token / orçamento** | invisível | `usage_update` por turno |
| **Sessão sobrevive ao cliente** | sim | sim |
| **Multi-agente na mesma worktree** | sim, é só outro processo | sim |
| **Interromper e retomar** | sinal no PTY, semântica do CLI | `session/cancel` e `session/load`, semântica do protocolo |
| **Quem quebra quando o CLI muda** | a tela, visivelmente | o adaptador, silenciosamente |
| **Escrever teste** | difícil — asserção sobre bytes de tela | fácil — asserção sobre mensagem JSON |
| **Você usar o Lumem no dia a dia** | funciona já, com o CLI que você conhece | depende de a tela nova ficar tão boa quanto a que você largou |

Resumo honesto em duas frases:

> **PTY compra cobertura e velocidade, e paga com cegueira.**
> **ACP compra entendimento e controle, e paga com a tela inteira e com dependência de adaptador.**

---

## 6. Os caminhos que não são "um ou outro"

### 6.1 Híbrido — `transport` como coluna

Sessão `shell` continua PTY (não tem ACP nenhum para isso, e nem faz sentido). Sessão de agente
ganha a escolha: agente que fala ACP pode rodar nos dois modos, e o modo é do `agent_config`.

Custo: manter duas telas de sessão. Ganho: nada do que funciona hoje é perdido, e a tela nova pode
nascer pequena, para um agente só, e crescer se provar valor.

**É a única forma de descobrir se a tela ACP vale a pena sem apostar o produto nela.**

### 6.2 MCP + hooks — entender mais sem trocar transporte

O daemon controla `argv` e `env` do spawn (§2). Isso permite, **hoje**, sem tocar em transporte:

| Mecanismo | O que dá | Depende de |
|---|---|---|
| Servidor MCP do Lumem, passado no lançamento | o agente lê e escreve memória, busca, propõe | o agente chamar a tool |
| `--append-system-prompt` ou arquivo apontado por flag | injeta memória sem escrever nada no repositório | o CLI aceitar a flag |
| Hooks do CLI (Claude Code: `SessionEnd`, `PostToolUse`, …) | evento estruturado empurrado para o daemon: fim de sessão, ferramenta usada, arquivo escrito | ter hook, e é por CLI |
| Sinais que já são nossos (git, `file-editor`, ciclo de vida da worktree) | você editou por cima, reverteu, descartou, matou a sessão | nada |

O terceiro item merece atenção: **hooks do Claude Code entregam boa parte do que o ACP entregaria
para fins de memória** — fim de turno, ferramenta chamada, arquivo escrito — sem tirar o terminal da
tela. É específico por CLI, e essa é exatamente a troca: cobertura menor, custo muito menor.

---

## 7. Recomendação

**Não migrar agora. Não fechar a porta.** Em três movimentos:

1. **Agora:** MCP no lançamento + injeção por flag + sinais próprios. Isso destrava a feature de
   memória inteira sem tocar no transporte, e é reversível por definição — se o caminho morrer,
   apagam-se algumas linhas de `agent_config`.
2. **Em seguida, se doer:** hooks por CLI, começando pelo que você mais usa. Sobe a qualidade da
   captura de graça para quem tem hook, e degrada para o caminho 1 para quem não tem.
3. **Depois, como experimento fechado:** `transport` no `agent_config` e uma tela ACP mínima para
   **um** agente. Se ela ficar melhor que o terminal, ela cresce e o PTY vira o modo "roda qualquer
   coisa". Se não ficar, custou uma fase.

O argumento decisivo é de **reversibilidade**: adotar ACP como transporte único é a decisão mais cara
de desfazer do projeto inteiro (o estudo do Compozy diz o mesmo), e nenhuma das perguntas em
aberto da memória exige que ela seja tomada agora. O que a memória precisa — escrever, buscar,
injetar, e saber quando a sessão acabou — o caminho 1 já dá.

**O que isso custa aceitar:** captura cooperativa. Um agente que não chama a tool e não tem hook não
ensina nada, e o Lumem tem que **mostrar isso** em vez de fingir que aprendeu (é a Q32 da memória).

---

## 8. Perguntas — todas respondidas

> Sem apego ao CLI (A1), um agente no começo e mais depois (A2), permissão pelo Lumem é feature futura
> (A3), adaptador de terceiro é aceitável (A4), hooks por CLI morreram com a decisão (A5), e **não há
> gatilho formal de reabertura** (A6).

### [x] A1 — O terminal do agente é temporário ou é o produto?

Se um dia a tela do Lumem for melhor que a do CLI, o terminal vira legado. Se o valor está
justamente em rodar **o CLI que você já usa, do jeito que ele é**, então ACP nunca é o caminho
principal — é no máximo um modo alternativo. Isso muda a resposta inteira.

**R:** não tenho apego pela CLI, se o ACP fizer a maioria das coisas qeu a CLI faz ja ta ótimo.

---

### [x] A2 — Quantos agentes diferentes você quer rodar de verdade?

Se são um ou dois, ACP é viável e hooks por CLI são baratos. Se você quer testar o que sai toda
semana, PTY é a única coisa que escala — e a memória tem que funcionar no denominador comum.

**R:** O que vc quer dizer com agentes diferentes? sessões diferentes por exemplo tres sessões do claude? Ou providers diferentes por exemplo claude, codex, open rounter, deepseak e etc?

**Esclarecimento:** o segundo — **binários/CLIs diferentes**, não sessões. Três sessões do Claude ao
mesmo tempo é problema resolvido nos dois transportes (é só outro subprocesso).

A pergunta é sobre a **lista de `agent_config`**: se ela tende a ter 1–2 entradas (`claude`, talvez
`codex`), ACP cobre o que você usa e cada buraco de adaptador é um problema que dá para resolver na
mão. Se ela tende a crescer toda semana com o que sair de novo, aí PTY é o único que aceita qualquer
binário — e um agente sem adaptador ACP simplesmente **não aparece na lista**.

Reformulando: **quantos CLIs você quer poder rodar, e você aceita que um CLI novo só entre no Lumem
depois que alguém escrever um adaptador ACP para ele?**

**R (rodada 2):** no Começo apenas o Claude, mas para o futuro quero extender isso para, pelo menos, Codex, open code, não necessariamente de uma vez, pode ser um por feature, mas isso é futuro.

Para o futuro tem outra feature que eu quero, poder selecionar qual conta usar para o mesmo agente, por exemplo se eu tenho duas contas do claude, uma pessoal e outra do trabalho, eu quero poder selecionar entre elas para usar, o mesmo para os outros agentes, mas isso é feature futura.

**Decisão:** **um CLI no começo — Claude.** Codex e opencode entram depois, um por feature. Isso torna
o custo do ACP bem menor do que a tabela do §5 sugere: adaptador de terceiro é risco **por agente**, e
no começo há um só.

E a conta-por-agente virou item de [backlog](backlog.md) com um mecanismo já identificado: é o mesmo
truque do *provider home isolation* do Compozy — reescrever `HOME` e `XDG_*` do subprocesso, o que dá
credenciais separadas sem container. Vale registrar **agora** porque afeta o desenho do
`agent_config`: a credencial deixa de ser propriedade do agente e passa a ser propriedade de *(agente,
conta)*.

---

### [x] A3 — Você quer que o Lumem seja dono da política de permissão?

Hoje quem pergunta "posso escrever neste arquivo?" é o CLI. Com ACP, quem pergunta é o Lumem — e aí
dá para ter regra por projeto, negar escrita fora do checkout, e auditar. É um ganho real de produto,
e é o argumento mais forte a favor do ACP que não tem nada a ver com memória.

**R:** não agora, mas é uma feature pro futuro.

---

### [x] A4 — Aceitar dependência de adaptador de terceiro?

`claude-agent-acp` é da Zed, não da Anthropic. Se ele quebrar, o Lumem quebra junto e você não
conserta. Com PTY, o binário oficial é o contrato.

**R:** é aceitável para o produto.

---

### [x] A5 — Hooks por CLI: quantos você topa manter?

Um por CLI, cada um com modelo próprio de evento. Vale para 1 (Claude Code) e provavelmente não vale
para 5.

**R:** não entendi, explica melhor

**Esclarecimento:** "hook" aqui é o mecanismo que **o próprio CLI** oferece para avisar alguém de
fora quando algo acontece. O Claude Code tem isso: você declara em config que, quando um evento
ocorrer, ele executa um comando seu passando um JSON com o que aconteceu.

| Evento (Claude Code) | O que o Lumem receberia |
|---|---|
| `SessionEnd` | a sessão acabou — hora de destilar o que ela ensinou |
| `PostToolUse` | qual ferramenta rodou, com que argumento, com que resultado |
| `UserPromptSubmit` | o que você mandou |

Era o **plano B para enxergar dentro da sessão sem trocar de transporte**: o terminal continuava na
tela e o daemon ganhava eventos estruturados por trás. O preço é que **isso é por CLI** — o Claude
Code tem um modelo de hooks, o Codex tem outro, o Gemini tem outro, e vários não têm nenhum. A
pergunta era: manter um adaptador de hook por CLI vale para quantos?

**A decisão de migrar para ACP torna esta pergunta quase irrelevante**, porque o ACP entrega os
mesmos eventos (`tool_call`, `usage_update`, fim de turno) de forma padronizada, sem adaptador de
hook nenhum. Ela só volta se sobrar algum agente rodando em PTY que você queira que ensine memória.

**R (rodada 2):** — **resolvida pelo caminho.** Com a migração para ACP decidida, hooks por CLI
deixam de ser plano B: o protocolo entrega os mesmos eventos, padronizados. O item continua no
[backlog](backlog.md) marcado como provavelmente morto, e só volta se sobrar agente em PTY que você
queira que alimente a memória.

---

### [x] A6 — Quando esta decisão volta para a mesa?

Proposta original: uma lista de gatilhos observáveis para não virar debate eterno — a tela ficar pior
que o terminal, a Anthropic reativar a separação de pools, ou um agente sem adaptador.

**R:** acho que usar ACP é uma decisão de arquitetura e vamos ter que lidar com ela, se alguma coisa acontecer eu vou ter que pessoalmente, como desenvolvedor do projeto, fazer alguma coisa, então não acho que deva ter um gatilho formalizado aqui.

**Decisão: não há gatilho formal.** ACP é decisão de arquitetura; reabrir é juízo do desenvolvedor
diante do que aparecer, não condição escrita que dispara sozinha.

O que fica no lugar — e não é gatilho, é garantia: **`transport` continua sendo coluna** (§9.3). Se
algo mudar, a saída já existe em config e não dependia de aviso prévio para ser construída. A lista de
gatilhos seria cerimônia em cima disso.

---

## 9. A decisão

**2026-08-17 — o Lumem-OS migra para ACP.** Decidido pelo Vinicius, contra a recomendação do §7, com
o argumento registrado por ele:

> *"é uma escolha complicada, mas é o melhor jeito de ter controle de várias features como a memória,
> e outras que são futuro como consumo de token por projeto, por feature, e assim por diante."*

O que sustentou: sem apego ao CLI (A1), adaptador de terceiro é aceitável (A4), e a política de
permissão pelo Lumem é feature desejada, só que depois (A3).

**A recomendação do §7 perdeu, e o motivo é legítimo.** Ela otimizava para reversibilidade e custo
imediato; a decisão otimiza para o que o produto quer ser. O que o §7 dizia continua verdadeiro como
**preço**, não como impedimento: a tela da conversa passa a ser trabalho seu, e é grande.

### 9.1 O que a decisão muda

| Área | Antes | Depois |
|---|---|---|
| Sessão de agente | terminal com o CLI desenhando | conversa estruturada, o Lumem desenhando |
| Sessão de shell | PTY | **continua PTY** — `node-pty`, `xterm` e o WebSocket ficam, sem discussão |
| Captura de aprendizado | cooperativa (o agente tem que chamar a tool) | **estrutural** — turno, `tool_call`, arquivo escrito e `usage_update` chegam sozinhos |
| Injeção de memória | flag no lançamento, ou arquivo fora do checkout | o Lumem monta o prompt: prepend no `session/prompt` e MCP declarado no `session/new` |
| Custo por token | invisível | `usage_update` por turno → consumo por projeto, por worktree, por feature |
| Permissão | do CLI | do Lumem, quando a A3 virar prioridade |
| Agente sem adaptador ACP | funcionava | não entra na lista (ver A2) |

**Consequência direta na feature de memória:** a frase *"captura vira cooperativa"*, que era o preço
mais duro do §4 do PRD, **deixa de valer**. O daemon passa a saber quando o turno acabou, o que foi
feito nele, e quanto custou — que é exatamente o material que o Compozy tem e o Hermes tem, e que nós
não tínhamos.

### 9.2 Billing e janela de contexto — investigado a fundo (2026-08-17)

> **Correção do que eu tinha escrito aqui.** A primeira versão desta seção listava três riscos com
> base em manchete e título de issue. Investigados na fonte — artigo de suporte da Anthropic, issues
> e changelog dos repositórios, e o estudo do Conductor que já estava neste repo —, **dois se
> desmancharam e um mudou de forma**. O que estava errado está marcado.

#### (a) Billing: hoje o caminho ACP consome a assinatura

O artigo de suporte da própria Anthropic
([15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan))
diz, hoje, com todas as letras:

> *"For now, nothing has changed: Claude Agent SDK, `claude -p`, and third-party app usage still draw
> from your subscription's usage limits."*

A separação de pools anunciada para 15/jun/2026 foi **puxada no próprio dia**. Não há crédito
separado, não há nada a reivindicar. A Anthropic diz que vai retrabalhar o plano e **avisar antes**.

Se voltar como foi desenhada, o desenho era: crédito mensal de US$ 100 no Max 5x, a preço de API,
e depois disso *extra usage* — e o próprio time do Zed confirmou na issue #658 que *"usage in Zed via
ACP (since we use the 'blessed' path of SDK usage) will count against this credit"*.

**O dado que fecha a conta, e que já estava neste repositório:** o [Conductor](../references/conductor.md#1-o-que-é)
— que o Vinicius usa **hoje**, no Max 5x — roda o Claude Code **via SDK**, não via TUI. O fundador
disse na época do anúncio: *"If you're on a max subscription you get $200 in credits and then can pay
at API costs — if you use Big Terminal Mode you won't be affected."*

Ou seja: **a categoria de billing que o ACP usaria é exatamente a que ele já usa todo dia.** A
migração não o move para um lugar novo. O que ela faz é **abrir mão da imunidade** que o Lumem tem
hoje: rodando o binário oficial em PTY, o Lumem está do lado *first-party*, que é justamente o lado
que a mudança pouparia.

| | Hoje | Depois da migração |
|---|---|---|
| Lumem com PTY | first-party — poupado em qualquer versão da mudança | continua existindo para shell e como alternativa |
| Lumem com ACP | — | mesma categoria do Conductor |
| Conductor | SDK (a categoria exposta) | inalterado |

#### (b) Login por assinatura: funciona, mas é área de política que se mexe

A issue [#517](https://github.com/agentclientprotocol/claude-agent-acp/issues/517), que eu citei como
"o adaptador não suporta assinatura", é **específica do JetBrains**. Lendo os comentários: uma
contribuidora da JetBrains responde que *"JetBrains is not allowed to distribute a Claude Code version
that's logging in via Claude subscription — it goes against Anthropic's user agreement"*, e outro
usuário reporta que **no Zed, na mesma máquina, funciona**. A JetBrains carrega o adaptador com
`--hide-claude-auth`; o botão some por distribuição, não por incapacidade.

Para o Lumem — pessoal, self-hosted, com o adaptador instalado por você — o caso é o do Zed, não o da
JetBrains. Mas o histórico de issues do adaptador (#337 mudanças de ToS, #421 "adapter no longer works
with OAuth", #517, #782) mostra que **é a área que mais se mexeu em 2026**. Tratar como risco
operacional recorrente, não como pergunta resolvida.

#### (c) Janela de contexto: ~~o caso que eu citei foi corrigido~~

**Estava errado.** A issue [zed#51648](https://github.com/zed-industries/zed/issues/51648) que eu usei
como evidência foi **fechada como corrigida no mesmo dia em que foi aberta** (16/mar/2026, PR #51695).
Era bug do cliente Zed, não limitação do protocolo nem do adaptador.

O que a investigação achou de verdade:

| Achado | Fonte | Estado |
|---|---|---|
| `usage_update.size` reportava `200000` mesmo em sessão 1M — placeholder até o `modelUsage` autoritativo chegar no fim do turno | [#596](https://github.com/agentclientprotocol/claude-agent-acp/issues/596) | **fechada** |
| Compactação é **do Claude Code**, não do adaptador — *"this is managed by Claude Code entirely, nothing for us to do here"* (mantenedor) | [#887](https://github.com/agentclientprotocol/claude-agent-acp/issues/887) | **fechada** |
| A lista de modelos vem da Anthropic e é repassada sem adaptação; a variante 1M aparece como modelo (`opus…[1m]`, `sonnet[1m]`), e `~/.claude/settings.json` é o mesmo botão do CLI | [#452](https://github.com/agentclientprotocol/claude-agent-acp/issues/452), [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786) | — |
| Usuário afirma que, com `sonnet[1m]` configurado, *"claude in terminal always uses the 1m context, the ACP however falls back to 200k"* | [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786) | **aberta**, sem resposta conclusiva |
| Pedido para expor `effort` e janela de contexto como opção de config | [#441](https://github.com/agentclientprotocol/claude-agent-acp/issues/441) | **aberta** |

E o 1M **está incluído** no Max 5x: a Anthropic documenta 1M para Claude Code nos planos Pro, Max,
Team e Enterprise nos modelos atuais.

**Conclusão honesta:** não é "a janela encolhe no ACP". É *"a janela é a mesma engine e o mesmo
arquivo de configuração, com um relato aberto de fallback e sem opção de config dedicada"*. Vira item
mensurável do spike, não motivo para não migrar.

#### Saúde do adaptador

Apache-2.0, ~2.4 mil estrelas, **release quase diária** (v0.69.0 em 16/ago/2026), acompanhando o
`@anthropic-ai/claude-agent-sdk` de perto. 123 issues abertas — é um projeto vivo e ativo, não um
`npx` abandonado. Isso não elimina o risco do §4.3 (um terceiro entre você e o agente); reduz.

#### O que o spike tem que medir

Três respostas objetivas, antes de qualquer tela:

1. **A assinatura autentica?** Rodar o adaptador, `/login`, e confirmar que a sessão sobe sem chave de
   API.
2. **O consumo sai do mesmo pool?** Rodar tarefa equivalente pelo PTY e pelo ACP e comparar no
   `/usage` da conta.
3. **A janela é a mesma?** Selecionar a variante 1M, encher contexto, e verificar onde a compactação
   dispara — comparando com o `claude` no terminal. É o único jeito de resolver a #786 para o nosso
   caso.

### 9.3 A regra que fica

**`transport` é coluna, não bandeira.** Mesmo migrando, `agent_config` ganha
`transport ∈ pty | acp` e o PTY continua sendo caminho de primeira classe — porque a sessão de shell
precisa dele de qualquer jeito, porque é a saída se o §9.2(b) se realizar, e porque é o que aceita o
binário que ninguém adaptou ainda.

Migrar quer dizer: **ACP é o default e é onde o produto investe**. Não quer dizer arrancar o PTY.

### 9.4 O que vem a seguir

1. **Spike medido** dos três eixos do §9.2 — antes de qualquer tela.
2. **PRD próprio** (`docs/prd/acp-sessions/`) para transporte + tela da conversa. É a maior feature
   do projeto até aqui, e o desenho passa pelo protótipo HTML como todas as outras.
3. **Reescrever o §4 do PRD da memória**, que foi escrito assumindo cegueira — feito.
4. As perguntas de memória que existiam **por causa** do PTY mudam de resposta: Q1, Q19, Q20, Q21 e
   Q35. Está anotado em cada uma.

---

## Fontes

- Código deste repositório: `packages/server/src/pty/`, `packages/server/src/sessions/`,
  `packages/server/src/routers/session.ts`, `packages/server/src/db/schema.ts`,
  `packages/web/src/components/Terminal.tsx`, `packages/web/src/lib/pty-socket.ts`
- [Estudo do Compozy](../references/compozy.md), §7 "Agent CLIs — 26 providers via ACP"
- [Agent Client Protocol — visão geral](https://agentclientprotocol.com/protocol/overview) e
  [SDK TypeScript](https://agentclientprotocol.com/libraries/typescript)
- [`@agentclientprotocol/sdk`](https://www.npmjs.com/package/@agentclientprotocol/sdk) ·
  [`claude-agent-acp`](https://github.com/agentclientprotocol/claude-agent-acp)
- Para o §9.2, tudo lido na fonte (issues via `gh`, não via busca):
  **billing** — [Anthropic, artigo de suporte 15036540](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
  · [discussão #658 no adaptador](https://github.com/agentclientprotocol/claude-agent-acp/issues/658)
  · [Zed — o que a mudança significa](https://zed.dev/blog/anthropic-subscription-changes)
  · [a mudança de 15/jun foi cancelada](https://thenewstack.io/anthropic-pauses-claude-agent-sdk-subscription-change/)
  · [nosso estudo do Conductor](../references/conductor.md), §1 (SDK e a citação do fundador);
  **login** — [#517](https://github.com/agentclientprotocol/claude-agent-acp/issues/517)
  · [#782](https://github.com/agentclientprotocol/claude-agent-acp/issues/782)
  · [Zed — External Agents](https://zed.dev/docs/ai/external-agents);
  **contexto** — [zed#51648, fechada como corrigida](https://github.com/zed-industries/zed/issues/51648)
  · [#596](https://github.com/agentclientprotocol/claude-agent-acp/issues/596)
  · [#887](https://github.com/agentclientprotocol/claude-agent-acp/issues/887)
  · [#786](https://github.com/agentclientprotocol/claude-agent-acp/issues/786)
  · [#452](https://github.com/agentclientprotocol/claude-agent-acp/issues/452)
  · [#441](https://github.com/agentclientprotocol/claude-agent-acp/issues/441)
  · [Anthropic — janela de contexto por plano](https://support.claude.com/en/articles/8606394-how-large-is-the-context-window-on-paid-claude-plans)

## Observações

Eu acho que é a hora de ir para ACP, é uma escolha complicada, mas é o melhor jeito de ter controle de várias features como a memoria, e outras que são futuro como consumo de token por projeto, por feature, e assim por diante.