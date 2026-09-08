# PRD — O harness deste repositório

> **Status:** proposta
> **Histórico:** v0.1 — proposto em **2026-09-07**, a partir da [auditoria de harness](../../project/harness-audit.md) medida no commit `40a0883` (v0.3.1).
> **Perguntas:** [open-questions.md](open-questions.md) — 8 abertas, 3 já respondidas
> **Tasks:** [tasks.md](tasks.md) — 16 tasks em 3 fases, uma issue cada
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
