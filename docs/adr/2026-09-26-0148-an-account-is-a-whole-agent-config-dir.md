---
title: Uma conta de agente é um diretório de configuração inteiro, e a primeira é a ausência dele
date: 2026-09-26
area: security
summary: Cada conta de agente é um diretório de config próprio, passado ao adaptador no `spawn` por `CLAUDE_CONFIG_DIR` ou `CODEX_HOME`. A primeira conta é a variável **ausente**, e não o caminho padrão escrito. A fase 0 da `034` mediu que a variável escolhida na Q6 não colide no Keychain. Mediu também que ela não é "cirúrgica", como a PRD dizia: ela leva a configuração inteira do agente. A forma que isola só a credencial existe e perde, porque compartilha a identidade que a conferência lê. Conferir a conta passa a ser uma leitura de identidade própria de cada agente, e não o `session/new`.
feature: 034-agent-accounts
---

## Contexto

A [`034-agent-accounts`](../features/034-agent-accounts/prd.md) tira a credencial do agente e a dá a
**(agente, conta)**. A [Q6](../features/034-agent-accounts/open-questions.md) escolheu o mecanismo
antes de medir, com o motivo por extenso: isolar pela variável do próprio CLI, e não reescrever
`HOME`, porque a variável *"muda só onde o CLI procura o login"*, e o agente continua commitando com o
seu nome, dando `push` com a sua chave SSH e rodando o `node` do seu nvm. A resposta deixou uma
condição escrita: se o Keychain do macOS colidisse, a pergunta **voltava**.

A [Q7](../features/034-agent-accounts/open-questions.md), *"isso vira ADR?"*, foi adiada até a
medição, com o critério *"ADR só se a fase 0 mudar o mecanismo"*.

A [medição](../project/agent-accounts-measurements.md) rodou em 2026-09-26, sem gastar token, contra
as cópias que o daemon é dono. Ela respondeu as quatro perguntas do §4 da PRD, e uma quinta que
ninguém tinha feito:

- **o Keychain não colide.** O Claude Code `2.1.257` nomeia a entrada
  `Claude Code-credentials-<sha256(dir)[0:8]>` sempre que `CLAUDE_CONFIG_DIR` existe, e lê e escreve
  pela mesma função. O Codex guarda em arquivo, e um login num `CODEX_HOME` descartável não tocou o
  `~/.codex`;
- **a variável não é cirúrgica.** `CLAUDE_CONFIG_DIR` muda onde mora *toda* a configuração do
  agente: a identidade (`oauthAccount`), os caches de modelo, os MCPs do usuário, o `settings.json`,
  o `CLAUDE.md` do usuário, os plugins, as skills e **os transcripts**. `CODEX_HOME` faz o mesmo com o
  `config.toml`, o `AGENTS.md` e o histórico. Medido: com o diretório próprio, o seletor de
  subagentes dos plugins **some** do `session/new`, e modelo e effort voltam ao padrão do adaptador.

O mecanismo da Q6 se sustenta. A premissa com que ela foi escolhida, não. É isso que faz a decisão
passar no teste de *trade-off real*.

## Decisão

**Uma conta de agente é um diretório de configuração inteiro daquele agente.**

- **onde:** `~/.lumem/_system/agents/<agente>/<conta>/`, fora do git pela regra do `_system/` que a
  [`007`](../features/007-workspace-memory/prd.md) já mantém. O Lumem é dono do diretório; o
  conteúdo é do CLI;
- **como chega ao adaptador:** uma variável no `spawn` e no `resume`, resolvida a cada vez junto com
  a invocação, pela regra do [ADR de 2026-09-08](2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
  `CLAUDE_CONFIG_DIR` para o Claude e `CODEX_HOME` para o Codex. O nome da variável é um campo da
  `AdapterSpec`, e um adaptador sem ele não tem mais de uma conta;
- **a primeira conta é a variável ausente**, e não o caminho padrão escrito. Medido: com
  `CLAUDE_CONFIG_DIR=~/.claude`, o Claude Code procura outra entrada do Keychain e outro arquivo de
  config, e a conta de hoje aparece deslogada. É assim que a conta que já existe vira a primeira sem
  ninguém relogar, como o §5 da PRD pede;
- **o diretório vive tanto quanto as conversas dele.** O `session/load` do Claude lê o transcript de
  `<config>/projects/`. *Desconectar* uma conta ([Q8](../features/034-agent-accounts/open-questions.md))
  deixa o diretório no disco; só *apagar de vez* o remove;
- **conferir a conta é ler a identidade dela, e não abrir sessão.** Claude:
  `claude-agent-acp --cli auth status`, o `--cli` do próprio adaptador, com e-mail e plano em JSON e
  sem gastar token. Codex: a notificação `_auth/status_update` do handshake. O `session/new` não
  serve: o do Claude `0.75.1` fecha **sem credencial nenhuma**, e o do Codex aceita uma chave falsa.

**Chave de API** não é diretório. Ela vai para o cofre do
[ADR de 2026-09-13](2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) e é injetada no
`spawn` da conta, como o §5 da PRD já dizia. Este ADR decide onde mora o login **por assinatura**,
que é do CLI.

## Alternativas

**Reescrever `HOME` e `XDG_*`** (o *provider home isolation* do [Compozy](../references/compozy.md)).
Isola qualquer CLI sem conhecer nenhum. Perde pela razão da Q6, que a medição não mexeu: um agente
num `HOME` que não é o seu roda `git commit` sem autor, `push` sem chave e outro `node`. A conta nova
perderia os plugins do mesmo jeito, e ainda perderia o ambiente de trabalho junto.

**`CLAUDE_SECURESTORAGE_CONFIG_DIR`**, a forma que o §4 da PRD descrevia sem saber o nome. Ela existe
no `2.1.257` e muda **só** a entrada do Keychain. A conta nova veria os seus plugins e a sua memória,
e é a alternativa que mais tenta. Perde por três achados do §2.4 do estudo:

1. o e-mail e a organização que o `auth status` mostra vêm do `.claude.json` **compartilhado**. O
   último login sobrescreve os de todos, e a conta 1 passaria a se apresentar com o e-mail da conta 2
   enquanto gasta o token da conta 1. A conferência, que é metade desta decisão, mentiria;
2. a lista de modelos vem de caches no mesmo arquivo. Medido: sem login, ela listou o Fable, que só
   existe no cache da conta de hoje. A lista por conta da
   [Q9](../features/034-agent-accounts/open-questions.md) mentiria do mesmo jeito;
3. não está documentada: aparece só na lista do que o Claude Code repassa a um processo filho.

**Um diretório só, trocando a credencial antes de cada `spawn`**, copiando o segredo para dentro e
para fora da entrada padrão. Mantém toda a configuração e dispensa variável. Perde porque a
credencial é **do processo vivo**: o Claude Code relê e **renova** o token durante a sessão. Duas
conversas em contas diferentes ao mesmo tempo, que é o critério de sucesso da PRD, disputariam a
mesma entrada. A última a renovar venceria, e a outra passaria a gastar na conta errada sem nada na
tela dizer isso — o problema que a `034` existe para resolver.

**Só chave de API por conta** (`ANTHROPIC_API_KEY` vindo do cofre, sem diretório). Não tem
estado de CLI nenhum, e não resolve o pedido: o pedido é de **assinaturas**, e assinatura é login
OAuth.

## Consequências

- **A segunda conta nasce limpa.** Sem os seus plugins, skills, subagentes, `CLAUDE.md` de usuário,
  MCPs de usuário e permissões — no Claude e no Codex. É o custo desta decisão, e ele fica nomeado
  aqui. O que a conta nova pode **herdar** da configuração de hoje é a
  [Q10](../features/034-agent-accounts/open-questions.md). Nenhuma resposta dela muda esta decisão:
  herança é cópia ou link **para dentro** do diretório da conta, e a identidade (a credencial, o
  `.claude.json`, o `auth.json`) nunca é compartilhada;
- **o que a conta não leva continua sendo seu**, e é a razão da Q6: `.gitconfig`, `~/.ssh`, nvm,
  `gh`. O ambiente em que o agente roda comando no seu repositório não muda de conta para conta;
- **o nome da variável passa a ser contrato com o adaptador.** Uma versão nova que mude o nome da
  entrada do Keychain, o diretório ou o `auth status` quebra contas sem nada falhar alto. A
  conferência no boot, que o ADR de 2026-09-08 fez para a versão, passa a conferir também isto: um
  teste contra o binário do pino que faça as leituras do §2.2 do estudo;
- **o [ADR de 2026-09-08](2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md) continua em
  vigor**, e este o reafirma. A conta é ambiente do `spawn`, resolvido da spec a cada vez; o PATH
  continua sem decidir nada, e a conferência usa o `--cli` do próprio adaptador;
- **o [ADR de 2026-09-13](2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) continua em
  vigor**, e este o completa na parte que ele deixou para *"uma feature posterior"*. A chave de API da
  conta vai para o cofre; o login por assinatura fica no diretório, e o Lumem não lê nem copia o
  conteúdo dele;
- **o [ADR de 2026-09-13-0038](2026-09-13-0038-our-model-is-king-outsiders-adapt.md) continua em
  vigor**, e é ele que manda na forma. A conta é entidade do Lumem, e `CLAUDE_CONFIG_DIR` é só a
  tradução dela para um adaptador. Um terceiro agente traz a tradução dele, não um conceito novo;
- **um defeito atual sai de graça.** O probe de login confia no `-32000` do `session/new`. Desde o
  pino `0.75.1`, uma máquina sem login do Claude aparece `conectado` no rodapé. A conferência por
  identidade conserta isso como caso particular: *há uma conta?* antes de *qual conta?*.
