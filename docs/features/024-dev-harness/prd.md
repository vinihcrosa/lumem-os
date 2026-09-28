# PRD — O harness deste repositório

> **Status:** em execução
> **Histórico:** v0.1 — proposto em **2026-09-07**, a partir da [auditoria de harness](../../project/harness-audit.md) medida no commit `40a0883` (v0.3.1). v0.2 — **2026-09-28**: remedido, e o escopo cresce para **hooks** (de git e de agente) e **skills** — ver o [§8](#8-emenda--2026-09-28-hooks-skills-e-o-que-três-semanas-não-mudaram).
> **Perguntas:** [open-questions.md](open-questions.md) — 14 abertas, 3 já respondidas
> **Tasks:** [tasks.md](tasks.md) — 21 tasks: uma Fase 0 de medição e as 3 fases de 2026-09-07
> **Issue de rastreio:** [#72](https://github.com/vinihcrosa/lumem-os/issues/72), com marco por fase
> **Depende de:** nada. A [daemon-auth](../019-daemon-auth/prd.md) é vizinha e **não** é pré-requisito:
> ela protege o produto de quem fala com ele, esta protege o repositório de quem escreve nele
> **Desenho:** nenhuma tela. Esta é a segunda feature que não é de tela — a primeira foi a
> [workspace-memory](../007-workspace-memory/prd.md)

---

## 1. O problema, em uma frase

**O repositório verifica muito e não bloqueia nada.**

Os sensores existem, são rápidos e são bons: 3151 testes em 1min05, 78 e2e em 2min29, CI em 4min,
`any = 2` em 105.757 linhas. E nada disso participa da decisão de mesclar: `main` não tem proteção
(`branches/main/protection` → **404**, `rulesets` → **`[]`**), não há check obrigatório, não há hook,
e a política de permissão do agente não mora no git — mora em `~/.claude/settings.json`, com **101
`allow` e zero `deny`**, propriedade de uma máquina.

No mesmo ambiente existe uma **credencial de publicação permanente**: `~/.npmrc` com `_authToken`,
para um pacote público já publicado. Um `npm publish` é um comando, e não passa por confirmação
nenhuma.

O diagnóstico completo, com os números e o que foi medido em vez de estimado, está na
[auditoria](../../project/harness-audit.md). Esta PRD é o que fazer com ele.

## 2. Por que agora

Porque o repositório **já** opera em N2 — 322 dos 324 commits têm co-autoria de agente — e opera sem
rede de proteção. A ordem certa não é "melhorar a qualidade": a qualidade está boa e medida. É
**posicionar** o que já existe na fronteira do merge, e tirar da mesa as quatro ações irreversíveis
que hoje custam um comando.

E porque a resposta 1 do §10 da auditoria transformou o item mais caro em o mais barato: o token do
`~/.npmrc` era do CD, o `release.yml` publica por OIDC desde `457247a`, e retirar o token é apagar
uma linha.

## 3. Escopo

Três fases, na ordem em que reduzem risco por unidade de esforço:

| Fase | O quê | Habilita |
|---|---|---|
| **F1 — contenção e loop** | credencial fora do ambiente, `main` protegida com os dois checks obrigatórios, política de permissão versionada, runtime pinado, frescor de documentação como teste, `AGENTS.md` | **N2 com segurança** |
| **F2 — comportamento e arquitetura** | lint de correção bloqueante, fitness arquitetural como teste, log do daemon consultável, ensaio de rollback, frescor de dependência | **N3 nas três classes definidas** |
| **F3 — entropia e revisão inferencial** | mutation testing com piso, revisor no CI com taxa medida, PR menor por contrato | ampliar as classes de N3 por número |

**As três classes de N3**, confirmadas na resposta 3 do §10 da auditoria e fechadas aqui:

1. **CSS e token** — coberto por porte de folha nas duas direções, 119 pares de contraste e o
   `tokens.ts` conferido contra a derivação.
2. **Atualização de dependência** — coberto pela suíte inteira mais `smoke:install` (3,4s).
3. **Documentação** — coberto pelo teste de frescor que a [T6](tasks.md) cria.

Nada além dessas três, e cada uma só depois de o portão da F1 existir.

## 4. Não-objetivos

| Fora | Por quê |
|---|---|
| Formatador (`prettier`, `biome format`) | reformata 105.757 linhas num commit e apaga o `git blame` de um repositório de 24 dias. Vai para o [backlog](../../project/backlog.md) com gatilho: quando entrar a segunda pessoa |
| Sandbox de filesystem para o agente | o `deny` da [T4](tasks.md) cobre os alvos nomeados; sandbox de verdade é decisão de ferramenta, não de repositório. Backlog |
| `CODEOWNERS` | um autor humano. A regra seria `* @vinihcrosa`, que não regula nada. Volta com a segunda pessoa |
| Aprovação humana obrigatória em PR | o GitHub não permite aprovar a própria PR: exigir 1 aprovação num repositório de uma pessoa trava o merge para sempre. A T2 exige **PR e checks**, com zero aprovações |
| Autenticação do daemon | é a [daemon-auth](../019-daemon-auth/prd.md), com PRD próprio e perguntas abertas |
| Grading de qualidade por domínio com histórico | precisa dos sensores da F2 existindo primeiro para ter o que graduar. Backlog |
| Script de seed | o ambiente de dev compartilhado (`~/.lumem-dev/shared`) **é** o seed, por desenho — ver [workspaces.md](../../project/workspaces.md) |
| Feature flags | o produto é local, de um usuário, e a unidade de release é a versão do npm. Flag aqui compraria complexidade sem comprar reversão. O que compra reversão é a T12 |

## 5. O que muda, arquivo por arquivo

| Onde | O quê | Task |
|---|---|---|
| `~/.npmrc` (fora do git) | a linha `_authToken` sai | T1 |
| GitHub — ruleset em `main` | nasce: PR obrigatória, `non_fast_forward`, `deletion`, os dois checks em modo `strict` | T2 |
| GitHub — environment `npm`, token do `gh` | reviewer obrigatório; scope `delete_repo` revogado | T3 |
| `.claude/settings.json` | nasce, com `deny` explícito | T4 |
| `scripts/agent-policy.test.ts` | nasce — o `deny` que desaparecer derruba a suíte | T4 |
| `.nvmrc`, `mise.toml`, `scripts/workspace/setup.sh`, `scripts/node-version.ts` (+ teste) | versão exata, e o setup recusa outra | T5 |
| `scripts/docs-freshness.test.ts`, `scripts/gate-quick.ts` (+ `gate-quick.test.ts`) | o frescor vira teste, e o gate ganha a categoria `docs` | T6 |
| `docs/**` (24 itens), `docs/README.md` | o que o T6 acusa | T7 |
| `AGENTS.md`, `CLAUDE.md`, `docs/project/history.md` | o mapa fica neutro; a narrativa histórica sai do contexto ativo | T8 |
| `eslint.config.ts` ou `.oxlintrc.json`, `package.json`, `ci.yml` | lint de correção, bloqueante | T9 |
| `scripts/architecture.test.ts` | direção de dependência, dependência declarada e teto de linhas | T10 |
| `packages/server/src/config.ts`, `server.ts`, `turbo.json`, `scripts/workspace/run.sh` | `LUMEM_LOG_FILE` — o log do daemon em arquivo | T11 |
| `.github/workflows/release.yml` | `rollback_to`, e o ensaio | T12 |
| `.github/dependabot.yml` | frescor de dependência | T13 |
| `stryker.config.json`, `.github/workflows/mutation.yml`, `docs/project/testing.md` | o número que limita o auto-engano | T14 |
| `.github/workflows/review.yml` | o `lumem-reviewer` no CI, não bloqueante, com taxa medida | T15 |
| `.github/pull_request_template.md`, `ci.yml` | PR menor por contrato | T16 |

## 6. Riscos

| Risco | Mitigação |
|---|---|
| **A T2 trava o próprio autor.** Ruleset com checks obrigatórios impede push direto em `main`, que é como boa parte deste histórico foi feita | é o ponto, não o efeito colateral. A saída de emergência é apagar o ruleset, que fica no audit log da organização — e não um `bypass_actor` permanente ([Q1](open-questions.md)) |
| **A T9 pode acusar centenas de coisas de uma vez** e virar um commit de 105k linhas | o passo 1 da task é **medir** os dois candidatos neste repositório antes de escolher, e o conjunto de regras nasce só com correção — nada de gosto. Se o número for grande, a task para e a Q2 decide |
| **A T12 mexe no registro público.** Mover `latest` para trás e voltar afeta quem instalar na janela | a janela é de minutos, o pacote tem dias de vida, e um rollback que nunca foi ensaiado não é um rollback. A task exige aval explícito antes de rodar |
| **A T15 gasta token por PR** | nasce não bloqueante e com teto por tamanho de diff; a decisão de bloquear vem depois de 5 PRs de dados ([Q5](open-questions.md)) |
| **O teste de frescor da T6 pode virar gate que grita à toa** — é a armadilha nº 2 do `gate-quick.ts`, registrada em [testing.md](../../project/testing.md) | a categoria `docs` é própria e a mensagem diz o que rodou e o que não rodou, exatamente como a categoria `e2e` faz hoje. E `docs/references/**` fica fora da conta, porque descreve código de outro repositório |
| **Pinar o Node quebra a máquina de quem já roda outra versão** | o `.nvmrc` e o `mise.toml` são leitura para quem usa gerenciador; o que **recusa** é o `setup.sh`, com mensagem nomeando a versão esperada e a encontrada |

## 7. Critério de aceite da feature

1. Nenhuma das ações **#1 a #5** do §6 da [auditoria](../../project/harness-audit.md) é alcançável sem
   aprovação humana. Conferido rodando cada uma e observando a recusa — não lendo a configuração.
2. Uma PR com um teste quebrado tem o merge **bloqueado** pelo GitHub.
3. `pnpm gate:quick` num commit que só mexe em documentação **roda o teste de frescor** e diz que
   rodou.
4. `pnpm lint` existe, sai 0, e uma promessa não-aguardada introduzida à mão reprova.
5. Existe arquivo de log do daemon com uma linha estruturada por requisição, e o `AGENTS.md` diz onde
   ele está.
6. Um rollback de versão foi executado, medido e registrado.
7. O mutation score dos três diretórios de núcleo está registrado em `testing.md`, com piso que só
   sobe.

## 8. Emenda — 2026-09-28: hooks, skills, e o que três semanas não mudaram

### 8.1 A remedição

Três semanas depois da auditoria, **nenhuma das 16 tasks começou**, e o repositório passou de 3 151
para **4 468 testes**. Medido em 2026-09-28, contra a linha de base do §6 da
[auditoria](../../project/harness-audit.md):

| # da auditoria | Em 2026-09-07 | Em 2026-09-28 |
|---|---|---|
| 1 — `npm publish` com o token do ambiente | `~/.npmrc` com `_authToken` | **igual**: a linha continua lá, três semanas depois da [A1](open-questions.md) dizer *"pode retirar"* |
| 2 e 5 — push forçado em `main`, merge de PR vermelha | `rulesets` → `[]` | existe um ruleset `main-protect` com `deletion`, `non_fast_forward`, `required_linear_history` e `pull_request` — **`enforcement: disabled`** e **sem `required_status_checks`**. `branches/main/protection` continua **404** |
| 3 — `git push --tags` publica | environment `npm` sem regra | **igual** |
| 4 — `gh api -X DELETE` | scope `delete_repo` | **igual** |
| 6 e 7 — credencial e `~/.lumem` | `~/.claude/settings.json`: 101 `allow`, 0 `deny` | **103 `allow`, 0 `deny`**, e nada em `.claude/settings.json` do repositório |
| hook de git | nenhum | **nenhum** — `core.hooksPath` indefinido |
| `AGENTS.md` | não existe | **não existe**. O Lumem roda Codex na esteira, e o Codex não lê `CLAUDE.md` |

O que mudou é o que a [`025`](../025-docs-contract/prd.md) e a
[PR #92](https://github.com/vinihcrosa/lumem-os/pull/92) fizeram na documentação: o link-checker
virou gate, e o `CLAUDE.md` perdeu a crônica (de 9 792 para 2 435 palavras) — metade da
[T8](tasks.md#t8-agentsmd-na-raiz-e-o-claudemd-encolhe--63), por outro caminho.

A leitura é a do §1, e piorou de sentido: **o repositório verifica mais e continua não bloqueando
nada**, e cada semana de N2 sem portão é uma semana de sorte.

### 8.2 O que entra

O pedido de 2026-09-28 é *"armar o harness para poder confiar cada vez mais no trabalho de agentes"*,
e ele nomeia três coisas que a v0.1 não tinha:

1. **Hooks de git.** A auditoria mediu a ausência e nenhuma task a tratava. Um hook de git é
   **feedback, não portão**: `--no-verify` o atravessa. Ele vale pelo que devolve *antes* do CI — e só
   vira regra para o agente quando o guarda do item 2 recusa o `--no-verify`.
2. **Hooks de agente.** A [T4](tasks.md#t4-a-política-de-permissão-do-agente-vira-arquivo-do-repositório-com-teste--59)
   põe um `deny` no `.claude/settings.json`, e isso protege **um** agente. O Codex tem hooks próprios
   (`.codex/hooks.json`, com `PreToolUse` que bloqueia), e a política precisa valer para os dois. A
   forma que a emenda propõe é **um guarda, três tomadas**: um script só decide, e o git, o Claude e o
   Codex o chamam.
3. **Skills.** O formato de cada tipo de documento sai do `CLAUDE.md` para três skills do repositório
   — ADR, documentos de feature e Outline —, e a regra de *onde cada coisa mora* fica. O desenho está
   na conversa que abriu a [PR #92](https://github.com/vinihcrosa/lumem-os/pull/92): regra sempre
   carregada, formato sob demanda.

E uma pergunta que a v0.1 não fez e que decide o valor dos itens 2 e 3: **os agentes que o próprio
Lumem sobe carregam o que está no repositório?** A esteira da [`028`](../028-autonomous-orchestration/prd.md)
roda `claude-agent-acp` e `codex-acp`, não o Claude Code interativo. Se os adaptadores não leem
`.claude/settings.json` nem `.codex/hooks.json`, o guarda protege quem está olhando e deixa de fora
quem trabalha sozinho — o caso que mais precisa dele. Por isso a emenda abre uma **Fase 0** que mede
antes de escrever, no molde da [`021`](../021-second-agent/prd.md) e da [`034`](../034-agent-accounts/prd.md).

### 8.3 O que muda, arquivo por arquivo — só o que é novo

| Onde | O quê | Task |
|---|---|---|
| `docs/project/harness-audit.md` §11 | o que cada agente carrega do repositório, medido | T0 |
| `.githooks/`, `scripts/workspace/setup.sh`, `scripts/harness/*.test.ts` | `pre-commit`, `commit-msg`, `pre-push`; o setup liga o `core.hooksPath` | T17 |
| `scripts/harness/guard.ts` (+ teste), `.claude/settings.json`, `.codex/hooks.json` | um guarda, chamado pelos dois agentes | T18 |
| `.claude/settings.json`, `.codex/hooks.json` | o `Stop` que cobra o gate antes de *"pronto"* | T19 |
| `.claude/skills/lumem-*`, e onde o Codex as lê | as três skills de documentação; auditoria das cinco de terceiro | T20 |

### 8.4 Critério de aceite — acrescido

8. Um agente — Claude **e** Codex, interativo **e** pela esteira, até onde a T0 disser que alcança —
   tentando `git commit --no-verify`, `git push --force` ou `npm publish` é **recusado pelo guarda**,
   com a frase dizendo por quê. Conferido tentando, não lendo a configuração.
9. `git commit` com mensagem fora do Conventional Commits é recusado pelo `commit-msg`; `git push` com
   o `gate:quick` vermelho é recusado pelo `pre-push`, dizendo o que rodou.
10. Um clone novo mais `scripts/workspace/setup.sh` deixa os hooks ligados sem passo manual.

