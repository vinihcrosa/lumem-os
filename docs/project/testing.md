# Testes

Fonte de verdade da estratégia de teste. O campo `Tests`/`Gate` de toda task sai daqui.

---

## Matriz de cobertura

| Camada | Teste exigido | Parallel-safe |
|---|---|---|
| `shared/` tipos e schemas | unit | Sim |
| `server/` serviço de git | integration (repo git temporário real) | Sim — cada teste cria seu próprio tmpdir |
| `server/` PTY manager | integration (processo real) | Sim |
| `server/` repositório (Drizzle) | integration (SQLite em arquivo temporário) | Sim |
| `server/` router tRPC | integration | Sim |
| `server/` endpoint WebSocket | integration | Sim |
| `web/` componente | unit (Vitest + Testing Library) | Sim |
| `web/` fluxo de usuário | e2e (Playwright) | **Não** — daemon único, porta única, estado compartilhado |

**Consequência dura:** task cujo `Tests` é `e2e` **não pode** receber `[P]`. O gargalo é a execução do teste, não o código.

---

## Gates

| Gate | Comando | O que garante |
|---|---|---|
| `quick` | `pnpm gate:quick` | Testes afetados pelo trabalho atual (`vitest run --changed HEAD^`) |
| `full` | `pnpm gate:full` | Suíte inteira + e2e |
| `build` | `pnpm gate:build` | Typecheck de tudo (inclusive `e2e/` e os configs) + build do web |

### Por que `--changed HEAD^` e não `--changed`

`vitest run --changed` sem argumento compara contra alterações **não commitadas**. Com a árvore limpa — que é exatamente o estado logo depois de um commit — ele sai com código 0 sem executar teste nenhum. O gate ficava verde por vacuidade.

Pelo mesmo motivo, o `vitest.config.ts` raiz tem `passWithNoTests: false`: uma execução que não casou com nenhum arquivo de teste não é um sucesso.

### Por que `gate:build` não é `tsc --noEmit && turbo build`

O `tsc` puro na raiz não enxergava `e2e/`, `playwright.config.ts` nem o `vitest.config.ts` raiz — nenhum `tsconfig` os incluía, e erro de tipo nesses arquivos passava direto. Hoje existe um `tsconfig.json` na raiz cobrindo os três, e `gate:build` roda `pnpm typecheck`, que é `tsc` na raiz **e** `turbo typecheck` nos pacotes.

---

## Armadilhas já corrigidas

Registro do que já mordeu, pra não voltar:

**Cache do Turborepo mentindo.** Sem `dependsOn: ["^typecheck"]` e sem `globalDependencies: ["tsconfig.base.json"]`, o turbo hasheava só os arquivos do próprio pacote. Renomear um export em `shared` deixava `server:typecheck` em cache hit reportando verde, com o código sem compilar. Dava até pra desligar `strict` no `tsconfig.base.json` sem invalidar nada.

**Testes lendo `process.env`.** `loadConfig()` lia o ambiente direto e os testes mutavam/deletavam variáveis globais. Um desenvolvedor com `LUMEM_HOST` exportado no shell via a suíte vermelha sem ter tocado em nada. Hoje `loadConfig(env)` recebe o mapa por parâmetro e os testes passam literais.

**E2E reusando o daemon do desenvolvedor.** `reuseExistingServer: true` pula o spawn quando já tem algo na porta — e pular o spawn descarta o `env`, incluindo o `LUMEM_STATE_DIR` descartável. O e2e rodava contra o `~/.lumem` real. Hoje o e2e tem portas próprias (`ports.json`) e `reuseExistingServer: false`.

**Constante duplicada sem teste.** A porta 4317 vivia em três arquivos e nenhum teste fixava o default; trocá-la deixava todos os gates verdes e o `pnpm dev` quebrado. Hoje `ports.json` é a fonte para os configs e `constants.test.ts` amarra as constantes de `shared` a ele.

---

## Convenções

- Teste de git usa **repositório temporário real**, nunca mock. `git worktree` tem caso de borda em nome com barra e branch existente que mock nenhum reproduz.
- Cada teste de banco recebe um SQLite em arquivo temporário próprio — é o que sustenta o "parallel-safe" da matriz.
- E2E de agente usa **configuração de fixture**, nunca o `claude` de verdade: senão o teste depende de autenticação, quota e rede.
- Asserção fraca conta como teste faltando. Se dá pra mutar o código e o teste continua verde, o teste não existe.
