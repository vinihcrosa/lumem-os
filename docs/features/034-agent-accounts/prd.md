# PRD — Mais de uma conta por agente

> **Status:** em execução
> **Histórico:** v0.1 — proposta em **2026-09-25**, a partir de um pedido do Vinicius: *"ter duas ou
> mais contas do Claude conectadas, e poder selecionar o Opus 5 na conta 1 para uma coisa e a conta 2
> com Fable para outra"*. Ela tira do [backlog](../../project/backlog.md) o item *Múltiplas contas
> para o mesmo agente*, que estava lá desde a [pty-vs-acp A2](../../project/pty-vs-acp.md)
> v0.2 — **fase 0 medida em 2026-09-26** ([estudo](../../project/agent-accounts-measurements.md)): o
> Keychain não colide, a variável do CLI se sustenta e **não é cirúrgica**, e a Q7 virou o
> [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md). As notas
> estão no §4, no §5 e no §8
> v0.3 — **renumerada de `030` para `034` em 2026-09-26**: colidiu com a
> [`030-settings`](../030-settings/prd.md), que mergeou antes. Pela regra 1 da
> [`025`](../025-docs-contract/prd.md), renumera a que mergeia depois. Junto veio o que o `main` mudou por baixo dela:
> o desenho passou a morar no código, o login de agentes saiu do rodapé para `/settings`, e agente
> passou a ser sempre ACP. As notas estão no cabeçalho, no §6 e nas tasks
> **Perguntas:** [open-questions.md](open-questions.md) — 13 perguntas, **todas respondidas**
> (2026-09-25 e 2026-09-26), **3 contra a proposta** e **2 emendadas**. A Q10 nasceu da fase 0
> **Depende de:** a [`009-agent-login`](../009-agent-login/prd.md) (o login pela tela, que esta PRD
> multiplica), a [`021-second-agent`](../021-second-agent/prd.md) (o catálogo `ADAPTERS` e o rodapé
> com uma linha por agente), a [`027-adapter-provenance`](../027-adapter-provenance/prd.md) (a
> invocação resolvida da spec a cada `spawn` — é onde a conta entra) e o
> [ADR do cofre](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md), que já disse
> que **agentes entram numa feature posterior**. Esta pode ser ela
> **Tasks:** [tasks.md](tasks.md) — 20 tasks em 4 fases. A fase 0 (a medição) está entregue
> **Desenho:** ~~vem do Open Design **antes** do React~~ — a regra de 2026-08-19 foi superada pelo
> [ADR de 2026-09-20](../../adr/2026-09-20-2246-design-lives-in-the-code.md): o desenho mora no
> código, e a galeria é o Storybook. Pelo gatilho dele (*"se o desenho estiver errado, o que se joga
> fora?"*), os componentes novos desta feature são **código**, então os estados deles nascem como
> stories antes da fiação

---

## 1. O problema, em uma frase

**O Lumem sabe que existe o agente Claude, mas não sabe que existe *uma conta* do Claude** — o login
é propriedade do agente, então cada agente tem exatamente uma identidade, e ela é a que estiver no
`$HOME` de quem subiu o daemon.

Hoje, quem tem uma conta pessoal e uma do trabalho — ou duas assinaturas para somar limite — troca de
login **na mão**, fora do produto, e toda sessão aberta a partir daí passa a gastar na conta nova sem
nada na tela dizer isso.

**Critério de sucesso em uma frase:** com duas contas do Claude conectadas, abrir uma conversa com
**Opus 5 na conta `pessoal`** e outra com **Fable 5.1 na conta `trabalho`**, lado a lado, e cada uma
gastar — e aparecer gastando — na conta certa.

## 2. O que muda no modelo

A credencial deixa de ser propriedade do **agente** e vira propriedade de **(agente, conta)** — a
frase é do backlog, e ela é a feature inteira.

| Hoje | Depois |
|---|---|
| `agent_config` = agente **e** identidade | `agent_config` = agente (comando, versão do adaptador) |
| — | `agent_account` = uma identidade daquele agente: rótulo, método de login, onde mora a credencial |
| sessão aponta para `agent_config` | sessão aponta para **`agent_account`** (e, por ela, para o agente) |
| `session_usage` somável por projeto e worktree | somável também **por conta** |

O **modelo** não muda de lugar: ele continua sendo escolha da sessão, pelo seletor que já existe
(`configOptions`). O que a feature acrescenta é **antes** disso — de qual conta sai a sessão. *"Opus 5
na conta 1"* é conta escolhida ao abrir + modelo escolhido no seletor.

**A escolha é por sessão, e vem pré-selecionada com um trio padrão** ([Q1](open-questions.md#x-q1--a-conta-é-escolhida-onde-por-sessão-por-projeto-ou-pelos-dois)):
na mesma worktree convivem uma sessão do Claude na conta 1 e outra do Codex na conta 2. O padrão é
**conta + modelo + effort** (effort quando o agente oferece), e ele é composto em dois níveis
([Q1a](open-questions.md#x-q1a--o-padrão-é-um-só-ou-um-por-agente)):

- **cada agente tem uma conta padrão** — a primeira conectada dele;
- **cada conta tem um modelo e um effort padrão**.

Conversa nova do Codex abre na conta padrão do Codex, no modelo padrão dela; trocar a conta no
diálogo troca o modelo e o effort para o padrão da conta escolhida. Tudo se muda na configuração, a
qualquer momento, sem mexer em sessão aberta. Não é padrão de projeto nem de worktree.

**A conta não troca depois do nascimento** ([Q3](open-questions.md#x-q3--dá-para-trocar-a-conta-de-uma-conversa-já-aberta)).
Trocar é um verbo — *continuar em outra conta* —: abre uma sessão nova na conta escolhida, com o
contexto da de origem, **numa aba nova**, e a de origem continua funcionando
([Q3b](open-questions.md#x-q3b--a-sessão-de-origem-fica-como)).

**O nome da conta é seu** ([Q2](open-questions.md#x-q2--a-conta-tem-nome-dado-por-você-ou-o-que-o-provedor-diz)),
digitado ao conectar.

**Cada encaixe da esteira tem o seu trio**, configurável separadamente
([Q5](open-questions.md#x-q5--cada-encaixe-da-esteira-pode-ter-conta-própria)): o padrão é a
primeira conta fazendo tudo, e trocar só o revisor é um gesto — o encaixe diz só o que difere e
herda o resto dos padrões do agente e da conta. O lugar já existe — o `named_agent` da
Parte 2 da [`028`](../028-autonomous-orchestration/prd.md) guarda adaptador e modelo, com a cascata
tarefa → projeto → workspace → padrão. Esta feature acrescenta **conta** e **effort** a ele, e o
degrau *padrão* passa a ser a primeira conta conectada.

**Levar o contexto é cortar as saídas** ([Q3a](open-questions.md#x-q3a--o-que-é-copiar-o-contexto)):
vai tudo o que foi dito e o registro de cada ferramenta; a saída longa de ferramenta vira uma linha.

**Remover uma conta a desconecta, não a apaga**
([Q8](open-questions.md#x-q8--remover-uma-conta-faz-o-quê-com-as-conversas-dela)): as conversas
dela continuam legíveis, e o `resume` pede para reconectar. Apagar de vez é um segundo gesto.

## 3. Casos de uso

- **UC1 — pessoal e trabalho.** Duas contas do Claude na mesma máquina, sem trocar login. O projeto
  do trabalho abre sessão na conta do trabalho; o pessoal, na pessoal.
- **UC2 — somar limite.** Duas assinaturas: quando a conta 1 bate no limite de janela, você abre a
  próxima conversa na conta 2 — ou *continua* a mesma nela. **O controle é seu**: o Lumem não mede
  nem compara limite por conta ([Q4](open-questions.md#x-q4--o-limite-de-janela-e-o-teto-de-orçamento-passam-a-ser-por-conta)).
- **UC3 — modelo caro numa, barato noutra.** Opus 5 numa conta com plano maior para o trabalho
  difícil, Fable/Haiku noutra para tarefa mecânica — o exemplo do pedido.
- **UC4 — a esteira.** Os encaixes da [`028`](../028-autonomous-orchestration/prd.md)
  (implementador, revisor, testador) nascem todos no trio padrão. Trocar **só o revisor** para a
  conta 2 com outro modelo é como a esteira deixa de comer o limite de quem está conduzindo na mão.
- **UC6 — continuar em outra conta.** A conversa bateu no limite no meio do trabalho: *continuar
  em outra conta* abre uma sessão nova, na conta 2, com o contexto levado da primeira, e segue dali.
  A primeira continua aberta.
- **UC5 — Codex também.** Nada aqui é do Claude: o `codex-acp` tem `api-key` e `chat-gpt`, e duas
  contas ChatGPT são o mesmo caso.

## 4. O mecanismo — o que precisa ser medido antes

O backlog já aponta o mecanismo, vindo do [estudo do Compozy](../../references/compozy.md): **isolar
o diretório de credencial do subprocesso**. Duas formas; **a escolhida é a 1**
([Q6](open-questions.md#x-q6--isolar-por-variável-do-cli-ou-por-home-inteiro)), e a fase 0 mede se
ela se sustenta:

1. **Variável do próprio CLI** — `CLAUDE_CONFIG_DIR` para o Claude Code, `CODEX_HOME` para o Codex.
   ~~Cirúrgica: só a credencial muda~~, o resto do ambiente (nvm, `gh`, `git config`) continua o seu.

   > **Nota (2026-09-26), da fase 0:** *cirúrgica* estava errado. A variável leva a **configuração
   > inteira do agente** — plugins, skills, `CLAUDE.md` de usuário, MCPs, permissões e transcripts
   > ([estudo](../../project/agent-accounts-measurements.md), §2.5). A forma que muda só a credencial
   > existe (`CLAUDE_SECURESTORAGE_CONFIG_DIR`) e perde, porque deixa a identidade compartilhada (§2.4).
   > Continua de pé o que decidiu a Q6: nvm, `gh` e `git config` não mudam. A decisão está no
   > [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md), e o custo
   > para você é a [Q10](open-questions.md#x-q10--o-que-uma-conta-nova-herda-da-sua-configuração-de-hoje).
2. **Reescrever `HOME` e `XDG_*`** (o *provider home isolation* do Compozy). Genérica, funciona para
   qualquer CLI — e cobra caro: o agente passa a rodar comandos num `$HOME` que não é o seu, sem
   `.gitconfig`, sem chave SSH, sem o nvm que a Parte 7 da `028` já pagou uma vez.

**A medição da fase 0**, na regra da [`021`](../021-second-agent/prd.md) e da
[`026`](../026-worktree-from/prd.md) de medir antes de escrever:

- o `claude-agent-acp@<pino>` respeita `CLAUDE_CONFIG_DIR` no handshake, no `authenticate` e no
  turno? O login OAuth pelo navegador grava onde?
- no macOS, o Claude Code guarda a credencial **no Keychain**, e não num arquivo. Se a entrada do
  Keychain não varia com o diretório de config, duas contas **colidem** na mesma entrada — e aí a
  forma 1 não basta. **Esta é a medição que pode mudar o desenho inteiro.**
- o `codex-acp` respeita `CODEX_HOME`, inclusive no `chat-gpt-device-code`?
- o `_auth/status_update` do Codex (`{ email, plan }`, já anotado no backlog) e o que o Claude
  expuser servem para **conferir** que a sessão está na conta que o Lumem acha — em vez de acreditar.

> **Medido (2026-09-26)** — [estudo](../../project/agent-accounts-measurements.md), zero token:
>
> - **Keychain:** não colide. A entrada é `Claude Code-credentials-<sha256(dir)[0:8]>` sempre que
>   `CLAUDE_CONFIG_DIR` existe, e leitura e escrita usam o mesmo nome. **A primeira conta é a variável
>   ausente**: com o caminho padrão escrito, a conta de hoje aparece deslogada;
> - **`claude-agent-acp`:** respeita a variável no handshake, no `session/new` e no turno;
> - **`codex-acp`:** respeita `CODEX_HOME`, e aqui a escrita foi exercitada. Um login num diretório
>   descartável não tocou o `~/.codex`. O `chat-gpt-device-code` aparece, e não foi completado;
> - **conferir:** sim, mas **não pelo `session/new`**. O do Claude fecha sem credencial, e o do Codex
>   aceita chave falsa. Claude: `claude-agent-acp --cli auth status` (e-mail e plano, 0,57 s). Codex:
>   `_auth/status_update`;
> - **de brinde:** desde o pino `0.75.1`, uma máquina sem login do Claude aparece `conectado` no
>   rodapé. O probe confia no `-32000` do `session/new` (estudo, §6).

## 5. Onde a credencial mora

Duas famílias de login, e elas moram em lugares diferentes:

- **Login por assinatura** (OAuth, `chat-gpt`, `claude-login`): a credencial é do **CLI**, gravada
  por ele. O Lumem é dono do **diretório** — `~/.lumem/_system/agents/<agente>/<conta>/`, fora do git
  pela mesma regra do `_system/` — e não do conteúdo.
- **Chave de API**: vai para o **cofre** do
  [ADR de 2026-09-13](../../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md), e é
  injetada no `spawn` da conta. É aqui que o `apiKeyEnv` da `021` — que o ADR chamou de
  *simplicidade, não política* — deixa de ler do ambiente. **Presença** sai para a tela; o valor não.

A conta que já existe hoje — a do `$HOME` — vira a **primeira conta** de cada agente, sem migração de
credencial: ela aponta para o diretório padrão do CLI. Ninguém precisa relogar para a feature chegar.

> **Nota (2026-09-26):** *aponta para o diretório padrão* quer dizer **sobe sem a variável**, e não
> com o caminho padrão escrito nela. No Claude as duas coisas são diferentes: a variável presente
> muda o nome da entrada do Keychain e o arquivo de config
> ([ADR](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)). E o diretório de uma
> conta vive tanto quanto as conversas dela, porque o `session/load` do Claude lê o transcript de
> dentro dele.

## 6. A tela

> **Nota (2026-09-26), do rebase no `main`:** a primeira versão desta seção punha as contas no
> **rodapé de agentes** da sidebar. A [`030-settings`](../030-settings/prd.md) decidiu depois, na Q6
> dela, que esse rodapé **some inteiro** e que o login de agentes vai para `/settings` (LUM-57). Pôr
> contas no rodapé seria construir no lugar que já tem data para sair. O que continua de pé: sub-linha
> e não coluna, a escolha de conta só com duas ou mais, e o cabeçalho com agente e conta.

- **`/settings` → Agentes** passa a ser onde as contas moram. Hoje a seção é só leitura (label,
  pino, versão instalada). Cada agente ganha **uma sub-linha por conta**: rótulo, a identidade
  conferida (e-mail e plano, quando o agente conta), estado, e as ações `entrar`, `padrão`,
  `desconectar`. Um `＋ conectar conta` por agente. A configuração do trio padrão da conta (modelo e
  effort) mora na mesma sub-linha. A lista de modelos e de effort vem do adaptador, e é gravada por
  conta **no handshake ~~que confere o login~~ que segue a conferência** (a nota de 2026-09-26 da
  [Q9](open-questions.md#x-q9--de-onde-a-configuração-tira-a-lista-de-modelos-e-de-effort): o
  `session/new` não confere, e quem confere é outra leitura). Ela existe desde que a conta existe, e
  se atualiza a cada sessão aberta. Modelo padrão que sumiu abre no que o adaptador escolher, com uma
  linha na conversa, e o trio aparece *indisponível*.
- **O rodapé da sidebar** fica como está até a LUM-57 removê-lo. Ele passa a falar da **conta
  padrão** de cada agente, que é o que ele sempre mostrou sem saber.
- **Abrir conversa:** a pílula de agente e modelo do rascunho (`AgentModelPill`, da
  [`033`](../033-acp-only-agents/prd.md)) ganha a escolha de conta **só quando o agente tem mais de
  uma**. Com uma conta, o produto fica pixel a pixel como hoje. Ela vem pré-selecionada com o trio
  padrão (Q1).
- **Esteira:** o trio de cada encaixe, na seção Esteira de `/settings`, que já existe.
- **Continuar em outra conta:** um gesto no cabeçalho da conversa aberta. A sessão nova mostra o que
  foi levado da origem, e cada uma aponta para a outra — o formato está na
  [Q3a](open-questions.md#x-q3a--o-que-é-copiar-o-contexto) e na
  [Q3b](open-questions.md#x-q3b--a-sessão-de-origem-fica-como).
- **Conversa aberta:** o cabeçalho diz agente **e conta** quando o agente tem mais de uma (a `021` já
  pagou o defeito da string `claude` escrita à mão; com contas, é o mesmo defeito uma camada abaixo).
- **Consumo do workspace:** abre por conta, embaixo do agente — é dado somável, não limite.

## 7. Fora do escopo

- **Trocar a conta de uma conversa no lugar.** O adaptador sobe com a credencial no `spawn`. O que
  existe é *continuar em outra conta*, que abre outra sessão (Q3).
- **Limite, teto ou alerta por conta.** Quem controla as contas é você (Q4). Os tetos do workspace
  da Parte 3 da `028` não mudam.
- **Rodízio automático** quando uma conta bate no limite. É o UC2 feito pela máquina, e a Q4 o tira
  do objetivo do produto — não é *depois*, é *não*.
- **GitHub e GitLab** com mais de uma conta — o ADR do cofre os agrupa com agentes, mas são outra
  feature.

## 8. Riscos

- ~~**Colisão no Keychain** (§4). Se confirmada, a forma cirúrgica não funciona no macOS e a feature
  depende da forma cara — ou de o adaptador ganhar um jeito de apontar a credencial.~~ **Medido em
  2026-09-26: não colide** (§4). No lugar dele entram dois riscos:
- **A segunda conta nasce limpa** — sem plugins, `CLAUDE.md` de usuário, MCPs e permissões. É o custo
  do [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md), e o que
  fazer com ele é a [Q10](open-questions.md#x-q10--o-que-uma-conta-nova-herda-da-sua-configuração-de-hoje).
- **O contrato com o adaptador é implícito.** O nome da variável, a derivação da entrada do Keychain
  e o formato do `auth status` são do CLI embutido, e não estão em nenhum protocolo. Um pino novo que
  mude um deles quebra contas sem nada falhar alto. A conferência do pino passa a medir isso também.
- **Termos de uso.** Usar duas assinaturas para somar limite (UC2) pode ferir os termos do provedor.
  O Lumem não decide isso por você, mas também não deve vender o UC2 como recurso sem dizer isso. **Decidido (2026-09-26):** o painel de conectar conta diz isso numa
  linha quando o agente **já tem** uma conta — que é o único momento em que a frase é sobre o que
  você está fazendo.
- **Sessões antigas.** Toda conversa em disco aponta para `agent_config`; a migração as amarra à
  primeira conta, e o `resume` de uma delas precisa subir com a credencial de onde ela nasceu.
