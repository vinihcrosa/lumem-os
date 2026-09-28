# Perguntas — o harness deste repositório

> **PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md) · **Emenda:** as Q9–Q14 são de 2026-09-28
> **Como usar:** responda embaixo de cada pergunta no campo `**R:**` e marque `[x]`. Nada é apagado —
> pergunta respondida vira registro de decisão. Pergunta que trava uma task tem o número da task ao
> lado, e a task não começa antes da resposta.

---

## Respondidas antes da PRD existir

As três que a [auditoria](../../project/harness-audit.md) fez ao time humano, respondidas em
**2026-09-07**. São elas que definiram o corte da feature.

- [x] **A1. O `_authToken` do `~/.npmrc` ainda serve para quê?**
  **R:** era só do CD, para publicar a release, e já foi migrado para o método novo — OIDC/trusted
  publisher, desde `457247a`. **Pode retirar.** Consequência: o item de maior redução de risco da
  auditoria virou apagar uma linha ([T1](tasks.md)), sem nenhuma migração antes.

- [x] **A2. `main` sem proteção é escolha ou inércia?**
  **R:** inércia. Hoje é uma pessoa só, e **faz sentido adicionar os checks de PR**. Consequência: a
  [T2](tasks.md) exige PR e os dois checks em modo `strict`, com **zero aprovações** — o GitHub não
  permite aprovar a própria PR, então exigir uma aprovação num repositório de uma pessoa travaria o
  merge para sempre. O que a T2 força é o caminho branch → PR → CI, que é o que estava faltando.

- [x] **A3. Qual a primeira classe de mudança que se mesclaria sem ler o diff?**
  **R:** o palpite da auditoria está correto — **CSS/token**, **atualização de dependência** e
  **documentação**. Consequência: são as três classes de N3, fechadas no §3 da PRD, e cada uma tem o
  sensor que a cobre nomeado. Nada além delas.

---

## Abertas

- [ ] **Q1 — O ruleset da `main` tem `bypass_actor`, ou não tem ninguém? ([T2](tasks.md))**
  Com uma pessoa só, um bypass de admin é confortável — e é exatamente a inércia da A2 voltando por
  outra porta: um portão que o dono atravessa sem atrito não é portão nos dias em que ele está com
  pressa, que são os dias que importam.
  **Recomendação:** `bypass_actors: []`. A saída de emergência passa a ser desativar o ruleset, que é
  um evento no audit log — visível e datado — em vez de um push que não deixa rastro de exceção.
  **O que a resposta muda:** um campo no JSON da T2.

- [ ] **Q2 — `oxlint` ou `typescript-eslint`? ([T9](tasks.md))**
  A regra de maior valor neste repositório é `no-floating-promises` (o daemon é cheio de `void` e de
  `async` disparado), e ela **precisa de informação de tipo** — o que hoje só o `typescript-eslint`
  entrega, e ele custa segundos de CI. O `oxlint` é quase instantâneo e não faz análise de tipo.
  **Recomendação:** medir os dois no repositório inteiro **antes** de escolher — é o passo 1 da T9, no
  molde da fase 0 da [second-agent](../021-second-agent/prd.md), que mediu antes de escrever e mudou duas
  decisões. Critério de escolha declarado antes da medição: se o `typescript-eslint` couber em **60s**,
  ele ganha, porque as regras com tipo são as que pegam defeito de verdade; acima disso, `oxlint`
  agora e o type-aware fica no backlog.
  **O que a resposta muda:** o arquivo de configuração e o tempo do `gate:build`.

- [ ] **Q3 — Onde mora o teste de arquitetura? ([T10](tasks.md))**
  Candidatos: `scripts/` (projeto vitest `scripts`, ferramenta do repositório) ou `packages/shared`
  (junto do código que ele regula).
  **Recomendação:** `scripts/`. O teste lê o disco de todos os pacotes; morando dentro de um deles ele
  inverteria a própria direção de dependência que existe para defender — e ele não é código
  publicado.
  **O que a resposta muda:** um caminho de arquivo, e se ele entra ou não no tarball (não deve).

- [ ] **Q4 — Teto de linhas por arquivo: número absoluto com exceções, ou só "não cresce"? ([T10](tasks.md))**
  Hoje: 27 arquivos acima de 400 linhas, 8 acima de 700, `AcpManager.ts` com 2071. Um teto de 700
  reprova 8 arquivos no dia 1; um "não cresce" (cada arquivo tem o próprio limite, igual ao tamanho
  atual, e ele só pode diminuir) não reprova nada hoje e impede a piora.
  **Recomendação:** as duas coisas — teto de **700 para arquivo novo**, e mapa de exceções com o
  tamanho atual dos 8, que só pode encolher. É o que transforma "refatorar o `AcpManager`" de intenção
  em número que aparece no diff.
  **O que a resposta muda:** a forma do mapa e se a T10 vem acompanhada de trabalho de refatoração
  (não deve — a T10 só instala o sensor).

- [ ] **Q5 — O revisor inferencial passa a bloquear? ([T15](tasks.md))**
  Não dá para responder antes de ter dado. Um revisor que erra bloqueando é pior que revisor nenhum,
  porque ensina a ignorar.
  **Recomendação:** decidir com **5 PRs** de taxa medida — achados reais contra falsos positivos,
  anotados na própria PR. Abaixo de 50% de achado real ele fica informativo para sempre.
  **O que a resposta muda:** uma linha no `review.yml`.

- [ ] **Q6 — Quem paga o token do revisor de CI, e qual o teto por PR? ([T15](tasks.md))**
  A PR mediana deste repositório tem 2.600 linhas e a maior tem 9.489. Revisar tudo em toda PR é um
  custo recorrente que ninguém orçou.
  **Recomendação:** teto por tamanho de diff — acima dele o job comenta "diff grande demais, revisão
  humana" em vez de tentar e alucinar. E o teto é a mesma fronteira da [T16](tasks.md), o que dá ao
  autor um motivo econômico para PR menor.
  **O que a resposta muda:** se a T15 existe.

- [ ] **Q7 — As classes de N3 precisam de um selo mecânico?**
  A A3 nomeou três classes que se mesclariam sem ler o diff. Mas "esta PR é da classe CSS/token" é
  hoje um julgamento humano — e uma PR que mistura CSS com uma mudança de daemon não é da classe
  nenhuma.
  **Recomendação:** um check que classifica pelo conjunto de caminhos tocados e recusa a mistura:
  `packages/web/src/**/*.css` + `tokens.*` sozinhos é classe 1; `pnpm-lock.yaml` + `package.json`
  sozinhos é classe 2; `docs/**` + `*.md` sozinhos é classe 3; qualquer união é "sem classe". Sem
  isso, N3 é uma promessa verbal.
  **O que a resposta muda:** existe ou não uma T17, e se N3 chega a ser real ou continua sendo N2 bem
  feito.
  > **Nota — 2026-09-28.** O número T17 foi para os hooks de git da emenda. Se esta pergunta criar
  > task, ela é a **T21**.

- [ ] **Q8 — Quando entrar a segunda pessoa, o que muda?**
  A T2 nasce com zero aprovações e a PRD tira `CODEOWNERS` de escopo, os dois por causa do "uma pessoa
  só" da A2. Isso é uma decisão com data de validade.
  **Recomendação:** registrar o gatilho no [backlog](../../project/backlog.md) em vez de deixar a
  reversão para a memória: no primeiro colaborador, `required_approving_review_count` vai a 1 e o
  `CODEOWNERS` nasce.
  **O que a resposta muda:** nada hoje; evita a arqueologia depois.

---

## Abertas pela emenda de 2026-09-28

As seis que o [§8 da PRD](prd.md#8-emenda--2026-09-28-hooks-skills-e-o-que-três-semanas-não-mudaram)
abriu — hooks de git, hooks de agente e skills. A Q13 é a única que só se responde medindo, e é ela
que decide o tamanho da T18, da T19 e da T20.

- [x] **Q9 — Qual ferramenta liga os hooks de git? ([T17](tasks.md))**
  Três candidatos: `core.hooksPath` apontando para `.githooks/` versionado, `lefthook` e `husky`.
  O que pesa aqui é que **toda worktree compartilha o mesmo `.git`** — Conductor e Superset criam
  dezenas (17 nesta máquina em 2026-09-28) —, e que o repositório não tem hoje nenhuma dependência de
  hook.
  **Recomendação (da emenda):** `core.hooksPath=.githooks`, ligado pelo `scripts/workspace/setup.sh`,
  sem dependência.
  **R:** **husky v9**, respondido em 2026-09-28 — contra a recomendação, por familiaridade, e a
  comparação que decidiu está aqui para não ser refeita. A lógica mora em
  `scripts/harness/git-hook.ts` nos dois casos, então a ferramenta só decide **quem liga** e **quantas
  portas de fuga existem**. O husky ganha em ligar sozinho no `pnpm install` (o `prepare`), sem
  depender do `setup.sh`, e em ser convenção que pessoa e agente reconhecem; custa um pacote pequeno
  sem dependências, no `package.json` da raiz (`private: true`, fora do tarball publicado), e uma
  pasta gerada por worktree (`.husky/_`). O custo que importa é **duas portas de fuga além do
  `--no-verify`**: `HUSKY=0` no ambiente, e o `~/.config/husky/init.sh`, que o husky executa a cada
  hook e que pode desligá-los na máquina inteira sem rastro no repositório. As duas ficam fechadas
  para agente pela [T18](tasks.md). E o CI ganha `HUSKY: 0`.
  > **Correção — 2026-09-28.** A recomendação original dizia que o husky *"depende do `prepare` do
  > `pnpm install`, que o `--ignore-scripts` do CI desliga"*. **Estava errado:** o `ci.yml` roda
  > `pnpm install --frozen-lockfile`, sem `--ignore-scripts`. O argumento caiu antes da resposta, e a
  > resposta não se apoia nele.
  **O que a resposta muda:** a T17 adiciona `husky` como dependência de desenvolvimento da raiz, e os
  hooks moram em `.husky/`.

- [x] **Q10 — O que roda em cada hook de git? ([T17](tasks.md))**
  O custo é o que decide: um `pre-commit` lento é um `pre-commit` que se atravessa.
  **Recomendação:**
  - `pre-commit` — **abaixo de 10 s**, só o que é barato e do arquivo em stage: `docs:check` se há
    `.md` em stage, `design:derive --check` se há CSS de token, e a recusa de commit direto em `main`;
  - `commit-msg` — Conventional Commits, assunto até 72 caracteres, e o trailer `Co-Authored-By`
    **não** é exigido (commit humano também existe);
  - `pre-push` — o `gate:quick` (84 s medidos em 2026-09-28 no pior caso, quando seleciona a suíte
    inteira). É o último ponto antes de o CI gastar 4 min.
  **O que a resposta muda:** o corpo de três arquivos, e o tempo que cada commit custa.
  **R:** **a recomendação, com dois acréscimos**, respondido em 2026-09-28. Os custos que decidiram,
  medidos nesta máquina no mesmo dia: `docs:check` **0,4 s**, `design:derive --check` **0,3 s**,
  `typecheck` **2 s** com cache e ~23 s frio, `gate:quick` **84 s** no pior caso. O `typecheck` fica
  **fora** do `pre-commit` por causa do frio — uma worktree nova ou uma troca de branch faria o
  commit custar 23 s —, e entra pelo `gate:quick` do `pre-push`. Os acréscimos:
  - **o carimbo compartilhado com a [Q12](#abertas-pela-emenda-de-2026-09-28).** O `pre-push` e o `Stop` gravam e leem o mesmo
    carimbo — o hash da árvore do último `gate:quick` verde —, e o `pre-push` de uma árvore já
    verde sai dizendo *"já verde em <hash>"*, sem rodar de novo;
  - **o checkpoint do Conductor não pode quebrar.** São 997 refs em `refs/conductor-checkpoints`,
    com mensagem `checkpoint:session-…`, fora do Conventional Commits; tudo indica que saem por
    plumbing, que não dispara hook, e isso vira **aceite** da T17 em vez de suposição.
  E o que ficou de fora de propósito: os títulos de squash em `main` (`034-agent-accounts: …`) não
  seguem o Conventional Commits, mas quem os escreve é o GitHub no merge — o `commit-msg` nunca os
  vê. Padronizar título de PR é outra regra, no CI, e conversa com a [T16](tasks.md).

- [x] **Q11 — A política do agente mora em `permissions.deny`, num hook, ou nos dois? ([T4](tasks.md), [T18](tasks.md))**
  O `deny` é nativo, barato e só o Claude o lê. O hook `PreToolUse` existe no Claude e no Codex, e
  sabe ler o comando inteiro — `git push --force` escrito como `git push origin +main` não casa com
  um padrão de prefixo, mas casa com um parser.
  **Recomendação:** os dois, com papéis diferentes. O `deny` da T4 fica como primeira camada; o guarda
  da T18 é **um script só** (`scripts/harness/guard.ts`) chamado pelo `PreToolUse` dos dois agentes,
  e é ele que o teste exercita com o JSON de entrada de cada agente. O que um agente recusa e o
  outro deixa passar é o defeito que o teste existe para pegar.
  **O que a resposta muda:** se a T18 existe, ou se a T4 basta.
  **R:** **os dois**, respondido em 2026-09-28 — e com uma restrição que encolhe a pergunta: **este
  repositório é desenvolvido só com Claude.** O guarda não precisa de tomada no Codex, e o *"um script,
  dois agentes"* da recomendação cai. O que decidiu, lido na documentação do Claude Code no mesmo dia:
  - o `deny` de **qualquer** escopo ganha do `allow` de qualquer escopo — o do repositório vale contra
    os 103 `allow` do `~/.claude/settings.json` — e vale **em `bypassPermissions`**, o modo da esteira;
  - o `PreToolUse` dispara **em todo modo**, e um bloqueio dele ganha até de um `allow`;
  - o `deny` casa por texto e o hook lê o comando: `git push origin +main`, `git push -f` e
    `HUSKY=0 git commit` (a porta da [Q9](#abertas-pela-emenda-de-2026-09-28)) escapam do primeiro e não do segundo;
  - um hook que quebra **deixa passar**, e é o `deny` que segura a forma óbvia nesse dia.
  Então: o `deny` da [T4](tasks.md) é o **piso**, o guarda da [T18](tasks.md) é o **guarda**, e um teste
  exige que o piso seja subconjunto do que o guarda recusa. O guarda que não consegue decidir —
  entrada que não parseia — **recusa** em vez de liberar, e isso é caso de teste.

- [ ] **Q12 — O `Stop` cobra o gate antes de o agente dizer *"pronto"*? ([T19](tasks.md))**
  É a regra *"antes de dizer que uma task está pronta, rode o gate que ela declara"* virando mecânica.
  O custo é o tempo: 84 s no pior caso, a cada vez que o agente para.
  **Recomendação:** sim, com três limites — só roda se a árvore mudou desde o último `gate:quick`
  verde (um carimbo com o hash do `git diff`), bloqueia **uma vez** por turno (o `stop_hook_active`
  do Claude), e na esteira ele **não** roda, porque lá o portão da
  [`028`](../028-autonomous-orchestration/prd.md) já é quem julga.
  **O que a resposta muda:** se a T19 existe, e quanto tempo cada turno custa.

- [ ] **Q13 — Os agentes que o Lumem sobe carregam o que está no repositório? ([T0](tasks.md))**
  Não dá para responder sem medir. Quatro superfícies, cada uma pode ler ou não
  `.claude/settings.json` (permissões e hooks), `.codex/hooks.json`, `CLAUDE.md`/`AGENTS.md` e as
  skills: o Claude Code interativo, o Codex interativo, o `claude-agent-acp@0.75.1` e o `codex-acp`
  como a esteira os sobe.
  **Recomendação:** a T0 mede as dezesseis células com um hook que só escreve um arquivo-marca, e
  **a resposta decide o desenho**: se os adaptadores não carregam o projeto, o guarda da esteira tem
  que ser o **daemon** (a política do Lumem da [`016`](../016-session-mode/prd.md) já é um guarda), e
  isso é assunto de produto, com ADR próprio — não de repositório.
  **O que a resposta muda:** o alcance da T18, T19 e T20, e se nasce uma feature de produto.
  > **Nota — 2026-09-28.** A [Q11](#abertas-pela-emenda-de-2026-09-28) fixou que este repositório é desenvolvido **só com
  > Claude**. As superfícies caem de quatro para **duas** — o Claude Code interativo e o
  > `claude-agent-acp@0.75.1` como a esteira o sobe —, e as células de dezesseis para **oito**. A
  > pergunta continua aberta: é a do adaptador que decide o desenho.

- [ ] **Q14 — Onde moram as skills, para que os dois agentes as leiam? ([T20](tasks.md))**
  O Claude lê `.claude/skills/`. O Codex desta máquina tem `~/.codex/skills` e `~/.agents/skills`,
  e a leitura de projeto dele é o que a T0 mede.
  **Recomendação:** a fonte em `.claude/skills/lumem-*`, e o que a T0 disser que o Codex lê vira um
  link simbólico versionado — uma cópia só, pela mesma razão do [ADR de 2026-09-28](../../adr/2026-09-28-1726-outline-discusses-the-repo-decides.md).
  E as cinco skills de terceiro que já moram em `.claude/skills/` passam pela mesma auditoria: a
  auditoria de 2026-09-07 achou uma delas **contradizendo o `CLAUDE.md`** (D3).
  **O que a resposta muda:** um caminho, e se o repositório carrega skill que não escreveu.
  > **Nota — 2026-09-28.** Com o repositório **só Claude** ([Q11](#abertas-pela-emenda-de-2026-09-28)), a metade do Codex desta
  > pergunta cai: as skills moram em `.claude/skills/`, e ponto. O que sobra de pé é a outra metade —
  > **as cinco skills de terceiro** que já estão lá.
