# O harness deste repositório — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Linha de base:**
[harness-audit.md](../../project/harness-audit.md)

**Status:** em execução
**Histórico:** **16 tasks em 3 fases, nenhuma iniciada** (2026-09-07). **Emenda de 2026-09-28:** mais a Fase 0 (T0) e cinco tasks na Fase 1 (T17–T21) — hooks de git, o guarda, o `Stop`, as skills e o contrato do `checks.md`; ver o [§8 da PRD](prd.md#8-emenda--2026-09-28-hooks-skills-e-o-que-três-semanas-não-mudaram). Três perguntas já respondidas (A1–A3); oito abertas, e as que travam task estão marcadas na coluna `Trava`.
**Issues:** [#72](https://github.com/vinihcrosa/lumem-os/issues/72) rastreia a feature; cada task tem a
sua, na coluna `Issue`. Marco por fase no GitHub.

Cada task diz **o que fazer**, **onde**, e **como se sabe que acabou** — e o "como se sabe" é sempre
comportamento observado, nunca configuração lida. `gh api` mostrando o campo certo não é aceite: o
aceite é o comando destrutivo sendo recusado.

---

## Antes de começar

**A ordem não é sugestão.** A F1 existe para que o resto possa ser feito por agente sem que um erro
alcance o registro público. Fazer a F2 antes da F1 é acelerar o loop de quem já pode publicar sem
aprovação.

| Fase | Tasks | Habilita | Esforço somado |
|---|---|---|---|
| **Fase 0 — o que os agentes carregam** | T0 | — | o alcance da T18, T19 e T20 | ~2 h |
| **F1 — contenção e loop** | T1 · T2 · T3 · T4 · T5 · T6 · T7 · T8 · T17 · T18 · T19 · T20 · T21 | [#56](https://github.com/vinihcrosa/lumem-os/issues/56) | N2 com segurança | ~1 dia |
| **F2 — comportamento e arquitetura** | T9 · T10 · T11 · T12 · T13 · T22 | [#64](https://github.com/vinihcrosa/lumem-os/issues/64) | N3 em CSS/token, dependência e docs | ~3 dias |
| **F3 — entropia e revisão inferencial** | T14 · ~~T15~~ · T16 | [#69](https://github.com/vinihcrosa/lumem-os/issues/69) | ampliar N3 por número | ~3 dias |

| Task | Issue | Classe | Trava | Esforço |
|---|---|---|---|---|
| T0 o que cada agente carrega do repositório, medido | — | medição | [Q13](open-questions.md) | P |
| T1 credencial de publicação fora do ambiente | [#56](https://github.com/vinihcrosa/lumem-os/issues/56) | permissão | — | P |
| T2 `main` protegida, dois checks obrigatórios | [#57](https://github.com/vinihcrosa/lumem-os/issues/57) | permissão | [Q1](open-questions.md) | P |
| T3 environment com reviewer, `delete_repo` revogado | [#58](https://github.com/vinihcrosa/lumem-os/issues/58) | permissão | — | P |
| T4 política de permissão versionada, com teste | [#59](https://github.com/vinihcrosa/lumem-os/issues/59) | permissão | — | P |
| T5 runtime pinado, e o setup recusa outro | [#60](https://github.com/vinihcrosa/lumem-os/issues/60) | ambiente | — | P |
| T6 frescor de documentação como teste | [#61](https://github.com/vinihcrosa/lumem-os/issues/61) | sensor computacional | — | M |
| T7 os 24 itens que o T6 acusa | [#62](https://github.com/vinihcrosa/lumem-os/issues/62) | — | — | P |
| T8 `AGENTS.md`, e o `CLAUDE.md` encolhe | [#63](https://github.com/vinihcrosa/lumem-os/issues/63) | guide inferencial | — | M |
| T17 hooks de git versionados, ligados pelo setup | — | sensor computacional | [Q9](open-questions.md), [Q10](open-questions.md) | P |
| T18 o guarda, no `PreToolUse` do Claude | — | permissão | [Q11](open-questions.md), T0 | M |
| T19 o `Stop` cobra o gate antes de *"pronto"* | — | sensor computacional | [Q12](open-questions.md), T0 | P |
| T20 as três skills de documentação, e a auditoria das de terceiro | — | guide inferencial | [Q14](open-questions.md), [Q15](open-questions.md), T8 | G |
| T21 o contrato conhece o `checks.md` | — | sensor computacional | [Q15](open-questions.md) | M |
| T9 lint de correção, bloqueante | [#64](https://github.com/vinihcrosa/lumem-os/issues/64) | sensor computacional | [Q2](open-questions.md) | M |
| T10 fitness arquitetural como teste | [#65](https://github.com/vinihcrosa/lumem-os/issues/65) | sensor computacional | [Q3](open-questions.md), [Q4](open-questions.md) | M |
| T11 log do daemon consultável pelo agente | [#66](https://github.com/vinihcrosa/lumem-os/issues/66) | ambiente | — | M |
| T12 rollback ensaiado e medido | [#67](https://github.com/vinihcrosa/lumem-os/issues/67) | ambiente | — | M |
| T22 o selo de classe de N3, como rótulo na PR | — | sensor computacional | ~~[Q7](open-questions.md)~~ | P |
| T13 frescor de dependência automatizado | [#68](https://github.com/vinihcrosa/lumem-os/issues/68) | sensor computacional | — | P |
| T14 mutation testing com piso | [#69](https://github.com/vinihcrosa/lumem-os/issues/69) | sensor computacional | — | G |
| ~~T15 revisor inferencial no CI, com taxa medida~~ — **fora de escopo** (2026-09-28, [Q5](open-questions.md)) | [#70](https://github.com/vinihcrosa/lumem-os/issues/70) | sensor inferencial | — | M |
| T16 PR menor por contrato | [#71](https://github.com/vinihcrosa/lumem-os/issues/71) | ambiente | — | P |

---

## Fase 0 — o que os agentes carregam

### T0: O que cada agente carrega do repositório, medido

**Classe:** medição · **Previne:** escrever um guarda que protege quem está olhando e deixa de fora
quem trabalha sozinho. A esteira da [`028`](../028-autonomous-orchestration/prd.md) sobe o
`claude-agent-acp`, e nada neste repositório diz se ele lê a configuração do projeto. **Só Claude**:
o repositório não é desenvolvido com outro agente ([Q11](open-questions.md)).
**Trava:** a [Q13](open-questions.md) é esta medição.

**What**:
1. Numa worktree descartável, criar `.claude/settings.json` com **um hook `PreToolUse` que só
   escreve um arquivo-marca** (`/tmp/lumem-t0/<superfície>`) e um `deny` de teste, mais uma linha
   distintiva no `CLAUDE.md` e numa skill de teste.
2. Rodar as duas superfícies com um prompt que dispare uma ferramenta inofensiva (`ls`): o Claude Code
   interativo, e o `claude-agent-acp` pelo daemon, como a esteira o sobe — em `bypassPermissions`.
3. Para cada superfície, registrar as quatro células: **hook disparou?** (a marca existe), **`deny`
   valeu?**, **o `CLAUDE.md` chegou?** (o agente cita a linha distintiva), **a skill apareceu?**. Oito
   células, e o custo em token de cada rodada.
4. Registrar no `docs/project/harness-audit.md`, como **§11**, com a data, as versões e a tabela.

**Where**: `docs/project/harness-audit.md`. Nenhum código de produção.

**Done when**:
- as oito células têm resposta observada, e nenhuma é *"deve funcionar"*;
- a [Q13](open-questions.md) está respondida com a tabela, e o alcance da T18, T19 e T20 está escrito
  nelas antes de começarem.

**Gate**: a tabela
**Status**: ✅ entregue em 2026-09-28 — [§11 da auditoria](../../project/harness-audit.md#11-o-que-o-claude-carrega-do-repositório--a-t0-da-dev-harness-2026-09-28).
Hook, `Stop`, `deny` e `CLAUDE.md` do projeto chegam às duas superfícies em `bypassPermissions`; a
skill chega sem descrição no Claude Code desta máquina.

---

## Fase 1 — contenção e loop

### T1: A credencial de publicação sai do ambiente · [#56](https://github.com/vinihcrosa/lumem-os/issues/56)

**Classe:** permissão · **Previne:** `npm publish` de uma versão arbitrária em
`@vinihcrosa/lumem-os` — pacote público, `0.3.1` no ar, ação irreversível (a janela de `unpublish` é
de 72h e o número da versão não volta nunca). Hoje custa um comando e não passa por confirmação.

**What**:
1. Conferir que o `release.yml` não depende do arquivo — ele publica por **OIDC/trusted publisher**
   desde `457247a`, e o próprio comentário do job `publish` diz que um token no ambiente faz o
   registry responder `404` disfarçado. Isto é leitura, não mudança.
2. Remover a linha `//registry.npmjs.org/:_authToken=...` do `~/.npmrc`:
   `npm config delete //registry.npmjs.org/:_authToken`.
3. Revogar o token no npmjs.com (Access Tokens → revoke). Apagar do arquivo sem revogar deixa a
   credencial válida em qualquer backup, histórico de shell ou snapshot de disco.
4. Registrar em [harness-audit.md](../../project/harness-audit.md) §6 que o item #1 está fechado, com
   a data.

**Where**: `~/.npmrc` (fora do git, é máquina), npmjs.com, `docs/project/harness-audit.md`.

**Done when**:
- `grep -c _authToken ~/.npmrc` devolve `0` (ou o arquivo não existe mais);
- `npm whoami` sai com código diferente de zero;
- `cd packages/cli && npm publish --dry-run` **recusa por falta de credencial** — este é o aceite, e
  não o `grep`;
- `pnpm smoke:install` continua verde: ele empacota e instala num prefixo descartável, e nunca
  precisou de credencial;
- a próxima release por tag publica normalmente. Se ela falhar, a causa é OIDC e não este token — o
  `release.yml` já registra o formato dessa falha.

**Gate**: `pnpm smoke:install`
**Status**: ✅ entregue em 2026-09-28, **menos o passo 3**. `~/.npmrc` sem `_authToken` (o arquivo
deixou de existir), `npm whoami` sai 1, `npm publish --dry-run` avisa *"requires you to be logged in"* —
em `--dry-run` o npm avisa em vez de recusar, e o aviso é o sinal —, `smoke:install` verde. **O passo 3,
revogar o token no npmjs.com, é do dono da conta.**

---

### T2: `main` protegida, com os dois checks obrigatórios · [#57](https://github.com/vinihcrosa/lumem-os/issues/57)

**Classe:** permissão · **Previne:** `git push --force origin main` (324 commits, um comando) e
merge de PR vermelha — hoje `gh pr merge` funciona com CI falhando, porque não existe check
obrigatório. É o que converte todo o estoque de sensores de conselho em portão.
**Trava:** ~~[Q1](open-questions.md)~~ — respondida em 2026-09-28: **ninguém**.

> **Nota — 2026-09-28.** Já existe um ruleset, `main-protect` (id `23258383`), com `deletion`,
> `non_fast_forward`, `required_linear_history` e `pull_request`, `bypass_actors: []` — mas
> **`enforcement: disabled`** e **sem `required_status_checks`**. O passo 1 **atualiza esse** (`PUT
> …/rulesets/23258383`) em vez de criar um segundo; o JSON abaixo continua sendo o alvo, mais o
> `required_linear_history` que ele já tem. Os nomes dos contextos foram conferidos de novo em
> `gh pr checks 92`: `typecheck, build e testes` e `e2e`. O `SonarQube` **não** entra
> ([Q1](open-questions.md)).

**What**:
1. Criar o ruleset. Os nomes dos contextos são os **nomes dos jobs**, conferidos em `gh pr checks 55`:
   `typecheck, build e testes` e `e2e` — com a vírgula e em português, exatamente assim.

```sh
gh api -X POST repos/:owner/:repo/rulesets --input - <<'JSON'
{
  "name": "main protegida",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false
      } },
    { "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "typecheck, build e testes" },
          { "context": "e2e" }
        ]
      } }
  ]
}
JSON
```

2. `required_approving_review_count` é **0** de propósito, pela [A2](open-questions.md): o GitHub não
   permite aprovar a própria PR, e 1 travaria o merge para sempre num repositório de uma pessoa. O que
   o ruleset força é o caminho branch → PR → CI verde.
3. `strict_required_status_checks_policy: true` exige que a PR esteja em cima da `main` atual. É o que
   fecha o buraco de "verde num commit que não é o que vai mesclar".
4. Ligar `delete_branch_on_merge` (hoje `false`), porque com PR obrigatória a branch passa a ser
   descartável: `gh api -X PATCH repos/:owner/:repo -F delete_branch_on_merge=true`.
5. **A release passa por PR** ([Q1](open-questions.md)): branch com `pnpm version:set x.y.z` → PR → CI
   verde → mescla → `git tag vx.y.z` no commit mesclado → `git push origin vx.y.z`. Escrever isso no
   runbook *Publishing a release* do Outline (`Lumem · Team` › Runbooks) e na linha do `version:set`
   no `CLAUDE.md`.

**Where**: configuração do repositório no GitHub. Nada no git.

**Done when** — os três conferidos por tentativa, e não por leitura:
- `git push origin main` direto de uma branch local é **recusado** pelo servidor;
- uma branch descartável com um teste deliberadamente quebrado, aberta como PR, mostra o merge
  **bloqueado** na UI e `gh pr merge` **recusa** (fechar a PR e apagar a branch depois — o experimento
  é o aceite);
- a primeira release depois disto sai pelo caminho do passo 5, e o `release.yml` dispara pela tag;
- `gh api repos/:owner/:repo/rulesets/23258383 --jq .enforcement` devolve `active` (confirmação
  secundária, não o aceite).

**Gate**: o experimento da PR vermelha acima
**Status**: ✅ entregue em 2026-09-28. O ruleset `main-protect` (`23258383`) está **`active`**, com
`bypass_actors: []`, `deletion`, `non_fast_forward`, `required_linear_history`, `pull_request` (0
aprovações, merge por `squash` ou `rebase` — o `merge` saiu, porque o histórico linear o recusaria de
qualquer jeito) e `required_status_checks` estrito com `typecheck, build e testes` e `e2e`;
`delete_branch_on_merge` ligado. Os dois aceites por tentativa:
- um push direto de um commit descendente de `main` foi **recusado pelo servidor**: *"Changes must be
  made through a pull request. 2 of 2 required status checks are expected."*;
- a PR descartável [#93](https://github.com/vinihcrosa/lumem-os/pull/93), com um teste vermelho de
  propósito, ficou em **`mergeStateStatus: BLOCKED`** com o check obrigatório reprovado — fechada e a
  branch apagada depois. O `gh pr merge` não foi tentado: o guarda da T18 o recusa, e o estado
  `BLOCKED` é a resposta do servidor.
O runbook *Publishing a release* do Outline passou a dizer a release por PR e a tag no commit mesclado,
e o `CLAUDE.md` também. A primeira release pelo caminho novo ainda não aconteceu.

---

### T3: Publicar exige aprovação, e o token do `gh` perde `delete_repo` · [#58](https://github.com/vinihcrosa/lumem-os/issues/58)

**Classe:** permissão · **Previne:** duas ações de um comando cada — `git push --tags`, que dispara o
`release.yml` e publica no npm sem nenhuma aprovação (o environment `npm` existe com
`protection_rules: []`, e o próprio arquivo diz que "exigir aprovação humana passa a ser uma linha no
dia em que houver uma segunda pessoa"); e `gh api -X DELETE repos/vinihcrosa/lumem-os`, porque o token
do `gh` desta máquina tem scope **`delete_repo`**.

**What**:
1. Reviewer obrigatório no environment `npm`. Aprovar o próprio deployment **é** permitido pelo GitHub
   (diferente de PR), então isto funciona com uma pessoa só:

```sh
ID=$(gh api user --jq .id)
gh api -X PUT repos/:owner/:repo/environments/npm --input - <<JSON
{
  "wait_timer": 0,
  "prevent_self_review": false,
  "reviewers": [ { "type": "User", "id": $ID } ],
  "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true }
}
JSON
gh api -X POST repos/:owner/:repo/environments/npm/deployment-branch-policies \
  -f name='v*' -f type=tag
```

2. A política de branch acima faz o job `publish` só rodar a partir de **tag `v*`**. Um
   `workflow_dispatch` de uma branch qualquer com `dry_run=false` deixa de alcançar o `npm publish` —
   que é o furo #9 da auditoria.
3. Revogar `delete_repo`. `gh auth refresh` só **acrescenta** scope, então o caminho é: GitHub →
   Settings → Applications → Authorized OAuth Apps → GitHub CLI → **Revoke**, e depois
   `gh auth login -h github.com -s repo,workflow,read:org,gist`. Conferir com `gh auth status` que
   `delete_repo` não aparece mais.

**Where**: configuração do repositório no GitHub, e a autorização do `gh` na conta.

**Done when**:
- `gh workflow run release.yml -f dry_run=false` a partir de uma branch **não** chega a publicar: o
  job `publish` fica em `waiting`, esperando aprovação, ou é recusado pela política de branch;
- um `git push --tags` de ensaio (tag descartável, apagada depois) para o job `publish` em
  `Review pending` — e a Release só nasce depois do clique;
- `gh auth status` não lista `delete_repo`;
- `gh api -X DELETE repos/:owner/:repo` responde `403` — este é o aceite do segundo item, e é a única
  forma honesta de saber. **Rodar contra este repositório, com o scope já revogado**; se o scope ainda
  estiver lá, o comando apaga o repositório.

**Gate**: os quatro acima
**Status**: 🟡 **parcial** em 2026-09-28. Feito: o environment `npm` exige o reviewer `vinihcrosa` e só
aceita deploy de **tag `v*`** (política `custom_branch_policies`). Aceites:
- `gh workflow run release.yml -f dry_run=false` a partir da branch `docs-repo-vs-outline` passou pelo
  empacote e pelos dois `smoke` e teve o job `npm` **recusado**: *"Branch "docs-repo-vs-outline" is not
  allowed to deploy to npm due to environment protection rules"*;
- a tag de ensaio (`v0.0.0-probe.1`) **não chegou** ao `publish`: parou antes, na conferência *"a tag não
  bate com a versão do pacote (0.6.0)"* — e chegar lá exige uma tag igual a uma versão nova, ou seja,
  uma release de verdade. O `Review pending` fica para ser observado na próxima release. Tag apagada.

**Falta, e é do dono da conta:** revogar o scope `delete_repo` do token do `gh` (GitHub → Settings →
Applications → Authorized OAuth Apps → GitHub CLI → Revoke, e `gh auth login -h github.com -s
repo,workflow,read:org,gist`). O aceite `gh api -X DELETE repos/:owner/:repo` → `403` só se roda
**depois**, e o guarda da T18 o recusa numa sessão de agente de qualquer jeito.

---

### T4: A política de permissão do agente vira arquivo do repositório, com teste · [#59](https://github.com/vinihcrosa/lumem-os/issues/59)

**Classe:** permissão · **Previne:** que o guardrail seja propriedade de **uma máquina**. Hoje toda a
política mora em `~/.claude/settings.json` — 101 `allow` e **zero `deny`** —, fora do git: um clone
novo, outra máquina, outro agente ou um runner começam sem nada. E cobre os alvos #6 e #7 da
auditoria: `~/.aws/credentials` legível e `~/.lumem` (o estado de **produção** do produto na máquina
do usuário) gravável, num repositório cuja suíte já escreveu ali uma vez.

**What**:
1. Criar `.claude/settings.json` versionado, com `deny` explícito. A lista mínima, cada linha com o
   motivo em comentário no PR (o JSON não tem comentário):
   - `Bash(npm publish:*)`, `Bash(npm unpublish:*)`, `Bash(npm dist-tag:*)` — publicação é a T12/T3, por workflow;
   - `Bash(git push --force:*)`, `Bash(git push -f:*)`, `Bash(git push --tags:*)` — reescrever `main` e disparar release;
   - `Bash(gh repo delete:*)`, `Bash(gh api -X DELETE:*)`, `Bash(gh api --method DELETE:*)` — apagar recurso do host;
   - `Bash(gh pr merge:*)` — mesclar é decisão humana enquanto N3 não existir;
   - `Read(~/.npmrc)`, `Read(~/.aws/**)`, `Read(~/.ssh/**)`, `Read(~/.config/gh/**)` — credencial;
   - `Write(~/.lumem/**)`, `Bash(rm -rf ~/.lumem:*)` — o estado de produção do produto;
   - `Write(~/.claude/**)` — a política não se edita a si mesma.
2. Conferir a sintaxe **por comportamento**: para cada padrão, rodar a forma inofensiva do comando
   (`npm publish --dry-run`, `gh api -X DELETE repos/vinihcrosa/nao-existe`, `cat ~/.npmrc`) e observar
   a recusa do harness. Padrão que não recusa está escrito errado, e acreditar na sintaxe é o defeito
   que esta task existe para não repetir.
3. Criar `scripts/agent-policy.test.ts`: lê `.claude/settings.json`, e exige que cada padrão da lista
   acima esteja presente. Um `deny` que desaparecer num refactor derruba a suíte nomeando o padrão.
4. Documentar no `AGENTS.md` da T8 que a política do repositório é a fonte, e que `~/.claude` é
   preferência de máquina — não guardrail.

**Where**: `.claude/settings.json` (novo), `scripts/agent-policy.test.ts` (novo), `AGENTS.md`.

**Done when**:
- os 15 padrões estão no arquivo e **cada um** foi observado recusando a forma inofensiva do comando;
- apagar uma linha do `deny` deixa `pnpm test` vermelho, com o nome do padrão na mensagem;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `.claude/settings.json` com **37** regras de `deny`, os motivos em
`scripts/harness/policy.ts`, e `scripts/agent-policy.test.ts` amarrando os dois (provado vermelho tirando
uma linha). O aceite por comportamento: um Claude Haiku em `bypassPermissions`, numa bancada em
`/tmp/lumem-t4`, tentou a forma inofensiva de **15** ações e teve as **15** recusadas; o controle
(`git log`) passou; nenhum arquivo nem commit ficou para trás (US$ 0,10).

> **SPEC_DEVIATION — três, todas medidas ou lidas na documentação do Claude Code de 2026-09-28:**
> - **`Write(~/.lumem/**)` virou `Edit(~/.lumem/**)`.** O Claude Code **aceita uma regra `Write(...)` de
>   caminho e nunca a consulta**; `Edit(...)` é a que cobre Write, Edit e NotebookEdit. Escrita como
>   estava, a linha nasceria sem efeito, e o teste passa a recusar `Write(`/`MultiEdit(`/`NotebookEdit(`.
> - **`Write(~/.claude/**)` virou três regras estreitas** (`settings.json`, `settings.local.json`,
>   `hooks/**`): o `~/.claude/projects/*/memory/` é a memória do agente, e a regra larga a proibiria.
> - **Entraram** `git commit --no-verify`/`-n`, `git push --no-verify` e `Edit(~/.config/husky/**)` —
>   as portas de fuga da [Q9](open-questions.md) —, e cada comando de Bash tem as duas formas
>   (`Bash(x)` e `Bash(x *)`), porque o prefixo com espaço não casa o comando sem argumento.
> - O passo 4 escreve no `CLAUDE.md`, e não num `AGENTS.md` (repositório só Claude, [Q11](open-questions.md)).

---

### T5: O runtime é pinado, e o setup recusa outro · [#60](https://github.com/vinihcrosa/lumem-os/issues/60)

**Classe:** ambiente · **Previne:** a falha já registrada no próprio `.lumem/project.toml` — *"o Node
default desta máquina (v26) quebra o jsdom, enquanto o do terminal (v22) passa. O comando está certo;
a versão de Node é que não estava."* O `setup.sh` hoje exige `>= 22`, o que aceita 26 e aceita a
falha. Um agente que rodar o gate pela aba `Testes` recebe vermelho por ambiente e vai depurar código.

**What**:
1. `.nvmrc` com a versão exata em uso: `22.17.1`.
2. `mise.toml` com `[tools] node = "22.17.1"` — os dois arquivos porque os dois gerenciadores
   convivem nas máquinas deste projeto.
3. `scripts/node-version.ts`: função pura que compara `process.versions.node` com o conteúdo do
   `.nvmrc` e devolve `ok | major-diferente | menor`, mais a mensagem. Com teste em
   `scripts/node-version.test.ts` cobrindo os três casos, incluindo `26.0.0` contra `22.17.1`.
4. `scripts/workspace/setup.sh` passa a chamar essa checagem no lugar do `-lt 22`, e a mensagem de
   recusa nomeia **a versão esperada, a encontrada e o comando de saída** (`nvm use` / `mise install`).
5. Manter `engines.node: ">=22"` no `package.json` — ele é contrato de *instalação* do pacote
   publicado, e não do desenvolvimento; apertá-lo recusaria usuário legítimo.

**Where**: `.nvmrc`, `mise.toml`, `scripts/node-version.ts` + teste, `scripts/workspace/setup.sh`,
`docs/project/workspaces.md`.

**Done when**:
- `./scripts/workspace/setup.sh` sob Node 26 falha com a mensagem nomeando `22.17.1`, `26.x` e o
  comando de saída — conferido rodando de verdade sob 26, não simulado;
- sob 22.17.1 passa, e continua em ~2s;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `.nvmrc` e `mise.toml` em `22.17.1`; `scripts/node-version.ts`
recusa **major** diferente e deixa passar patch/minor com aviso; o `setup.sh` o chama e o `env.sh` põe o
nvm no `.nvmrc` antes do `default`. Medido de verdade: sob o **Node 26.4.0** do Homebrew (sem nvm), o
`setup.sh` sai **1** com *"pinado no node 22.17.1 (.nvmrc) e encontrei 26.4.0 … Saída: `nvm use` … ou
`mise install`"*; sob o 22.17.1 sai 0 em **3 s**.

> **SPEC_DEVIATION.** Além do que a task pedia, os três workflows trocaram `node-version: 22` por
> `node-version-file: .nvmrc` — o CI rodava o 22 mais recente, que não é o pino —, e o teste recusa
> um número de versão escrito à mão num workflow. Só o major recusa: `22.18` contra `22.17.1` avisa e
> segue, porque recusar patch compraria atrito sem nenhum defeito medido.

---

### T6: O frescor da documentação vira teste, e o gate ganha a categoria `docs` · [#61](https://github.com/vinihcrosa/lumem-os/issues/61)

**Classe:** sensor computacional · **Previne:** exatamente o que foi medido — **4 links relativos
quebrados** em 1199 e **20 caminhos de código citados em backtick que não existem** em 242. Um agente
lê `docs/features/008-onboarding/tasks.md`, vai abrir `packages/server/src/setup/probe.ts`, não encontra, e
gasta contexto decidindo se o arquivo foi renomeado ou se ele entendeu errado.

**A armadilha desta task é o gate, não o teste.** `FULL_SUITE_GLOBS` do `gate-quick.ts` exclui `*.md`
e `docs/**` de propósito (armadilha nº 2 do arquivo: `passWithNoTests: false` sozinho deixa todo
commit de documentação vermelho). Consequência: um commit **só de documentação** decide `run: "none"`
— e o teste de frescor nunca roda no único commit que poderia tê-lo quebrado. Criar o teste sem tocar
o gate é criar um sensor que dorme.

**What**:
1. `scripts/docs-freshness.test.ts`, com três asserções:
   - todo link relativo em `docs/**/*.md`, `CLAUDE.md`, `AGENTS.md` e `README*.md` resolve para
     arquivo existente (ignorando a âncora `#`);
   - todo caminho em backtick que comece por `packages/`, `scripts/`, `e2e/` ou `docs/` e termine em
     extensão de arquivo existe no disco;
   - nenhuma linha do índice `docs/README.md` aparece duas vezes apontando para o mesmo arquivo.
   A mensagem de falha lista **arquivo de origem → alvo faltando**, uma por linha, porque é isso que
   o agente precisa para consertar sem procurar.
2. Exceção nomeada: `docs/references/**` fica **fora** da checagem de caminho de código. Aqueles
   arquivos descrevem o código de *outros produtos* (Superset, compozy) — são 30 ocorrências que
   parecem defeito e não são. A exceção vive num array com o motivo em comentário, não numa condição
   solta.
3. Convenção que a T7 vai usar, declarada aqui: **caminho histórico não leva backtick.** Quando uma
   task entregue cita arquivo que a feature seguinte renomeou, o texto passa a escrever o nome sem
   backtick (ou com o nome atual entre parênteses). O backtick é o que o sensor lê — e é o que
   promete "isto existe agora".
4. `scripts/gate-quick.ts` ganha `DOCS_GLOBS = ["*.md", "docs/**"]` como **categoria própria**,
   checada depois de `GRAPH_GLOBS` e de `E2E_GLOBS`: se só documentação mudou, `decide` devolve
   `run: "docs"` e o comando roda **só** `vitest run --project scripts docs-freshness`. A mensagem
   segue o padrão da categoria `e2e`, dizendo o que rodou e o que não rodou.
5. `scripts/gate-quick.test.ts` ganha os casos: doc-only → `docs`; doc + fonte → `changed`
   (documentação não pode encolher a seleção de código); doc + lockfile → `all`.

**Where**: `scripts/docs-freshness.test.ts` (novo), `scripts/gate-quick.ts`, `scripts/gate-quick.test.ts`,
`docs/project/testing.md` (a matriz ganha a linha, e as armadilhas ganham a explicação da categoria).

**Done when**:
- o teste, rodado antes da T7, **falha listando os 24 itens conhecidos** (4 links + 20 caminhos) — se
  ele passar de primeira, ele está errado;
- `git commit` de um `.md` qualquer seguido de `pnpm gate:quick` roda o teste de frescor e **diz** que
  rodou, em segundos;
- um link quebrado introduzido à mão reprova nomeando os dois arquivos;
- `pnpm gate:quick` verde depois da T7.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28, **dentro do `check-docs`** e não num `docs-freshness.test.ts` à
parte: é o mesmo sensor de documentação, e dois fariam o agente procurar em dois lugares. Duas checagens
novas — `stale-code-path` e `duplicate-index-row` (por tabela, porque o mesmo ADR é linkado de novo na
tabela da feature que o produziu) — e o `gate:quick` roda o `docs:check` sempre que uma doc mudou, e diz.

> **SPEC_DEVIATION — três exclusões que a task não previa:** `docs/adr/` (ADR nunca se edita, então um
> caminho nele é um fato do dia dele), `docs/references/` (como previsto) e **feature que não está
> `completa`** — um plano cita os arquivos que vai criar, e esta própria `024` citava `stop.ts` e
> `pr-class.ts` antes de existirem. E a medição do dia: não 24 itens, mas **198 ocorrências em 50
> arquivos** — a `032` moveu 113 arquivos para `features/<domínio>/`.

---

### T7: Os 24 itens que o T6 acusa · [#62](https://github.com/vinihcrosa/lumem-os/issues/62)

**Classe:** — (conserto) · **Previne:** que o sensor da T6 nasça vermelho e seja desligado por
incômodo, que é como gate morre.

**What**:
1. Os 4 links: ~~dois `../003-worktree-tabs/prd.md`~~ — **feitos em 2026-09-07 pela
   [025-docs-contract](../025-docs-contract/prd.md)**, que também trouxe o link-checker do `gate:full`,
   então esta metade não volta. **Sobram os dois de `docs/references/compozy.md`**, que citam arquivos
   de outro repositório: viram texto sem link.
2. Os 20 caminhos: para cada um, decidir entre **atualizar** para o nome atual (quando o arquivo só
   mudou de nome, como `probe.ts` e `fake-agent.ts`) ou **remover o backtick** pela convenção da T6
   (quando o arquivo deixou de existir, como `TerminalSpike.tsx` e `ProjectList.tsx`, que eram
   andaimes de fase). Nenhum caminho fica com backtick e sem arquivo.
3. A linha duplicada: `task-cycle-evidence.md` aparecia **duas vezes** na tabela de `project/` em
   `docs/README.md`. **Já consertada** em 2026-09-07, ao indexar esta feature — ficou a segunda, que é
   a descrição mais completa. Sobrou para a task apenas conferir que o teste da T6 acusa a classe
   (linha repetida apontando para o mesmo arquivo) e não só este caso.
4. Indexar no `docs/README.md` os arquivos que esta feature criou — `project/harness-audit.md` e a
   pasta `features/024-dev-harness/`. **Já feito** em 2026-09-07, junto da criação deles, porque a regra do
   repositório é "arquivo novo entra no índice na mesma hora".

**Where**: os arquivos que o T6 listar, `docs/README.md`.

**Done when**: `pnpm test scripts/docs-freshness` verde, e o diff não muda **nenhuma** afirmação
técnica de task entregue — só caminho e link. Registro histórico não se reescreve para agradar sensor.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. As **198** ocorrências que a T6 acusou, em 50 arquivos: **106**
apontam agora para onde o arquivo mora, pela **cadeia de renomeações do git** (`git log --diff-filter=R`)
e não pelo nome — o atalho pelo nome do arquivo foi tentado primeiro e errou, mandando
`packages/server/src/setup/probe.ts` para `scripts/q39/probe.ts`, que é outro arquivo com o mesmo nome;
**92** são históricas (protótipos que saíram para o `lumem-os-design`, arquivos apagados) e perderam a
crase, pela convenção da T6. E a linha duplicada do índice era outra, não a de 2026-09-07: o ADR *"agente
é sempre ACP"* aparecia duas vezes na tabela de ADRs, uma fora da ordem.

---

### T8: `AGENTS.md` na raiz, e o `CLAUDE.md` encolhe · [#63](https://github.com/vinihcrosa/lumem-os/issues/63)

**Classe:** guide inferencial · **Previne:** duas coisas. Primeira: o repositório de um produto que
**suporta Codex** (`ADAPTERS`, `codex-acp`, a [second-agent](../021-second-agent/prd.md) inteira) é legível
só para Claude — qualquer outro agente entra sem mapa. Segunda: das 203 linhas do `CLAUDE.md`, ~120 são
narrativa de feature entregue — registro histórico competindo com contexto ativo em todo turno de todo
agente, e apodrecendo a cada feature nova.

**What**:
1. `AGENTS.md` na raiz, neutro, com seis seções e nada mais: o que é o projeto (3 linhas), a
   hierarquia, os comandos e o que cada gate garante, a regra de design, a regra de documentação, as
   convenções, e os ponteiros para `docs/README.md`.
2. `docs/project/history.md`: a narrativa por feature sai do `CLAUDE.md` para cá, **sem reescrita** —
   é registro, e o valor dele é ser o que foi escrito na época.
3. `CLAUDE.md` passa a apontar para o `AGENTS.md` e guarda só o que é específico de Claude Code: as
   skills, os subagentes (`lumem-dev`, `lumem-reviewer`), e a cláusula que sobrepõe skill de terceiro
   na regra de documentação — que hoje existe porque `tlc-spec-driven` manda escrever doc em outro
   lugar.
4. A exceção da raiz na regra de documentação (`README.md` e `CLAUDE.md`) passa a incluir
   `AGENTS.md`, e o `docs/README.md` indexa o `history.md`.

**Where**: `AGENTS.md` (novo), `CLAUDE.md`, `docs/project/history.md` (novo), `docs/README.md`.

> **Nota — 2026-09-28.** O passo 2 foi feito por outro caminho: a
> [PR #92](https://github.com/vinihcrosa/lumem-os/pull/92) moveu a narrativa para o **Outline**, e não
> para `docs/project/history.md` — o [ADR de 2026-09-28](../../adr/2026-09-28-1726-outline-discusses-the-repo-decides.md)
> põe crônica fora do repositório. O `CLAUDE.md` caiu de 9 792 para 2 435 palavras (227 linhas). O que
> sobra de pé nesta task: o `AGENTS.md` (passo 1), o `CLAUDE.md` só com o que é de Claude Code
> (passo 3) e a exceção da raiz (passo 4). O teto de **100 linhas** do *Done when* continua valendo, e
> a [T20](#t20-as-três-skills-de-documentação-e-a-auditoria-das-de-terceiro) é o que o alcança — o
> formato de cada documento sai do `CLAUDE.md` para as skills.
>
> **E o passo 1 perdeu o motivo.** O `Previne` desta task é *"qualquer outro agente entra sem mapa"*, e
> este repositório é desenvolvido **só com Claude** ([Q11](open-questions.md), 2026-09-28). O que fica
> de pé é o `CLAUDE.md` abaixo de 100 linhas; se o `AGENTS.md` ainda nasce — por exemplo, para quem
> clonar o repositório público com outra ferramenta — é decisão da hora em que esta task começar, e
> não pressuposto.

**Done when**:
- `wc -l CLAUDE.md` abaixo de **100**;
- `AGENTS.md` cobre as seis seções, e um agente sem contexto consegue rodar `setup` → `dev` → os três
  gates lendo só ele;
- nenhuma regra perdida: as quatro do `CLAUDE.md` de hoje (design, documentação, convenções, gate
  antes de dizer pronto) aparecem no `AGENTS.md` com o mesmo peso;
- o teste da T6 verde (os links novos resolvem).

**Gate**: `pnpm gate:quick`
**Status**: ⬜ não iniciada

---

### T17: Hooks de git versionados, ligados pelo setup

**Classe:** sensor computacional · **Previne:** que o primeiro sinal de um commit ruim seja o CI, 4 min
e um push depois — e que um agente commite em `main`. A auditoria mediu a ausência (`core.hooksPath`
indefinido, só `.sample`) e nenhuma task da v0.1 a tratava.
**Trava:** [Q9](open-questions.md) (a ferramenta) e [Q10](open-questions.md) (o que roda em cada um).

**What** — a ferramenta é o **husky v9** ([Q9](open-questions.md)), e o conteúdo de cada hook é o
da [Q10](open-questions.md):
1. `husky` como dependência de desenvolvimento da raiz, com `"prepare": "husky"`. `.husky/pre-commit`,
   `.husky/commit-msg`, `.husky/pre-push`, cada um **uma linha** que chama
   `scripts/harness/git-hook.ts <nome>` — a lógica mora em TypeScript, com teste, e não em shell.
2. `pre-commit`: recusa commit com `HEAD` em `main`; roda `docs:check` se há `.md` em stage e
   `design:derive --check` se há `tokens.css` em stage. Medidos em 0,4 s e 0,3 s; a mensagem diz o
   que rodou.
3. `commit-msg`: Conventional Commits (`tipo(escopo)?: assunto`), assunto até 72 caracteres. A
   recusa mostra a mensagem recebida e um exemplo.
4. `pre-push`: `pnpm gate:quick`. Vermelho recusa o push com o resumo do gate. Verde grava o
   **carimbo** — o hash da árvore (`git write-tree` do `HEAD`) em `.git/lumem-gate-green` —, e um
   push de árvore já carimbada sai dizendo *"já verde em <hash>"* sem rodar. O `Stop` da
   [T19](#t19-o-stop-cobra-o-gate-antes-de-pronto) usa o mesmo carimbo. O `typecheck` **não** entra
   no `pre-commit`: são ~23 s frio, e ele já vem dentro do `gate:quick`.
5. Quem liga é o `prepare` do `pnpm install`, que o `setup.sh` já roda. O `run.sh` avisa se
   encontrar o `core.hooksPath` diferente de `.husky/_` — o caso da worktree que nunca rodou install —,
   e o `ci.yml` ganha `HUSKY: 0`.
6. `scripts/harness/git-hook.test.ts`: cada decisão como função pura (arquivos em stage e mensagem →
   veredito), mais um teste que confere que os três arquivos de `.husky/` existem e chamam o nome
   certo, e que o `prepare` está no `package.json`.
7. `docs/project/testing.md` ganha a linha: **hook de git é feedback, não portão** — quem garante é o
   ruleset da T2 e o CI; quem impede o agente de atravessar com `--no-verify` é a T18.

**Where**: `.husky/` (novo), `package.json`, `pnpm-lock.yaml`, `scripts/harness/git-hook.ts` (+ teste, novos),
`scripts/workspace/run.sh`, `.github/workflows/ci.yml`, `docs/project/testing.md`, `docs/project/workspaces.md`.

**Done when**:
- numa worktree nova, depois do `pnpm install`, `git commit -m "wip"` é **recusado** pelo `commit-msg`, e
  um commit em `main` é recusado pelo `pre-commit` — os dois observados;
- `git push` com um teste quebrado de propósito é recusado pelo `pre-push`, nomeando o teste;
- o `pre-commit` de um commit só de código roda em menos de **1 s**, medido;
- um segundo `git push` da mesma árvore sai pelo carimbo, sem rodar o gate;
- os checkpoints do Conductor continuam sendo criados com os hooks ligados — conferido
  observando um checkpoint novo em `refs/conductor-checkpoints` depois de um turno;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `husky@9.1.7` na raiz com `"prepare": "husky"`; `.husky/pre-commit`,
`commit-msg` e `pre-push` de uma linha cada; `scripts/harness/git-hook.ts` com **32** testes; `HUSKY: 0`
nos três workflows; o `run.sh` avisa quando a worktree está sem os hooks. Aceites observados:
- `git commit -m "wip"` **recusado** pelo `commit-msg`, com a mensagem e um exemplo;
- num clone descartável em `main`, um commit **recusado** pelo `pre-commit`;
- um `pre-commit` de commit só de código em **0 s**;
- o `git push` desta branch rodou o `gate:quick` **desde a ponta do remoto** — 4 642 testes verdes em
  83 s — e gravou o carimbo; o mesmo push da mesma árvore saiu em **0 s** com *"esta árvore já passou"*.

**O defeito caro:** o primeiro push de verdade herdou o `GIT_DIR` do hook para a suíte, 718 testes
escreveram no repositório, e a config compartilhada ganhou `core.bare = true` — todas as 17 worktrees
pararam — e uma seção `[user]` de teste. Consertado à mão, conferido por `diff`, e o hook passou a
limpar o ambiente; a armadilha está no [`testing.md`](../../project/testing.md).

**Não observado:** o checkpoint do Conductor depois de um turno com os hooks ligados — este trabalho
roda num turno só. A inferência é forte: os checkpoints vivem em `refs/conductor-checkpoints`, fora do
`HEAD`, e `git commit` só grava no `HEAD`, então eles saem por plumbing (`commit-tree` + `update-ref`),
que não dispara hook.

---

### T18: O guarda, no `PreToolUse` do Claude

**Classe:** permissão · **Previne:** que um padrão de prefixo deixe passar a mesma ação escrita de
outro jeito (`git push origin +main` é um push forçado que `Bash(git push --force:*)` não casa), e que
a política dependa de um arquivo que casa texto. O `deny` da T4 fica como **piso**
([Q11](open-questions.md)).
**Trava:** [Q11](open-questions.md), e a [T0](#t0-o-que-cada-agente-carrega-do-repositório-medido) —
o alcance é o que ela medir.

**What**:
1. `scripts/harness/guard.ts`: lê o JSON de `PreToolUse` do Claude da entrada padrão
   (`tool_name`/`tool_input`), decide, e sai `2` com a frase no `stderr` quando recusa. Decisão como
   **função pura** — comando → veredito com motivo —, separada da leitura. Entrada que não parseia é
   **recusa**, não liberação ([Q11](open-questions.md)).
2. O que ele recusa, com o motivo de cada um: a lista da [T4](#t4-a-política-de-permissão-do-agente-vira-arquivo-do-repositório-com-teste--59),
   mais `git commit --no-verify` e `git push --no-verify` (é o que faz a T17 valer para agente),
   `HUSKY=0` em qualquer comando e escrita em `~/.config/husky/` — as duas portas de fuga que o
   husky acrescenta ([Q9](open-questions.md)) —,
   push direto para `main`, push forçado em **qualquer** forma (`--force`, `-f`, `+refspec`,
   `--force-with-lease` para `main`), `git reset --hard` com mudança não commitada, e escrita fora do
   checkout.
3. Ligar em `hooks.PreToolUse` do `.claude/settings.json`. A [T0](#t0-o-que-cada-agente-carrega-do-repositório-medido)
   mediu que o `claude-agent-acp` da esteira lê o mesmo arquivo: uma tomada serve às duas superfícies.
4. `scripts/harness/guard.test.ts`: uma tabela de casos com a **entrada crua do Claude**, cada forma
   alternativa de cada ação (`--force`, `-f`, `+refspec`, variável na frente, `git -C`). E o teste da
   T4 passa a exigir que o piso do `deny` seja **subconjunto** do que o guarda recusa.
5. `CLAUDE.md`: o que o guarda recusa, e que recusa é o comportamento — não um erro para contornar.

**Where**: `scripts/harness/guard.ts` (+ teste, novos), `.claude/settings.json`,
`scripts/agent-policy.test.ts`, `CLAUDE.md`.

**Done when**:
- cada ação da lista, tentada pelo Claude na forma inofensiva — interativo, e pela esteira até onde a
  T0 alcançar —, é recusada com a frase do guarda; observado, não lido;
- apagar a tomada, ou tirar do guarda um padrão que o `deny` tem, deixa `pnpm test` vermelho;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `scripts/harness/guard.ts`, ligado no `PreToolUse` do
`.claude/settings.json` para `Bash|Write|Edit|MultiEdit|NotebookEdit`, rodado por
`node --experimental-strip-types` — **84 ms** por chamada contra **576 ms** do `tsx`, medidos na mesma
máquina, e é por isso que ele não importa nada além de `node:`. `guard.test.ts` tem **119** casos: cada
grafia de cada ação, o piso do `deny` como subconjunto (uma linha por regra), o parser, e o processo do
hook (sai 2 com a frase, sai 0, e **recusa** uma entrada que não é JSON). O aceite por comportamento:
um Claude Haiku em `bypassPermissions`, numa bancada em `/tmp/lumem-t18`, tentou **7** grafias que o piso
não pega — `+main`, `HUSKY=0`, `git -C . push -f`, `bash -c "npm publish"`, `HEAD:main`, escrita fora do
checkout, `core.hooksPath` — e teve as **7** recusadas com a frase do guarda; os dois controles passaram
(US$ 0,06).

Dois defeitos, os dois achados antes de alguém depender dele:
- o teste achou que `pnpm --filter <pacote> publish` passava — a regra olhava só a primeira palavra;
- **o próprio guarda recusou o autor dele**, no primeiro comando depois de ligado: um `python3 - <<'PY'`
  com crase no corpo foi lido como substituição de comando. Heredoc com delimitador entre aspas é texto
  literal; o parser passou a entendê-lo (e a ler como script o heredoc que alimenta um shell), e
  `2>&1`/`&>` deixaram de ser lidos como segundo plano.

---

### T19: O `Stop` cobra o gate antes de *"pronto"*

**Classe:** sensor computacional · **Previne:** a regra *"antes de dizer que uma task está pronta,
rode o gate que ela declara"* depender de o agente lembrar dela.
**Trava:** [Q12](open-questions.md), e a [T0](#t0-o-que-cada-agente-carrega-do-repositório-medido).

**What** — a resposta da [Q12](open-questions.md): bloqueante, uma vez por turno.
0. **Medir antes:** a **mediana** do `gate:quick` em turnos reais que mexeram em código, não só o
   pior caso (84 s). É o número que diz quanto o bloqueio custa na prática, e fica no `testing.md`.
1. `scripts/harness/stop.ts`: se a árvore mudou desde o último `gate:quick` verde (o carimbo da
   [T17](#t17-hooks-de-git-versionados-ligados-pelo-setup), em `.git/lumem-gate-green`, agora com o
   hash da árvore de trabalho), roda o `gate:quick`; vermelho devolve
   `{"decision":"block","reason":…}` com o resumo, verde grava o carimbo.
2. **Uma vez por turno**: com `stop_hook_active`, sai sem rodar.
3. **Fora da esteira**: com a variável que o daemon põe nas sessões da esteira, sai sem rodar — o
   portão da [`028`](../028-autonomous-orchestration/prd.md) já julga lá.
4. Ligar no `Stop` do `.claude/settings.json`, com `timeout` explícito acima do pior caso medido.
5. A frase do bloqueio diz o que falhou **e** que parar de novo é permitido: *"se o vermelho é
   esperado (RED do TDD, pergunta pendente), diga isso e pare"* — é o que impede o hook de brigar com
   o ciclo do `lumem-dev`.

**Where**: `scripts/harness/stop.ts` (+ teste, novos), `.claude/settings.json`.

**Done when**:
- uma sessão que quebra um teste e tenta encerrar recebe o bloqueio com o nome do teste, **uma vez** —
  a segunda parada passa;
- a mediana do passo 0 está registrada no `testing.md`;
- uma sessão que não mexeu em nada encerra sem rodar gate nenhum;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ⬜ não iniciada

---

### T20: As três skills de documentação, e a auditoria das de terceiro

**Classe:** guide inferencial · **Previne:** duas coisas. O formato de cada documento competindo com
contexto ativo em todo turno, dentro do `CLAUDE.md`; e skill de terceiro no repositório mandando o
contrário da regra — a auditoria achou uma (D3), e hoje são cinco em `.claude/skills/`.
**Trava:** [Q14](open-questions.md), a [T0](#t0-o-que-cada-agente-carrega-do-repositório-medido) e a
[T8](#t8-agentsmd-na-raiz-e-o-claudemd-encolhe--63) (o `CLAUDE.md` encolhe junto).

**What**:
1. `lumem-adr` — os três testes, o frontmatter, `supersedes`, reafirmar o que fica, o estudo em
   `docs/project/` que o sustenta. Primeiro passo: listar `docs/adr/` e ler o frontmatter.
2. `lumem-feature` — **o fluxo de feature**, derivado da `tlc-spec-lean` pelo [ADR de 2026-09-28](../../adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md)
   ([Q15](open-questions.md)): plano no `prd.md`, perguntas no `open-questions.md`, obrigações com
   prova no `checks.md`, construção a partir dos checks, e o `verification.md` escrito por um
   `lumem-reviewer` novo. Mais o que é daqui: numeração `NNN`, a gramática do `Status:`, a nota no
   requisito contradito, e ao fechar a feature a linha no §Estado atual e o parágrafo no History do
   Outline. Os validadores dela, em Python, viram TypeScript em `scripts/`. A licença da original é
   CC-BY-4.0: o `SKILL.md` credita a origem.
3. `lumem-outline` — discovery, postmortem, runbook, a entrada no Work log: a coleção certa, a regra
   do segredo, *linka, não copia*, e o fechamento discovery → ADR.
4. O `CLAUDE.md` fica com a tabela de **onde cada coisa mora** e as sete
   regras; o formato sai para as skills.
5. As skills de terceiro, pela resposta da [Q14](open-questions.md): `evolutionary-modular-architecture`
   e `tlc-spec-lean` **saem** (a segunda depois de a `lumem-feature` existir); `playwright-skill`,
   `react-best-practices` e `react-composition-patterns` **ficam**, e o `CLAUDE.md` diz que a parte de
   Next.js da `react-best-practices` não se aplica.
6. **A descrição que some.** A [T0](#t0-o-que-cada-agente-carrega-do-repositório-medido) viu a skill do
   projeto aparecer **sem descrição** no Claude Code desta máquina — e skill sem descrição não
   dispara sozinha. Medir a causa (a hipótese é o orçamento da lista, com dezenas de skills globais
   de plugin) antes de escrever as três, e registrar no `testing.md` o que a skill precisa para
   disparar.
7. Um teste em `scripts/` exige que cada `lumem-*` tenha `name` e `description`, e que toda regra que
   uma skill cita (`check-docs`, `Status:`) exista no código que ela cita.

**Where**: `.claude/skills/lumem-adr/`, `.claude/skills/lumem-feature/`,
`.claude/skills/lumem-outline/` (novos), `.claude/skills/tlc-spec-lean/` e
`.claude/skills/evolutionary-modular-architecture/` (saem), `CLAUDE.md`, `scripts/`.

**Done when**:
- um agente sem histórico, pedido *"escreve um ADR sobre X"*, carrega a `lumem-adr` sozinho e produz
  um arquivo que o `docs:check` aceita — observado;
- `wc -l CLAUDE.md` abaixo de **100**, junto com a T8;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ⬜ não iniciada

---

### T21: O contrato conhece o `checks.md`

**Classe:** sensor computacional · **Previne:** que o fluxo novo do [ADR de 2026-09-28](../../adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md) exista
só na skill: sem isto, o `check-docs` acusaria toda feature nova de `Status:` errado (ela não tem
`tasks.md`), o `lumem-dev` procuraria task que não existe, e o `lumem-reviewer` não saberia que o
`verification.md` é dele.
**Trava:** [Q15](open-questions.md).

**What**:
1. `scripts/check-docs.ts`: proposta ⇔ **nem `tasks.md` nem `checks.md`**; o `Status:` é comparado com
   o arquivo que existir; os casos novos no `check-docs.test.ts`, cada um provado ficando vermelho.
2. Os validadores do fluxo — plano, checks e verificação —, portados da `tlc-spec-lean` para
   TypeScript em `scripts/`, com o teste que injeta defeito em cada regra e exige que ele morra (o
   `selftest.py` dela).
3. `.claude/agents/lumem-dev.md`: executa **fatias do `checks.md`**, escreve o teste a partir do check
   e nunca da implementação, e continua executando `tasks.md` nas features antigas.
4. `.claude/agents/lumem-reviewer.md`: é o **verificador** — disparado novo, depois do último commit
   da feature, sobre `<base>..HEAD`, com todos os checks —, e escreve o `verification.md`.
5. `CLAUDE.md`: a regra 5 ganha a nota no requisito contradito — *"PRD proposta ⇔ não tem
   `tasks.md`"* passa a valer para `tasks.md` **ou** `checks.md`.

**Where**: `scripts/check-docs.ts` (+ teste), `scripts/` (validadores novos), `.claude/agents/lumem-dev.md`,
`.claude/agents/lumem-reviewer.md`, `CLAUDE.md`.

**Done when**:
- uma feature de exemplo com `prd.md` + `checks.md` e `Status: em execução` passa no `check-docs`, e a
  mesma sem `checks.md` reprova;
- cada validador portado fica vermelho contra o defeito que ele existe para pegar;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ⬜ não iniciada

---

## Fase 2 — comportamento e arquitetura

### T9: Lint de correção, bloqueante · [#64](https://github.com/vinihcrosa/lumem-os/issues/64)

**Classe:** sensor computacional · **Previne:** a classe inteira que o `tsc` não vê e que hoje **não
tem sensor nenhum** — promessa não-aguardada (o daemon é cheio de `void` e de `async` disparado),
`catch` vazio, `await` em laço, import não usado, variável sombreada. E previne a deriva de estilo que
o agente **copia do que encontra**: inconsistência existente é dívida composta.
**Trava:** ~~[Q2](open-questions.md)~~ — respondida em 2026-09-28: **`oxlint --type-aware`**.

**What**:
1. ~~**Medir antes de escolher**~~ — **feito em 2026-09-28**, e a tabela está na
   [Q2](open-questions.md): os dois acham os mesmos 2 `no-misused-promises` e 0 `no-floating-promises`;
   o `oxlint --type-aware` em 2,7 s, o `typescript-eslint` em 18,9 s. O passo começa daqui:
   `oxlint` e `oxlint-tsgolint` como dependências de desenvolvimento da raiz, `.oxlintrc.json` com a
   categoria `correctness` mais `typescript/no-floating-promises`, `typescript/no-misused-promises` e
   `typescript/await-thenable`, e os **44 achados** de hoje triados um a um — consertados, ou
   desligados **na linha** com o motivo. Os `eslint-disable` que já existem no código (`react/…`,
   `no-bitwise`) são lidos pelo oxlint: os que não calam nada saem.
2. Configurar **só correção**. Nada de estilo, nada de ordem de import, nada que um formatador
   resolveria — formatador está fora de escopo por decisão do §4 da PRD (reformatar 105k linhas apaga
   o `git blame` de um repositório de 24 dias).
3. `pnpm lint` na raiz, com `--max-warnings 0`: warning que não falha é ruído que se aprende a ignorar.
4. Entrar no `gate:build` (que é o gate que hoje responde "o repositório compila") e no job `checks`
   do CI, **depois** do `typecheck` — erro de tipo primeiro, porque é o mais legível dos dois. Com
   2,7 s medidos, ele cabe também no `pre-push` da [T17](#t17-hooks-de-git-versionados-ligados-pelo-setup).
5. Registrar em `docs/project/testing.md`: o que o lint garante, o que ele **não** garante, e o tempo
   medido.

**Where**: `.oxlintrc.json` (novo), `package.json` e `pnpm-lock.yaml` (raiz),
`.github/workflows/ci.yml`, os arquivos dos 44 achados, `docs/project/testing.md`.

**Done when**:
- `pnpm lint` sai **0** no HEAD;
- uma promessa não-aguardada introduzida à mão em `packages/server/src` **reprova**, e a mensagem diz
  qual arquivo e qual linha;
- `gate:build` continua abaixo de **60s** frio (hoje 22,7s) — número medido e registrado;
- o CI continua abaixo de 6min.

**Gate**: `pnpm gate:build`
**Status**: ✅ entregue em 2026-09-28. `oxlint@1.86` + `oxlint-tsgolint`, `.oxlintrc.json`, `pnpm lint`
com `--max-warnings 0`, dentro do `gate:build` (e portanto do job `checks` do CI) e do `pre-push`. O
`gate:build` inteiro ficou em **21 s**. Um canário com uma promise flutuante reprova nomeando arquivo e
linha.

A triagem não foi de 44 itens, como a medição da Q2 previa, e o motivo é instrutivo: com `--type-aware`
a categoria `correctness` liga **mais** regras com tipo, e o total foi **231**. Destes, **162** eram
`unbound-method` sobre `const { f } = useHook()` — desligado, com o motivo no `testing.md`. Os **69**
restantes, um a um:
- **consertados** — 2 `no-misused-promises` (o `void` ficou explícito, e a rejeição cai no registro de
  erros pelo `unhandledrejection`); 12 `await-thenable` (o `.all()`/`.run()` do drizzle com
  `better-sqlite3` é síncrono); 18 variáveis e imports sem uso; 11 `no-base-to-string` — o `RawData` do
  `ws` é `Buffer | ArrayBuffer | Buffer[]`, e `.toString()` só acerta o primeiro: nasceu
  `server/src/ws-text.ts`; 4 `no-unsafe-optional-chaining` nos testes; 2 `sort()` sem comparador;
  um *spread* inútil e um *fallback* vazio;
- **um defeito real e engraçado:** em `web/src/lib/shiki-codemirror.ts`, um `` `*/` `` dentro do JSDoc
  **fechava o comentário no meio**, e o resto da frase virava uma template literal solta no módulo
  (`no-unused-expressions`). O `queryKeys.test.ts` tinha o mesmo problema contornado com um espaço de
  largura zero (`no-irregular-whitespace`); os dois passaram a escrever `*\/`;
- **exceção na linha, com motivo** — 7 `no-control-regex` (as regex **são** de caractere de controle:
  tiram escape ANSI) e 8 `no-useless-spread` que são **cópia de propósito**, porque o laço pode
  remover da coleção que percorre.

A regra 8 da `032` reprovou no caminho porque dois arquivos **encolheram**, e o mapa foi atualizado —
o sensor funcionando.

---

### T10: Fitness arquitetural como teste · [#65](https://github.com/vinihcrosa/lumem-os/issues/65)

**Classe:** sensor computacional · **Previne:** que a direção de dependência hoje limpa degrade sem
ninguém ver — `shared` não importa ninguém, `server` importa `shared`, `web` importa `shared` e
**só o tipo** do router do `server` (declarado em devDependencies). Nada verifica isso: é uma
propriedade que existe por disciplina. E previne o crescimento silencioso do núcleo:
`AcpManager.ts` tem **2071 linhas** e concentra transporte, sessão e tradução — é o arquivo mais
difícil de testar do repositório, e o que mais cresce.
**Trava:** ~~[Q3](open-questions.md)~~ e ~~[Q4](open-questions.md)~~, respondidas em 2026-09-28: `scripts/package-boundaries.test.ts`, e mapa que sobe só com motivo.

**What**:
1. `scripts/package-boundaries.test.ts` com três asserções — **entre** pacotes; o que é de dentro do
   `web` já está no `packages/web/src/architecture.test.ts` da [`032`](../032-web-architecture/prd.md):
   - **direção:** nenhum `import` de `packages/shared/src` alcança `server`, `web` ou `cli`; nenhum de
     `server` alcança `web` ou `cli`; `web → server` é permitido **só** como `import type` de
     `@lumem/server/router-types`, que é a exceção declarada e a única;
   - **dependência declarada:** todo `@lumem/*` importado por um pacote está nas `dependencies` ou
     `devDependencies` **daquele** pacote. Hoje passa (o `web` declara `@lumem/server` em devDeps), e
     é uma propriedade que quebra calada num monorepo com symlink;
   - **teto:** arquivo de produção fora de `web/src/features/` não passa de **700 linhas** fora do
     mapa; o mapa guarda **`{ linhas, motivo }`**, e um arquivo que cresce além do registrado reprova
     até o mapa subir **com motivo novo** — sem motivo, reprova ([Q4](open-questions.md)). A regra 8 da
     `032` ganha o mesmo campo `motivo`, e as duas mensagens passam a dizer a mesma coisa.
2. A mensagem de falha injeta remediação, não código de regra: *"este import atravessa a fronteira do
   pacote — mova a lógica para `shared/`, ou exponha por `router-types`"*. O critério de qualidade da
   mensagem é o do §D4 da auditoria: um agente tem que saber o que fazer sem abrir o teste.
3. O mapa de exceções nasce da medição de 2026-09-28, com motivo *"linha de base 2026-09-28"*:
   `AcpManager.ts` 2813, `schema.ts` 1709, `GitService.ts` 1099, `FileService.ts` 971,
   `MemoryService.ts` 961, `SessionStore.ts` 951, `routers/worktree.ts` 896, `tasks/conveyor.ts` 784,
   `bootstrap.ts` 781, `repositories/task.ts` 756, `shared/src/acp-protocol.ts` 749,
   `tasks/conveyor-ports.ts` 727. O `conversation-model.ts` (751) já está no mapa da `032`. Os
   números mudam até a task começar — o mapa nasce do `wc -l` do dia, não desta lista.
4. **A task instala o sensor e não refatora nada.** Reduzir o `AcpManager` é trabalho com PRD próprio;
   misturar as duas coisas produz um diff que ninguém revisa.

**Where**: `scripts/package-boundaries.test.ts` (novo), `docs/project/testing.md`, `CLAUDE.md` (a linha *dentro do pacote → no pacote; entre pacotes → `scripts/`*).

**Done when**:
- um `import` de `server` dentro de `packages/shared/src` **reprova**, nomeando os dois arquivos e
  dizendo o que fazer;
- remover `@lumem/server` das devDependencies do `web` **reprova**;
- acrescentar 20 linhas a um arquivo que está no seu teto **reprova**; remover 20 linhas **passa** e o
  mapa pode ser atualizado para baixo;
- subir um número do mapa **sem** `motivo` reprova;
- o mapa tem exatamente os arquivos acima do teto no dia, e o teste passa no HEAD.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `scripts/package-boundaries.test.ts` com as três asserções mais
uma — nenhum import relativo de produção sai do próprio pacote —, e as três provadas vermelhas de
propósito: um `import` de `@lumem/server` dentro do `shared`, o `@lumem/server` tirado das devDependencies
do `web`, e 20 linhas a mais no `bootstrap.ts` (*"cresceu de 780 para 800"*). O mapa nasceu com os
**12** arquivos acima de 700 no dia, cada um com `reason`, e a regra 8 da `032` ganhou o mesmo campo.

Duas coisas que o sensor achou no primeiro dia:
- **o crescimento, e era meu:** as exceções de lint na linha da T9 somaram 5 linhas ao `AcpManager` e 1
  ao `worktree.ts` — o mapa subiu com esse motivo escrito, que é exatamente o mecanismo da Q4;
- **um import que atravessa o pacote em produção:** `cli/src/postinstall.ts` importa
  `scripts/ensure-pty-helper.js` da raiz. Fica, como exceção nomeada: o esbuild o embute no
  `bin/postinstall.mjs`, e nada de fora do pacote é lido na instalação.

---

### T11: O log do daemon fica consultável pelo agente · [#66](https://github.com/vinihcrosa/lumem-os/issues/66)

**Classe:** ambiente · **Previne:** que o agente valide **código** e afirme **comportamento**. Hoje o
logger do Fastify está ligado no daemon e estruturado (`server.ts:220`), e vai **só para stdout**:
zero `createWriteStream`, zero `pino.destination`. Um agente que não subiu o daemon não tem como
perguntar o que ele fez, e um bug de runtime exige uma pessoa lendo o terminal do `pnpm dev`.

**What**:
1. `packages/server/src/config.ts` ganha `logFile`, lido de `LUMEM_LOG_FILE`. Ausente = comportamento
   de hoje (stdout), porque o daemon instalado não deve escrever arquivo que ninguém pediu.
2. `packages/server/src/server.ts` constrói o logger com `pino.destination` quando `logFile` existe,
   e mantém stdout junto — o log não pode **sair** do terminal, ele passa a existir nos dois lugares.
3. **`turbo.json` ganha `LUMEM_LOG_FILE` no `globalPassThroughEnv`.** Sem isso a variável nunca chega
   ao processo, silenciosamente — é a armadilha que o próprio arquivo documenta no topo, e ela já
   mordeu com `LUMEM_STATE_DIR`.
4. `scripts/workspace/run.sh` define `LUMEM_LOG_FILE="$LUMEM_STATE_DIR/daemon.log"` e imprime o
   caminho no bloco de cabeçalho, junto do state dir — informação que não aparece na tela do `run` é
   informação que ninguém acha.
5. Rotação simples: o daemon renomeia para `daemon.log.1` ao passar de 10 MB, guardando um. Sem
   dependência nova.
6. `AGENTS.md` ganha a receita de duas linhas: onde o arquivo está e como filtrar
   (`grep 'trpc procedure failed' ~/.lumem-dev/shared/daemon.log`).

**Where**: `packages/server/src/config.ts` (+ teste), `packages/server/src/server.ts`, `turbo.json`,
`scripts/workspace/run.sh`, `AGENTS.md`, `docs/project/workspaces.md`.

**Done when**:
- depois de um `pnpm dev`, `$LUMEM_STATE_DIR/daemon.log` existe com **uma linha JSON por
  requisição**;
- uma chamada tRPC que falha deixa `trpc procedure failed` no arquivo, com o `path`, e um `grep` acha;
- sem `LUMEM_LOG_FILE`, o daemon **não** cria arquivo (teste de unidade do config);
- o arquivo passa de 10 MB e rotaciona, com o `.1` guardado;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: ✅ entregue em 2026-09-28. `LUMEM_LOG_FILE` no `config.ts` (ausente → `null`, sem arquivo),
`server/src/log-file.ts` escrevendo no arquivo **e** no stdout com rotação para `.1` aos 10 MB, sem
dependência nova; `turbo.json` com a variável no `globalPassThroughEnv`; o `run.sh` a define e imprime.
Observado com um daemon de verdade, isolado em `/tmp/lumem-t11` na porta 47811: o arquivo e o stdout
com as **mesmas 12 linhas** JSON, uma por requisição, e um `workspace.create` com nome vazio deixando
`"msg":"trpc procedure failed"` com `"path":"workspace.create"` — achado pelo `grep`. A rotação está
coberta por teste (teto de 20 bytes), não por um arquivo de 10 MB de verdade. A receita de duas linhas
foi para o `CLAUDE.md`, e não para um `AGENTS.md` ([Q11](open-questions.md)).

---

### T12: Rollback ensaiado e medido · [#67](https://github.com/vinihcrosa/lumem-os/issues/67)

**Classe:** ambiente · **Previne:** que a única recuperação de uma publicação ruim seja outra
publicação. O `release.yml` já registra uma release que falhou em voo — a v0.2.0, com o guarda de
`npm whoami` que media o status do `echo`. Autonomia alta só é responsável quando a reversão é barata
e **conhecida**, e hoje ela é nem uma nem outra.

**What**:
1. `release.yml` ganha um `workflow_dispatch` com input `rollback_to` (versão): quando preenchido, o
   workflow **não** empacota nem publica — roda
   `npm dist-tag add @vinihcrosa/lumem-os@<versão> latest` sob o environment `npm`, ou seja, atrás do
   reviewer da T3.
2. Ensaiar de verdade, **com aval explícito do Vinicius antes de rodar** — isto mexe no registro
   público, e quem instalar na janela recebe a versão anterior: mover `latest` para `0.3.0`, conferir,
   voltar para `0.3.1`, conferir. Medir o tempo das duas metades.
3. Registrar em [harness-audit.md](../../project/harness-audit.md) o tempo medido e o que o usuário vê
   na janela — que é o dado que decide se o rollback é aceitável como controle.

**Where**: `.github/workflows/release.yml`, `docs/project/harness-audit.md`.

**Done when**:
- `npm view @vinihcrosa/lumem-os version` devolve `0.3.0` durante a janela e `0.3.1` depois;
- `lumem upgrade --check` observado relatando cada um dos dois estados — é o efeito de ponta, e o que
  prova que o rollback alcança o usuário e não só o registro;
- o tempo das duas metades está registrado;
- o job de rollback é recusado sem aprovação.

**Gate**: os quatro acima
**Status**: ⬜ não iniciada

---

### T13: Frescor de dependência automatizado · [#68](https://github.com/vinihcrosa/lumem-os/issues/68)

**Classe:** sensor computacional · **Previne:** um pacote **público**, com 3,6 MB de bundle e duas
dependências nativas, sem nenhum sinal de vulnerabilidade — `dependabot_security_updates` está
`disabled` e não existe `dependabot.yml`. É também a segunda das três classes de N3: com a suíte
inteira mais `smoke:install` (3,4s), atualização de dependência é a mudança mais mecanicamente
verificável deste repositório.

**What**:
1. `.github/dependabot.yml` com dois ecossistemas: `npm` na raiz (o pnpm workspace é lido inteiro) e
   `github-actions`. Semanal, `open-pull-requests-limit: 3`, e dois grupos — `dev` e `prod` — para não
   virar enxame de PR.
2. `ignore` de **major** para `better-sqlite3` e `node-pty`, com o motivo no arquivo: são as duas
   dependências nativas, o pacote depende dos prebuilds delas, e um major delas é decisão de release,
   não de bot. Minor e patch entram normalmente.
3. Ligar as correções de segurança:
   `gh api -X PUT repos/:owner/:repo/automated-security-fixes`.
4. `AGENTS.md` ganha a linha: PR de bot é da classe N3 — merge com o CI verde e o `smoke:install`
   verde, sem revisão de linha.

**Where**: `.github/dependabot.yml` (novo), configuração do repositório, `AGENTS.md`.

**Done when**:
- `gh api repos/:owner/:repo --jq .security_and_analysis.dependabot_security_updates.status` devolve
  `enabled`;
- existe **uma PR de bot mergeada** com CI verde — a prova de que a esteira funciona ponta a ponta,
  incluindo o ruleset da T2;
- o número de PRs abertas pelo bot não passa de 3.

**Gate**: `pnpm gate:full` na PR do bot
**Status**: 🟡 **parcial** em 2026-09-28. `.github/dependabot.yml` com `npm` e `github-actions`, semanal,
até 3 PRs, grupos `dev`/`prod`, sem major das duas nativas; alertas de vulnerabilidade e correções
automáticas ligados — `dependabot_security_updates` devolve **`enabled`**. A linha da classe N3 foi para o
`CLAUDE.md`. **Falta, e é do dono:** mesclar a primeira PR do bot com o CI verde — é o aceite que prova a
esteira ponta a ponta com o ruleset da T2, e mesclar é decisão do dono (o guarda recusa `gh pr merge`).

---

### T22: O selo de classe de N3, como rótulo na PR

**Classe:** sensor computacional · **Previne:** que *"esta PR é só de documentação"* seja julgamento de
quem lê o título. As três classes da [A3](open-questions.md) — CSS/token, dependência, documentação —
só existem se uma PR que as **mistura** com outra coisa for reconhecida como *sem classe*.
**Trava:** ~~[Q7](open-questions.md)~~ — respondida em 2026-09-28: rótulo, **sem** merge automático.

**What**:
1. `scripts/pr-class.ts`: recebe a lista de caminhos tocados e devolve a classe, como função pura.
   `packages/web/src/**/*.css` e `packages/web/src/styles/tokens.*` sozinhos → `css-token`;
   `package.json` e `pnpm-lock.yaml` (de qualquer pacote) sozinhos → `dependência`; `docs/**` e
   `*.md` sozinhos → `docs`; qualquer união → `sem classe`.
2. `scripts/pr-class.test.ts`: cada classe, cada mistura, e a PR vazia.
3. Um passo no `ci.yml`, só em `pull_request`, com `permissions: pull-requests: write` **só nele**:
   `git diff --name-only <base>...<head>` → `pr-class` → `gh pr edit --add-label` (e tira o rótulo
   antigo quando a classe muda num push novo).
4. O rótulo é **informação**: nenhuma regra do ruleset o lê, e nada se mescla sozinho por causa dele.

**Where**: `scripts/pr-class.ts` (+ teste, novos), `.github/workflows/ci.yml`, `docs/project/testing.md`.

**Done when**:
- uma PR só de `.md` recebe `N3: docs`; a mesma PR com um `.ts` a mais passa a `sem classe` no push
  seguinte — observado numa PR descartável;
- `pnpm gate:quick` verde.

**Gate**: `pnpm gate:quick`
**Status**: 🟡 entregue em 2026-09-28, **menos a observação numa PR de verdade**. `scripts/pr-class.ts` com
**11** testes (cada classe, cada mistura, a PR vazia, e que só o workflow novo escreve na PR). Um workflow
**próprio**, `.github/workflows/pr-signals.yml`, e não um passo do `ci.yml`: os checks obrigatórios do
ruleset continuam sendo só os dois, e a permissão `pull-requests: write` fica restrita a ele. Os quatro
rótulos são criados pelo próprio workflow (`gh label create --force`). O primeiro rótulo aparece na
primeira PR aberta depois do merge desta — o workflow só roda a partir da `main`.

---

## Fase 3 — entropia e revisão inferencial

### T14: Um número que limite o auto-engano da suíte · [#69](https://github.com/vinihcrosa/lumem-os/issues/69)

**Classe:** sensor computacional · **Previne:** a família de defeito que este repositório **já viu 8
vezes** e documentou em [testing.md](../../project/testing.md): teste verde que prova a coisa errada —
locator escopado numa caixa que a feature esvaziou, `toBeVisible` contra elemento recortado por
ancestral, teste de corte com acervo menor que o corte, índice derivado preenchido pela metade que
passa na própria verificação de frescor. Hoje **nada limita a taxa de escape**: não existe cobertura
nem mutação, e 3151 testes verdes não dizem quantos têm dentes.

**What**:
1. Stryker com runner do vitest, `mutate` limitado a três diretórios de núcleo — os que escrevem no
   disco do usuário e os que decidem: `packages/server/src/memory/**`, `packages/server/src/files/**`,
   `packages/server/src/git/**`.
2. `pnpm gate:mutation` como comando próprio. **Não** entra no `gate:quick` nem no `gate:build`: o
   contrato de segundos do gate rápido é a razão de ele ser rodado, e mutação custa minutos.
3. Workflow semanal (`schedule`) que roda e falha se o score cair abaixo do piso.
4. Registrar o score inicial em `docs/project/testing.md`, com data, e o piso em `baseline - 2`. O
   piso **só sobe**.

**Where**: `stryker.config.json` (novo), `package.json`, `.github/workflows/mutation.yml` (novo),
`docs/project/testing.md`.

**Done when**:
- o score dos três diretórios está medido e registrado, com o tempo de execução;
- enfraquecer uma asserção de um teste desses diretórios **derruba** o score abaixo do piso e o job
  fica vermelho — conferido de verdade, num commit descartável;
- o job semanal roda e não interfere no CI de PR.

**Gate**: `pnpm gate:mutation`
**Status**: ⬜ não iniciada

---

### T15: O revisor inferencial no CI, não bloqueante, com taxa medida · [#70](https://github.com/vinihcrosa/lumem-os/issues/70)

> **Fora de escopo — 2026-09-28.** A [Q5](open-questions.md) tirou esta task da feature. O texto abaixo
> fica como estava, como registro do que foi pensado; o que volta, e quando, está no
> [backlog](../../project/backlog.md).

**Classe:** sensor inferencial · **Previne:** que o `lumem-reviewer` — 518 linhas de critério real,
incluindo **auditoria de força de teste por bateria de mutação** — só exista quando alguém lembra de
chamar. É hoje o único sensor semântico do repositório e é 100% manual: o quadrante inferencial de
feedback está vazio.
**Trava:** [Q5](open-questions.md) (bloqueia ou não), [Q6](open-questions.md) (custo e teto).

**What**:
1. `.github/workflows/review.yml`, em `pull_request`: roda o agente com `.claude/agents/lumem-reviewer.md`
   como instrução, sobre o diff da PR, e publica **um** comentário.
2. **Não bloqueante** no nascimento, pela Q5. Um revisor que erra bloqueando ensina a ignorar, e é o
   fim de todo sensor.
3. Teto por tamanho de diff, pela Q6: acima dele o job comenta *"diff grande demais para revisão
   automática — revisão humana"* em vez de tentar e alucinar. O teto é a **mesma** fronteira da T16, o
   que dá ao autor um motivo econômico para PR menor.
4. Medir: nas 5 primeiras PRs, anotar achados reais contra falsos positivos, no corpo da própria PR, e
   consolidar em `harness-audit.md`. A Q5 se responde com esse número, e não com impressão.

**Where**: `.github/workflows/review.yml` (novo), `docs/project/harness-audit.md`.

**Done when**:
- três PRs consecutivas com comentário automático publicado;
- a taxa de achado real das 5 primeiras está registrada;
- o job **não** bloqueia o merge, e uma PR acima do teto recebe a mensagem de recusa em vez de uma
  revisão inventada.

**Gate**: as três PRs acima
**Status**: ⏸ **fora de escopo** desde 2026-09-28 — [Q5](open-questions.md): nada de revisão automática por agente no CI agora. O desenho discutido está no [backlog](../../project/backlog.md).

---

### T16: PR menor, por contrato · [#71](https://github.com/vinihcrosa/lumem-os/issues/71)

**Classe:** ambiente · **Previne:** o gargalo humano de N2. Revisão de intenção sobre **+9.489/-278 em
82 arquivos** (a maior PR mergeada) não é revisão — é aceitação. A mediana das 20 últimas é **+2.600/-238
em 41 arquivos**, e é ela que decide se o humano continua conseguindo ser o revisor de arquitetura que
o N2 exige dele.

**What**:
1. `.github/pull_request_template.md` com quatro campos e nada mais: a **task ou issue** que a PR
   fecha; o **`Done when`** dela, copiado; o **gate rodado**, com a saída colada; o que ficou **fora**,
   de propósito.
2. Passo informativo no `ci.yml` que comenta quando `additions + deletions > 1500`, pedindo a
   justificativa no corpo. Comenta, não reprova: o tamanho certo depende da feature, e um limite
   rígido produziria PR fatiada artificialmente, que é pior de revisar.
3. Medir por 10 PRs e registrar a mediana em `harness-audit.md`.

**Where**: `.github/pull_request_template.md` (novo), `.github/workflows/ci.yml`,
`docs/project/harness-audit.md`.

**Done when**:
- o template aparece em toda PR nova;
- uma PR acima de 1.500 linhas recebe o comentário;
- a mediana de 10 PRs consecutivas fica **abaixo de 1.000 linhas** — e se não ficar, o achado é sobre
  o tamanho das features, não sobre o template.

**Gate**: as 10 PRs medidas
**Status**: 🟡 **parcial** em 2026-09-28. O `.github/pull_request_template.md` com os quatro campos, e o
passo de tamanho no `pr-signals.yml` da T22 (e não no `ci.yml`, pelo mesmo motivo): acima de 1500 linhas,
comenta **uma vez** pedindo a justificativa, com um marcador para não repetir. **Falta:** a mediana de 10
PRs — ela só existe depois delas.

---

## O que estas 16 tasks deixam de fora

Registrado aqui para não voltar como memória de conversa — os quatro primeiros vão para o
[backlog](../../project/backlog.md) com gatilho, e o quinto tem PRD própria:

| Fora | Gatilho de volta |
|---|---|
| Formatador (`prettier`, `biome format`) | a segunda pessoa no repositório — antes disso o custo (reformatar 105k linhas, apagar o `git blame`) é maior que o ganho |
| Sandbox de filesystem para o agente | quando o `deny` da T4 for atravessado por algum caminho que ele não previu |
| `CODEOWNERS` e aprovação obrigatória | o primeiro colaborador ([Q8](open-questions.md)) |
| Grading de qualidade por domínio com histórico | depois da T9 e da T10 — sem sensor não há o que graduar |
| Autenticação do daemon | é a [daemon-auth](../019-daemon-auth/prd.md); o que trava lá são as perguntas, não o código |
