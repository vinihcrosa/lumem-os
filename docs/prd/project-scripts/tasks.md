# Os scripts do projeto — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **14 de 14 entregues.** Desenho aprovado em 2026-08-30 (`lumem-run-dock.html`, sete
quadros) e portado. A ordem foi a do risco: a configuração e a execução primeiro, os ganchos depois, a
tela por último — porque a tela era a única parte já desenhada e, portanto, a única que não podia
surpreender.

As tasks foram entregues em **seis commits**, e não em quatorze: a T2, a T3, a T6, a T7 e a T8 são um
router só e nasceram juntas, porque separar `status` de `start` teria produzido uma leitura sem nada
para ler. O que cada commit fez está na mensagem dele.

**O que a execução achou** está no fim deste arquivo.

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
- [x] Sem arquivo, sem `[scripts]`, ou tabela vazia → `{ setup: null, run: null, teardown: null }`.
      **Não é erro**: é o estado normal de todo projeto que entra no Lumem
- [x] TOML inválido → `DomainError` nomeando o arquivo e a linha, e **não** um `{}` silencioso
- [x] Valor que não é string, ou string vazia → tratado como ausente, com aviso no log
- [x] Lê do caminho do **checkout** recebido, não da raiz do projeto (A2) — worktree tem o seu
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): ler a tabela [scripts] do project.toml do checkout`

---

#### T2: O `scripts.get`, por escopo

**What**: `scripts.get({scopeType, scopeId})` devolve os três comandos, o caminho do arquivo e se o
projeto é confiado.
**Where**: `packages/server/src/routers/scripts.ts`, `routers/index.ts` + testes

**Done when**:
- [x] Resolve o `cwd` pelo `resolveScope` que a `session` já usa — nenhuma segunda resolução de escopo
- [x] Devolve `{ file, setup, run, teardown, trusted }`; `file` existe mesmo quando o arquivo não
- [x] `trusted` é falso para projeto **gerenciado** (clonado de URL) que ainda não foi confiado (S11)
- [x] Escopo que não existe → `NOT_FOUND`, não `{}`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): expor os scripts do projeto por escopo`

---

#### T3: O `scripts.writeFile`, preservando o resto

**What**: Criar ou completar o `[scripts]` do `project.toml` sem tocar no que já está lá.
**Where**: `scripts/project-scripts.ts`, `routers/scripts.ts` + testes

**Done when**:
- [x] Arquivo inexistente → criado com `[scripts]` e nada mais
- [x] Arquivo com `id` → o `id` continua **byte a byte** onde estava (A5)
- [x] `[scripts]` já existente → as chaves passadas são substituídas, as outras ficam
- [x] Escreve dentro do repositório do usuário, então aparece como mudança comum na aba `Mudanças`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): criar o [scripts] sem reescrever o project.toml`

---

## Fase 2 — a execução é uma sessão

#### T4: `kind = 'script'`

**What**: A sessão de script existe no schema, com subtipo, e o `CHECK` acompanha.
**Where**: `db/schema.ts`, migração `0008_*.sql`, `repositories/session.ts`, `sessions/SessionStore.ts` + testes

**Done when**:
- [x] `session_kind` passa a aceitar `'script'`; `script_name` aceita `'setup' | 'run' | 'teardown'`
      e é **obrigatório** para `kind='script'` e **nulo** para os outros — nos dois sentidos
- [x] `kind='script'` implica `transport='pty'` e `agent_config_id IS NULL`
- [x] A migração roda sobre um banco com dados e não perde linha nenhuma
- [x] `listByScope` continua devolvendo o que devolvia; script **não** vira aba de sessão
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(db): a sessão de script, com o subtipo no CHECK`

---

#### T5: A porta reservada por checkout

**What**: Um bloco de portas estável por checkout, gravado, exposto como variável de ambiente.
**Where**: `db/schema.ts` + migração, `scripts/ports.ts` + testes

**Done when**:
- [x] Primeira chamada aloca e **grava**; as seguintes devolvem a mesma porta (S5)
- [x] A porta é procurada livre no momento da alocação, e a busca não empresta uma porta já
      reservada por outro checkout
- [x] Faixa configurável por variável de ambiente, com default documentado
- [x] Remover o checkout libera a reserva
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): reservar um bloco de portas por checkout`

---

#### T6: `scripts.start` e `scripts.stop`

**What**: Rodar `setup` ou `run` como sessão, e parar.
**Where**: `scripts/ScriptRunner.ts`, `routers/scripts.ts` + testes

**Done when**:
- [x] `start` lê o comando na hora (A2), monta o env do §4 do PRD e spawna via `SessionStore`
- [x] **Run é único por checkout** (A4): começar com outro vivo para o anterior, e a resposta diz que
      parou
- [x] `setup` e `run` podem correr ao mesmo tempo — são coisas diferentes
- [x] Projeto sem o comando pedido → `BLOCKED` com o motivo, não um spawn de string vazia
- [x] Projeto **não confiado** → `BLOCKED` citando a S11, e o comando vem junto na recusa para a tela
      poder mostrá-lo
- [x] `stop` mata o processo e deixa o registro `exited`; parar o que não está rodando é no-op
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): rodar e parar os scripts do projeto`

---

#### T7: A porta descoberta, e de onde ela veio

**What**: A porta que o `Abrir :PORTA` usa, com proveniência.
**Where**: `scripts/port-sniff.ts`, `ScriptRunner`, `routers/scripts.ts` + testes

**Done when**:
- [x] Se o script usou `LUMEM_RUN_PORT`, a porta é essa e a origem é `env` — **sem regex**
- [x] Senão, regex sobre no máximo os primeiros N KB da saída depois do start (S6); o teto é
      constante nomeada, e a busca para nele
- [x] Acha `http://127.0.0.1:5173/`, `localhost:3000`, `Listening on port 8080`; **não** acha número
      solto em log de JSON
- [x] A origem viaja para a tela (`env` | `output` | `null`) — o botão diz de onde tirou o número
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): descobrir a porta do run, e dizer de onde ela veio`

---

#### T8: `scripts.status`

**What**: Uma leitura que responde as duas perguntas do rodapé: o que está vivo, e como foi a última.
**Where**: `routers/scripts.ts` + testes

**Done when**:
- [x] Devolve, por fase: sessão viva (se há), última execução (código de saída e quando), e a porta
      com a origem
- [x] A última execução do `setup` sobrevive ao fim do processo — é o histórico que a aba mostra
- [x] Sem daemon reiniciado no meio: depois de um restart, run vivo vira "parado", porque o processo
      morreu com o daemon e mentir sobre isso é pior que a verdade
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o estado dos scripts de um checkout`

---

## Fase 3 — os ganchos de ciclo de vida

#### T9: Setup na criação da worktree

**What**: Worktree nova já nasce sendo preparada (S3).
**Where**: `routers/worktree.ts`, `ScriptRunner` + testes

**Done when**:
- [x] Roda **em segundo plano**: a mutação de criar volta na hora, e a worktree é utilizável
- [x] Falha do setup **não desfaz** a worktree (S4) — ela fica, marcada
- [x] Projeto sem `setup`, ou não confiado, simplesmente não roda nada — e isso não é erro
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): rodar o setup quando a worktree nasce`

---

#### T10: Teardown na remoção

**What**: O que o checkout deixou de pé morre com ele (S8).
**Where**: `routers/worktree.ts` + testes

**Done when**:
- [x] Roda antes de apagar, com timeout curto e constante nomeada
- [x] Falha ou timeout **não impedem** a remoção — worktree que não se apaga por causa de script é
      pior que sujeira
- [x] Run vivo daquele checkout é parado junto
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): teardown ao remover a worktree`

---

## Fase 4 — a tela

> O desenho está aprovado em `packages/web/prototype/lumem-run-dock.html`. Componente em React só usa
> `var(--token)`.

#### T11: O rodapé, com as três abas

**What**: O componente `RunDock` — abas, ponto de estado, saída, barra de ações.
**Where**: `packages/web/src/components/RunDock.tsx`, `run-dock.css` + testes

**Done when**:
- [x] Três abas com o ponto de estado **na aba** (verde rodando, vermelho falhou, cinza parado)
- [x] `Setup` mostra a última execução; `Run` mostra o estado; `Terminal` abre shell e o `＋` outra
- [x] A saída é o `Terminal` que já existe, anexado por WebSocket — nenhuma segunda implementação
- [x] Nenhum literal de cor, espaço ou tipografia; o CSS sai do protótipo
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé de execução, com setup, run e terminal`

---

#### T12: O rodapé na coluna, com altura

**What**: Ele entra abaixo da árvore, e a coluna aceita ser mais larga enquanto ele está aberto (S1).
**Where**: `components/CheckoutFiles.tsx`, `hooks/useRunDock.ts`, `right-panel.css` + testes

**Done when**:
- [x] Irmão do scroll da árvore, não filho: rolar a árvore não leva o terminal junto
- [x] Altura arrastável, com mínimo, e lembrada como a largura da coluna já é
- [x] Aberto, o teto de largura da coluna sobe; recolhido, volta
- [x] Recolhido continua dizendo o que está vivo
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o rodapé mora abaixo da árvore, com altura própria`

---

#### T13: Abrir, parar, rodar de novo — e o vazio que ensina

**What**: As ações da barra e o estado sem `[scripts]`.
**Where**: `RunDock.tsx`, `components/NoScripts.tsx` + testes

**Done when**:
- [x] `Abrir :PORTA` abre `http://127.0.0.1:PORTA`, e **diz de onde veio a porta**
- [x] `parar` não é botão vermelho cheio (é rotina reversível); `rodar de novo` só onde faz sentido
- [x] Sem `[scripts]`: o caminho do arquivo, o exemplo para copiar, e **`pedir para o agente criar`**
      — que abre uma conversa nova já com o pedido dentro (as três fases, o que cada uma significa, e
      a instrução de ler o repositório antes de inventar). Desabilitado com o motivo quando não há
      agente ACP conectado
- [x] Projeto não confiado: o comando aparece **antes** de rodar, com `rodar uma vez` e `confiar`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): as ações do rodapé, o vazio e o portão de confiança`

---

#### T14: O run visto de fora

**What**: O sinal fora do rodapé (S1, §9.2 do PRD).
**Where**: `components/SidebarTree.tsx`, `hooks/useScriptStatus.ts` + testes

**Done when**:
- [x] Worktree com run vivo mostra a marca com a porta, no vocabulário que a sidebar já usa
- [x] Worktree com setup falho mostra o motivo onde `ausente` já aparece hoje
- [x] Nenhuma requisição nova por linha: a leitura é compartilhada por chave de cache
- [x] Gate: `pnpm gate:full`

**Commit**: `feat(web): run de pé e setup falho aparecem fora do rodapé`


---

## O que a execução achou

Sete coisas que o plano não previa. As três primeiras são defeitos que um teste pegou; as outras
quatro são decisões que a implementação cobrou.

| O quê | Onde | O que mudou |
|---|---|---|
| **`NULL IN (…)` não recusa nada** | `db/schema.ts` | Um CHECK só falha quando avalia para FALSE, e `NULL IN ('setup', …)` avalia para NULL. `kind='script'` sem fase passava. O `IS NOT NULL` explícito não é redundância — é o que faz o CHECK existir |
| **A migração lia uma coluna que ainda não existe** | `drizzle/0008` | O gerador escreveu `SELECT "script_name"` da tabela **de origem**. É a mesma armadilha que o `migrations.test.ts` documenta desde a 0001, e só o teste de upgrade a pega |
| **`printenv` para na primeira variável vazia** | teste da T6 | O teste do ambiente media a ordem dos argumentos em vez do ambiente. Virou `echo` linha a linha |
| **Worktree nova é checkout do que está commitado** | teste da T9 | Um `[scripts]` que só existe na árvore de trabalho não chega na worktree nova. É consequência direta da S7, e significa que o gancho de criação **só funciona para quem versionou os scripts** — que é a promessa da feature, agora provada |
| **Sessão de script não pode bloquear a remoção** | `routers/worktree.ts` | A regra de "encerre as sessões antes" existe para o que é **seu**; o `run` é do daemon. Bloquear por causa dele mandaria a pessoa caçar um processo que ela não abriu |
| **O tipo do status não atravessa como está escrito** | `hooks/useScripts.ts` | Sem transformer, um `Date` do daemon chega como texto. O tipo é derivado do **cliente**, não importado do servidor — importar prometeria um `Date` que nunca chega. (E `@trpc/server` não é dependência do web de propósito) |
| **Ler o rodapé não pode alocar porta** | `ScriptRunner.status` | A tela pergunta muito mais vezes do que alguém roda. `findReservedPort` existe separado de `reservePort` por isso: abrir o rodapé de um checkout que nunca vai rodar nada não consome bloco |

### E três que só apareceram rodando o produto

Nenhuma delas foi achada por teste. As três vieram de abrir o Lumem, apontar para este repositório e
clicar — que é o que o [testing.md](../../project/testing.md) chama de "o que o portão não prova".

| O quê | O que estava errado | O que mudou |
|---|---|---|
| **A sessão de script se apresentava como shell** | A lista de sessões do projeto mostrava `shell /bin/zsh` para toda execução: o tipo errado e o mecanismo no lugar da intenção | A linha guarda o comando **declarado** (`recordedCommand`), e o painel rotula pela fase, com glifo próprio |
| **A saída sumida virava um retângulo preto** | O scrollback vive na memória do daemon; reiniciar o daemon apaga a saída e deixa a linha do banco. A tela mostrava um terminal vazio, que é a pior forma de dizer "isto não existe mais" | `outputAvailable` viaja no status, e a aba escreve o motivo |
| **`[scripts]` inválido travava a tela em "lendo o checkout…"** | Achado pelo e2e, não pelo browser — mas é o mesmo tipo de buraco: o daemon recusava com um motivo e a tela não sabia mostrá-lo | A aba mostra o erro do daemon |

### O que veio depois, pelo uso

**A aba `Testes`, e a altura do rodapé.** Duas coisas que só o uso mostra:

| O quê | Por quê |
|---|---|
| **`test` virou a quarta fase** do `[scripts]` (migração `0011`) e a quarta aba do rodapé | rodar a suíte é a coisa que mais se repete num dia, e estava fora do produto: quem quisesse testar abria um terminal e digitava o comando de novo. Ela termina, como o `setup` — o que interessa dela é o código de saída, e é por isso que o comando declarado não pode ser *watch* |
| **O rodapé nasce com metade da janela**, e não com 256px | fixo, ele nascia como uma tira colada no pé da tela: a saída de um `pnpm dev` mal cabia, e a primeira coisa que se fazia ao abrir era arrastar. A altura agora é calculada da janela — uma constante estaria errada nas duas pontas, apertada no monitor grande e grande demais no notebook — e o teto deixa a árvore continuar existindo |

O hash de confiança (S11) é sobre o **conjunto** das fases, então ele mudou junto: aprovar um
`[scripts]` sem `test` e ganhar um `test` de brinde é exatamente o buraco que a S11 fecha, e há teste
para isso.


**O vazio pedia para o produto escrever o arquivo, e o produto não sabe o comando.** A primeira versão
tinha um botão `criar o arquivo` que gravava `run = "pnpm dev"` — certo neste repositório e errado na
maioria dos outros. Ele virou **`pedir para o agente criar`**: abre uma conversa nova no checkout e
manda o pedido sozinha. O `scripts.writeFile` do daemon continua existindo como caminho de API — é o
escritor que preserva o resto do arquivo —, mas saiu do cliente.

Isso trouxe uma peça nova para a conversa: `initialPrompt`, uma primeira mensagem que ela envia **uma
vez**, depois de anexar, e nunca numa sessão encerrada. A trava de "uma vez" custou um teste que
sobreviveu a duas mutações antes de virar prova: `waitFor` acerta na primeira checagem — quando o
contador ainda é 1 — e passa mesmo com o segundo envio saindo logo depois. Com `act` drenando os
efeitos, a mutação morre.

E uma quarta, que é sobre o teste e não sobre o produto: a correção da segunda linha
**apareceu duas vezes** na tela — uma delas dentro da linha de estado, empurrando o chip de saída
para fora — e o teste passou verde, porque ele só perguntava *"a frase aparece?"*. Ele agora conta os
`.dock__idle`, exige que nenhum esteja dentro do `.dock__state` e cobra o chip ao lado; a mutação foi
reintroduzida para confirmar que ele falha. **Asserção de existência não vê duplicata**, e duplicata
foi metade dos defeitos de tela desta feature.

### O que o portão não prova

- **A regex de porta contra servidores de verdade.** Ela foi testada contra as linhas do Vite, do
  Next e de um log JSON, escritas à mão. O primeiro projeto com um formato exótico vai revelar o que
  falta — e o botão diz de onde tirou o número justamente para esse dia;
- **O `teardown` derrubando algo de verdade** (container, volume). O teste prova que ele roda, que o
  tempo tem teto e que a remoção continua; não prova que alguém escreveu um teardown útil;
- **Duas instâncias do Lumem na mesma faixa de portas.** A reserva é única dentro de um banco, e dois
  daemons têm dois bancos.
