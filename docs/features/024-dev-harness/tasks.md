# O harness deste repositório — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) · **Linha de base:**
[harness-audit.md](../../project/harness-audit.md)

**Status:** **16 tasks em 3 fases, nenhuma iniciada** (2026-09-07). Três perguntas já respondidas
(A1–A3); oito abertas, e as que travam task estão marcadas na coluna `Trava`.
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
| **F1 — contenção e loop** | T1 · T2 · T3 · T4 · T5 · T6 · T7 · T8 | [#56](https://github.com/vinihcrosa/lumem-os/issues/56) | N2 com segurança | ~1 dia |
| **F2 — comportamento e arquitetura** | T9 · T10 · T11 · T12 · T13 | [#64](https://github.com/vinihcrosa/lumem-os/issues/64) | N3 em CSS/token, dependência e docs | ~3 dias |
| **F3 — entropia e revisão inferencial** | T14 · T15 · T16 | [#69](https://github.com/vinihcrosa/lumem-os/issues/69) | ampliar N3 por número | ~3 dias |

| Task | Issue | Classe | Trava | Esforço |
|---|---|---|---|---|
| T1 credencial de publicação fora do ambiente | [#56](https://github.com/vinihcrosa/lumem-os/issues/56) | permissão | — | P |
| T2 `main` protegida, dois checks obrigatórios | [#57](https://github.com/vinihcrosa/lumem-os/issues/57) | permissão | [Q1](open-questions.md) | P |
| T3 environment com reviewer, `delete_repo` revogado | [#58](https://github.com/vinihcrosa/lumem-os/issues/58) | permissão | — | P |
| T4 política de permissão versionada, com teste | [#59](https://github.com/vinihcrosa/lumem-os/issues/59) | permissão | — | P |
| T5 runtime pinado, e o setup recusa outro | [#60](https://github.com/vinihcrosa/lumem-os/issues/60) | ambiente | — | P |
| T6 frescor de documentação como teste | [#61](https://github.com/vinihcrosa/lumem-os/issues/61) | sensor computacional | — | M |
| T7 os 24 itens que o T6 acusa | [#62](https://github.com/vinihcrosa/lumem-os/issues/62) | — | — | P |
| T8 `AGENTS.md`, e o `CLAUDE.md` encolhe | [#63](https://github.com/vinihcrosa/lumem-os/issues/63) | guide inferencial | — | M |
| T9 lint de correção, bloqueante | [#64](https://github.com/vinihcrosa/lumem-os/issues/64) | sensor computacional | [Q2](open-questions.md) | M |
| T10 fitness arquitetural como teste | [#65](https://github.com/vinihcrosa/lumem-os/issues/65) | sensor computacional | [Q3](open-questions.md), [Q4](open-questions.md) | M |
| T11 log do daemon consultável pelo agente | [#66](https://github.com/vinihcrosa/lumem-os/issues/66) | ambiente | — | M |
| T12 rollback ensaiado e medido | [#67](https://github.com/vinihcrosa/lumem-os/issues/67) | ambiente | — | M |
| T13 frescor de dependência automatizado | [#68](https://github.com/vinihcrosa/lumem-os/issues/68) | sensor computacional | — | P |
| T14 mutation testing com piso | [#69](https://github.com/vinihcrosa/lumem-os/issues/69) | sensor computacional | — | G |
| T15 revisor inferencial no CI, com taxa medida | [#70](https://github.com/vinihcrosa/lumem-os/issues/70) | sensor inferencial | [Q5](open-questions.md), [Q6](open-questions.md) | M |
| T16 PR menor por contrato | [#71](https://github.com/vinihcrosa/lumem-os/issues/71) | ambiente | — | P |

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
**Status**: ⬜ não iniciada

---

### T2: `main` protegida, com os dois checks obrigatórios · [#57](https://github.com/vinihcrosa/lumem-os/issues/57)

**Classe:** permissão · **Previne:** `git push --force origin main` (324 commits, um comando) e
merge de PR vermelha — hoje `gh pr merge` funciona com CI falhando, porque não existe check
obrigatório. É o que converte todo o estoque de sensores de conselho em portão.
**Trava:** [Q1](open-questions.md) — `bypass_actor` ou ninguém.

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

**Where**: configuração do repositório no GitHub. Nada no git.

**Done when** — os três conferidos por tentativa, e não por leitura:
- `git push origin main` direto de uma branch local é **recusado** pelo servidor;
- uma branch descartável com um teste deliberadamente quebrado, aberta como PR, mostra o merge
  **bloqueado** na UI e `gh pr merge` **recusa** (fechar a PR e apagar a branch depois — o experimento
  é o aceite);
- `gh api repos/:owner/:repo/rulesets --jq '.[].name'` devolve `main protegida` (confirmação
  secundária, não o aceite).

**Gate**: o experimento da PR vermelha acima
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

---

### T7: Os 24 itens que o T6 acusa · [#62](https://github.com/vinihcrosa/lumem-os/issues/62)

**Classe:** — (conserto) · **Previne:** que o sensor da T6 nasça vermelho e seja desligado por
incômodo, que é como gate morre.

**What**:
1. Os 4 links: dois `../003-worktree-tabs/prd.md` (em `docs/features/018-worktree-first-tab/tasks.md` e
   `docs/features/013-pull-request-status/tasks.md`) apontam para arquivo que **nunca existiu** — a pasta
   `worktree-tabs/` só tem `tasks.md`. Apontar para `tasks.md`. Os dois de `docs/references/compozy.md`
   citam arquivos de outro repositório: viram texto sem link.
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
**Status**: ⬜ não iniciada

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

## Fase 2 — comportamento e arquitetura

### T9: Lint de correção, bloqueante · [#64](https://github.com/vinihcrosa/lumem-os/issues/64)

**Classe:** sensor computacional · **Previne:** a classe inteira que o `tsc` não vê e que hoje **não
tem sensor nenhum** — promessa não-aguardada (o daemon é cheio de `void` e de `async` disparado),
`catch` vazio, `await` em laço, import não usado, variável sombreada. E previne a deriva de estilo que
o agente **copia do que encontra**: inconsistência existente é dívida composta.
**Trava:** [Q2](open-questions.md).

**What**:
1. **Medir antes de escolher**, no molde da fase 0 da [second-agent](../021-second-agent/prd.md). Rodar
   `oxlint` e `typescript-eslint` (perfil só-correção) sobre `packages/*/src`, `e2e` e `scripts`, e
   registrar: tempo de execução e número de achados por regra. Critério declarado **antes** da
   medição: se o `typescript-eslint` couber em **60s**, ele ganha — as regras com informação de tipo
   são as que pegam defeito de verdade; acima disso, `oxlint` agora e o type-aware vai para o backlog
   com o número medido como gatilho.
2. Configurar **só correção**. Nada de estilo, nada de ordem de import, nada que um formatador
   resolveria — formatador está fora de escopo por decisão do §4 da PRD (reformatar 105k linhas apaga
   o `git blame` de um repositório de 24 dias).
3. `pnpm lint` na raiz, com `--max-warnings 0`: warning que não falha é ruído que se aprende a ignorar.
4. Entrar no `gate:build` (que é o gate que hoje responde "o repositório compila") e no job `checks`
   do CI, **depois** do `typecheck` — erro de tipo primeiro, porque é o mais legível dos dois.
5. Registrar em `docs/project/testing.md`: o que o lint garante, o que ele **não** garante, e o tempo
   medido.

**Where**: `eslint.config.ts` ou `.oxlintrc.json` (conforme a Q2), `package.json` (raiz),
`.github/workflows/ci.yml`, `docs/project/testing.md`.

**Done when**:
- `pnpm lint` sai **0** no HEAD;
- uma promessa não-aguardada introduzida à mão em `packages/server/src` **reprova**, e a mensagem diz
  qual arquivo e qual linha;
- `gate:build` continua abaixo de **60s** frio (hoje 22,7s) — número medido e registrado;
- o CI continua abaixo de 6min.

**Gate**: `pnpm gate:build`
**Status**: ⬜ não iniciada

---

### T10: Fitness arquitetural como teste · [#65](https://github.com/vinihcrosa/lumem-os/issues/65)

**Classe:** sensor computacional · **Previne:** que a direção de dependência hoje limpa degrade sem
ninguém ver — `shared` não importa ninguém, `server` importa `shared`, `web` importa `shared` e
**só o tipo** do router do `server` (declarado em devDependencies). Nada verifica isso: é uma
propriedade que existe por disciplina. E previne o crescimento silencioso do núcleo:
`AcpManager.ts` tem **2071 linhas** e concentra transporte, sessão e tradução — é o arquivo mais
difícil de testar do repositório, e o que mais cresce.
**Trava:** [Q3](open-questions.md) (onde mora), [Q4](open-questions.md) (forma do teto).

**What**:
1. `scripts/architecture.test.ts` com três asserções:
   - **direção:** nenhum `import` de `packages/shared/src` alcança `server`, `web` ou `cli`; nenhum de
     `server` alcança `web` ou `cli`; `web → server` é permitido **só** como `import type` de
     `@lumem/server/router-types`, que é a exceção declarada e a única;
   - **dependência declarada:** todo `@lumem/*` importado por um pacote está nas `dependencies` ou
     `devDependencies` **daquele** pacote. Hoje passa (o `web` declara `@lumem/server` em devDeps), e
     é uma propriedade que quebra calada num monorepo com symlink;
   - **teto:** arquivo novo de produção não passa de **700 linhas**, e os 8 que hoje passam vivem num
     mapa de exceções com o tamanho atual, que **só pode diminuir** (conforme a Q4).
2. A mensagem de falha injeta remediação, não código de regra: *"este import atravessa a fronteira do
   pacote — mova a lógica para `shared/`, ou exponha por `router-types`"*. O critério de qualidade da
   mensagem é o do §D4 da auditoria: um agente tem que saber o que fazer sem abrir o teste.
3. O mapa de exceções nasce da medição já feita (`AcpManager.ts` 2071, `MemoryPanel.tsx` 987,
   `FileService.ts` 971, `MemoryService.ts` 961, `AgentLogin.tsx` 933, `Conversation.tsx` 824,
   `schema.ts` 787, `GitService.ts` 768).
4. **A task instala o sensor e não refatora nada.** Reduzir o `AcpManager` é trabalho com PRD próprio;
   misturar as duas coisas produz um diff que ninguém revisa.

**Where**: `scripts/architecture.test.ts` (novo, conforme a Q3), `docs/project/testing.md`.

**Done when**:
- um `import` de `server` dentro de `packages/shared/src` **reprova**, nomeando os dois arquivos e
  dizendo o que fazer;
- remover `@lumem/server` das devDependencies do `web` **reprova**;
- acrescentar 20 linhas a um arquivo que está no seu teto **reprova**; remover 20 linhas **passa** e o
  mapa pode ser atualizado para baixo;
- o mapa tem exatamente os 8 arquivos medidos, e o teste passa no HEAD.

**Gate**: `pnpm gate:quick`
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
**Status**: ⬜ não iniciada

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
