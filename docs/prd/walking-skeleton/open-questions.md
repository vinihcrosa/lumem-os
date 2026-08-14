# Perguntas abertas — Walking Skeleton

Escopo: **só esta versão**. Perguntas de projeto em geral ficam no [questions.md](../../project/questions.md).

Responda no campo `**R:**` e marque `[x]`.

🔴 = trava o início da implementação · 🟡 = trava durante · 🟢 = dá pra decidir na hora de codar

---

## Travantes

### 🔴 [ ] WS-Q01 — Qual o cliente?
Você pediu sidebar, então é interface gráfica. As opções, com o que cada uma custa:

| Opção | Ganha | Perde |
|---|---|---|
| **Web servida pelo servidor** | multi-plataforma de graça, cai natural no multi-host depois, ciclo de dev mais rápido, terminal via xterm.js é caminho batido | sem notificação de SO, sem "abrir no editor", sem deep link, sem acesso a filesystem local |
| **Tauri** (o que o Conductor usa) | binário único de ~66 MB, terminal nativo, notificação, abrir no editor, acesso local | precisa saber Rust pro lado nativo, build por plataforma |
| **Electron** (o que o Superset usa) | mesma coisa do Tauri sem Rust, ecossistema enorme | pesado em memória — é a crítica constante ao Superset |
| **TUI** | mais rápido de fazer, roda por SSH de graça | sidebar + N terminais dentro de um terminal é desconfortável, e você já vai ter terminal dentro dele |

Minha leitura: **web** pra este passo. O objetivo é provar a espinha, e web dá o ciclo mais curto até isso. As coisas que ela perde (notificação, abrir no editor) só passam a importar quando existir agente rodando sozinho — que é justamente o que esta versão não tem. Se depois virar Tauri, o servidor e a API não mudam, só a casca.

**R:** web

### 🔴 [ ] WS-Q02 — Qual a linguagem do servidor?
Os critérios que importam no seu caso, em ordem: você vai manter sozinho; precisa spawnar e supervisionar processos; precisa de streaming bidirecional pro terminal; e precisa continuar gostoso de mexer daqui a seis meses.

Referências: Compozy é Go, Superset é TypeScript/Node, Conductor é Rust no app + Bun no servidor.

O que muda de verdade na escolha: bibliotecas de PTY e de git existem em todas. Go dá binário único e concorrência boa pra supervisão de processo. TypeScript compartilha tipos com um cliente web e você escreve numa linguagem só. Rust é o mais caro de escrever pro que esta versão faz.

**R:** typescript

### 🔴 [ ] WS-Q03 — Onde ficam as worktrees no disco?
Assumi `~/.lumem/worktrees/<projeto>/<nome>` no PRD. Alternativas: `<repo>/.worktrees/<nome>` (perto do código, mas suja o repo e confunde ferramenta que varre a pasta) ou irmão do repo (`<repo>-<nome>`, que é o que muita gente faz na mão).

O design doc do Compozy rejeita explicitamente a opção dentro do repo. *(mesma questão que Q009 da raiz)*

**R:** eu gosto do que está na PRD `~/.lumem/worktrees/<projeto>/<nome>`.

### 🔴 [ ] WS-Q04 — Qual o protocolo entre cliente e servidor?
Precisa de dois modos: request/response pras operações (criar worktree, listar projeto) e stream bidirecional pro terminal.

Opções: HTTP + WebSocket (simples, universal, funciona em qualquer cliente); gRPC (tipado, streaming nativo, mais cerimônia); ou uma coisa só sobre WebSocket. A escolha aqui é o contrato de fio que todas as versões seguintes herdam.

**R:** eu gosto muito de GRP, é tipado, binário, mais rápido, mas eu tenho medo do suporte nos navegadores já que a interface vai ser web, me diz o que vc acha disso.

---

## Comportamento

### 🟡 [ ] WS-Q05 — Como o servidor sobe?
Você roda na mão quando quer usar? Sobe junto com o cliente e morre com ele? Ou é daemon que sobe com o sistema e fica sempre de pé?

Isso muda o que "fechar o cliente" significa. Se o servidor morre junto, o F6.2 (terminal sobrevive ao cliente) perde metade do sentido nesta versão.

**R:** o server fica sempre rodando, como um daemon, o objetivo é mesmo que eu feche a UI o daemon fica rodando, ai eu posso ligar a UI de novo e só conectar e seguir de onde parei.

### 🟡 [ ] WS-Q06 — Remover worktree apaga a branch?
O PRD assume que **não** — `git worktree remove` roda, a branch fica. Segurança maior, mas acumula branch morta rápido.

Alternativas: apagar sempre; perguntar toda vez; apagar só se a branch não tiver commits próprios além da base.

**R:** não apaga a branch.

### 🟡 [ ] WS-Q07 — De onde a worktree nasce?
O PRD assume: branch default do repositório. Alternativas: da branch atualmente em check-out no repo principal; ou você escolhe na criação.

E antes de criar: dá `git fetch` pra nascer atualizada, ou usa o que está em disco? Fetch deixa a criação lenta e depende de rede, mas evita nascer desatualizada.

**R:** para a primeira versão vai da branch default.

### 🟡 [ ] WS-Q08 — O que acontece ao fechar a janela com terminal rodando?
Fecha a janela → o terminal continua vivo no servidor (é o que o PRD diz). Isso significa que dá pra acumular terminal órfão sem perceber.

Quer algum limite — teto por projeto, aviso ao fechar com N terminais vivos, ou uma tela que lista tudo que está rodando?

**R:** o comportamento é esse mesmo, a parte de terminal morto é um problema a ser resolvido depois, não se preocupe com ele agora.

### 🟢 [ ] WS-Q09 — Quanto de scrollback o terminal guarda?
Ring buffer em memória por sessão. 10 mil linhas? 100 mil? Sem limite até a sessão fechar? Isso vira consumo de memória do servidor multiplicado por número de terminais abertos.

**R:** 10 mil ta ok.

### 🟢 [ ] WS-Q10 — O nome da worktree pode ter barra?
`feature/login` é nome de branch válido e vira diretório aninhado. Aceitar e criar o diretório aninhado, ou restringir nome de worktree a `[a-z0-9-]` e deixar a branch livre?

**R:** pode ter qualquer nome, o usuário pode escolher um nome ou pode ser gerado automaticamente.

### 🟢 [ ] WS-Q11 — Monorepo é um projeto ou vários?
Nesta versão projeto = raiz de repo git, então monorepo é um projeto só. Isso te incomoda já agora, ou dá pra viver com isso até ter agente? *(relacionado a Q008 da raiz)*

**R:** pode ser monorepo, não vejo problema nenhum, só use um gerenciador de monorepos, pode escolher o que mais te agrada.

### 🟢 [ ] WS-Q12 — Dois clientes abertos ao mesmo tempo: precisa funcionar bem?
O PRD diz que ambos veem o mesmo estado. Isso exige o servidor empurrar mudança pros dois. Se for aceitável um deles ficar desatualizado até dar refresh, economiza trabalho agora.

**R:** vamos considerar por enquanto que só um conecta por vez, por simplicidade.

---

## Coisas que eu deliberadamente não perguntei

Registro do que ficou de fora de propósito, pra você saber que não foi esquecimento:

- **Modelo de permissão / sandbox** — sem agente, não há o que restringir. Volta quando entrar agente.
- **Portas, `.env`, `node_modules`** — a queixa nº 1 da categoria, mas depende de setup script, que está fora desta versão.
- **Nome bonito de worktree (cidades, IDs de task)** — você digita o nome. Cosmético.
- **Multi-host** — servidor é local por definição aqui.
- **Migração de schema do banco** — vai importar na segunda versão, não nesta.

## Observações

- existe um erro aqui, vc presumiu que eu só estava falando da UI, mas eu estava falando da funcionaliddae toda, então deve ter um server com os agentes, tudo conectado.

Se quiser fazer mais uma rodade de perguntas considerando essa informação pode fazer.

---
---

# Rodada 2 — com agentes no escopo

R1 (WS-Q01 a WS-Q12) está respondida e virou decisão no PRD v0.2. Esta rodada é só do que a entrada dos agentes abriu.

## Resolvido

### ✅ WS-Q04 — Protocolo (resposta à sua pergunta sobre gRPC)

Seu medo é justificado, e é pior do que você imaginava: **gRPC puro não roda em navegador**, porque precisa de controle de frame HTTP/2 que o `fetch` não expõe. As saídas:

| Opção | Situação |
|---|---|
| **gRPC-Web** | Exige proxy (Envoy) na frente. **Não faz streaming bidirecional** — só unary e server-streaming. Pro terminal, que é bidi por natureza, já é eliminatório. |
| **Connect** (connectrpc) | Mesmo `.proto`, mesmo codegen tipado, fala HTTP/1.1 e HTTP/2 **direto do browser, sem proxy**. Unary e server-streaming nativos. Bidi full-duplex continua fora, mas é limite do browser, não da lib. |

**Recomendação: Connect + protobuf pro control plane, WebSocket cru pro PTY.**

Você fica com tudo que queria do gRPC — contrato tipado, codegen, schema neutro de linguagem caso entre um cliente Tauri ou Go depois — e o canal bidi do terminal vai por WebSocket, que é onde ele naturalmente pertence. Nenhum proxy no meio.

O contra honesto: são dois mecanismos de transporte em vez de um. A alternativa de mecanismo único seria tRPC (tipagem fim-a-fim sem codegen, ótima DX em TypeScript) — mas amarra o contrato à linguagem, e você perde a porta de saída pra cliente não-TS.

**R:** vamos de tRPC.

---

## Agentes

### 🔴 [ ] WS-Q13 — Agente é PTY cru, ou protocolo estruturado?
O PRD assume **PTY**: o servidor lança o CLI declarado e liga os bytes ao cliente. Não interpreta output, não sabe o que o agente faz, não sabe quando termina. É o modelo do Superset e é o que mantém esta versão pequena.

O custo é que o servidor fica **cego**: não dá pra saber se o agente está trabalhando, travado esperando você, ou morto há 40 minutos. Enquanto for um agente e você estiver olhando, tudo bem. Deixa de ser quando forem três.

A alternativa (ACP, ou SDK) dá eventos estruturados desde já, mas puxa pra dentro desta versão a decisão mais cara de reverter do projeto inteiro (Q029/Q030 da raiz), e ela não está madura na sua cabeça ainda.

Minha leitura: PTY agora. O caminho de saída existe e é limpo — a configuração de agente é declarativa, então adicionar um transporte estruturado depois é adicionar um campo, não reescrever.

**R:** concordo, vamos de PTY

### 🟡 [ ] WS-Q14 — Quais agentes vêm de fábrica?
O PRD diz "pelo menos Claude Code funcionando sem configurar nada". Você quer mais algum já no primeiro passo — Codex, Gemini, Cursor Agent, Aider? Cada um é uma linha de configuração, o custo é baixo, mas cada um também é um comportamento de terminal diferente pra testar.

**R:** Vamos começar simples, apenas o Claude.

### 🟡 [ ] WS-Q15 — Agente pode rodar no projeto principal, ou só em worktree?
O PRD restringe agente a worktree (`session.kind = agent` exige escopo de worktree). É a postura segura: o agente nunca mexe no seu checkout principal.

Mas na prática, às vezes você quer só perguntar uma coisa sobre o repo sem criar branch. Restringe, ou libera com o projeto principal sendo tratado como um escopo qualquer?

**R:** pode liberar.

### 🟡 [ ] WS-Q16 — Aprovações: default do CLI, ou desligadas?
**Todas as três referências rodam com aprovação desligada** — o isolamento é a worktree e ponto. É o que dá o fluxo sem atrito, e é também o que deixa um agente com suas credenciais rodando comando arbitrário.

Nesta versão não há política de permissão nenhuma no Lumem (está nos não-objetivos), então a pergunta é só: a configuração de fábrica do Claude Code vem com as flags de skip, ou vem crua e você aprova na mão?

⚠️ Ligado significa: agente rodando na sua máquina, com seu `~/.ssh`, seu `~/.aws`, seus tokens, sem confirmação. Numa worktree, mas com o seu usuário.

**R:** no momento deixa o default, o mais simples, so abre o claude. No futuro a gente vai mexer nisso.

### 🟢 [ ] WS-Q17 — Dá pra mandar o prompt inicial junto com a criação da sessão?
Ou seja: "nova worktree + subir agente + já manda esta tarefa", num passo só. É o que transforma o fluxo de três cliques em um, e é a base de qualquer automação futura.

Ou nesta versão você sobe o agente e digita nele como digitaria num terminal?

**R:** nessa versão só sobe o agente e depois digita no terminal.

### 🟢 [ ] WS-Q18 — Retomar sessão de agente anterior entra agora?
Os CLIs têm flag de resume (`--resume`, `--continue`). Se a sessão morreu, dá pra relançar continuando a conversa em vez de começar do zero.

Isso exige guardar o ID de sessão do agente, que é específico de cada CLI. Entra agora ou fica pra quando as sessões sobreviverem a restart do daemon?

**R:** agora não, isso vai ser uma feature isolada.

---

## Daemon

### 🟡 [ ] WS-Q19 — A sessão deveria sobreviver a restart do **daemon**?
O PRD diz que **não** — restart do daemon mata tudo, e as sessões viram `exited` no boot.

Fazer sobreviver exige o processo de PTY viver fora do daemon, num processo separado que faz handoff de descritor de arquivo. É exatamente o que o Superset faz, e é a peça de engenharia mais sofisticada que apareceu no estudo — sessões deles sobrevivem até a upgrade de binário.

É caro. Mas note que "reiniciar o daemon" vai acontecer toda vez que você mexer no código do servidor — ou seja, o dia inteiro, durante o desenvolvimento. Isso muda sua resposta?

**R:** não.

### 🟢 [ ] WS-Q20 — Como o daemon sobe e se mantém de pé?
Você respondeu que ele fica sempre rodando. O mecanismo: `launchd` (sobe com o Mac, reinicia se cair, é o jeito nativo), um gerenciador de processo tipo pm2, ou você sobe na mão num terminal e deixa lá?

Durante o desenvolvimento provavelmente é na mão de qualquer jeito. A pergunta é o que vale pro uso normal.

**R:** durante o desenvolvimento é na mão, mas quando isso se tornar um produto deve ser mais automatico, mas a gente pode pensar depois.

---

## Correção

### 🟢 [ ] WS-Q21 — Sobre a WS-Q11, acho que houve uma troca
Você respondeu *"pode ser monorepo, só use um gerenciador de monorepos"* — isso soa como resposta sobre **o repositório do Lumem-OS**, e nesse caso está decidido: monorepo com servidor e cliente juntos, tipos compartilhados.

Mas a pergunta original era outra: **quando você registra um monorepo como projeto no Lumem**, ele é um projeto só ou N projetos? Ex.: registrar o `lorebase`, que tem front e back dentro, é uma entrada na sidebar ou duas?

Nesta versão a resposta é forçada — projeto = raiz de repo git, então é uma entrada. A pergunta é se isso te incomoda a ponto de precisar resolver já.

**R:** pode ser assim mesmo, o projeto é a raiz do repo git.
