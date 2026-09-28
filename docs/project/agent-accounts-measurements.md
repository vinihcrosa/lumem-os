# Mais de uma conta por agente — a medição da fase 0

> **Feito em 2026-09-26**, macOS arm64 (Darwin 25.6), contra as cópias que o daemon é dono — a regra
> do [ADR de 2026-09-08](../adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md):
>
> - `@agentclientprotocol/claude-agent-acp@0.75.1`, em `~/.lumem/adapters/claude`, que embute o
>   Claude Code **`2.1.257`** (`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, um binário Bun);
> - `@agentclientprotocol/codex-acp@1.10.0`, em `~/.lumem-dev/shared/adapters/codex`, que embute o
>   `@openai/codex@0.153.4`.
>
> O cliente é um ndjson de 40 linhas (`initialize` + `session/new` + `session/prompt` opcional),
> declarando as mesmas capacidades que o `AcpManager` declara — `auth.terminal`,
> `_meta["terminal-auth"]` e `elicitation.url`. Todo processo rodou com `env -i`: só `HOME`, `USER`,
> `PATH` (o `node` e `/usr/bin`), `TMPDIR` e a variável medida. Nenhuma variável `CLAUDE_*` da
> sessão que mediu vazou para dentro.
>
> **Custo: zero token.** Nenhum turno chegou a um modelo — os dois `session/prompt` do Claude
> morreram no `-32000` antes da API, e o do Codex usou uma chave falsa, recusada com 401.
>
> **O que não foi medido:** um login **real** de uma segunda conta. Ele exige navegador e uma
> segunda assinatura, e nenhuma das duas coisas existe numa sessão de agente. O §2.3 diz por que a
> leitura do código fecha esse buraco para o Claude, e o §3.2 mostra que no Codex a escrita foi
> exercitada de verdade.
>
> Motivo: o §4 da [PRD 034](../features/034-agent-accounts/prd.md), e a
> [Q7](../features/034-agent-accounts/open-questions.md), adiada até esta medição.

## 1. As respostas, antes do caminho

| Pergunta do §4 | Resposta |
|---|---|
| O Keychain colide entre duas contas do Claude? | **Não.** O nome da entrada é `Claude Code-credentials-<sha256(dir)[0:8]>` quando `CLAUDE_CONFIG_DIR` existe (§2.1) |
| O `claude-agent-acp` respeita `CLAUDE_CONFIG_DIR`? | **Sim**, nas três etapas medidas: handshake, `session/new` e turno (§2.2) |
| O `codex-acp` respeita `CODEX_HOME`? | **Sim** — e aqui a **escrita** foi exercitada: um login num diretório descartável não tocou o `~/.codex` (§3) |
| Dá para conferir a conta em vez de acreditar? | **Sim, nos dois** — mas **não** pelo `session/new`. Claude: `claude-agent-acp --cli auth status` (0,57 s, JSON com e-mail e plano). Codex: a notificação `_auth/status_update` (§4) |
| A variável do CLI é *"cirúrgica: só a credencial muda"*, como o §4 da PRD escreveu? | **Não.** Ela move a **configuração inteira do agente** — e é por isso que a Q7 virou ADR (§5) |
| Como o adaptador diz que a conta bateu no limite? *(2026-09-28, depois da fase 0)* | **Por `data.errorKind: "rate_limit"`** num `session/prompt` recusado com `-32603` — o código é genérico e o texto é prosa. Sem `turn_end`, e com `rateLimit: null`: a hora de reabrir só existe no texto (§7) |

## 2. Claude Code

### 2.1 O nome da entrada do Keychain

Lido do binário embutido (`2.1.257`), no módulo que constrói o nome do serviço:

```js
var g5 = "-credentials";
function Ix(n = "") {
  let e = process.env.CLAUDE_SECURESTORAGE_CONFIG_DIR,
      t = e !== void 0 ? !e : !process.env.CLAUDE_CONFIG_DIR,       // sem sufixo só se a variável NÃO existe
      r = e !== void 0 ? e.normalize("NFC") : Se(),                    // Se() = o diretório de config
      c = t ? "" : `-${sha256(r).hex.substring(0, 8)}`;
  return `Claude Code${Kt().OAUTH_FILE_SUFFIX}${n}${c}`;              // OAUTH_FILE_SUFFIX = "" em produção
}
```

E **a leitura e a escrita usam a mesma função**: a escrita é
`security -i` ← `add-generic-password -U -a "$USER" -s "${Ix(g5)}" -X <hex>`, e a leitura é
`find-generic-password -a "$USER" -w -s "${Ix(g5)}"`. A conta (`-a`) é sempre `$USER`, igual para
todas; o que separa as contas é o **serviço** (`-s`).

No Keychain desta máquina existe uma entrada só, `Claude Code-credentials`, sem sufixo — a da conta
de hoje, gravada sem a variável.

### 2.2 O que cada diretório enxerga

`claude auth status`, pelo binário embutido:

| Ambiente | `loggedIn` | `projectsDirectory` |
|---|---|---|
| sem variável | **`true`**, `claude.ai`, plano `team` | `~/.claude/projects` |
| `CLAUDE_CONFIG_DIR=/tmp/…/claude-a` | `false` | `/tmp/…/claude-a/projects` |
| `CLAUDE_CONFIG_DIR=~/.claude` (o caminho padrão, **escrito**) | **`false`** | — |
| `CLAUDE_SECURESTORAGE_CONFIG_DIR=/tmp/…/sec-s` | `false` | `~/.claude/projects` |

A terceira linha é o achado que vira regra de implementação: **o caminho padrão escrito não é o
padrão.** Com a variável presente, a entrada do Keychain ganha o sufixo e o arquivo de config muda
de `~/.claude.json` para `~/.claude/.claude.json`. A conta de hoje só é a conta de hoje com a
variável **ausente**. (A medição criou um `~/.claude/.claude.json` de primeira execução, de 343
bytes, e ele foi apagado em seguida; o `~/.claude.json` real não foi tocado.)

E pelo adaptador, com o cliente ndjson:

| Ambiente | `authMethods` | `session/new` | `session/prompt` |
|---|---|---|---|
| sem variável | — (não pedido nesta rodada) | fecha, 777 ms | — |
| `CLAUDE_CONFIG_DIR=a` | `claude-ai-login`, `console-login` | **fecha**, 520 ms | **`-32000 Authentication required`**, 62 ms |
| `CLAUDE_SECURESTORAGE_CONFIG_DIR=s` | os mesmos dois | **fecha**, 476 ms | `-32000`, 2,2 s |

**O `session/new` do Claude não confere login.** Ele fecha sem credencial nenhuma, e o
`-32000` só chega no primeiro `session/prompt` — de graça, porque morre antes da API, mas só depois
de alguém mandar um prompt. O §6 diz o que isso quebra hoje.

### 2.3 Por que a escrita não medida está coberta

O único jeito de gravar uma credencial de assinatura é o OAuth pelo navegador. Mas a pergunta não é
*"o login grava?"* — é *"grava numa entrada diferente?"* —, e o nome da entrada é função pura do
ambiente, lida pelos dois caminhos (§2.1). A leitura foi medida (§2.2); a escrita usa o mesmo nome.
O que sobra para o primeiro login de verdade conferir é o `find-generic-password -s "Claude
Code-credentials-<hash>"` existir depois dele — e isso vira critério de aceite de uma task, não
pergunta de desenho.

**Medido em 2026-09-28**, com uma segunda assinatura de verdade conectada pela tela (a T19 da
[`034`](../features/034-agent-accounts/tasks.md)), só com leituras — nenhum segredo lido, nada escrito:

| O que faltava medir | Resultado |
|---|---|
| a entrada da conta nova no Keychain | **existe**: `Claude Code-credentials-d2b72677`, e `d2b72677` é o `sha256` do diretório da conta — o nome que o §2.1 leu no binário |
| a primeira conta continua logada | **sim**: a entrada sem sufixo continua lá, e o `auth status` sem a variável diz `loggedIn: true` |
| cada conta com o próprio e-mail | **sim**: as duas no plano `team`, com e-mails diferentes — o `auth status` de cada diretório lê o `.claude.json` dela |

E uma prova que ninguém pediu: no mesmo dia, o limite semanal esgotou na conta nova enquanto a
primeira seguia respondendo (§7). Cada conta gasta a sua cota.

### 2.4 `CLAUDE_SECURESTORAGE_CONFIG_DIR` — a forma cirúrgica, e por que ela mente

Ela existe, e faz literalmente o que o §4 da PRD prometia: muda **só** a entrada do Keychain e deixa
a config onde está. A medição mostra por que ela não serve:

- o **e-mail e a organização** que o `auth status` mostra vêm de `oauthAccount`, no `.claude.json`
  **da config** — `function On(){return gl()?ie().oauthAccount:void 0}` —, e não da credencial. Com
  a config compartilhada, o último login sobrescreve o `oauthAccount` de todos: a conta 1 passaria a
  **se apresentar** com o e-mail da conta 2, gastando o token da conta 1;
- a **lista de modelos** também vem da config: o `.claude.json` guarda `additionalModelOptionsCache`,
  `modelAccessCache` e `orgModelDefaultCache`. Medido — com a credencial isolada e **sem login**, o
  `session/new` listou `claude-fable-5-1[1m]`, que só aparece porque a conta de hoje o tem em cache.
  Com `CLAUDE_CONFIG_DIR` limpo, a mesma lista **não tem** o Fable;
- não está documentada. É uma variável interna — aparece na lista do que o Claude Code repassa a um
  *teammate*, e em nenhum lugar que um usuário leia.

Ou seja: ela isola o segredo e compartilha a **identidade** — que é justamente o que a conferência
(§4) e a lista de modelos por conta ([Q9](../features/034-agent-accounts/open-questions.md)) leem.

### 2.5 O que `CLAUDE_CONFIG_DIR` leva junto

O que mora no diretório de config, e portanto **não** é visto por uma conta com diretório próprio:

| Item | Onde, na conta de hoje |
|---|---|
| credencial (Keychain, com o sufixo) | `Claude Code-credentials` |
| identidade: `oauthAccount`, caches de modelo | `~/.claude.json` |
| servidores MCP do escopo do usuário | `~/.claude.json` → `mcpServers` |
| permissões, hooks, `env`, modelo e effort padrão | `~/.claude/settings.json` |
| memória do usuário | `~/.claude/CLAUDE.md`, `~/.claude/rules/` |
| plugins, skills, subagentes | `~/.claude/plugins/`, `skills/` |
| **os transcripts das sessões** | `~/.claude/projects/` |

Medido na lista de `configOptions`: na conta de hoje, o `session/new` oferece um seletor `agent` com
os subagentes dos plugins instalados, o modelo `opus[1m]` e o effort `xhigh` que o `settings.json`
fixa. Com `CLAUDE_CONFIG_DIR=a`, o seletor `agent` **some**, e modelo e effort voltam a `default`.

**E com a herança por link** ([Q10](../features/034-agent-accounts/open-questions.md)), medido em
2026-09-28 numa conta de verdade: o `session/new` da conta nova devolve o seletor `agent` com os
mesmos subagentes de plugin, e o modelo e o effort do `settings.json` — idêntico ao da conta de hoje.
O que a tabela acima diz que a conta nova **não** vê passa a ser só a identidade e os MCPs de
usuário, que moram no `.claude.json`.

A última linha da tabela é a que pesa na implementação: o `session/load` de uma conversa do Claude lê
o transcript de `<config>/projects/`, então **o diretório da conta tem de viver tanto quanto as
conversas dela** — o que a [Q8](../features/034-agent-accounts/open-questions.md) já decidiu
(*desconectar* não apaga) ganha aqui o motivo técnico.

O que ela **não** leva, e é por isso que ela ganha de reescrever `HOME`: `.gitconfig`, `~/.ssh`,
`nvm`, `gh`. O agente numa conta nova continua commitando com o seu nome e dando `push` com a sua
chave — a razão da [Q6](../features/034-agent-accounts/open-questions.md) continua de pé.

### 2.6 A credencial é do processo vivo

Não medido em execução, lido do binário: o Claude Code **renova** o token OAuth durante a sessão
(`tengu_oauth_token_refresh_*` aparece 45 vezes, junto com um lock de renovação —
`oauth_token_refresh_lock`, `contended_lock`, `holder_alive`) e grava o token novo de volta na
entrada. É o que tira da mesa a alternativa de *um diretório só, trocando a credencial antes de cada
`spawn`*: duas sessões vivas em contas diferentes renovariam contra a mesma entrada.

## 3. Codex

### 3.1 O que cada diretório enxerga

`codex login status`, pelo binário embutido:

| Ambiente | Resultado |
|---|---|
| sem variável | `Logged in using ChatGPT` |
| `CODEX_HOME=~/.codex` (escrito) | `Logged in using ChatGPT` — no Codex, o caminho padrão escrito **é** o padrão |
| `CODEX_HOME=/tmp/…/codex-a` | `Not logged in` |

### 3.2 A escrita, exercitada

`printf '<chave falsa>' | CODEX_HOME=/tmp/…/codex-b codex login --with-api-key`:

- gravou `codex-b/auth.json` (83 bytes, `0600`);
- `codex-b` passou a responder `Logged in using an API key - sk-lumem***chave`;
- `codex-a` continuou `Not logged in`;
- o `~/.codex/auth.json` ficou com o **mesmo mtime e o mesmo tamanho** de antes (`1790338570`,
  3727 bytes).

O armazenamento do Codex é **arquivo**, e não Keychain, enquanto o `config.toml` daquele diretório
não pedir outra coisa (`cli_auth_credentials_store`). Num diretório que o Lumem cria, ninguém pede.
O `chat-gpt-device-code` aparece nos `authMethods` com `elicitation: { url: {} }` — a mesma
declaração do `AcpManager` —, mas não foi completado: ele espera uma pessoa aprovar no navegador. Ele
grava no mesmo `auth.json` do mesmo diretório.

### 3.3 Pelo adaptador

| Ambiente | `session/new` | `_auth/status_update` | Modelos |
|---|---|---|---|
| sem variável | fecha, 1,2 s | `{ kind: "account", label: "ChatGPT Plus", account: { email, plan: "plus" } }` | 5, effort até `xhigh` |
| `CODEX_HOME=a` (sem login) | **`-32000`**, 3 ms | — | — |
| `CODEX_HOME=b` (chave falsa) | fecha, 19 ms | `{ kind: "api_key", label: "OpenAI API key" }` | **6** (com `gpt-5.2`), effort até **`ultra`** |

A ordem também foi vista, e ela importa para quem espera a notificação: o `_auth/status_update`
chega **antes** da resposta do `session/new` (no registro da rodada padrão, a notificação aparece
antes da linha com os 1,2 s do `session/new`). Uma espera curta depois da resposta é só folga.

Duas coisas daqui:

- **a lista de modelos muda com a conta**, e não é pouco: a conta ChatGPT e a chave de API oferecem
  listas e escalas de effort diferentes. Isso confirma a Q9 pelo lado do dado — a lista **é** por
  conta, e guardá-la por agente estaria errado;
- **o `session/new` do Codex confere presença, não validade**: a chave falsa passou. E o turno com
  ela terminou em **`end_turn`**, com o `401 Unauthorized` chegando como `agent_message_chunk` — o
  erro vira texto da conversa. Não é da `034`, mas é o mesmo tipo do §6.

`CODEX_HOME` leva junto o que o Codex guarda lá: o `config.toml` (modelo, perfis, os
`[mcp_servers]`), o `AGENTS.md` global e o histórico. Medido: na conta de hoje o modelo corrente é
`gpt-5.5`, que o `config.toml` fixa; em `CODEX_HOME=b`, o adaptador abriu em `gpt-6-astra`.

## 4. A conferência

A regra da [`021`](../features/021-second-agent/prd.md) é *conferido, não acreditado*. A medição
diz com o quê:

| Agente | Confere presença | Confere **qual conta** |
|---|---|---|
| Claude | `claude-agent-acp --cli auth status` → `loggedIn` (0,57 s, zero token) | o mesmo JSON → `email`, `orgName`, `subscriptionType` |
| Codex | `session/new` → `-32000` | `_auth/status_update` → `account.email`, `plan` (só no login ChatGPT; a chave de API diz só `api_key`) |

O `--cli` é do próprio adaptador (o mesmo que os `authMethods` mandam rodar para o login), então a
conferência do Claude não reintroduz um `claude` do PATH — a regra do ADR de 2026-09-08 fica inteira.

## 5. O que isto decide

A forma escolhida na Q6 — a variável do CLI — **se sustenta**: nenhuma colisão, nos dois agentes.
Mas a premissa com que a PRD a escolheu estava errada. *"Cirúrgica: só a credencial muda"* descreve a
`CLAUDE_SECURESTORAGE_CONFIG_DIR`, que perde pelo §2.4. `CLAUDE_CONFIG_DIR` e `CODEX_HOME` são uma
**configuração inteira do agente por conta**: a segunda conta nasce sem os seus plugins, a sua
memória de usuário, os seus MCPs e as suas permissões.

É um trade-off real, com alternativa nomeável dos dois lados, difícil de reverter (os transcripts do
Claude passam a morar no diretório da conta) e surpreendente sem contexto (*"por que a minha conta
do trabalho não vê meus plugins?"*). Passa nos três testes, e a decisão está no
[ADR de 2026-09-26](../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md).

## 6. O defeito de brinde

**Desde o pino `0.75.1`, uma máquina sem login do Claude aparece `conectado` no rodapé.**

O `AcpManager` deriva `authRequired` do `session/new` responder `-32000`
(`packages/server/src/acp/AcpManager.ts`, no `spawn` do probe), e o `AgentLogin` pinta `entrar` só
quando `authRequired === true` (packages/web/src/components/AgentLogin.tsx). Com o `0.75.1`, o
`session/new` fecha sem credencial (§2.2), então a linha fica verde e o primeiro sinal de que falta
login é o primeiro prompt morrer. A [`027`](../features/027-adapter-provenance/prd.md) mediu o
sintoma pelo lado do turno (*"com só `node`, `session/prompt` responde `Authentication required`"*) e
não chegou ao probe.

A conferência do §4 conserta os dois ao mesmo tempo, e é por isso que ela entra na `034` e não num
remendo separado: com contas, **qual** conta é a pergunta, e *se há* uma é o caso particular.

## 7. A conta que bateu no limite — medida em 2026-09-28

> **Não foi uma bancada: foi uso.** Uma conta do Claude conectada pela `034` — rótulo
> `technomar-ted`, com `CLAUDE_CONFIG_DIR` próprio — bateu no **limite semanal** no meio de uma
> conversa. Sessão Lumem `6b67b5b4-…`, sessão ACP `52cb3d1d`, `claude-agent-acp@0.75.1`, modelo
> `sonnet`. O que chegou ficou em dois lugares que já existiam para isso: a transcrição da conversa e
> o `~/.lumem/_system/turn-failures.jsonl` que a
> [Q46 da `028`](../features/028-autonomous-orchestration/open-questions.md#q46--como-o-daemon-reconhece-uma-recusa-por-cota)
> deixou de instrumento. **Custo: nenhum turno chegou ao modelo.**

O que chegou, nesta ordem:

| # | O quê | Forma |
|---|---|---|
| 1 | `agent_message_chunk` | o texto *"You've hit your weekly limit · resets 7pm (America/Sao_Paulo)"*, gravado como mensagem **comum** do agente |
| 2 | `usage_update` | `used: 0`, `size: 200000`, custo **zero** em USD — não nulo —, e `rateLimit: null` |
| 3 | `session/prompt` **recusado** | `{"code":-32603,"message":"Internal error: You've hit your weekly limit · resets 7pm (America/Sao_Paulo)","data":{"errorKind":"rate_limit"}}` |
| 4 | — | **nenhum `turn_end`** |

O retrato do `turn-failures.jsonl` saiu com `tag: turn-failed` e `windowSpent: false` — e o `false`
é informação: a janela **não** estava marcada como gasta, porque o `rateLimit` veio nulo. O filtro
que a Q46 propôs (`jq 'select(.windowSpent)'`) **não teria achado esta amostra**; o que a achou foi o
`data`, guardado cru justamente por isso.

**O que isto decide:**

- **o código não serve, o texto também não, e o `errorKind` serve.** `-32603` é o *internal error*
  genérico do JSON-RPC; o texto é prosa do adaptador. O único campo estrutural que distingue a recusa
  por cota de qualquer outra falha interna é `data.errorKind`. Ele entrou na `spec` como
  `AdapterSpec.quotaRefusalKind` — `"rate_limit"` no Claude, `null` no Codex, que **não foi medido** —,
  e é por ele, e só por ele, que o daemon reconhece a recusa (o [ADR de
  2026-09-13](../adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md));
- **o sinal de quando reabre não existe fora do texto.** *"resets 7pm (America/Sao_Paulo)"* está na
  mensagem e em nenhum campo — o `rateLimit` veio nulo. A esteira, então, trata o caso medido como
  **sem sinal**: três tentativas com espera crescente, e depois o cartão para nomeando a conta
  (a [T17 da `028`](../features/028-autonomous-orchestration/tasks.md#t17-cota-não-é-orçamento--pausada));
- **a recusa não fecha o turno sozinha.** Sem `turn_end`, a conversa ficava dizendo que o agente
  ainda respondia. O evento `quota_refused` do Lumem é quem fecha — e **não** é um `turn_end`, porque
  é no `turn_end` que o contador de turnos vira, e contar um turno aqui gastaria o teto de
  `turnsPerSession` num turno que a conta recusou. Pelo mesmo motivo, o `usage_update` zerado do
  passo 2 deixou de virar linha em `session_usage`;
- **a conversa diz qual conta.** Com duas contas do mesmo agente, *"o Claude bateu no limite"* não
  diz nada. A linha diz *"a conta technomar-ted bateu no limite do Claude Code"*, com o texto do
  adaptador ao lado, e oferece *continuar em outra conta* quando há outra conectada — oferece, e não
  troca: a [Q4](../features/034-agent-accounts/open-questions.md#x-q4--o-limite-de-janela-e-o-teto-de-orçamento-passam-a-ser-por-conta)
  continua de pé, e a decisão está na
  [Q12](../features/034-agent-accounts/open-questions.md#x-q12--a-conversa-que-bateu-no-limite-oferece-continuar-em-outra-conta).

**O que não foi medido:** a mesma recusa no **Codex**, e o limite de **cinco horas** do Claude (a
amostra é do semanal). Até uma cota do Codex fechar de verdade, a recusa dele é uma falha de turno
comum — escrever `rate_limit` na spec dele seria vocabulário de um adaptador no catálogo de outro.
