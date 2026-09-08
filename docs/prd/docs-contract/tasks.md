# O contrato de documentação — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** em execução — **12 tasks em 6 fases**, as 12 perguntas respondidas antes da primeira

A ordem das fases é **forçada pela [Q6](open-questions.md)**: com o número significando só ordem, um
`docs/adr/` vazio deixaria o repositório sem fonte de precedência nenhuma — pior que hoje, onde a
nota informal ao menos existe em 44 lugares. Então **o lastro vem antes da regra**, e a regra antes
do `git mv`.

---

## Antes de começar

**O que muda:**

| Onde | O quê |
|---|---|
| `docs/adr/` (nasce) | 6 ADRs: 5 retrospectivos mais o desta decisão |
| `docs/project/pty-vs-acp.md`, `design-source-of-truth.md` | perdem o campo que **afirma** a decisão; ganham ponteiro para o ADR |
| `docs/prd/` → `docs/features/` | 25 pastas, `NNN-nome`, três dígitos |
| `CLAUDE.md`, `docs/README.md`, `docs/project/backlog.md` | a regra escrita, e a categoria nova |
| `.claude/agents/lumem-{dev,reviewer}.md` | 4 quebras e 12 placeholders |
| `README.md`, `README.pt-BR.md` | sai *"designed, not built"* |
| `scripts/check-docs.ts` (nasce) | o link-checker do `gate:full` |

**O que não muda** — e cada um tem uma pergunta com nome:

| Não muda | Por quê |
|---|---|
| o nome `prd.md` | só a categoria muda ([Q12](open-questions.md)) |
| as 164 linhas de `../../project/` e `../../references/` | a profundidade de `docs/features/<NNN>-<x>/` é a mesma de `docs/prd/<x>/` |
| as 3 strings executáveis com `docs/prd` em teste | caminhos sintéticos escritos em tmpdir — trocá-las não conserta nada e arrisca o assert |
| os 45 trailers de commit do histórico | git history não se reescreve ([Q9](open-questions.md)) |
| `broken-supersedes` / `supersedes-cycle` | [Q11](open-questions.md) — gatilho de voltar é o primeiro `supersedes:` escrito |

---

## Fase 1 — o lastro

### T1 — `docs/adr/` e os cinco ADRs retrospectivos

- **Where:** `docs/adr/*.md`
- **O quê:** os cinco que passam nos três testes, cada um com a **data real da decisão** e o minuto
  tirado do `git log` do commit que a fechou — não a data de hoje. `Alternativas` **cita a fonte**
  em vez de reescrever, porque reconstruir de memória o que perdeu produz um documento que *soa*
  autoritativo e erra a única parte que importava.
- [ ] `2026-08-17-…-a-sessao-de-agente-e-acp-nao-pty.md` — fonte: `pty-vs-acp.md` §§1–7, **inclusive
      o §7, que recomendou não migrar e perdeu**
- [ ] `2026-08-19-…-o-design-e-feito-no-open-design.md` — fonte: `design-source-of-truth.md` §§1–3
- [ ] `2026-08-22-…-a-memoria-escreve-atras-de-portao-e-interruptor-desligado.md` — fonte:
      `workspace-memory/open-questions.md`
- [ ] `2026-08-30-…-o-daemon-e-um-bundle-esm-que-serve-o-web.md` — fonte: `distribution/prd.md`
- [ ] `2026-09-05-…-o-status-de-pr-vem-do-gh-da-sua-maquina.md` — fonte:
      `pull-request-status/{prd,spike}.md`
- **Done when:** os 5 existem, cada um com os 6 campos de frontmatter e as 5 seções; `date:` bate
  com o prefixo do nome; nenhum tem `supersedes:`; e dá para decidir a relevância de qualquer um
  **só pelo frontmatter**, sem abrir o corpo.
- **Fora de escopo, com o motivo:** *"o adaptador é catálogo, não constante de Claude"* — a
  reversibilidade é discutível, e reverter falha o primeiro dos três testes. *"Um popover ancora no
  que o abre"* — é regra de design, e pela regra 4 isso fica na PRD da
  [composer-menus](../composer-menus/prd.md).
- **Gate:** nenhum (só documentação) · **Commit:** `docs(adr): the five decisions that already crossed the system`

### T2 — os dois arquivos de `docs/project/` param de afirmar decisão

- **Where:** `docs/project/pty-vs-acp.md`, `docs/project/design-source-of-truth.md`
- [ ] `pty-vs-acp.md:3` perde o `**Status:** DECIDIDO em 2026-08-17 — migrar para ACP`
- [ ] `design-source-of-truth.md:3` perde o `> **Decisão, 2026-08-19.**`
- [ ] os dois ganham uma linha apontando para o ADR que a decisão virou, e o papel novo dito:
      **estudo que sustenta a decisão, não a decisão**
- **Done when:** nenhum arquivo de `docs/project/` afirma uma decisão que um ADR também afirma —
  sem isso, dois arquivos dizem a mesma coisa e um deles vai apodrecer, que é o defeito do §1 do PRD.
  É também a **primeira vez** que um arquivo de `docs/project/` aponta para um sucessor.
- **Gate:** nenhum · **Commit:** `docs(project): pty-vs-acp and design-source-of-truth point at their ADR`

### T3 — o ADR desta decisão

- **Where:** `docs/adr/2026-09-07-…-o-numero-da-prd-e-ordem-de-leitura-nao-precedencia.md`
- **O quê:** o único que nasce com `Alternativas` escrito de primeira mão — as três opções da
  [Q6](open-questions.md), com o `Por que perdeu` da prioridade dura sendo a emenda da
  `run-dock-open`: respondida em 09-01, revertida em 09-06, com número de 09-05.
- **Done when:** existe, e é o teste do formato contra um caso real. Se o `Por que perdeu` repetir o
  `Contra`, o ADR é advocacia e volta.
- **Gate:** nenhum · **Commit:** `docs(adr): the PRD number is reading order, not precedence`

## Fase 2 — a regra escrita

### T4 — `CLAUDE.md`

- **Where:** `CLAUDE.md`
- [ ] a tabela de categorias ganha `docs/adr/`, e a linha de `docs/project/` ganha o papel novo
- [ ] a regra de documentação ganha as sete linhas do §3.2 do PRD
- [ ] a tabela de mapa (`| Onde | O quê |`) ganha `docs/adr/`
- **Done when:** a frase **`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa
  · o código está em vigor** está escrita, e curta o suficiente para caber na cabeça de quem lê.
- **Gate:** nenhum · **Commit:** `docs: the documentation contract, written where it is enforced`

### T5 — o índice e o backlog

- **Where:** `docs/README.md`, `docs/project/backlog.md`
- [ ] o índice ganha a seção `docs/adr/`, com uma linha por ADR
- [ ] a seção Convenções espelha a regra nova
- [ ] as duas regras de fronteira do backlog passam a citar `docs/features/<NNN>-<feature>/tasks.md`
- **Gate:** nenhum · **Commit:** `docs(readme): index the ADRs and mirror the contract`

## Fase 3 — o rename

### T6 — `git mv`, e **nada mais**

- **Where:** as 25 pastas de `docs/prd/`
- **O quê:** `docs/prd/<x>/` → `docs/features/<NNN>-<x>/`, `NNN` pela ordem do primeiro commit que
  criou cada pasta:

  | | | | | |
  |---|---|---|---|---|
  | `001` walking-skeleton | `002` ui-shell | `003` worktree-tabs | `004` right-panel | `005` file-editor |
  | `006` acp-sessions | `007` workspace-memory | `008` onboarding | `009` agent-login | `010` workspace-screen |
  | `011` project-from-url | `012` project-scripts | `013` pull-request-status | `014` distribution | `015` run-dock-open |
  | `016` session-mode | `017` sidebar-actions | `018` worktree-first-tab | `019` daemon-auth | `020` memory-dogfooding |
  | `021` second-agent | `022` workspace-tasks | `023` composer-menus | `024` dev-harness | `025` docs-contract |

- **A ordem de merge é muda para 10 das 24, e isso é regra, não descuido.** Três commits criaram
  várias pastas de uma vez: `3c94515` (acp-sessions, workspace-memory), `4874cf7` (run-dock-open,
  session-mode, sidebar-actions, worktree-first-tab) e `1a25f92` (daemon-auth, memory-dogfooding,
  second-agent, workspace-tasks). Entre elas não existe "antes". **Desempate: alfabético** —
  arbitrário, determinístico, e arbitrário está **certo** aqui: pela [Q6](open-questions.md) o
  número não afirma precedência, então o desempate não precisa significar nada. Ordenar por data de
  conclusão faria o número voltar a afirmar algo.
- **Done when:** `git log --follow docs/features/001-walking-skeleton/prd.md` atravessa o rename.
- **A armadilha:** **commit isolado, zero edição de conteúdo.** Misturar o `sed` da T7 aqui destrói
  o `--follow` para 70 arquivos, e não tem como desfazer depois.
- **Gate:** `pnpm gate:build` · **Commit:** `docs: docs/prd becomes docs/features/NNN-name`

## Fase 4 — os links

### T7 — as quatro formas de caminho

- **Where:** `docs/**`, `CLAUDE.md`, `README.md`, `README.pt-BR.md`
- [ ] `docs/prd/<x>/` → `docs/features/<NNN>-<x>/` (86 linhas em 38 arquivos)
- [ ] `prd/<x>/` no índice → `features/<NNN>-<x>/` (117 ocorrências)
- [ ] `../<x>/` entre features → `../<NNN>-<x>/` (129 linhas)
- [ ] `docs/prd/` genérico → `docs/features/`
- **Não tocar:** `../../project/` e `../../references/` — 164 linhas, e a profundidade não muda.
- **Done when:** `grep -rn 'docs/prd' .` volta só as 3 strings de teste; e o link-checker da T12
  volta zero.
- **Gate:** `pnpm gate:build` · **Commit:** `docs: repoint every link at the numbered folders`

### T8 — os comentários no código

- **Where:** `packages/**`, `scripts/**` — 30 referências em 24 arquivos
- **O quê:** todas são comentário ou texto de protótipo; **nenhuma quebra compilação**. Entram porque
  são a rastreabilidade código → decisão, que é o ponto da feature.
- **Não tocar** as 3 strings executáveis: `scripts/gate-quick.test.ts` e
  `packages/web/src/lib/markdown.test.ts` — caminhos sintéticos escritos em tmpdir.
- **Gate:** `pnpm gate:quick` · **Commit:** `chore: repoint doc references in code comments`

## Fase 5 — os agentes

### T9 — as 4 quebras e os 12 placeholders

- **Where:** `.claude/agents/lumem-dev.md`, `.claude/agents/lumem-reviewer.md`
- [ ] `lumem-dev.md:71` — o link para `walking-skeleton/tasks.md`, **2 ocorrências na mesma linha**
- [ ] `lumem-dev.md:210` — `T5 of docs/prd/walking-skeleton/tasks.md`, no template de commit
- [ ] `lumem-reviewer.md:78` — `docs/prd/walking-skeleton/{prd,open-questions,tasks}.md`
- [ ] os 12 placeholders `docs/prd/<feature>/` → `docs/features/<NNN>-<feature>/`, incluindo
      `lumem-reviewer.md:113` e `:272`, que **definem** o trailer de commit
- **Achado de graça:** as três quebras apontam `walking-skeleton` como *"feature atual"*, e ela é a
  **primeira** do repositório — já era falso antes desta mudança.
- **Done when:** o trailer novo é `T<N> of docs/features/<NNN>-<feature>/tasks.md`. Os 45 trailers
  já no histórico ficam citando caminho inexistente: irreversível, pago uma vez.
- **Gate:** nenhum · **Commit:** `chore(agents): point the agents at the numbered folders`

## Fase 6 — o que mentia, e o gate

### T10 — os cinco `Status:` que mentem

- **Where:** os 5 `prd.md` do §1 do PRD
- [ ] `pull-request-status` — o `Status:`, **e a nota de 2026-09-01** que afirma o contrário do
      próprio `tasks.md`
- [ ] `right-panel`, `ui-shell`, `walking-skeleton`
- [ ] `acp-sessions` — o `Status:` e a linha `:10`
- [ ] a prosa rica desce para `**Histórico:**`, em todos que a tiverem
- **Done when:** os 24 `Status:` usam a gramática de quatro valores e concordam com o disco.
- **Gate:** nenhum · **Commit:** `docs: the Status field stops lying`

### T11 — o que vazou para fora do `docs/`

- **Where:** `README.md`, `README.pt-BR.md`, `docs/README.md`
- [ ] sai *"designed, not built"* / *"desenhado, não implementado"* sobre a `pull-request-status`
- [ ] o heading *"Propostos em 2026-09-05 — quatro PRDs, nenhum começado"* — são três, e o quarto
      está completo
- [ ] os **4 links mortos** para `docs/prd/worktree-tabs/prd.md`, arquivo que nunca existiu. O
      destino certo é o `tasks.md`, que é o único arquivo daquela pasta
- **Gate:** nenhum · **Commit:** `docs: fix the claims that outlived their feature`

### T12 — o link-checker

- **Where:** `scripts/check-docs.ts`, `scripts/check-docs.test.ts`, `package.json`
- **O quê:** três checagens, em ordem de valor:
  1. **link relativo** entre arquivos de `docs/` resolve para arquivo existente — pega o rename
     incompleto;
  2. **âncora de heading** resolve. É o que `grep` **não** pega, e é justamente o mecanismo da nota
     de reversão (`…/prd.md#21-isto-reverte-um-requisito-do-walking-skeleton`);
  3. **`Status:` contra o filesystem** — `proposta` ⇔ sem `tasks.md`, `completa` ⇔ sem checkbox
     aberto.
- **Entra no `gate:full`, não no `quick`:** é I/O em ~70 arquivos, e a exclusão deliberada de
  `docs/**` em `scripts/gate-quick.ts` continua valendo.
- **Done when:** roda contra `docs/` e volta zero **depois** da T11, e **vermelho antes** — se der
  verde antes da T11, o gate não está checando nada. Essa é a prova, e não o teste unitário.
- **Gate:** `pnpm gate:full` · **Commit:** `feat(scripts): check-docs, the gate that would have caught the four dead links`

---

## O que fica de fora, com o gatilho de volta

| Adiado | Volta quando |
|---|---|
| `broken-supersedes` / `supersedes-cycle` | o primeiro `supersedes:` for escrito |
| índice de ADR gerado | `ls docs/adr/` mais o frontmatter deixar de ser suficiente — na referência, a conta fecha em ~60 ADRs |
| ADR para as 44 supersessões informais | nunca, pela regra 4: são requisito de feature, não arquitetura |
| um ADR da `memory-dogfooding` | quando o período medido fechar. O entregável dela **é** uma decisão |
