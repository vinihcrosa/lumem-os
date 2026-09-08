---
title: O status de PR vem do `gh` da sua máquina, e o Lumem não guarda segredo
date: 2026-08-30
area: security
summary: A consulta ao host passa pelo `gh` já autenticado no keychain da sua máquina em vez de uma API com token nosso, porque não guardar segredo é a maior parte da resposta de segurança da feature e ela sai de graça.
feature: 013-pull-request-status
---

## Contexto

A `013-pull-request-status` responde uma pergunta que o paralelismo cobra — **dá pra mesclar?** — e
para responder ela precisa falar com o host da PR. Isso é a primeira vez que o Lumem lê dado de fora
da sua máquina.

A restrição que bifurca a decisão: **guardar token cria uma superfície de segredo, e superfície de
segredo é permanente.** Onde guarda, como cifra, o que faz no backup, o que vaza no log, e uma tela
de configuração por host. Nada disso desaparece depois.

## Decisão

O dado vem do **`gh` instalado na sua máquina**, com a autenticação que ele já tem no keychain. O
Lumem **não guarda token, não pede token e não lê token**. A consulta é **por projeto** — oito
worktrees custam um processo, não oito.

## Alternativas consideradas

A pergunta é a [Q1 da feature](../features/013-pull-request-status/open-questions.md), e ela era
bloqueante: *"a feature inteira depende desta resposta; sem ela nada da fase 1 começa"*. A medição
está no [`spike.md`](../features/013-pull-request-status/spike.md).

### API do host, com token guardado pelo Lumem

- **O que era:** falar direto com a API do GitHub, com um token que o Lumem guarda.
- **A favor:** sem dependência de binário externo, mais rápido, e controle fino de quais campos
  pedir.
- **Contra:** uma **superfície de segredo** — onde guarda, como cifra, o que faz no backup, o que
  vaza no log — mais uma tela de configuração de token por host.
- **Por que perdeu:** *não guardar segredo* é a maior parte da resposta de segurança da feature, e
  ela **sai de graça** pelo outro caminho. O motivo não é performance — é que a alternativa cobra uma
  dívida que nunca é paga, e cobra antes de a feature provar que vale.

### `gh` — o que ganhou

- **O que era:** delegar a autenticação ao CLI que a pessoa já usa (e a `glab`, e ao que vier).
- **A favor:** autenticação já resolvida; o Lumem nunca vê, guarda nem pede segredo; e GitHub
  Enterprise funciona **sem configuração nova**, porque o `gh` já sabe o host.
- **Contra:** um **processo por consulta** (centenas de ms), depende de um binário existir, e a saída
  `--json` é contrato de outro projeto, que pode mudar.
- **Por que ganhou apesar do custo:** o custo do processo se paga com a consulta **por projeto** — o
  spike mediu **0,7 s** num repositório pequeno para **todas** as PRs de uma vez.

## Consequências

### Bom

- **Zero segredo nosso no caminho.** A pergunta "o que acontece se o `~/.lumem` vazar" tem a mesma
  resposta antes e depois desta feature.
- GitHub Enterprise funciona sem nenhuma configuração.
- **`argv` fixo:** nenhuma string de UI entra na linha de comando. O que varia é `cwd` e, no máximo,
  um nome de branch vindo do **git local** — nunca do cliente. Não há shell no caminho.
- **`stderr` do `gh` nunca vai cru** para a tela nem para o log: ele pode conter URL com credencial
  em remoto mal configurado.
- URL só vira link se o esquema for `https` **e** o host for igual ao host do remote do projeto.

### Ruim

- **A feature não funciona sem o `gh` instalado**, e o Lumem não pode consertar isso — só dizer.
- Um processo por consulta, com timeout e `maxBuffer`, porque um repositório com 300 PRs não pode
  travar nem estourar a memória do daemon.
- **A saída `--json` é contrato de outro projeto.** Foi medido, e ele muda de resposta conforme o
  estado da PR: `mergeable` volta `UNKNOWN` para PR fechada ou mesclada e resolvido para PR aberta. A
  tabela de veredito trata `UNKNOWN` como `pending` em vez de chutar, e as fixtures congelam as duas
  formas.

### Riscos

- **O Lumem executa um binário que ele não controla, com as permissões de quem rodou o daemon.** O
  que impede isso de virar execução arbitrária é a lista de `argv`, não a esperança — o mesmo
  argumento do `ext::` no `git-url.ts`.
- **Título de PR, nome de check, de autor e de branch são texto de gente desconhecida.** Vão para a
  tela como texto, nunca como HTML, sempre truncados. O React já faz o escape; a regra proíbe a
  exceção esperta que alguém acrescenta depois.
- **Nada do que vem do host entra em prompt de agente nesta feature.** Se um dia entrar, esta linha é
  onde a decisão foi tomada — e ela precisa ser reaberta, não estendida.
