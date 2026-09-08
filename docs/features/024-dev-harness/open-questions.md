# Perguntas — o harness deste repositório

> **PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)
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

- [ ] **Q8 — Quando entrar a segunda pessoa, o que muda?**
  A T2 nasce com zero aprovações e a PRD tira `CODEOWNERS` de escopo, os dois por causa do "uma pessoa
  só" da A2. Isso é uma decisão com data de validade.
  **Recomendação:** registrar o gatilho no [backlog](../../project/backlog.md) em vez de deixar a
  reversão para a memória: no primeiro colaborador, `required_approving_review_count` vai a 1 e o
  `CODEOWNERS` nasce.
  **O que a resposta muda:** nada hoje; evita a arqueologia depois.
