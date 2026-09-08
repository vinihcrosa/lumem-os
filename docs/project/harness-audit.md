# Auditoria de harness — a linha de base medida

> **O que este arquivo é:** o lastro da [dev-harness](../features/024-dev-harness/prd.md). Toda afirmação da
> PRD e de cada task sai de um número aqui, medido nesta máquina em **2026-09-07**, no commit
> `40a0883` (v0.3.1). Quem contestar uma task contesta um número, não uma opinião.
>
> **O que ele não é:** relatório para ler de novo. Ele é registro de medição, no molde do
> [task-cycle-evidence](task-cycle-evidence.md) — e a coluna que importa é a que ficar velha primeiro.

---

## 1. O repositório, em números

| O quê | Medida |
|---|---|
| Idade | primeiro commit **2026-08-14**, 24 dias |
| Commits | **324**, todos nos últimos 90 dias |
| Autores humanos | **1** (`vinihcrosa`) |
| Commits com co-autoria de agente | **322 de 324** |
| Linhas `.ts`/`.tsx` (`packages` + `e2e` + `scripts`) | **105.757** |
| Linhas de produção (`packages/*/src`, sem teste) | **49.311** em 248 arquivos |
| Linhas de teste | **54.843** em 205 arquivos — razão **1,11:1** |
| `any` | **2** |
| `@ts-ignore` / `@ts-expect-error` | **4** |
| `.skip(` / `.only(` / `.todo(` literais | **0** (4 testes pulam por `describe.skipIf(!installed)`, documentado) |
| Arquivos de produção > 400 linhas | **27** · > 700 linhas: **8** · maior: `AcpManager.ts` com **2071** |
| Duplicação (janelas de 12 linhas normalizadas, entre arquivos) | **14**, em 3 pares de arquivo |
| Documentação | **84** `.md`, 2,1 MB |

## 2. Os sensores, com o tempo real

Medido em sequência, máquina de desenvolvimento, `LUMEM_TEST_WORKERS` no default 4.

| Sensor | Comando | Tempo | Resultado | Onde roda |
|---|---|---|---|---|
| unit + integração | `pnpm test` | **1min05** | ✅ 178 arquivos, 3151 testes, 4 skip condicionais | CI (`checks`) + local |
| e2e | `pnpm test:e2e` | **2min29** | ✅ 78/78, zero retry | CI (`e2e`) + local |
| typecheck + build | `pnpm gate:build` | **22,7s** frio · **1,5s** quente (`FULL TURBO`) | ✅ | CI + local |
| gate rápido | `pnpm gate:quick` | **55,8s** | ✅ — no HEAD ele selecionou a **suíte inteira**, porque config/dependência mudou desde `HEAD^` | local |
| pacote instalado | `pnpm smoke:install` | **3,4s** | ✅ HTML 200 e daemon `v0.3.1` | release + local |
| design | `design:sync --check` | ~3s | ✅ 39 arquivos, nada mudou | **só local** — exige o Open Design instalado |
| CI inteiro | GitHub Actions | **4min** (`checks` 2min19 e `e2e` 4min37, paralelos) | 15 últimos: 11 `success`, 4 `cancelled` pelo `concurrency` | toda PR + push em `main` |
| bootstrap | `./scripts/workspace/setup.sh` | **2,1s** quente | ✅ | local |
| zero → jornada validada | setup + e2e | **~2min32** | ✅ | — |

**Legibilidade de erro: alta, e por desenho.** `run.sh` recusa porta ocupada com o comando de saída no
corpo da mensagem; `gate:quick` diz *"only the e2e suite changed since HEAD^; vitest has nothing to
run. Playwright is not in this gate: run `pnpm gate:full`"*; as recusas do daemon são frases de
domínio. Conferido também o caminho de falha: `LUMEM_GATE_BASE=nao-existe` cai em `unresolved-base` e
**roda tudo** em vez de nada.

**O silêncio, nas duas hipóteses.** Para tipo e comportamento os sensores existem e falam alto, e o
silêncio é qualidade real — corroborado de fora por `any = 2` e pela duplicação medida. Para estilo,
código morto, complexidade e cobertura o silêncio é **ausência de detecção**: não há nada instalado
que pudesse reclamar.

## 3. O que não existe

Verificado nos manifestos e na raiz, não suposto:

| Ausente | Consequência |
|---|---|
| `eslint`, `prettier`, `biome`, `oxlint` | nenhuma análise estática além do `tsc` |
| `knip`, `ts-prune`, `madge`, `dependency-cruiser`, `jscpd` | código morto, ciclo e duplicação sem sensor |
| configuração de cobertura, `stryker` | nenhum número limita o auto-engano da suíte |
| hook de git (`core.hooksPath` não definido, só `.sample`) | nada acontece antes do commit ou do push |
| `.nvmrc`, `mise.toml`, devcontainer, Nix, Dockerfile | runtime não pinado — e o `project.toml` já registra o Node 26 quebrando o jsdom |
| `.claude/settings.json` no repositório | a política de permissão do agente mora em `~/.claude/settings.json`: **101 `allow`, zero `deny`**, fora do git |
| `CODEOWNERS`, template de issue e de PR | nada estrutura input nem revisão |
| `dependabot.yml` (e `dependabot_security_updates: disabled`) | pacote público sem frescor de dependência |
| proteção em `main` | `branches/main/protection` → **404**; `rulesets` → **`[]`** |
| revisão inferencial automatizada | o `lumem-reviewer` (518 linhas de critério) roda só quando alguém chama |
| log em arquivo, métrica, trace | zero `createWriteStream`/`pino.destination`: o agente não consulta o daemon que não subiu |

## 4. Frescor de documentação, medido

| O quê | Medida |
|---|---|
| Links relativos em `docs/**` + `CLAUDE.md` + `README*` | **1199**, **4 quebrados** |
| Caminhos de código citados em backtick (fora de `docs/references/`) | **242**, **20 inexistentes** |
| Linha duplicada no índice | 1 — `task-cycle-evidence.md` aparece duas vezes em `docs/README.md` |

Os 4 links: dois apontam para `docs/features/003-worktree-tabs/prd.md`, que nunca existiu (a pasta só tem
`tasks.md`), e dois em `compozy.md` apontam para arquivos de **outro** repositório.

> **Metade consertada em 2026-09-07, pela [025-docs-contract](../features/025-docs-contract/prd.md).**
> Os dois de `003-worktree-tabs` passaram a apontar para o `tasks.md`, e o link-checker do
> `gate:full` nasceu nessa feature — então esta linha da tabela deixa de ser medição e passa a ser
> gate. **Os dois de `compozy.md` continuam quebrados**, e continuam sendo trabalho da
> [T7 da dev-harness](../features/024-dev-harness/tasks.md), junto com os 20 caminhos em backtick e
> a linha duplicada do índice — nada disso foi tocado aqui.

Os 20 caminhos são de `tasks.md` de features entregues, citando arquivo que a própria feature
seguinte renomeou: `packages/server/src/setup/probe.ts`, `packages/web/src/components/WorktreeDetail.tsx`,
`scripts/ScriptRunner.ts`, `e2e/onboarding.spec.ts`, entre outros.

**Os caminhos de `docs/references/` ficam de fora da conta de propósito:** aqueles arquivos descrevem
o código de *outros produtos* (Superset, compozy). São 30 ocorrências que parecem defeito e não são.

## 5. Tamanho de PR

Vinte últimas PRs mergeadas: mediana **≈ +2.600/-238 em 41 arquivos**; máxima **+9.489/-278 em 82
arquivos**; mínima +4/-0. Merge por squash, `delete_branch_on_merge: false`, `allow_auto_merge:
false`. Histórico misto: as features recentes vão por PR (#44–#55), as antigas foram empurradas
direto para `main`.

## 6. Superfície de risco — o que um agente alcança hoje sem aprovação

Esta sessão de auditoria rodou em modo bypass, sem sandbox, sem `deny`, e o repositório não carrega
política alguma. A ordem é por severidade.

| # | Ação | Evidência | Controle | Task |
|---|---|---|---|---|
| 1 | `npm publish` de versão arbitrária no pacote público | `~/.npmrc` tem uma linha `_authToken`; `@vinihcrosa/lumem-os@0.3.1` no ar | apagar o token — o OIDC não o usa | [T1](../features/024-dev-harness/tasks.md) |
| 2 | `git push --force origin main` | sem proteção, sem ruleset | ruleset com `non_fast_forward` | T2 |
| 3 | `git push --tags` → `release.yml` publica | `on: push: tags: ["v*"]`; environment `npm` com `protection_rules: []` | reviewer no environment | T3 |
| 4 | `gh api -X DELETE repos/...` | token do `gh` com scope **`delete_repo`** | revogar o scope | T3 |
| 5 | mesclar PR vermelha | nenhum check obrigatório | `required_status_checks` | T2 |
| 6 | ler `~/.aws/credentials` | arquivo existe (116 bytes) | `deny` de leitura fora do checkout | T4 |
| 7 | `rm -rf ~/.lumem` — estado de produção do produto na máquina | fora do checkout, sem guarda; `testing.md` registra que a suíte já escreveu ali | `deny` de escrita fora do checkout | T4 |
| 8 | falar com o daemon sem credencial: abrir shell, escrever em qualquer checkout, gastar token | [`daemon-auth`](../features/019-daemon-auth/prd.md): "nenhuma autenticação em rota nenhuma" | fase 1 da `daemon-auth` | — |

Os itens 1 a 4 são irreversíveis ou quase, custam um comando, e nenhum passa por confirmação. É o que
trava a autonomia — mais do que qualquer lacuna de teste.

## 7. Scorecard

Escala: **0** ausente · **1** informal · **2** executável quando alguém lembra · **3** automatizado no
ciclo, com sinal legível · **4** bloqueante e evolutivo. Pesos: D9 e D6 ×2 (gargalos de confiança);
D1, D4, D7 ×1,5 (multiplicadores); resto ×1.

| Dimensão | Score | Maior lacuna |
|---|---|---|
| D1 legibilidade e base de conhecimento | 3 | zero checagem mecânica de frescor; sem `ARCHITECTURE.md` |
| D2 guides computacionais | 3 | nenhum gerador, scaffold ou codemod |
| D3 guides inferenciais | 3 | sem `AGENTS.md`; skill de terceiro contradizendo o `CLAUDE.md` |
| D4 sensors computacionais | 3 | nenhuma análise estática além do `tsc` |
| D5 sensors inferenciais | 2 | nada semântico roda sozinho |
| D6 harness de comportamento | 3 | nenhum número limitando o auto-engano |
| D7 ambiente e loop | 3 | runtime não pinado; paralelismo real é opt-in |
| D8 observabilidade | 2 | log só em stdout; nada consultável |
| D9 guardrails e raio de dano | 1 | nada bloqueia; credencial de publicação ao alcance |
| D10 ciclo de mudança e merge | 2 | nada obrigatório; PR de milhares de linhas; rollback nunca ensaiado |
| D11 entropia | 2 | nenhum processo recorrente |
| D12 harnessability | 3 | o núcleo (`AcpManager`) é o menos harnessável |
| D13 qualidade do input de tarefa | 3 | sem template; status de task mantido à mão |

**Ponderado: 41,5 / 66 ≈ 63%.** Nível de autonomia responsável hoje: **N2 — PR autônomo**, que é o
nível que o repositório já pratica.

## 8. A matriz, preenchida

|  | Feedforward (guides) | Feedback (sensors) |
|---|---|---|
| **Computacional** | `tsconfig.base.json` strict; tRPC/zod/drizzle; `ports.json`; `tokens.ts` derivado; `SCRIPT_PHASES`; catálogo `ADAPTERS`; os três scripts de ciclo de vida; `version:set` | `tsc` (raiz + 4 pacotes); 3151 vitest; 78 playwright em 2 projetos; porte de CSS nas duas direções; 119 pares de contraste; `manifest.test.ts`; o teste que roda o bundle e lê o esquema; `smoke:install`; CI em 2 jobs |
| **Inferencial** | `CLAUDE.md`; `docs/README.md`; 84 docs; `lumem-dev.md`; 3 skills; MCP `agentation` | `lumem-reviewer.md` — **manual**; revisão humana — **não obrigatória** |

**Quadrantes vazios, nomeados:** sensor computacional de **manutenibilidade** (inteiro); sensor
computacional de **fitness arquitetural** (existe *um* — o que recusa uma terceira dependência bare no
bundle); sensor **inferencial automatizado** (inteiro); guide computacional de **geração** (inteiro).

O desequilíbrio deste repositório é atípico: não é o caso comum de "regra que ninguém verifica" —
feedforward e feedback estão os dois povoados. Falta **posição**: quase todo controle está *antes* do
merge, como conselho, e nenhum está *no* merge, como portão.

## 9. O que não foi verificado

| O quê | Por quê | O que seria necessário |
|---|---|---|
| Bootstrap **frio** | o store do pnpm e o cache do Playwright estão quentes; 2,1s é o número quente | clone limpo com `PNPM_STORE_PATH` descartável |
| Cobertura e mutation score | **não existe** configuração de nenhum dos dois — nada a medir | [T14](../features/024-dev-harness/tasks.md) |
| Flakiness histórica | o CI não retém histórico legível de re-run; minha execução deu 78/78 sem retry, amostra de um | 10 execuções seguidas, ou retry registrado por spec |
| Se o `tokens.css` está em dia com o Open Design **de hoje** | `design:sync --check` lê o Open Design *local*; não roda em CI | fonte remota do projeto no Open Design |
| Se as PRs tiveram review humano registrado | com um autor só, review formal não existiria | respondido em §10 |
| Conteúdo das credenciais alcançáveis | verifiquei **existência** e que `~/.npmrc` tem `_authToken`; não li segredo, de propósito | nada — a existência é o achado |

## 10. As três perguntas, respondidas

Respondidas pelo Vinicius em **2026-09-07**, e é delas que sai o corte da PRD:

1. **O `_authToken` do `~/.npmrc` serve para quê?** *"Era só para CD, para publicar a release, mas já
   foi atualizado para o novo método, pode retirar ele."* → o item de maior redução de risco por
   unidade de esforço virou **deletar uma linha** ([T1](../features/024-dev-harness/tasks.md)).
2. **`main` sem proteção é escolha ou inércia?** *"É inércia. No momento é só um humano, mas faz
   sentido adicionar PR checks."* → T2 exige PR e os dois checks, com **zero aprovações**, porque
   ninguém aprova a própria PR no GitHub e um repositório de uma pessoa não pode depender disso.
3. **Qual a primeira classe de mudança que se mesclaria sem ler o diff?** O palpite da auditoria foi
   confirmado: **CSS/token** (porte nas duas direções + 119 pares de contraste), **atualização de
   dependência** (com `smoke:install` de 3,4s) e **documentação** (com o teste de frescor da T6). São
   as três classes candidatas a N3, e nada além delas.
