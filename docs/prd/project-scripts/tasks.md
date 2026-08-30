# Os scripts do projeto — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** desenho **aprovado** (2026-08-30, `lumem-run-dock.html`, sete quadros). 14 tasks em 4
fases. A ordem é a do risco: a configuração e a execução primeiro, os ganchos depois, a tela por
último — porque a tela é a única parte que já está desenhada e, portanto, a única que não pode
surpreender.

---

## Antes de começar

**O que não trava:** o `PtyManager` (spawn com `cwd`/`env`, scrollback, attach/detach, sobrevive ao
browser), a `session` como registro, o `project.toml` com o `id` dentro, e o parser TOML
(`smol-toml`) já no `package.json` do servidor.

**O que a execução precisa decidir e o PRD não decide:** nada de escopo. As 11 perguntas estão
fechadas em [open-questions.md](open-questions.md) — quatro pelo desenho aprovado, sete como proposta
seguida. Divergir de qualquer uma delas é mudar a resposta lá, não aqui.

**Premissas travadas:**

- **A1** — comando é string única por fase, executada por `$SHELL -lc`. Nada de lista.
- **A2** — o arquivo que vale é o do **checkout**, lido na hora de rodar.
- **A3** — sessão de script é `session`, com `kind = 'script'`. Nenhum caminho paralelo de processo.
- **A4** — run é **único por checkout**: começar um com outro vivo para o anterior.
- **A5** — o daemon **nunca** reescreve o `project.toml` inteiro; ele preserva o que já estava lá,
  como o `project-identity.ts` já faz para o `id`.

---

## Fase 1 — a configuração existe

#### T1: O `[scripts]`, lido

**What**: Um módulo que lê `setup`, `run` e `teardown` do `<checkout>/.lumem/project.toml`.
**Where**: `packages/server/src/scripts/project-scripts.ts` + teste

**Done when**:
- [ ] Sem arquivo, sem `[scripts]`, ou tabela vazia → `{ setup: null, run: null, teardown: null }`.
      **Não é erro**: é o estado normal de todo projeto que entra no Lumem
- [ ] TOML inválido → `DomainError` nomeando o arquivo e a linha, e **não** um `{}` silencioso
- [ ] Valor que não é string, ou string vazia → tratado como ausente, com aviso no log
- [ ] Lê do caminho do **checkout** recebido, não da raiz do projeto (A2) — worktree tem o seu
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): ler a tabela [scripts] do project.toml do checkout`

---

#### T2: O `scripts.get`, por escopo

**What**: `scripts.get({scopeType, scopeId})` devolve os três comandos, o caminho do arquivo e se o
projeto é confiado.
**Where**: `packages/server/src/routers/scripts.ts`, `routers/index.ts` + testes

**Done when**:
- [ ] Resolve o `cwd` pelo `resolveScope` que a `session` já usa — nenhuma segunda resolução de escopo
- [ ] Devolve `{ file, setup, run, teardown, trusted }`; `file` existe mesmo quando o arquivo não
- [ ] `trusted` é falso para projeto **gerenciado** (clonado de URL) que ainda não foi confiado (S11)
- [ ] Escopo que não existe → `NOT_FOUND`, não `{}`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): expor os scripts do projeto por escopo`

---

#### T3: O `scripts.writeFile`, preservando o resto

**What**: Criar ou completar o `[scripts]` do `project.toml` sem tocar no que já está lá.
**Where**: `scripts/project-scripts.ts`, `routers/scripts.ts` + testes

**Done when**:
- [ ] Arquivo inexistente → criado com `[scripts]` e nada mais
- [ ] Arquivo com `id` → o `id` continua **byte a byte** onde estava (A5)
- [ ] `[scripts]` já existente → as chaves passadas são substituídas, as outras ficam
- [ ] Escreve dentro do repositório do usuário, então aparece como mudança comum na aba `Mudanças`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): criar o [scripts] sem reescrever o project.toml`

---

## Fase 2 — a execução é uma sessão

#### T4: `kind = 'script'`

**What**: A sessão de script existe no schema, com subtipo, e o `CHECK` acompanha.
**Where**: `db/schema.ts`, migração `0008_*.sql`, `repositories/session.ts`, `sessions/SessionStore.ts` + testes

**Done when**:
- [ ] `session_kind` passa a aceitar `'script'`; `script_name` aceita `'setup' | 'run' | 'teardown'`
      e é **obrigatório** para `kind='script'` e **nulo** para os outros — nos dois sentidos
- [ ] `kind='script'` implica `transport='pty'` e `agent_config_id IS NULL`
- [ ] A migração roda sobre um banco com dados e não perde linha nenhuma
- [ ] `listByScope` continua devolvendo o que devolvia; script **não** vira aba de sessão
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(db): a sessão de script, com o subtipo no CHECK`

---

#### T5: A porta reservada por checkout

**What**: Um bloco de portas estável por checkout, gravado, exposto como variável de ambiente.
**Where**: `db/schema.ts` + migração, `scripts/ports.ts` + testes

**Done when**:
- [ ] Primeira chamada aloca e **grava**; as seguintes devolvem a mesma porta (S5)
- [ ] A porta é procurada livre no momento da alocação, e a busca não empresta uma porta já
      reservada por outro checkout
- [ ] Faixa configurável por variável de ambiente, com default documentado
- [ ] Remover o checkout libera a reserva
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): reservar um bloco de portas por checkout`

---

#### T6: `scripts.start` e `scripts.stop`

**What**: Rodar `setup` ou `run` como sessão, e parar.
**Where**: `scripts/ScriptRunner.ts`, `routers/scripts.ts` + testes

**Done when**:
- [ ] `start` lê o comando na hora (A2), monta o env do §4 do PRD e spawna via `SessionStore`
- [ ] **Run é único por checkout** (A4): começar com outro vivo para o anterior, e a resposta diz que
      parou
- [ ] `setup` e `run` podem correr ao mesmo tempo — são coisas diferentes
- [ ] Projeto sem o comando pedido → `BLOCKED` com o motivo, não um spawn de string vazia
- [ ] Projeto **não confiado** → `BLOCKED` citando a S11, e o comando vem junto na recusa para a tela
      poder mostrá-lo
- [ ] `stop` mata o processo e deixa o registro `exited`; parar o que não está rodando é no-op
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): rodar e parar os scripts do projeto`

---

#### T7: A porta descoberta, e de onde ela veio

**What**: A porta que o `Abrir :PORTA` usa, com proveniência.
**Where**: `scripts/port-sniff.ts`, `ScriptRunner`, `routers/scripts.ts` + testes

**Done when**:
- [ ] Se o script usou `LUMEM_RUN_PORT`, a porta é essa e a origem é `env` — **sem regex**
- [ ] Senão, regex sobre no máximo os primeiros N KB da saída depois do start (S6); o teto é
      constante nomeada, e a busca para nele
- [ ] Acha `http://127.0.0.1:5173/`, `localhost:3000`, `Listening on port 8080`; **não** acha número
      solto em log de JSON
- [ ] A origem viaja para a tela (`env` | `output` | `null`) — o botão diz de onde tirou o número
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): descobrir a porta do run, e dizer de onde ela veio`

---

#### T8: `scripts.status`

**What**: Uma leitura que responde as duas perguntas do rodapé: o que está vivo, e como foi a última.
**Where**: `routers/scripts.ts` + testes

**Done when**:
- [ ] Devolve, por fase: sessão viva (se há), última execução (código de saída e quando), e a porta
      com a origem
- [ ] A última execução do `setup` sobrevive ao fim do processo — é o histórico que a aba mostra
- [ ] Sem daemon reiniciado no meio: depois de um restart, run vivo vira "parado", porque o processo
      morreu com o daemon e mentir sobre isso é pior que a verdade
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o estado dos scripts de um checkout`

---

## Fase 3 — os ganchos de ciclo de vida

#### T9: Setup na criação da worktree

**What**: Worktree nova já nasce sendo preparada (S3).
**Where**: `routers/worktree.ts`, `ScriptRunner` + testes

**Done when**:
- [ ] Roda **em segundo plano**: a mutação de criar volta na hora, e a worktree é utilizável
- [ ] Falha do setup **não desfaz** a worktree (S4) — ela fica, marcada
- [ ] Projeto sem `setup`, ou não confiado, simplesmente não roda nada — e isso não é erro
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): rodar o setup quando a worktree nasce`

---

#### T10: Teardown na remoção

**What**: O que o checkout deixou de pé morre com ele (S8).
**Where**: `routers/worktree.ts` + testes

**Done when**:
- [ ] Roda antes de apagar, com timeout curto e constante nomeada
- [ ] Falha ou timeout **não impedem** a remoção — worktree que não se apaga por causa de script é
      pior que sujeira
- [ ] Run vivo daquele checkout é parado junto
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): teardown ao remover a worktree`

---

## Fase 4 — a tela

> O desenho está aprovado em `packages/web/prototype/lumem-run-dock.html`. Componente em React só usa
> `var(--token)`.

#### T11: O rodapé, com as três abas

**What**: O componente `RunDock` — abas, ponto de estado, saída, barra de ações.
**Where**: `packages/web/src/components/RunDock.tsx`, `run-dock.css` + testes

**Done when**:
- [ ] Três abas com o ponto de estado **na aba** (verde rodando, vermelho falhou, cinza parado)
- [ ] `Setup` mostra a última execução; `Run` mostra o estado; `Terminal` abre shell e o `＋` outra
- [ ] A saída é o `Terminal` que já existe, anexado por WebSocket — nenhuma segunda implementação
- [ ] Nenhum literal de cor, espaço ou tipografia; o CSS sai do protótipo
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé de execução, com setup, run e terminal`

---

#### T12: O rodapé na coluna, com altura

**What**: Ele entra abaixo da árvore, e a coluna aceita ser mais larga enquanto ele está aberto (S1).
**Where**: `components/CheckoutFiles.tsx`, `hooks/useRunDock.ts`, `right-panel.css` + testes

**Done when**:
- [ ] Irmão do scroll da árvore, não filho: rolar a árvore não leva o terminal junto
- [ ] Altura arrastável, com mínimo, e lembrada como a largura da coluna já é
- [ ] Aberto, o teto de largura da coluna sobe; recolhido, volta
- [ ] Recolhido continua dizendo o que está vivo
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé mora abaixo da árvore, com altura própria`

---

#### T13: Abrir, parar, rodar de novo — e o vazio que ensina

**What**: As ações da barra e o estado sem `[scripts]`.
**Where**: `RunDock.tsx`, `components/NoScripts.tsx` + testes

**Done when**:
- [ ] `Abrir :PORTA` abre `http://127.0.0.1:PORTA`, e **diz de onde veio a porta**
- [ ] `parar` não é botão vermelho cheio (é rotina reversível); `rodar de novo` só onde faz sentido
- [ ] Sem `[scripts]`: o texto pronto, o caminho do arquivo, `criar o arquivo` e `copiar`
- [ ] Projeto não confiado: o comando aparece **antes** de rodar, com `rodar uma vez` e `confiar`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): as ações do rodapé, o vazio e o portão de confiança`

---

#### T14: O run visto de fora

**What**: O sinal fora do rodapé (S1, §9.2 do PRD).
**Where**: `components/SidebarTree.tsx`, `hooks/useScriptStatus.ts` + testes

**Done when**:
- [ ] Worktree com run vivo mostra a marca com a porta, no vocabulário que a sidebar já usa
- [ ] Worktree com setup falho mostra o motivo onde `ausente` já aparece hoje
- [ ] Nenhuma requisição nova por linha: a leitura é compartilhada por chave de cache
- [ ] Gate: `pnpm gate:full`

**Commit**: `feat(web): run de pé e setup falho aparecem fora do rodapé`
