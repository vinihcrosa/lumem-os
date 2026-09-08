# PRD — Conectar agente: login, e só

**Protótipo:** `packages/web/prototype/lumem-agent-login.html` — sete estados, mais os casos e o mapa
tela ↔ protocolo
**Sucede:** [onboarding](../onboarding/prd.md) · **Depende de:** [acp-sessions](../acp-sessions/prd.md)
**Perguntas:** [open-questions.md](open-questions.md) · **Tasks:** [tasks.md](tasks.md)
**Status:** **implementado** — núcleo mais instalação automática. O caminho da chave de API ficou fora,
com a decisão registrada.

---

## 1. O problema, em uma frase

O rodapé da sidebar pedia **nome, transporte, comando, argumentos e versão do adaptador** — cinco
campos que só quem mantém o próprio adaptador sabe responder.

Nenhum deles é escolha de quem usa: o comando e a versão o daemon resolve, o transporte é decisão do
produto, e o jeito de entrar quem dita é o **próprio agente**, no handshake. Sobra uma decisão real —
**com qual conta você entra** — e é ela que esta tela é.

---

## 2. O que foi medido antes de desenhar código

Contra `@agentclientprotocol/claude-agent-acp` **0.40.0**, instalado nesta máquina, em 2026-08-20.
Quatro achados, e dois deles derrubam premissas que este repositório já tinha publicado.

### 2.1 O adaptador não oferece login para quem não pede

`authMethods` volta **vazio** a menos que o cliente declare `clientCapabilities.auth.terminal`. Está no
código do adaptador:

```js
const supportsTerminalAuth = request.clientCapabilities?.auth?.terminal === true;
const supportsMetaTerminalAuth = request.clientCapabilities?._meta?.["terminal-auth"] === true;
```

**Correção de uma medição anterior:** o [spike da acp-sessions](../../project/pty-vs-acp.md) leu
`authMethods: []` e concluiu *"a assinatura vale, o adaptador não pediu nada"*. A primeira metade
continua verdadeira — `session/new` respondeu. A segunda não: **ele nunca foi perguntado.** A conclusão
certa é mais estreita: uma credencial local válida faz `session/new` funcionar, e nada se pode dizer
sobre o que o adaptador ofereceria a um cliente que perguntasse.

Declarando a capacidade, ele oferece dois métodos: `claude-ai-login` (Claude Subscription) e
`console-login` (Anthropic Console) — que são **exatamente os dois botões do desenho**, com esses
nomes. O desenho estava certo sobre a lista.

### 2.2 Os dois logins são comando, não `authenticate`

Ambos vêm com `type: "terminal"`. E o `authenticate` do adaptador é:

```js
async authenticate(_params) {
  if (_params.methodId === "gateway" || _params.methodId === "gateway-bedrock") { … }
  throw new Error("Method not implemented.");
}
```

Então o clique **não** vai por `authenticate`. O que roda é `claude-agent-acp --cli auth login
--claudeai` num terminal — e é esse comando que abre o navegador. O desenho descrevia o mecanismo
errado; o resultado na tela é o mesmo, e o Lumem já tinha terminal desde a
[acp-sessions](../acp-sessions/prd.md).

Com `_meta["terminal-auth"]` declarado, o adaptador entrega o **comando exato**:

```json
{ "command": "…/bin/node", "args": ["…/claude-agent-acp", "--cli", "auth", "login", "--claudeai"],
  "label": "Claude Login" }
```

O daemon não adivinha qual binário dele mesmo loga — o que importa, porque adivinhar nome de binário é
o erro que produziu o comando de instalação errado no desenho do onboarding.

### 2.3 Não existe logout

`agentCapabilities.auth` volta **`null`**. O ACP tem `logout`, e ele é fechado por
`agentCapabilities.auth.logout`. Então o botão **sair** do desenho não pode existir — e a regra que o
próprio desenho escreveu é essa: *"sem isso, o botão mentiria"*.

### 2.4 Não existe método para chave de API

O adaptador oferece `env_var` para nada, e `gateway`/`gateway-bedrock` só quando o cliente declara
`auth._meta.gateway`. O caminho **colar uma chave** do desenho não tem respaldo de protocolo aqui:
seria mecanismo do Lumem. Ficou fora ([L6](open-questions.md)).

---

## 3. Escopo

### F1 — O rodapé diz o estado da conexão

- **F1.1** Uma linha, um verbo: `conectar um agente` quando não há nenhum, o nome do agente quando há.
- **F1.2** Cinco estados, com pip: `nenhum`, `verificando`, `entrando…`, `conectado`, `expirado`,
  `falhou`. Antes não havia onde ler nada disso.
- **F1.3** O estado é **derivado**, não guardado: existe `agent_config` ACP? o `session/new` da sonda
  respondeu? Nenhuma coluna nova.

### F2 — O painel, dentro dos 264px

- **F2.1** Mora na coluna e empurra a árvore. Sem modal — a sessão que estiver rodando continua
  visível ao lado.
- **F2.2** Um botão preenchido por painel. O segundo caminho é contorno; o terceiro é link.
- **F2.3** O que não está disponível **continua listado, com o motivo** (`Codex`). Sumir com ele deixa
  a pessoa procurando.

### F3 — O daemon prepara o adaptador

- **F3.1** `setup.installAdapter` instala `@agentclientprotocol/claude-agent-acp@0.40.0` em
  `~/.lumem/adapters`, com `npm install --prefix` — nunca `-g`, nunca `@latest`.
- **F3.2** Idempotente: se já está lá, não baixa nada.
- **F3.3** O progresso aparece em **três linhas** (`CLI encontrado` → `instalando` → `handshake`).
  Automático não é escondido.
- **F3.4** `npm` ausente, registry inalcançável, pacote que mudou de layout: cada um vira frase, com
  as palavras do npm quando existem — e o comando copiável volta como saída de emergência.
- **F3.5** A detecção procura **primeiro** onde o daemon instala, depois no `PATH`: numa máquina onde
  o daemon instalou, achar uma cópia global velha antes reportaria a versão de quem não vai rodar.

### F4 — O login é o comando do adaptador, num terminal do daemon

- **F4.1** Os botões vêm de `authMethods`. Nada de lista fixa nossa.
- **F4.2** O cliente manda **`methodId`**, nunca uma linha de comando. O daemon refaz o handshake e
  executa o que o **adaptador** declarou para aquele id — um cliente que pudesse nomear o binário
  seria um cliente que roda qualquer coisa na máquina do daemon.
- **F4.3** O terminal de login **não é sessão**: não tem escopo, e uma linha em `session` seria uma
  conversa que nunca existiu. O cliente anexa pelo socket de PTY que já fala.
- **F4.4** Não existe **"já entrei"**. O que muda o painel é o processo terminar **e** o adaptador
  responder `session/new` depois.
- **F4.5** Método que o Lumem não sabe executar — `agent`, `env_var`, ou `terminal` sem comando —
  aparece como recusa explicada, nunca como botão que falha.

### F5 — Os cinco campos viram gaveta

- **F5.1** `avançado` mostra comando, argumentos e versão fixada como **fatos**, em leitura.
- **F5.2** O formulário de cinco campos continua existindo, atrás de **outro agente ACP…** — é o
  único caminho para um adaptador que o daemon não instala nem sabe nomear.

---

## 4. Onde o desenho e o protocolo discordaram

| Desenho | Protocolo | Quem ganhou |
|---|---|---|
| clique → `authenticate` → o agente abre o navegador | os dois métodos são `terminal`; `authenticate` responde *Method not implemented* | **o protocolo** — roda o comando num terminal do daemon, e é ele que abre o navegador |
| `sair` quando vier `auth.logout` | `agentCapabilities.auth` é `null` | **o desenho**, pela própria regra dele: o botão não existe |
| `conta: vinicius@…` · `plano: Claude Max` | o handshake não diz conta nem plano | **o protocolo** — o painel mostra o que existe: agente, versão, modo ([L8](open-questions.md)) |
| colar uma chave de API | nenhum método `env_var` oferecido | **fora do escopo**, com a decisão de onde ela moraria já tomada ([L6](open-questions.md)) |
| estado 07 tem só `trocar conta` e `sair` | — | **o produto**: sem um caminho para um segundo agente, nunca se adiciona o Codex. Entrou `outro agente ACP…` |

---

## 5. A reversão nomeada

A [D5/O6 do onboarding](../onboarding/open-questions.md) decidiu, ontem, que **a tela nunca instala
nada**. Esta feature reverte isso, e a diferença importa:

| O que foi recusado | O que foi feito |
|---|---|
| `npm i -g` | `npm install --prefix ~/.lumem/adapters` |
| global, podendo pedir `sudo` | dentro da pasta do daemon, sem privilégio |
| sem lugar para dois minutos de saída | três linhas de progresso no painel |
| `@latest` implícito | versão **fixada** numa constante que alguém revisou |

O que ela custa, dito: **o daemon roda um gerenciador de pacotes e depois executa o que baixou.** É
um alargamento real do que um daemon local faz num clique. O que o limita é o que está na tabela — e
o comando copiável continua ali para a máquina onde nada disso funciona.

---

## 6. Não-objetivos

- **Chave de API colada.** §2.4. Quando voltar, mora em `agent_config.env` — decidido, e a tela terá
  de dizer que fica no registro do Lumem, não no chaveiro ([L6](open-questions.md)).
- **Chaveiro do sistema.** Consequência do acima: não há segredo para guardar nesta entrega.
- **Botão `sair`.** §2.3.
- **Conta e plano na tela.** O protocolo não os dá, e ler `~/.claude` para descobrir seria o Lumem
  espiando o estado interno de outro programa.
- **Editar o adaptador pela gaveta.** `avançado` é leitura. Trocar é remover e criar em **outro agente
  ACP…**, que é o formulário que já existe ([L7](open-questions.md)).
- **Login em daemon remoto.** O caso `claude-login` do desenho — sem navegador na máquina do daemon —
  é o mesmo mecanismo (`type: "terminal"`) e funciona por construção; não foi exercitado, porque esta
  máquina tem navegador.

---

## 7. Riscos

| Risco | Por que é real | O que segura |
|---|---|---|
| **A versão fixada envelhece** | 0.40.0 é o que esta máquina tem; o adaptador solta versão quase toda semana | é constante, então subir é mudança de código revisada. O integration marcado roda contra a instalada e falha se o handshake mudar de forma |
| **`npm` na máquina do usuário** | proxy, mirror corporativo, npm ausente | cada falha é frase com as palavras do npm, e o comando copiável volta |
| **O daemon executa o que baixou** | é o alargamento do §5 | `--prefix`, versão fixa, pasta própria, e nada de `sudo` |
| **`authMethods` muda de forma** | é lista de terceiro | o que o Lumem não sabe executar aparece como recusa explicada, não como botão |
| **A sonda por página** | cada `probe` sobe um processo | `staleTime` de 5 min e um botão explícito de reverificar. Zero token, ~0,6 s |
| **Clicar antes da detecção** | aconteceu: instalava um adaptador que já existia | o botão fica desabilitado enquanto a detecção corre — foi o e2e que achou |

---

## 8. Custo nos testes

| O quê | Como | Novo? |
|---|---|---|
| Instalação | unitário com `npm` dublado; os casos que interessam são os que uma rede boa não produz | sim |
| Sonda com `authMethods` | integration com agente falso, inclusive `auth_required` pelo `RequestError` do SDK | reusa |
| `setup.login` | integration: roda o comando que o adaptador nomeou, e **recusa** id que ele não ofereceu | sim |
| O painel, estado por estado | 17 testes de componente | reusa |
| Porte do CSS | auditoria nas duas direções, que pegou o `.key-in` sem markup | reusa |
| O painel contra handshake real | e2e contra o adaptador de fixture | reusa |
