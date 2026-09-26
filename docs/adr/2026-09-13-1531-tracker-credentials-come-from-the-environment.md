---
title: A credencial do tracker vem do ambiente, e o Lumem continua não guardando segredo
date: 2026-09-13
area: security
summary: O §11 da `028` dizia que falar com um tracker exigiria reverter o ADR de 2026-08-30 — e não exige. O estudo achou uma quarta saída que nem ele nem a medição tinham visto, e ela **já está implementada duas vezes** neste produto: a credencial vem do ambiente do daemon, a tela recebe o **nome** da variável e nunca o valor, e a mensagem de erro do terceiro passa por `redact`. O ADR de 2026-08-30 é **reafirmado** no que ele protege — nenhuma superfície de segredo persistente — e **delimitado** no que ele dizia por atalho: *"não lê token"* virou *"não guarda, não pede, e não deixa vazar"*. A diferença honesta fica escrita: para adaptador o daemon nunca toca no valor, e para tracker ele toca, durante a chamada.
feature: 028-autonomous-orchestration
supersedes:
---

## Contexto

As Partes 5 e 6 da [`028`](../features/028-autonomous-orchestration/prd.md) — a issue do Linear que
vira tarefa, e o comentário que volta para lá — são as duas últimas da feature, e as duas estão
paradas pelo mesmo motivo. O §11 o escreveu assim:

> *"**segredo**: um relé multiusuário guardaria credencial de escrita no tracker de terceiros, o que
> contraria de frente o [ADR de 2026-08-30](2026-08-30-0416-pr-status-comes-from-your-own-gh.md) (*"o
> Lumem não guarda segredo"*). Reverter aquilo, se for o caso, é um ADR novo."*

E o [§3.4 do estudo de orquestração](../project/orchestration-measurements.md) mediu a saída
confortável e a eliminou: **não existe o `gh` do Linear.** Reconferido, e a lista cresceu — `linear`,
`lnr`, `jira`, `jira-cli` e `clickup`, nenhum na máquina. O ADR de 2026-08-30 nunca foi sobre GitHub;
ele foi sobre **já existir na máquina uma ferramenta autenticada que não é nossa**, e para tracker
essa ferramenta não existe.

O estudo listou três saídas — guardar, camada gerenciada, ou não ter tracker — e disse que a medição
não escolhia entre elas. **Ele não viu a quarta.**

## Decisão

**A credencial do tracker vem do ambiente do daemon, e o Lumem continua não guardando segredo
nenhum.**

Uma variável por host, declarada num catálogo como o `ADAPTERS` da
[`021`](../features/021-second-agent/prd.md) já é declarado. `LINEAR_API_KEY` é a primeira.

E com ela, quatro regras — **nenhuma delas nova**, porque as quatro já estão implementadas:

| Regra | Onde ela já vale hoje |
|---|---|
| a credencial vem do **ambiente**, e nada a escreve | `ADAPTERS[].apiKeyEnv` |
| a tela recebe o **nome**, nunca o valor | `AdapterReport.apiKeyEnv` |
| erro vindo de terceiro é **redigido** antes de subir | `agent-auth.ts` → `redact` |
| nada sobrevive ao processo | `agent-auth.ts` |

**Sem a variável, a feature não aparece.** Não é erro, é ausência — do mesmo jeito que um projeto sem
`test` declarado não ganha portão, e que um adaptador sem cópia gerenciada não abre sessão.

### O que este ADR faz com o de 2026-08-30

Ele o **reafirma** no que importa e o **delimita** no que ele dizia por atalho, que é o que a regra 4
do `CLAUDE.md` manda fazer quando só parte muda.

O que fica de pé, inteiro, e é a razão dele existir:

> *"guardar token cria uma superfície de segredo, e superfície de segredo é permanente. Onde guarda,
> como cifra, o que faz no backup, o que vaza no log, e uma tela de configuração por host. Nada disso
> desaparece depois."*

**Nenhuma dessas cinco aparece aqui.** Não há onde guardar, não há o que cifrar, não há backup a
decidir, e não há tela de configuração por host — há uma variável de ambiente, que é onde ela já
estaria para qualquer outra ferramenta da sua máquina.

O que é delimitado é a frase operacional do ADR — *"o Lumem não guarda token, não pede token e **não
lê token**"*. Lida ao pé da letra, ela proibiria o `apiKeyEnv` que o produto **já entregou** na `021`
e usa na tela desde então; ou seja, ela já estava delimitada de fato, e este ADR a escreve. A frase
passa a ser: **não guarda, não pede, e não deixa vazar.**

> Isto é o [ADR de 2026-09-13](2026-09-13-0038-our-model-is-king-outsiders-adapt.md) aplicado ao caso
> mais desconfortável dele: o que vem de fora se adapta ao nosso modelo, **inclusive quando o nosso
> modelo é uma política de segurança**. Um tracker que só funcionasse com o Lumem guardando a chave
> dele não entra; ele se adapta, ou fica de fora.

## Alternativas

**(a) O Lumem guarda a chave.** É a saída que o §11 antecipava, e ela contradiz o ADR de 2026-08-30
de frente. Custa a superfície inteira do parágrafo acima, e o
[estudo](../project/tracker-secret.md) mede uma parte dela contra este repositório e não contra a
lembrança: o `~/.lumem` é um **repositório git que o daemon commita sozinho**, e a proteção do
`lumem.db` é uma linha do bloco de `.gitignore` que o próprio daemon reescreve — uma proteção, não
uma garantia. Mais: o Q36 da [`007`](../features/007-workspace-memory/prd.md) vende `git remote` como
o backup daquela pasta, então um token ali seria um token cujo backup é decisão de outra feature.

**(b) Uma camada gerenciada guarda por nós** (Composio, Nango, Pipedream — os três que o §11 cita). O
Lumem continuaria sem guardar segredo, e é por isso que ela é tentadora. Perde por duas medidas e uma
frase: custa **~2 s por chamada** contra ~345 ms do caminho direto (§3.1 do estudo de orquestração),
faz o produto **parar de funcionar offline**, e move a credencial de escrita do usuário para um
terceiro — o que é pior, e não melhor, que a opção (a) para quem confiou a chave.

**(c) Sem tracker na v1.** Sai barato e derruba o **UC1** — *"uma issue do Linear vira uma PR enquanto
você almoça"* —, que é o caso que abriu a PRD. Seria escolher não ter a feature para não decidir sobre
ela.

## Consequências

- **A diferença honesta fica escrita**, e é o preço desta decisão. Para adaptador, o daemon **nunca
  toca no valor**: ele lança um processo filho e o filho herda o ambiente. Para tracker, quem faz a
  chamada HTTP é o daemon, então **o valor passa pela memória dele** durante a chamada. É um degrau a
  mais, é pequeno — é o que qualquer cliente HTTP faz ao montar um cabeçalho — e é real;
- o que **não** muda por causa desse degrau: nada em disco, nada no browser, nada em log que não passe
  pelo `redact`;
- **a tela ganha um estado que ela já sabe desenhar**: *"a variável existe"* / *"não existe"*, que é
  exatamente o que o rodapé de adaptadores já faz com `apiKeyEnv`;
- **escrita multiusuário continua fora.** Um relé com credencial de escrita de várias pessoas é a
  opção (b) com outro nome, e este ADR não a autoriza;
- e o gatilho para revisitar: **o dia em que um tracker relevante não tiver chave de API por
  ambiente** — só OAuth com redirecionamento, por exemplo. Aí a opção (b) volta à mesa com um custo
  que hoje ela não paga, e este ADR é quem deve ser contradito, não o de 2026-08-30.
