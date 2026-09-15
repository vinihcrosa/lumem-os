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
| `server/` router tRPC | integration (caller) | Sim |
| `server/` scan do portão de memória | unit puro — regex, sem disco e sem banco | Sim |
| `server/` portão e WAL de memória | integration (`~/.lumem` temporário, git real) | Sim — cada teste cria seu próprio state dir |
| `server/` regra de **transporte** — limite de corpo, GET vs POST, status | integration sobre HTTP (`app.inject`) | Sim — o caller é cego a estas três |
| `server/` endpoint WebSocket | integration | Sim |
| `server/` transporte **ACP** | integration com **agente falso** no outro lado do pipe — o SDK nos dois lados, wire ndjson de verdade, **zero token** | Sim |
| **conectar o segundo agente pela tela** | e2e `second-agent.spec.ts`, no caminho do `＋`: catálogo → handshake → configuração criada, **sem rede**. O painel só instala quando o pré-voo não acha o binário, e o shim `codex-acp` está no `PATH` do daemon — sem isso o teste seriam 300 MB de `npm install` por execução | **Não** |
| **a conta por agente**, da gravação à tela | e2e `second-agent.spec.ts`: dois turnos de dois agentes → `session_usage` com `agent_config_id` → `usage.byProjectAndAgent` → a sub-linha no consumo do workspace. Cada peça tem teste de unidade; **a corrente não tinha**, e ela atravessa gravação, migração, consulta e tela | **Não** |
| **dois agentes na mesma worktree** | e2e `second-agent.spec.ts`: os dois agentes são o **mesmo** fake, o segundo com `LUMEM_FAKE_PROFILE=codex`, então continua zero token. Prova o que só o navegador responde — cada aba nomeia o **seu** agente (as abas escondidas ficam montadas, então o locator é escopado na que está na frente) e o agente que não informa limite não desenha limite nem custo zero | **Não** |
| **conversa ACP** de ponta a ponta | e2e contra `e2e/support/fake-acp-agent.mjs` — agente ACP de verdade sobre stdio de verdade, **zero token**. Exercita o turno inteiro: mensagem, ferramenta, permissão, plano, uso, comandos e o terminal que o agente pede. É onde vivem as medidas que jsdom não faz, porque jsdom não tem layout | **Não** |
| `server/` **segundo adaptador**, perfil medido | integration com o perfil `codexLikeScript()` do agente falso (`codex-like.test.ts`), **zero token**: `usage` sem `rateLimit` nem `cost`, comandos só por notificação, `mode` nas duas listas, e os dois casos que o Codex **não** é — sem `usage` nenhum e sem `loadSession`. Ele existe porque a fase 0 mediu que o daemon **já** aguentava, e o que passa sem teste é o que volta a quebrar | Sim |
| `server/` handshake do **adaptador real** | integration **marcado**: pulado quando `claude-agent-acp` não está no PATH. Para em `initialize` + `session/new`, que o spike mediu em zero token. Desde o `onboarding`, ele também confere o **`agentInfo`** — é onde a versão pinada vem, e uma release do adaptador que parasse de mandá-la viraria um `null` silencioso | Sim |
| `server/` **pré-voo da máquina** e detecção de binário | unit com `PATH` e executor de processo **fabricados**: os casos que interessam — git 2.29, git ausente, `--version` que trava, `statfs` que estoura — não existem numa máquina que funciona | Sim |
| `server/` **instalação do adaptador** | unit com `npm` dublado: os casos que interessam — npm ausente, registry inalcançável, npm saindo 0 sem escrever o binário — são os que uma rede que funciona não produz. **Nenhum `npm install` de verdade roda na suíte** | Sim |
| `server/` **login do agente** | integration com agente falso: roda o comando que o adaptador nomeou e **recusa** id que ele não ofereceu. É a guarda que impede o cliente de mandar uma linha de comando | Sim |
| `server/` **login por chamada** (`authenticate`) | integration com o perfil codex-like: o método vem do handshake, a URL e o código chegam **no meio** da espera, cancelar mata o processo, e o login é **conferido** com um `session/new` em vez de acreditado. Dois testes são sobre segredo e varrem o disco: a chave não fica em arquivo nenhum do `stateDir`, e não volta em resposta nem em mensagem de erro — nem quando o adaptador a ecoa na frase dele | Sim |
| `server/` **sonda ACP** | integration com agente falso, **zero token** (não há `session/prompt` no caminho). O teste com dentes é o do processo: sem o `kill` no `finally`, o caminho em que `session/new` recusa deixa adaptador órfão | Sim |
| `server/` **transcrição em disco** | integration com SQLite em arquivo temporário — um banco por sessão, e o teste que reabre o arquivo com um store novo é o que prova que a conversa sobrevive ao processo | Sim — cada teste cria seu próprio tmpdir |
| `server/` **passe de manutenção** de transcrição | integration com filesystem de verdade: comprime a fria, poupa a viva, apaga a órfã. Um dos testes exige que o arquivo **encolha de fato** — sem isso a decisão de comprimir é cerimônia | Sim |
| **configuração de agente pela tela** | e2e que não toca na API para nada: workspace, projeto, agente e sessão, tudo pelo formulário. É a única prova que interessa, porque o resto da suíte cria a configuração pela API — que é justamente o caminho que a fase 6 existe para tornar dispensável | **Não** |
| `server/` **tarefa como entidade** | integration em três camadas, e as três provam coisas diferentes: o **banco** recusa os estados que nenhum leitor sabe interpretar (`db.test.ts`); o **router** prova a ordem da lista com os quatro estados misturados, porque ordem é decisão de produto e decisão de produto sem teste volta a ser opinião; e a **migração** prova que apagar tarefa anula o ponteiro da sessão em vez de ser recusado — o `drizzle-kit` perde a ação do estrangeiro no `ALTER TABLE`, e sem esse caso a coluna nasceria `NO ACTION` | Sim |
| `server/` **`in_progress` derivado** | integration com agente falso, **zero token**: o primeiro prompt de uma sessão ligada à tarefa move a seta, o segundo não reescreve, e `review`/`proposed` não são desfeitos. O último caso do arquivo é a **mutação**: sem o observador, a tarefa não anda | Sim |
| `server/` **porta de tarefa do agente** | integration sobre HTTP (`app.inject`): a regra do §3.2 nos dois sentidos, o orçamento **por tarefa** (duas sessões da mesma tarefa dividem o bolso), e um caso que não é de comportamento — `/tasks` está no `DAEMON_PREFIXES`. Sem ele, a rota cai no fallback da SPA e o agente recebe `<!doctype html>` onde esperava texto, **só no pacote instalado** | Sim |
| **tarefa na tela**, de ponta a ponta | e2e `tasks.spec.ts`, **zero token e zero rede**: a lista com o estado como primeiro item, o `done` que só uma pessoa dá, e a porta HTTP do agente com a proveniência aparecendo na linha | **Não** |
| **primeiro acesso** de ponta a ponta | e2e `00-onboarding.spec.ts`, e o prefixo `00-` é estrutural: é o único spec que precisa de daemon **sem workspace**, e qualquer outro spec rodando antes cria um. Ele sai de `~/.lumem` vazio e chega a um turno respondido **sem tocar a API** em nenhum passo — que é o caminho que a feature existe para tornar dispensável, e a razão pela qual o resto da suíte pode continuar usando. O adaptador é um shim com o nome `claude-agent-acp` no PATH do daemon, porque **detectar** é parte do que está sendo provado | **Não** |
| **memória do workspace** de ponta a ponta | e2e `memory.spec.ts`. O buraco que a integração das duas pilhas revelou: a feature tinha ~357 testes de unidade e integração e **nenhum** e2e, e a tela dela é a terceira aba do painel direito. A API entra como **setup** e é a única forma honesta — uma proposta nasce de ator não-humano escrevendo para cima (Q27), e não existe gesto de tela que produza uma. O que está sob teste é a revisão, e o que prova a aprovação é o **daemon**: a proposta sai de pendente e a memória passa a existir no acervo | **Não** |
| **painel de login** de ponta a ponta | e2e contra o adaptador de fixture: a versão vem do handshake, não existe botão `sair` porque o adaptador não declara `auth.logout`, e a gaveta `avançado` mostra o comando como fato. O clique `nenhum → conectado` **não** está aqui, e o spec diz por quê — chegar nesse estado no meio da suíte exige remover configuração que pode estar em uso | **Não** |
| **retomada de conversa** de ponta a ponta | e2e em duas metades, porque a afirmação tem duas. O **reinício** só dá contra daemon que a suíte controla (o Playwright não reinicia o que ele gerencia) e é conduzido pela API, que o §7 do PRD exige poder fazer tudo que o cliente faz; a **tela** — conversa encerrada em leitura e o botão que retoma — é a metade do browser, contra o daemon compartilhado. Ambas com o agente falso, **zero token** | **Não** |
| `server/` CLI | integration **in-process** — a função (`runMemoryCli`) recebe `env`, `out` e `err` por parâmetro | Sim — nada de `process.env` nem de captura de `process.stdout` |
| `web/` componente | unit (Vitest + Testing Library) | Sim |
| `web/` **porte de CSS** | unit que lê os arquivos, nas **duas direções**: classe pedida por componente que não existe no stylesheet, e classe definida que ninguém pede. jsdom não aplica stylesheet, então é a única forma de ver regra faltando. A lista de componentes é `readdirSync`, não array — array deixa de estar completo no dia em que alguém acrescenta tela | Sim |
| `web/` tokens e paleta | unit — roda os pares de contraste declarados (119 desde a barra da PR, que não trouxe token novo e trouxe doze combinações), a escada de cinzas, e confere que o `tokens.ts` commitado é o que a derivação produz do `tokens.css` | Sim |
| `server/` **scripts do projeto** | integration pelo caller, com repositório git de verdade e processo de verdade: o comando declarado no `project.toml` roda, escreve no disco do checkout e recebe as variáveis do §4. Nada de dublê — a coisa sob teste é justamente "isto vira processo" | Sim — cada teste faz seu repositório e seu state dir |
| **rodapé de execução** de ponta a ponta | e2e `run-dock.spec.ts`, com um repositório de fixture que traz `[scripts]` **commitado** — a única forma de ele existir numa worktree recém-criada. Prova as duas coisas que só o navegador responde: o `run` sobe pela tela e o botão abre **a mesma porta** que a saída anunciou, e a worktree nova nasce preparada sem ninguém pedir | **Não** |
| **artefato publicado** — o bundle do daemon | integration que **roda o bundle**: sobe `dist/server/main.mjs` num state dir temporário, chama tRPC e depois **abre o SQLite para ler o esquema**. Ler o esquema é o ponto: um bundle na profundidade errada sobe feliz, com um banco sem tabela nenhuma, e só quebra na primeira query. Mais um teste que lê os `import` do bundle e falha se aparecer uma terceira dependência bare | Sim — cada teste faz seu state dir |
| **artefato publicado** — o tarball | integration que roda `pnpm build` e depois `npm pack --dry-run`: `bin/`, `dist/server`, `dist/web` e o `drizzle/` **inteiro** (migração faltando para o banco do usuário na versão que o tarball levou). Constrói antes de olhar, senão mede o que sobrou de um build anterior | Sim |
| **produto instalado** | `pnpm smoke:install` — **não é vitest**. Empacota, instala num prefixo global descartável, sobe o binário e pede a página e o `/trpc/health`. É o único lugar onde `require` dinâmico de dependência nova, prebuild nativo ausente e arquivo fora do `files` aparecem antes da máquina de outra pessoa | Sim |
| **produto servido pelo daemon** | e2e, projeto `production` do playwright: um processo, sem vite, contra `dist`. Quatro specs sobre o que só a produção muda — fallback de SPA com reload, `/trpc` sob `Accept: text/html`, e o `cache-control` do asset com hash | **Não** |
| `server/` **adaptador de host de git** | unit com o executor **dublado** e fixtures capturadas de uma execução real. É a inversão declarada da regra do git: git nunca é dublado porque `git worktree` tem comportamento que nenhum dublê reproduz; o `gh` **tem** que ser, porque fala com a rede e com a conta de quem roda a suíte. **Nenhum teste da suíte executa o `gh`** | Sim |
| **barra da pull request** de ponta a ponta | e2e `pull-request.spec.ts`, com um `gh` **falso** num diretório na frente do `PATH` do daemon: processo de verdade, `argv` de verdade, saída de verdade, zero rede. Cada teste tem a **própria branch** — o daemon guarda um instantâneo por projeto, e os specs compartilham um daemon | **Não** |
| **menus do composer** — geometria | e2e `composer-menus.spec.ts`, com o fake em `LUMEM_FAKE_MANY_MODELS=1`: vinte modelos, zero token. A pergunta **não** é `toBeVisible` — um elemento recortado por um ancestral continua no DOM, com caixa, e o matcher continua satisfeito. É `document.elementFromPoint` no meio do elemento, que é o que o mouse responde. Foi assim que se descobriu que o menu de `/comandos` era **invisível por inteiro** há três features, tendo teste de componente o tempo todo | **Não** |
| **o quadro** — as sete colunas, o arrasto e o selo | e2e `board.spec.ts`, **zero token**: o agente é falso e o selo é lido pelo `task.board`. A janela em que o turno está **em voo** é o pedido de permissão — o fake para ali e espera —, porque um turno que abre e fecha em milissegundos não é observável, e o caso viraria um `sleep` disfarçado. O `beforeEach` limpa o quadro com **duas** portas (`remove` recusa tarefa que teve sessão, `dropped` sai do quadro): num quadro, estado de um caso vira *"quatro na To-Do"* no seguinte | **Não** |
| **o selo é derivado**, e não guardado | o par do §12 da [`028`](../features/028-autonomous-orchestration/prd.md), no `board.spec.ts`: o turno some da lista do `AcpManager` e o selo volta para `manual` **na leitura seguinte, sem nenhuma escrita** — e o cartão não volta de coluna. Conferido por mutação: guardar o selo derruba o caso | **Não** |
| **o teto do workspace** | e2e `budget.spec.ts`, **zero token**: o teto é conferido **antes** do `session/prompt`, então o agente falso nem precisa responder — o pedido de permissão aparecer **é** a prova de que o turno passou do portão. Teto de **zero turno** é o caminho mais curto até o aviso e não depende de nenhum consumo gravado; sem isso o caso testaria o contador em vez do portão | **Não** |
| **o parecer do revisor** de ponta a ponta | e2e `conveyor-review.spec.ts`, **zero token** e daemon próprio: o agente falso lê **a porta do parecer no próprio prompt** — não uma URL passada por variável — e posta lá o que o spec mandou. Quatro perguntas: as quatro setas andam sem ninguém clicar; um `bloqueia` que o daemon **reproduz** devolve o cartão ao implementador; um que não reproduz **não** segura; e um `anota` avança o cartão e **aparece na PR**, contra o `gh` falso do `PATH`. Ele achou três defeitos de produção que nenhum teste de unidade pegaria | **Não** |
| `web/` fluxo de usuário | e2e (Playwright) | **Não** — daemon único, porta única, estado compartilhado |
| **a própria documentação** | `scripts/check-docs.test.ts` — 21 testes sobre fixtures mais **um que roda o checador contra a árvore de verdade**, e é esse que é o gate. Link relativo resolve, âncora de heading resolve, e o `**Status:**` de cada feature está na gramática fechada e concorda com o `tasks.md` da mesma pasta | Sim |

**Consequência dura:** task cujo `Tests` é `e2e` **não pode** receber `[P]`. O gargalo é a execução do teste, não o código.

---

## Gates

| Gate | Comando | O que garante |
|---|---|---|
| `quick` | `pnpm gate:quick` | Testes afetados pelo trabalho atual |
| `full` | `pnpm gate:full` | Suíte inteira + e2e |
| `build` | `pnpm gate:build` | Typecheck de todo TS do repositório + build do web **e do bundle do daemon** |
| `docs` | `pnpm docs:check` | Link, âncora e `**Status:**` da documentação. Já roda dentro do `gate:full` pelo `check-docs.test.ts`; o comando existe para rodar em 200 ms sem a suíte |
| `smoke` | `pnpm smoke:install` | O pacote publicado instala num prefixo limpo e sobe. Não faz parte dos três gates de todo dia: roda no release, e à mão antes de publicar |

### Na PR, os mesmos gates

`.github/workflows/ci.yml` roda em **toda PR, contra qualquer branch**, em dois jobs paralelos: `checks` (`gate:build` e a suíte unit/integration) e `e2e` (Playwright com chromium). São os mesmos comandos da máquina, na mesma ordem — se passou aqui e falhou lá, a diferença está no ambiente, não no critério.

Duas coisas que o runner precisa e a máquina de quem desenvolve já tem:

- **Identidade do git.** A suíte commita dentro dos repositórios de fixture — inclusive de dentro de um terminal, no spec da coluna de arquivos. Sem `user.name`, o `git commit` recusa.
- **O navegador.** Só o chromium, que é o único projeto do `playwright.config.ts`.

**O filtro de branch já mordeu, e a mordida é silenciosa.** Enquanto o gatilho era `branches: [main]`, PR encadeada — feature que sai de outra feature ainda não mergeada — não disparava CI nenhum. Ausência de check não aparece como vermelho; aparece como nada, e `gh pr checks` responde "no checks reported" para quem for procurar. A PR do `file-editor` foi aberta assim: 50 commits de código que escreve em disco, 961 testes verdes no macOS, **zero execuções em Linux** — justamente onde três dos defeitos históricos desta base apareceram, e onde um teste de guarda de caminho se auto-pula por o filesystem ser sensível a caixa.

Hoje o gatilho é `on: pull_request`, sem filtro. PR é PR.

Falha guarda `playwright-report/` e `test-results/` como artefato por 7 dias: o config já grava trace em `retain-on-failure`, e sem subir isso o rastro morre com o runner.

**O CI achou três defeitos de teste na primeira execução, nenhum de produto** — todos escondidos por o desenvolvimento acontecer só no macOS:

| O quê | Por que ninguém via |
|---|---|
| **A suíte gravava no `~/.lumem` de verdade.** `createTestCaller()` chamava `loadConfig({})`, que resolve o `stateDir` para o estado real da máquina — e `worktree.create` cria worktree dentro de `worktreesDir`. Vinte e sete diretórios `lumem-git-*` foram encontrados no estado real de quem escreveu isto, cada um com uma worktree `externa` órfã cujo repositório de origem era um tmpdir que já não existia | Porque nada falha. O teste passa, a asserção é sobre o retorno, e o efeito colateral fica num diretório que ninguém abre. O banco já era descartável desde sempre; o **diretório** não era, e a diferença passou anos sem ser notada. Agora todo caller nasce com um `stateDir` de mentira, e `caller.test.ts` é a guarda que impede desfazer isso sem ver |

| O quê | Por que passava no macOS |
|---|---|
| `PtyManager` assertava buffer vazio ao spawnar binário inexistente | O Linux escreve `execvp(3) failed.` no PTY; o macOS não escreve nada |
| `execGit` corria `git log --all` contra um orçamento de 1ms | No Linux o comando termina antes do timer, e o teste falha perguntando por que um comando travado respondeu. Hoje usa `hash-object --stdin`, que bloqueia de verdade |
| `startDaemon` sinalizava só o `pnpm`, não o daemon | No Linux o daemon sobrevivia ao `stop`, a porta seguia ocupada e o teste de reinício lia o estado de um processo que nunca reiniciou. Hoje o filho tem grupo próprio e o SIGTERM vai para o grupo |

Mais um de produto-adjacente: o vite escutava no default `localhost`, que num runner com IPv6 resolve para `::1` — e o Playwright pede `127.0.0.1`. Hoje o dev server declara o endereço.

### O SonarQube fica ao lado do CI, e não dentro dele

`.github/workflows/sonarqube.yml` roda nos mesmos gatilhos — **toda PR, sem filtro de branch**, pelo
mesmo motivo do `ci.yml` — e num workflow **separado**. Os dois respondem perguntas diferentes e
falham por motivos diferentes: o `ci.yml` diz *"isto funciona"* e é o portão de merge; o Sonar diz
*"isto é sustentável"*, e depende de um serviço de terceiro e de um segredo. Juntos, uma
indisponibilidade do SonarQube apareceria como a suíte quebrada.

Ele precisa de **`fetch-depth: 0`**, e isso não é detalhe de checkout: sem histórico o Sonar não tem
blame, e *"código novo"* — que é onde o quality gate morde — passa a ser o arquivo inteiro.

**O `sonar-project.properties` exclui quatro coisas, e cada exclusão é sobre achado inacionável:**

| Fora | Por quê |
|---|---|
| `packages/web/prototype/**`, `tokens.css`, `tokens.ts` | **cópia e derivado do Open Design.** A regra de design deste repositório diz que nenhum dos três se edita à mão — analisar cópia é pedir para alguém consertar um arquivo que o próximo `design:sync` sobrescreve |
| `packages/server/drizzle/**` | migração é **imutável por definição**: uma já aplicada não se edita, se sucede. Aviso de estilo numa migração de três meses atrás não tem conserto possível |
| `dist/`, `.turbo/`, `packages/cli/bin|drizzle` | saída de build. Estão no `.gitignore`, então o CI nem as vê; a linha existe para o run **local** dar o mesmo resultado que o do runner |
| — | e o que **não** é exclusão: `sonar.tests` marca a suíte como suíte. Ela é colocada (`foo.ts` ao lado de `foo.test.ts`), e sem isso o Sonar cobraria dela as regras erradas — duplicação, que todo arranjo de teste repete, e complexidade cognitiva, que uma tabela de casos tem por desenho |

**O Sonar analisa cobertura, e o `include` é a decisão inteira.** `pnpm test:coverage` escreve
`coverage/lcov.info`, e o workflow o gera **ele mesmo** antes do scan — não o recebe do `ci.yml`. O
caminho do artefato entre workflows foi descartado por dois motivos medidos, não por preferência:
`actions/download-artifact` não cruza *workflow run*, e os dois disparam em paralelo no mesmo commit;
fazer esperar pede `workflow_run`, que roda no contexto da branch default e **quebra a decoração de
PR**, que é o ponto do workflow. O preço é uma execução extra da suíte por PR; o que ela compra é a
independência que a seção acima justifica.

O que decide o número é `coverage.include` no `vitest.config.ts`, e o default do provider é uma
armadilha. O `v8` instrumenta **tudo que o processo carrega**, e a suíte carrega `packages/web/dist/assets`
e `packages/cli/dist/web/assets` — 186 376 linhas de bundle minificado, 0% cobertas por definição.
Rodado sem `include`, o relatório sai assim:

```
Statements : 12.05% ( 26664/221198 )
Branches   : 88.06% (   7743/8792 )
```

Ramo em 88% e linha em 12% no mesmo cabeçalho não descrevem um projeto mal testado — descrevem um
denominador errado, e é exatamente o tipo de número com cara de medida que ensina a ignorar a
ferramenta. Com o `include`, a **mesma** execução dos 3374 testes dá:

| | linhas | ramos |
|---|---|---|
| `packages/shared/src` | 100,0% (356/356) | 93,9% |
| `packages/server/src` | 95,1% (12712/13365) | 89,2% |
| `packages/web/src` | 94,2% (11907/12639) | 88,0% |
| `packages/cli/src` | 90,1% (283/314) | 89,6% |
| `scripts` | 69,3% (488/704) | 84,8% |
| **total** | **94,0%** (25746/27378) | **88,6%** (7634/8617) |

**E esse 94,0% é honesto, o que não era garantido:** sem `include`, o `v8` só reporta arquivo
*carregado*, então um arquivo que nenhum teste importa **some** do relatório em vez de puxar a média
para baixo. Com o `include`, ele entra com 0% — e a diferença foi conferida por comparação de listas:
os 264 arquivos do `lcov` são um **superconjunto** da fonte elegível no disco, com zero ausente. Não é
média de amostra conveniente.

Três exclusões, e nenhuma é higiene: os ajudantes de teste (`src/testing/`, `web/src/test/`), porque
contá-los é medir a régua; `Styleguide.tsx`, que é `import.meta.env.DEV` em `main.tsx` e seria a
maior linha não coberta do repositório (444) medindo algo que não é entregue; e `tokens.ts`, derivado
do Open Design pelo `design:sync`, que ninguém escreve e ninguém conserta. Essa lista e a
`sonar.exclusions` concordam de propósito — número local diferente do número do Sonar é como se
aprende a não olhar nenhum dos dois.

**O número do Sonar é 92,7%, e não os 94,0% da tabela — os dois estão certos.** O `coverage` do Sonar
é linha **e** ramo numa métrica só, e a tabela acima separa as duas:

```
(25746 + 7631) / (27378 + 8615) = 33377 / 35993 = 92,7%
```

Quem comparar a tela do Sonar com o `text-summary` do vitest vai ver números diferentes para a mesma
execução. Não é divergência de escopo — as exclusões concordam, e `lines_to_cover` do Sonar (27 385)
bate com as 27 378 do `lcov` mais as sete do arquivo que só ele indexa. É a fórmula.

**Sem limiar global.** O quality gate do Sonar mede *código novo*, e é essa a métrica que vale: 94,0%
virando piso transformaria a próxima PR honesta — um arquivo novo ainda mal coberto — em vermelho por
aritmética. A matriz deste arquivo continua sendo por **camada e propriedade**; a porcentagem é o
complemento dela, e não a substituta.

O custo cronometrado surpreendeu na direção boa: **65,8s → 73,5s** de suíte, +12%. A primeira medição
deu +32% (86,8s) porque instrumentar 186 mil linhas de bundle também custa tempo — o `include` que
conserta o número conserta o relógio junto.

#### A cobertura mata a thread principal de fome, e o timeout do RPC é fixo

**Sintoma:** a primeira execução do passo no runner morreu com **os 3371 testes verdes e o
`lcov.info` já escrito**:

```
Error: [vitest-worker]: Timeout calling "onTaskUpdate"
```

Teste nenhum falhou. O que falhou foi um worker conversando com quem o coordena.

**Por que não dá para afrouxar:** o timeout do RPC é **60 s fixos** no bundle do vitest 3.2.7 —
`const DEFAULT_TIMEOUT = 6e4`, e `createForksRpcOptions` não repassa `timeout`. Não existe opção de
config que chegue lá. Um worker esperou a thread principal por um minuto inteiro e desistiu.

**Onde:** no meio da corrida, não no fim — o log começa 06:50:30, o erro sai 06:53:03, então a chamada
pendurada é de ~06:52:03, com outros workers ainda imprimindo. Isso é thread principal **faminta**, e
não travada num passo final de cobertura.

O runner tem 4 vCPU. Sem `LUMEM_TEST_WORKERS`, o `vitest.config.ts` usa 4 workers e eles ocupam os
quatro núcleos; a instrumentação de cobertura é trabalho a mais **na thread principal**, que passa a
não ter onde rodar. O `ci.yml` roda a mesma suíte no mesmo runner sem falhar porque não paga essa
parcela — o que explica por que a armadilha só apareceu ao ligar cobertura, e não antes.

**O conserto tem dois lados, os dois só no job do Sonar:** `LUMEM_TEST_WORKERS=2` devolve dois
núcleos a quem estava sendo esperado — o knob existia no config exatamente para o CI ajustar sem
editá-lo —, e `--reporter=dot` corta a outra ponta, porque o relatório padrão re-renderiza uma árvore
viva a cada `onTaskUpdate`, e é essa renderização que ocupa a thread que o worker aguarda.

A lição que sobra é sobre ler a falha: *suíte verde e job vermelho* não é flake por definição. Aqui
era o custo da própria medição competindo com o que ela mede.

#### Sem `sonar.sources`, a árvore inteira vira teste — e a cobertura some em silêncio

**Sintoma:** o job verde, o `lcov.info` correto no disco, e **zero cobertura** no SonarCloud. A API da
PR respondia `new_lines_to_cover=0` e `new_uncovered_lines=0` com `new_lines=1791`, e a métrica
`coverage` simplesmente não existia. `bugs` e `code_smells` voltavam normalmente, então não era acesso:
a análise chegou, com o commit certo e o gate OK. Ela só não trouxe cobertura.

**O que atrapalhou o diagnóstico** merece nota própria, porque vai acontecer de novo: o SonarJS registra
a importação de LCOV em **DEBUG**. Um relatório lido e casado com zero arquivo e um relatório nunca
aberto imprimem exatamente o mesmo nada. Foi preciso `-Dsonar.verbose=true` num run para o log falar:

```
229 indexed as test with language 'ts'
  0 indexed as main
DEBUG 'JavaScript/TypeScript Coverage' skipped because there is no related file in current project
```

**Nenhum arquivo de produção foi indexado.** Os 231 arquivos eram os de teste. Cobertura só existe
sobre arquivo *main*; sem nenhum, o sensor é pulado — e pular sensor não é erro, então o job fica verde.

**A causa é uma linha comentada no template do SonarCloud:** `#sonar.sources=.`. Ela parece redundante,
porque `.` é o default — mas o default só vale enquanto `sonar.tests` não existe. Ao acrescentar
`sonar.tests=.` (para o Sonar parar de cobrar de teste as regras de produção), a ausência de
`sonar.sources` passa a significar *"tudo é teste"*. O conserto é descomentar a linha.

**O que isso ensina sobre a guarda certa.** A primeira guarda que escrevi conferia o `lcov.info` — que
existe, que não está vazio, que tem caminho relativo, que tem 264 registros. Ela teria passado em todos
os runs quebrados, porque o arquivo **sempre esteve certo**. Guarda que confere o sintoma mais próximo
da sua mão não protege de nada; a que ficou confere `sonar.sources` no `.properties`, que é a causa.

### Por que `gate:quick` é um script e não `vitest --changed`

Duas falhas em direções opostas, e evitar uma de cada vez criou a outra:

1. `vitest run --changed` sem argumento compara contra alterações **não commitadas**. Com a árvore limpa — o estado logo depois de todo commit — ele sai com código 0 sem executar teste nenhum. Verde por vacuidade.
2. Corrigir só com `passWithNoTests: false` troca falso-verde por **falso-vermelho**: todo commit de documentação passa a derrubar o gate, e gate que grita à toa é gate que as pessoas aprendem a ignorar.

`scripts/gate-quick.ts` pergunta ao git se algum arquivo de código mudou. Se nenhum mudou, não há o que rodar e isso é um sucesso legítimo. Se mudou, o vitest **tem** que selecionar e rodar algo — seleção vazia é falha. A base é `HEAD^`, pode ser trocada por `LUMEM_GATE_BASE`, e passa por `git rev-parse` antes de chegar ao vitest — pelo motivo registrado na primeira armadilha abaixo.

### Por que `gate:build` não é `tsc --noEmit && turbo build`

O `tsc` puro na raiz não enxergava `e2e/`, `playwright.config.ts` nem os `vitest.config.ts` — nenhum `tsconfig` os incluía, e erro de tipo neles passava direto. Hoje existe um `tsconfig.json` na raiz cobrindo `e2e/` e os configs da raiz, cada pacote inclui o próprio `vitest.config.ts`, e `gate:build` roda `pnpm typecheck` = `tsc` na raiz **e** `turbo typecheck` nos pacotes.

---

## Armadilhas já corrigidas

### Documentação não tinha gate nenhum, e a convenção falhava 1 em 5

**Sintoma:** quatro links apontavam para `docs/features/003-worktree-tabs/prd.md`, arquivo que nunca
existiu sob nome nenhum — a pasta só tem `tasks.md`. **Dois deles foram criados por tasks marcadas
`[x]`** cujo trabalho era propagar uma nota de reversão, e ficaram lá por dias. Em paralelo, cinco
`prd.md` declaravam um `**Status:**` que discordava do próprio `tasks.md` da mesma pasta, e os dois
`README` da raiz publicavam *"designed, not built"* sobre uma feature com 14 arquivos em
`packages/server/src/pr/`.

**Causa:** não existia link-checker, markdown-lint, nem um único assert de que um caminho de
documentação resolve. `grep` não serve: ele não vê **âncora de heading**, e a âncora é justamente o
mecanismo da nota de reversão (`.../prd.md#21-isto-reverte-um-requisito-do-walking-skeleton`).

**Conserto:** `scripts/check-docs.ts`, no `gate:full`. E a armadilha *dele*: ele nasceu **verde na
primeira execução** contra o repositório, o que é o sinal de um gate que não checa nada. Cada
checagem foi provada ficando vermelha de propósito — 45 achados de `status-value` contra a árvore de
antes da normalização, e link e âncora por mutação na árvore de verdade.

**O que ele deliberadamente não checa:** estado de checkbox. A `001-walking-skeleton` está entregue
com **244 caixas abertas** e a `005-file-editor` com **126** — nenhuma das duas marcou uma só —,
enquanto a `023-composer-menus` não tem caixa nenhuma. Caixa é **critério de aceite**, não barra de
progresso, e derivar fase dela marcaria duas features entregues como em execução para sempre.

Registro do que já mordeu, pra não voltar:

**Locator escopado numa caixa que a feature acabou de esvaziar — o teste passa sem olhar.** A F6.6 do
clone diz que o botão de cancelar some quando o download acaba, e o teste provava isso com
`within(row).queryByRole("button", { name: /cancelar/ })`. A `sidebar-actions` moveu o botão da linha
para o **rodapé do modal**; o `row` continuou existindo, continuou sem botão nenhum, e o teste
continuou **verde** — provando que não há botão num lugar onde nunca mais haveria. A regra: quando uma
feature muda **onde** um controle mora, todo `within(...)` que o cercava vira suspeito, e a correção é
subir o escopo até o menor container que ainda contém as duas versões (aqui, o `role="dialog"`). O
sintoma é sempre o mesmo — um teste que nunca falhou nem quando devia.

**Suíte verde sobre um tipo errado, porque vitest não faz typecheck.** A `project-scripts`
acrescentou a fase `test` ao `[scripts]`, e um helper do teste de router continuou listando as três
fases originais numa união escrita à mão. Todos os testes passaram — `gate:quick` e `gate:full` — e o
CI reprovou no `gate:build`, que é o único que roda `tsc`. A regra: **os três gates respondem
perguntas diferentes**, e "a suíte passou" não é resposta para "o repositório compila". Quando o tipo
tem uma fonte (`SCRIPT_PHASES`, um enum, um `zod`), derive dela em vez de reescrever a união — a lista
escrita à mão é a que fica para trás.

**CHECK que não recusa nada, porque `NULL IN (…)` é NULL.** A `session_script_name` nasceu como
`(kind = 'script' AND script_name IN ('setup','run','teardown')) OR (kind <> 'script' AND script_name
IS NULL)`. Um CHECK do SQLite só recusa quando a expressão avalia para **FALSE**, e `NULL IN (…)`
avalia para NULL — então `kind='script'` com fase nula passava, que é exatamente a linha que o CHECK
existia para impedir. A regra: **em CHECK, comparação com coluna anulável precisa de `IS NOT NULL`
explícito**, e o teste que prova isso é o de inserir a linha proibida — não o de inserir a permitida.

**`printenv` com vários nomes para na primeira variável vazia.** Um teste do ambiente dos scripts lia
cinco variáveis com um `printenv A B C D E` e comparava por posição. Com uma delas vazia, o teste passa
a medir a ordem dos argumentos em vez do ambiente. Virou `echo` linha a linha.

**Fixture de e2e escrita na árvore de trabalho quando o que importa é o commit.** O `[scripts]` da
`project-scripts` precisa existir na **worktree nova**, e worktree nova é checkout do que está
commitado. Uma fixture que só escreve o arquivo prova o contrário do que o spec afirma. (A mesma
fixture também gravou TOML inválido por causa de aspas duplas dentro de aspas duplas — o daemon
recusou, como deve, e o que o e2e achou foi uma tela que não sabia mostrar o erro.)

**Teste de corte com acervo menor que o corte.** O recall pagina o `MATCH` em páginas de 50 e só então
decide se já tem candidatos suficientes. Havia um teste chamado *"o limite pedido não muda quem está no
topo"* — verde — enquanto o `limit` **mudava** o primeiro colocado: o acervo do teste tinha 23 linhas,
uma página só, e com uma página qualquer tamanho de pool devolve o mesmo conjunto. O teste passava até
com o pool em 1.

A regra que sobrou: **teste de corte, de pool ou de paginação precisa de acervo maior que o corte.**
Abaixo dele a asserção é vácua e o nome do teste vira promessa. E se o acervo depender de desempate —
linhas com o mesmo score, ordenadas pelo rowid que o SQLite escolher — a premissa não é estrutural:
faça a ordem vir do **score** (documento mais longo tem bm25 menor), senão o teste fica verde no dia em
que o desempate mudar.

**Estado derivado preenchido pela metade, que passa na própria verificação de frescor.** O índice FTS5
da memória nasce fora das migrations — migration não deriva nada —, então existe banco com catálogo e
sem índice. A primeira tentativa de consertar isso preenchia o índice **a partir do catálogo** quando
ele faltava. Só que o catálogo não guarda corpo: o índice nascia mudo para toda busca por texto de
arquivo — e, como o reparo inseria uma linha por memória, a verificação de frescor (`COUNT` do índice
contra `COUNT` do catálogo) passava a **bater**. O índice ficava permanentemente incompleto e
permanentemente "em dia": o reparo do boot era dispensado por um número que o próprio reparo pela
metade havia falsificado.

O verde que mente aqui é duplo — a busca não erra, ela devolve menos; e a checagem não acusa, ela
confirma. Hoje o índice ausente nasce **vazio e assumidamente atrasado**, quem preenche é o `reindex`
lendo o disco, e o resultado da busca carrega `staleIndex` para quem chama poder avisar. A regra que
sobrou: **estado derivado ou é reconstruído da fonte da verdade, ou continua se declarando ausente.**
Preencher pela metade é pior que não preencher, porque ninguém volta.

**O gate rápido ficava vermelho quando só o e2e mudava — e o teste dele fixava isso como certo.** `e2e/**/*.ts` casava `GRAPH_GLOBS` e ia para o `vitest run --changed`, mas os projetos do vitest são `packages/*` e `scripts`: spec de playwright não está no grafo de módulo de teste nenhum. Seleção vazia com `passWithNoTests: false` sai com código 1, e o HEAD do branch respondia vermelho ao gate que o `CLAUDE.md` manda todo mundo rodar.

É a **quarta** desta família — as outras três foram cache do Turborepo (duas vezes) e `LUMEM_GATE_BASE` numérica — e a primeira em que **o próprio teste do gate congelava o defeito**: `gate-quick.test.ts` asseria que uma spec de e2e *casa* com os globs de grafo. Consertar o script sem mexer no teste deixaria o teste vermelho, e a tentação seria desfazer o conserto.

Hoje `e2e/**` é categoria própria, checada **depois** do grafo — fonte tocada junto com spec continua selecionando os testes afetados —, e a mensagem diz a verdade em vez de calar:

```
gate:quick — only the e2e suite changed since HEAD^; vitest has nothing to run.
Playwright is not in this gate: run `pnpm gate:full`.
```

A decisão por trás: **o gate rápido não sobe daemon.** Fazer ele rodar playwright quebraria o contrato de segundos que é a razão de ele existir, e a task de e2e já declara `Gate: full`. O que não podia continuar era o silêncio — um "nada mudou" num commit que mudou uma suíte inteira é o mesmo defeito virado do avesso.

Irmão conhecido e **ainda aberto**: `playwright.config.ts` é `*.ts` na raiz, casa `GRAPH_GLOBS`, e nenhum projeto do vitest o importa. Um commit que só mexa nele vai vermelho pela mesma razão.

**Esperar por texto num PTY é esperar pela primeira das duas cópias.** Um `cat` sob PTY devolve cada linha **duas vezes**: o terminal ecoa o que foi digitado, e só depois o processo a escreve de volta pelo stdout. `websocket.test.ts > attach > sends the buffer before any new byte` esperava por `old-line` no snapshot antes de conectar o cliente — e a espera era satisfeita pelo **eco**, com a cópia do `cat` chegando depois do attach, na stream que a asserção proíbe conter passado.

Falhava em ~2 de 5 execuções isoladas, e mais sob carga da suíte inteira — o formato clássico de flake que passa quase sempre. Hoje a espera exige **duas** ocorrências, e o comentário no teste diz de onde vem cada uma.

É prima da armadilha do eco no e2e, logo abaixo: nas duas, o que parecia sinal de "o processo rodou" era sinal de "a tecla chegou".

**Um `git commit` que falha depois do `git add` deixa a mudança no índice — e o commit seguinte a varre junto.** O `commitChange` é deliberadamente não-fatal: com o repositório impedido de commitar, a escrita ainda acontece e a falha vira aviso ([T3](../features/007-workspace-memory/tasks.md)). O que não estava previsto é que o `add` já rodou: o arquivo fica **staged**, e o próximo `commit` — de qualquer outra memória — leva junto o que ninguém pediu naquele commit.

Apareceu escrevendo o teste da chave de idempotência do `revert`, que precisava de um `commit: null` **sem** mover o histórico do arquivo. Injetar a falha no `commit` não servia: o commit seguinte movia o histórico assim mesmo, e o teste media outra coisa. A falha passou a ser injetada no **staging**, e o comentário no teste diz por quê.

Fica anotado como **P6** no [tasks.md da memória](../features/007-workspace-memory/tasks.md): agrupar commit por transação resolve esta e a P4 de uma vez.

**No e2e, esperar por texto no terminal é esperar pelo eco do que você digitou.** O `typeLine` escreve o comando e o xterm **ecoa cada caractere** — então `expect(.xterm-rows).toContainText("X")` é satisfeito no instante da digitação, antes de o comando começar a rodar.

A prova não precisa de execução: em `e2e/right-panel.spec.ts`, o comando é `printf 'escrito pelo terminal\n' >> README.md`, que redireciona **toda** a saída para o arquivo e não imprime nada. Mesmo assim a espera por `README.md` passa. A única fonte daquele texto na tela é o eco.

Consequência: `… && echo COMITADO` seguido de espera por `COMITADO` não espera o `git commit` — espera a tecla. O passo seguinte corre contra um repositório que talvez ainda não tenha commitado, e o teste fica flaky pelo motivo mais difícil de enxergar, porque ele **passa quase sempre**.

A regra: **o sentinela não pode aparecer no comando digitado.** Hoje o helper `announcing(comando, palavra)` monta a palavra na saída — `printf 'COMITAD%s\n' O` — e a amarra ao comando com `&&`, então o sentinela depende do **êxito**: com `git commit`, isso é a diferença entre esperar a tecla e esperar o commit. O teste inverso foi executado: trocando o comando por `false`, o eco continua na tela e o prompt volta, e a espera **falha**.

Sobra uma instância viva e ela é legítima: em `e2e/happy-path.spec.ts`, um dos casos espera pelo eco **de propósito** — a marca precisa estar no scrollback para provar que o ring buffer devolveu a sessão depois de navegar e voltar. Ali o eco é o objeto do teste, não o atalho.

**Relógio falso e react-query: o cache muda e nada renderiza.** O react-query entrega mudança de cache aos observadores por um `setTimeout(0)`. Com `vi.useFakeTimers()`, invalidar uma query atualiza o cache e **nenhum componente re-renderiza** — então toda asserção sobre o que um refetch pôs (ou deixou de pôr) na tela passa **pelo motivo errado**.

Provado nos dois sentidos durante o review do autosave: sem o `advanceTimersByTimeAsync(0)` do helper que o teste usa, a mutação que remove a guarda de "leitura em voo não pisa no que foi digitado" **sobrevive** — ou seja, a regra que impede perder texto ficaria falsamente verde. Com o avanço no lugar, a mesma mutação morre.

A regra: **depois de mexer no cache sob relógio falso, avance o relógio antes de assertar a tela.** Um helper com o nome disso vale mais que a linha solta, porque quem escreve o próximo teste não vai saber que precisa.

**Sob relógio falso, `waitFor` e `userEvent` travam em vez de falhar.** O polling dos dois é `setTimeout` que ninguém avança, então eles ficam pendurados até o timeout de 5 s do vitest — e **um teste travado envenena os seguintes do mesmo arquivo**: no autosave, onze falharam por causa de um. Não é o mesmo defeito da linha acima; é a versão que custa a rodada inteira em vez de mentir.

Consequência prática desta suíte: onde há relógio falso, digitação em editor é `dispatch` direto, não `userEvent`, e espera é helper próprio, não `waitFor`. E o stub de `getClientRects` do `setup.ts` devolve `[]`, então **teste que dependa de coordenada — clique posicionando cursor, rolar até a seleção — é no-op silencioso**. Que a tecla física chegue ao editor é assunto de e2e, não de unidade.

**A suíte de contraste vivia dentro do gerador e nada a invocava — enquanto a task afirmava que ela rodava no gate.** Os 59 pares de `generate-tokens.py` só eram verificados quando alguém executava o script à mão: nenhum script de `package.json`, nenhuma task do turbo, nenhum teste. O `Tests` da E1 do `file-editor` dizia "o teste de contraste dos tokens roda no gate", e isso era falso desde o dia em que foi escrito.

É a mesma família de "o próprio gate sem teste" das duas armadilhas abaixo, com um detalhe que a torna pior: **ninguém descobre por sintoma.** Cor com contraste ruim não quebra teste, não quebra build, e a pessoa que a introduz é justamente quem não vai olhar o número.

A correção da época foi um teste de vitest que rodava o gerador num tmpdir e comparava os arquivos gerados byte a byte com os commitados — o que pegava regressão de contraste e edição à mão de arquivo gerado de uma vez.

**Hoje o gerador não existe mais** ([o design é feito no Open Design](design-source-of-truth.md)) e a
verificação ficou, sem Python: os 99 pares foram portados para `packages/web/src/styles/contrast.ts` e
`tokens.test.ts` os roda no `gate:quick`, junto com a monotonia da escada de cinzas e a igualdade
entre o `tokens.ts` commitado e o que a derivação produz do `tokens.css`. Essa última asserção é a
herdeira direta da comparação byte a byte: ela pega edição à mão do derivado **e** sync sem derivar.

O que a mudança de fonte custou está nomeado na decisão, e o item que interessa a este arquivo é este:
**o contraste deixou de ser conferido no momento em que a cor nasce.** Quem escolhe cor no Open Design
descobre a reprovação ao rodar a suíte aqui, não antes. Em troca, a suíte do `web` **deixou de exigir
`python3`** — a guarda que antes falhava numa máquina sem ele hoje roda em qualquer lugar.

**O caller tRPC não enxerga o transporte, e a matriz dizia que router se testa com ele.** Os 16 casos de router do `file-editor` passavam verdes enquanto o navegador teria recebido **413 em toda gravação de arquivo grande**: o `bodyLimit` default do Fastify é 1 MiB, exatamente o teto de arquivo, e o corpo é o texto mais o envelope JSON mais o escape. Medido: 1.024.011 bytes passam, 1.048.587 voltam `FST_ERR_CTP_BODY_TOO_LARGE`.

O caller (`testing/caller.ts`) chama a procedure direto, então ele é cego a três coisas de uma vez: **limite de corpo**, **`query` versus `mutation`** (que sobre o fio é GET versus POST, e decide o que uma página de terceiros consegue disparar sem preflight), e **status HTTP**. Nenhuma delas é detalhe: a primeira quebra o produto, a segunda é controle de acesso, a terceira é o que o cliente ramifica.

Regra que fica: **regra de transporte se testa sobre HTTP** (`app.inject`), não pelo caller. O caller continua sendo o certo para lógica de procedure, que é a maioria — o que muda é saber onde ele para.

**Nome de arquivo entregue ao git é *pathspec*, e pathspec não é nome.** O `deletePreview` perguntava `git ls-files --error-unmatch -z -- <basename>` para saber se o git recupera um arquivo apagado. O `--` está lá e resolve o caso do nome começando em `-`, mas **`--` não desliga glob nem magic pathspec**: o git tenta a igualdade literal e, falhando, faz `wildmatch`.

Consequência medida num repositório de verdade, com `ab.ts` rastreado e `a*.ts` **não** rastreado ao lado:

```
git ls-files -z -- 'a*.ts'                     → ab.ts     (casou outro arquivo)
git --literal-pathspecs ls-files -z -- 'a*.ts' → vazio     (correto)
```

E o inverso: um arquivo chamado `:anotacoes.txt`, rastreado, volta como **não** rastreado, porque `:` abre assinatura mágica. O diálogo de apagar então promete "o git desfaz — `git checkout -- a*.ts`" para um arquivo do qual o git não tem cópia; e se a pessoa rodar o comando que a tela mostrou, o glob restaura `ab.ts` por cima das edições não commitadas dele.

Hoje as duas chamadas usam `--literal-pathspecs`, inclusive a que não tem pathspec — dois `ls-files` no mesmo arquivo com regras de interpretação diferentes é a divergência que volta em seis meses. O teste usa nome com `*`, nome com `:` inicial e nome com `-` inicial; nenhum teste com nome comum pegaria isto.

É a mesma família do `.GIT` abaixo, com a fronteira em outro lugar: lá a linguagem era a do filesystem, aqui é a do git.

**`LUMEM_GATE_BASE` com SHA curta só de dígitos rodava a suíte errada, em silêncio.** `8519566` — sete caracteres, nenhuma letra — era coagido a número pelo CLI do vitest, e `--changed 8519566` degradava para `--changed true`: **só o não-commitado**, em vez do diff contra aquele commit. Medido contra o commit raiz deste repositório: 13 arquivos de teste selecionados pela forma curta contra **50** pela forma longa, mesmo commit.

O sintoma visível era falso vermelho em árvore limpa (`4 source file(s) changed` seguido de `No test files found`, exit 1), e ele custou uma rodada de review inteira. O sintoma **invisível** é pior e é o motivo de isto estar registrado: em árvore suja, o gate rodava menos teste do que a base pedia e ficava verde — falso verde estreito, do tipo que ninguém investiga.

Hoje `resolveBase` passa a base por `git rev-parse --verify <base>^{commit}` antes de o vitest ver a string, com cinco testes em `scripts/gate-quick.test.ts` que ficam vermelhos se alguém remover a resolução. É a terceira vez que este repositório é mordido por gate que mente — as outras duas foram cache do Turborepo — e o padrão é sempre o mesmo: **verde ou vermelho sem relação com o código sob teste**.

**O caso que só existe no macOS, e o CI não pode provar.** A guarda de escrita do `file-editor` recusava `.git` comparando segmento por segmento, sensível a maiúscula — e a suíte inteira de segurança de caminho ficava **verde** com `.GIT` passando como alvo de escrita legítimo, porque num filesystem insensível a caixa (APFS, o padrão do macOS) `.GIT` e `.git` são o mesmo diretório. Rodando a saída da guarda contra um repositório de verdade, um `rm -rf` do caminho devolvido destruía a worktree e o trabalho staged junto.

É o **espelho** dos três defeitos acima: aqueles só apareciam no Linux e o macOS os escondia; este só existe no macOS e o `ubuntu-latest` do CI não consegue reproduzi-lo — lá `.GIT` é outro nome, e um teste ingênuo passa pelo motivo errado. A consequência para quem escreve teste de caminho: **o caso é condicional ao filesystem** (`existsSync(join(root, ".GIT"))` depois de criar `.git`), e a condição precisa do comentário dizendo por quê, senão ela parece supérflua e alguém a remove.

A API importa e a troca é silenciosa: `fs/promises.realpath` canoniza a caixa da última componente no macOS, e `fs.realpathSync` **não** — trocar uma pela outra devolveria `.GIT` como alvo de escrita, com a suíte verde no Linux do CI. A regra de produto que ficou disso está no §5 do [PRD do file-editor](../features/005-file-editor/prd.md): toda checagem vale sobre o caminho **resolvido**, inclusive a última componente. Tudo era canonizado por `realpath` menos ela, e a assimetria era o buraco.

**Cache do Turborepo mentindo.** Sem `dependsOn: ["^typecheck"]` e sem `globalDependencies: ["tsconfig.base.json"]`, o turbo hasheava só os arquivos do próprio pacote. Renomear um export em `shared` deixava `server:typecheck` em cache hit reportando verde, com o código sem compilar. Dava até pra desligar `strict` no `tsconfig.base.json` sem invalidar nada.

**Testes lendo `process.env`.** `loadConfig()` lia o ambiente direto e os testes mutavam/deletavam variáveis globais. Um desenvolvedor com `LUMEM_HOST` exportado no shell via a suíte vermelha sem ter tocado em nada. Hoje `loadConfig(env)` recebe o mapa por parâmetro e os testes passam literais.

**E2E reusando o daemon do desenvolvedor.** `reuseExistingServer: true` pula o spawn quando já tem algo na porta — e pular o spawn descarta o `env`, incluindo o `LUMEM_STATE_DIR` descartável. O e2e rodava contra o `~/.lumem` real. Hoje o e2e tem portas próprias (`ports.json`) e `reuseExistingServer: false`.

**A suíte unitária passando a escrever no `~/.lumem` de verdade.** Irmã direta da anterior, e descoberta na PR 01 da memória. O `bootstrap.test.ts` sempre chamou o boot sem `LUMEM_STATE_DIR` — inofensivo enquanto o boot só abria um banco que o próprio teste injetava. Quando o boot ganhou `ensureMemoryHome`, aquela mesma linha passou a **criar diretório e rodar `git init` no estado do desenvolvedor**, e a partir daí a suíte commitaria por cima da memória real de quem a rodasse.

O detalhe que a torna instrutiva: **o teste não mudou.** O que mudou foi o que a função sob teste passou a fazer. Um teste que não nomeia o diretório em que escreve fica correto por sorte até o dia em que a produção cresce por baixo dele.

A regra: **todo teste que toca o estado do daemon passa um `stateDir` temporário explícito**, e a mesma exigência vale para o e2e (a armadilha acima) e para o gate. Hoje cada boot do `bootstrap.test.ts` recebe um state dir próprio, e os testes de `src/memory/` criam o seu com `tempDir()`.

**Bateria de mutação incompleta dá falso verde — e é pior que não ter bateria nenhuma.** No rework da PR 01 da memória, quem escreveu as correções rodou **11 mutações** e viu as 11 morrerem: relatou "cada correção verificada por mutação". O review rodou **32** na mesma árvore, e **7 sobreviveram** — quatro delas eram correções daquele mesmo lote, sem teste nenhum. Uma era `db.transaction` no `reindex`, ou seja, **exatamente a correção do bloqueante**.

O mecanismo do engano é específico e vale nomear: as 11 mutações foram derivadas dos testes que tinham acabado de ser escritos, então cada uma mirava numa asserção que existia por construção. A mutação que sobrevive é a que ninguém pensou em escrever — e quem acabou de escrever o teste é justamente quem não vai pensar nela.

Duas armadilhas de segunda ordem apareceram junto, e as duas produzem "sobreviveu" falso: **mutação que não aplica** (o `perl`/`python` não casa o padrão depois de um refactor renomear a função) e **mutação equivalente** (trocar a validação da CLI por um `as` continua vermelho, mas por causa de uma guarda a jusante com mensagem de prefixo igual — o teste passava sem provar o que dizia provar). A primeira se pega conferindo que o arquivo mudou (`grep -c` no padrão); a segunda, assertando o pedaço da mensagem que **só** a camada sob teste produz.

A regra: **a bateria de mutação de quem escreveu o código não substitui a de quem revisa**, e toda mutação relatada precisa de prova de que aplicou. Quando o número de mutações do autor e o do revisor divergem por 3×, o do autor está medindo os testes que ele lembrou de escrever.

**E o corolário, que veio do passe a frio do mesmo lote: nem a bateria do revisor basta quando o filesystem colabora com o defeito.** As 32 mutações do review também não pegaram a 8ª sobrevivente — apagar o `.sort()` da varredura do `reindex` deixava **108 de 108** verdes. O `reindex` promete ser determinístico e ordena por caminho justamente para não depender do `readdir`; acontece que neste APFS o `readdir` já devolve numa ordem que coincide com a ordenada, então **o teste concordava com o código pelo motivo errado**. Inverter o comparador matava o teste; removê-lo, não.

A regra que fecha essa família: **teste de propriedade "não depende de X" tem que variar o X.** Quando X é o sistema de arquivos, o relógio ou a ordem de chegada da rede, o ambiente de teste é o pior lugar para procurar variação — ele é estável de propósito. Aqui o teste inverte o `readdir` com um dublê local e assere a mesma resposta nas duas ordens; sem inverter, ele estava medindo o APFS, não o `catalog.ts`.

**Constante duplicada sem teste.** A porta 4317 vivia em três arquivos e nenhum teste fixava o default; trocá-la deixava todos os gates verdes e o `pnpm dev` quebrado. Hoje `ports.json` é a fonte para os configs e `constants.test.ts` amarra as constantes de `shared` a ele.

**O guarda de porta invisível ao `--changed`.** O teste acima lia `ports.json` com `readFileSync`, e `vitest --changed` seleciona por grafo de módulos: alterar `ports.json` não selecionava o teste que existe justamente para vigiá-lo. Editar `ports.json` junto com qualquer código deixava o gate rápido verde com as portas dessincronizadas. Hoje é `import ports from "../../../ports.json" with { type: "json" }` — um import de verdade, que o vitest rastreia.

**Cache do `turbo test`, a mesma armadilha pela segunda vez.** Ao adicionar a task `test` ao turbo, `ports.json` ficou fora de `globalDependencies` — então alterá-lo dava cache hit e "5 successful" com o teste de portas na verdade vermelho. Hoje `ports.json` está em `globalDependencies` e a task `test` é `cache: false`: teste que dispara processo, repositório git e socket não tem resultado cacheável.

**Fiação de sinais sem teste.** `createShutdownHandler` tinha 6 testes e o registro dos sinais tinha zero. Trocar `["SIGINT", "SIGTERM"]` por `["SIGINT"]` passava nos três gates — e SIGTERM é o que `turbo dev` e o teardown do Playwright mandam. Sem handler, o Node encerra na hora, sem fechar os filhos. Hoje `installSignalHandlers` é testado com um `EventEmitter` falso.

**Config de teste fora de todo typecheck.** `packages/*/vitest.config.ts` não estava em nenhum `include`; erro de tipo neles passava direto. Hoje cada `tsconfig.json` de pacote inclui o próprio.

**O próprio gate sem teste.** `gate-quick` nasceu como `.mjs`, fora do typecheck e sem um único teste — e tinha dois defeitos reais: ignorava mudança em `pnpm-lock.yaml` (bump de dependência é a mudança com mais chance de quebrar teste em runtime, e era a única que o gate não via) e, quando o ref base não resolvia, vazava o `fatal:` do git e ficava vermelho reclamando de "nenhum teste encontrado" em vez de rodar tudo. Hoje é TypeScript, tem projeto de vitest próprio, e a decisão é função pura testada.

**Teste que não testa, no lugar mais caro possível.** Os primeiros 15 testes do gate eram vazios. A asserção dos globs era `CODE_GLOBS.some(g => g.startsWith(glob))`, onde `glob` vinha do próprio caso de teste e o nome do arquivo nunca era usado — corromper 6 dos 7 globs deixava tudo verde. E `changedFiles` era asserido com `toBeInstanceOf(Array)`; como `[]` é um Array, trocar a função por `return []` também passava, restaurando o bug original por inteiro. Hoje as listas são fixadas por igualdade exata e cada glob é exercitado contra **repositório git temporário real**. A regra "git não se mocka" já estava escrita aqui embaixo e não estava sendo seguida.

**Arquivo novo invisível ao gate.** `git diff` não lista untracked, então todo arquivo recém-criado — que é o que escrever uma feature produz — não contava como mudança. Criar um módulo inteiro e rodar o gate dava "nothing to run". Hoje `changedFiles` une o `diff` com `git ls-files --others --exclude-standard`.

**Classificar por prefixo de diretório em vez de por rastreabilidade.** `packages/**` roteava `index.html` e `.css` para `--changed`, que não sabe rastreá-los, e a run falhava com "No test files found"; ao mesmo tempo `drizzle/0001.sql` não casava com prefixo nenhum e ficava invisível. Hoje a divisão é por o que o vitest consegue resolver: `*.ts`/`*.tsx` vão para `--changed`, e todo o resto que não seja documentação roda a suíte inteira.

**Config do Playwright reavaliado em cada worker.** Mover a limpeza do state dir do `globalSetup` para o corpo do módulo resolveu a ordem, mas o config é avaliado também em cada processo worker — medido, 2,1s depois do daemon subir. A segunda limpeza cairia com o handle aberto. Hoje há guarda `TEST_WORKER_INDEX === undefined`.

**Fixture que esconde o bug em vez de expor.** O e2e do terminal do agente falhava: o `xterm` montava e ficava vazio. Trocar o comando do agente falso de `echo uma vez` para um laço que imprime sempre fez o teste passar — e escondeu que o **snapshot** (saída produzida antes do cliente atacar) estava sendo perdido. O laço testa o caminho ao vivo; o `echo` único é o único que testa o replay. A causa era real: o `fit()` do xterm roda na montagem, e um terminal montado num contêiner que **acabou de aparecer** — como o do cartão — é medido antes do layout assentar, então o resize seguinte descarta as linhas que o snapshot já havia escrito. Hoje o `Terminal` refaz o `fit` antes de escrever o snapshot. A regra que fica: quando trocar o fixture faz o teste passar, a pergunta certa é **o que o fixture novo deixou de perguntar**.

**Clique do Playwright em elemento que se substitui no `mousedown`.** O menu de comandos escolhe no `mousedown` — o textarea perde foco antes do `mouseup` — então o `click()` do Playwright vê o elemento trocar entre os dois eventos e reenvia até estourar o timeout. O comportamento está certo; o gesto é o que quase nenhum usuário usa. O teste passou a escolher pelo teclado, que é o caminho primário de um palette e o determinístico.

**Asserção de contagem com `getByText` por substring.** O e2e do replay checava que "primeira pergunta" aparecia **uma** vez e achava duas — porque a resposta do agente cita a pergunta de volta, e `getByText` casa por substring. O código estava certo; o teste acusava duplicação que não existia. Falso vermelho é tão caro quanto falso verde: gasta o tempo procurando um bug no lugar errado. Quando a asserção é sobre **quantidade**, o texto tem que ser `exact`.

**Nome acessível que cresce sozinho.** Depois que a contagem da sidebar passou a anunciar "1 sessão rodando" em `sr-only`, o nome acessível do botão da worktree virou `"conversa-replay 1 sessão rodando"` — e todo `getByRole(..., { exact: true })` que apontava para ela parou de casar. O texto sr-only está certo: é ele que faz a contagem existir para quem não vê cor. A regra que fica: localizador por nome acessível usa âncora (`^nome\b`), não igualdade, sempre que o elemento puder ganhar um sufixo anunciado.

**Efeito de limpeza que depende do valor de um contexto.** O `Conversation` reportava "esperando permissão" num efeito e limpava noutro, e o segundo tinha `awaiting` nas dependências. `awaiting` é objeto novo a cada mudança do conjunto compartilhado, então a limpeza rodava a cada mudança: limpava a marca, a limpeza mudava o conjunto, a identidade nova rodava a limpeza de novo, e o primeiro efeito remarcava. Os dois oscilaram para sempre — e o sintoma foi a suíte **travar**, não falhar, que é o vermelho mais caro de diagnosticar porque não existe vermelho. Hoje a limpeza de desmontagem passa por `useRef` e depende só do id. A regra que fica: limpeza de desmontagem não depende de valor de contexto; ela lê o último por `ref`.

**Agente falso e código errados juntos.** O `configOptions` do ACP chaveia opção de select por **`value`**; o `AcpManager` lia `id`, e o agente falso *também* enviava `id`. Os dois erros se cancelavam e a suíte ficava verde com uma lista de modelos toda `undefined` — que na tela viraria seletor vazio sem explicação. Só o `AcpManager.integration.test.ts`, contra o adaptador de verdade, pegou. A regra que fica: fixture que eu escrevo não é evidência sobre formato de terceiro; **um** teste contra o processo real por contrato externo paga por si.

**Esperar uma cópia de uma saída que vem duas vezes.** O teste de attach do `/pty` escrevia `old-line` num `cat` e esperava o snapshot conter a linha — mas `cat` sob PTY produz a linha **duas** vezes: o terminal ecoa a entrada e o `cat` escreve de volta. O `waitFor` passava na primeira cópia, o cliente atacava, e a segunda chegava pelo stream fazendo o teste falhar em "não deve conter old-line". Verde em máquina folgada, vermelho quando a suíte inteira roda junto — e o vermelho aponta para o endpoint, que está correto. Hoje o wait exige as duas cópias. A regra que fica: quando a asserção é sobre **ausência**, o wait tem que esperar o fim da produção, não o primeiro sinal dela.

**Mute liberado pela resposta, não pelo próximo pedido.** O `session/load` faz o adaptador re-transmitir a conversa inteira, e o daemon descarta essa cópia (D14). A primeira versão desligava o descarte no `finally` do próprio `session/load` — e a resposta e as notificações viajam pelo mesmo pipe, sem o SDK prometer que uma notificação escrita antes da resposta é **tratada** antes dela. Em processo o replay era descartado e a suíte unitária ficava verde; contra subprocesso de verdade o mesmo replay era gravado, e a conversa aparecia duas vezes na tela. Só o e2e viu. Hoje o corte é o **primeiro prompt**: nada de novo acontece numa conversa com quem ninguém falou ainda, então é uma fronteira que não corre. A regra que fica: fronteira temporal em cima de "a resposta chegou" é fronteira que corre; fronteira em cima de "alguém agiu" não.

**Nome acessível de um botão contendo o nome de outro.** O painel de agentes tem `adicionar` como submit, e o rodapé tem `adicionar projeto` do lado — `getByRole("button", { name: "adicionar" })` casa com os dois, e o e2e morre em strict mode antes de testar nada. O mesmo aconteceu com `getByText("eco")` no teste de componente, porque o botão de remover carrega o nome do agente em `sr-only` para ter nome acessível próprio. É a regra do parágrafo acima aplicada duas vezes no mesmo dia: localizador por nome nasce **escopado** no painel, ou ancorado.

**Dois composers montados ao mesmo tempo.** Reabrir uma sessão encerrada e retomá-la deixa **duas** conversas montadas — a que está sendo lida e a que continuou —, e `getByLabel("mensagem para o agente")` sem escopo casa com as duas: strict mode violation num teste sobre feature nenhuma. O e2e da retomada passou a escopar tudo pelo `[role=tabpanel]:not([hidden]) .conv`. A regra que fica: em tela com aba, localizador nasce escopado no painel visível.

**Estado do e2e sobrevivendo entre execuções.** `.lumem-e2e/` é caminho fixo e não havia limpeza. Inofensivo enquanto o daemon não escreve nada; a partir do banco, a segunda execução herda os workspaces da primeira e o teste que cria `pessoal` quebra em constraint de unicidade — flaky por histórico, o pior vermelho de diagnosticar. Hoje o `globalSetup` do Playwright apaga o diretório antes da suíte.

---

**A janela entre "renderizou" e "atado" — e o CI foi o único a ver.** Depois da `workspace-memory`
inteira ficar verde na minha máquina, o CI reprovou no `00-onboarding`: a mensagem era digitada, o
botão clicado, e o primeiro turno **não acontecia**. O painel da conversa renderiza enquanto o socket
conecta; o `acp-socket` recusa escrita antes de abrir, de propósito — *"mandar antes de o socket abrir
é bug de quem chamou"* —, e o bug era o `send` do composer: ele mandava, o socket largava, e o
`setDraft("")` limpava o texto de qualquer jeito. Numa máquina mais lenta o `attached` chega depois do
primeiro clique, e a pessoa perde a mensagem sem a tela dizer nada.

Duas correções, e a segunda é o teste: o composer **não envia** antes de atar e **não limpa** o
rascunho quando não deu para enviar; e cada spec que digita na conversa espera pelo sinal de atado
(`sessão aberta, nada pedido ainda`) em vez de pelo painel visível.

A regra: **"o elemento apareceu" não é "o elemento funciona".** Quando o que faz um controle funcionar
é uma conexão, o teste tem que esperar pela conexão — e o controle tem que se desabilitar até lá, que é
o que faz o `click()` do Playwright esperar sozinho. E o corolário desconfortável: **uma suíte que só
roda numa máquina não cobre corrida de rede.** Esta passou 34/34 localmente em três execuções
seguidas, e reprovou na primeira vez que rodou num runner mais lento.

**Laço que não avança falha por OOM, e isso é sorte.** O parser de markdown da mensagem tinha um
ramo — linha com barras que não é tabela — que nenhum bloco consumia e que o parágrafo se recusava a
consumir. O `index` ficava parado, o laço enchia a memória de parágrafos vazios, e o `vitest` morreu
com *heap out of memory* e stack nativo de 49 quadros. O teste que provocou isso tem uma linha.

A regra: **todo laço que consome entrada tem que garantir consumo no ramo de fallback.** No parser é
literal — o parágrafo pega a primeira linha **sempre**, e só depois decide se continua. E o corolário
de teste: **um caso "isto não é X" vale o dobro**, porque ele é o que cai no fallback.

**Esperar o processo morrer não é esperar a saída dele chegar.** O teste de scrollback do `PtyManager`
mandava `sh` imprimir 200 linhas, esperava o processo **sair** e então exigia `line200` no buffer. No
macOS ocioso passa sempre; num runner de CI carregado ele parou na `line181`. A causa não é lentidão, é
ordem: `onData` e `onExit` são dois callbacks do node-pty, e o exit chega com o último pedaço ainda na
fila. O arquivo já tinha o helper certo — `waitForOutput` — e todos os outros testes dele já esperavam
pela saída; só este esperava pelo cadáver.

A regra: **espere pela evidência que você vai asserir, não por um evento que costuma vir antes dela.**
E o sinal de alerta barato: um teste que usa um helper de espera diferente do que todos os seus vizinhos
usam para a mesma classe de asserção.

**`useQuery` numa chave que outra tela invalida é um re-render que você não pediu.** A
[worktree-first-tab](../features/018-worktree-first-tab/prd.md) precisava do nome do checkout **antes** do
`getDetail` responder, para a primeira aba não aparecer meio segundo depois. O nome está no cache que
a sidebar já carregou, então o painel abriu um `useQuery` na mesma chave — e o e2e passou a falhar
numa spec que nada tinha a ver: a sessão recém-criada não vinha para a frente.

A causa é uma janela. `select(novaSessão)` roda antes de a lista de sessões chegar, e existe um efeito
que devolve a seleção para a aba do checkout quando a aba escolhida não está na lista. Criar sessão
invalida a lista de **worktrees** também — é dela que sai o "1 sessão rodando" da sidebar —, e a
inscrição nova fazia o painel re-renderizar exatamente dentro dessa janela, disparando o efeito.

A regra: **para ler o cache, leia o cache** — `queryClient.getQueryData` em vez de `useQuery` quando o
que se quer é o valor e não as atualizações dele. Uma inscrição é um acoplamento a *quem invalida a
chave*, e quem invalida uma chave costuma ser outra tela. E o corolário de teste: **isto só aparece com
layout e tempo reais.** Em jsdom a janela não existe, os 826 testes de componente passaram, e o que
achou foi o e2e — que por isso não é redundante com eles.

### Coluna que "existe para ser comparada verticalmente" e não é

**Sintoma:** nenhum, por meses. A tela do workspace desenha o consumo em colunas de número em mono,
alinhadas à direita, e a folha diz por escrito que elas existem para ser lidas uma debaixo da outra.

**Causa:** cada linha era uma **grade própria** com colunas `max-content`. Duas linhas só se alinham
por coincidência de largura de conteúdo — e a coluna de token de uma ficava 37px à esquerda da de
outra sempre que o texto de custo mudava (`sem custo reportado` contra `US$ 12,4071`). Com projetos
parecidos o erro era pequeno o suficiente para ninguém notar.

A regra: **alinhamento entre linhas é `subgrid` na lista, nunca colunas repetidas por linha** — e o
`gap` sobe com ele, porque com `subgrid` quem define a distância entre as trilhas é o pai. Achado
desenhando a divisão por agente da [second-agent](../features/021-second-agent/prd.md), onde o erro deixa de
ser pequeno: comparar dois agentes é exatamente ler dois números um debaixo do outro. E o que achou
foi **renderizar e medir**, não ler o CSS.

### O adaptador de verdade também pinado, e o CLI por baixo dele **não**

**Sintoma:** nenhum. É o que faz esta armadilha valer a pena escrever.

**Causa:** a A12 diz "nunca `@latest`", e o catálogo cumpre: `codex-acp` está fixo em `1.10.0`. Só que
ele depende de `@openai/codex: ^0.153.3` — um **caret**. Duas máquinas que instalam a mesma versão
pinada do adaptador podem estar rodando CLIs diferentes por baixo dele, e o produto reporta a versão
que ele conhece: a do adaptador.

A regra: **pinar o adaptador não pina o agente**, e o teste marcado contra o adaptador real
(`AcpManager.codex.integration.test.ts`) é o único lugar onde essa diferença aparece antes de um
usuário. Ele para em `initialize` + `session/new` — zero token — e afirma o que decidiu perguntas: que
`loadSession` existe, que `mode` está entre as `configOptions`, e que **nenhum** `authMethod` é
`type: "terminal"`. Essa última fica vermelha no dia em que a C3 puder ser reaberta. Da
[second-agent](../features/021-second-agent/prd.md), fase 0.

### Um comportamento que nunca teve teste não tem teste para reescrever

**Sintoma:** a fase 0 da second-agent atravessou um turno inteiro de um adaptador **diferente** pelo
`translate.ts` sem uma linha de mudança e sem um `warn` — e a suíte não tinha uma única afirmação
sobre `usage` sem `rateLimit`, que é o caso desse adaptador.

**Causa:** o Claude sempre mandou `_meta._claude/rateLimit`, então o caminho do nulo existia por
desenho, era exercitado por ninguém, e estava correto por sorte declarada. O mesmo padrão da
[run-dock-open](../features/015-run-dock-open/prd.md), onde o rodapé fechado nunca teve teste em três features.

A regra: **quando uma medição diz "já funciona", o resultado é uma task de teste, não uma task
fechada.** A F3 da second-agent era código no PRD e virou teste depois da medição, e é ela que impede
o `cost: 0` — a mentira que faz um turno pago parecer grátis — de voltar.

### Um repositório de fixture só pode ser adicionado uma vez na suíte inteira

**Sintoma:** o spec passa quando roda sozinho e falha no `gate:full`, com um projeto que nunca aparece
na sidebar.

**Causa:** os specs de e2e dividem **um daemon e um diretório de estado**, e o daemon recusa adicionar
o mesmo caminho de repositório duas vezes — corretamente, porque um projeto é um repositório. Um spec
que reaproveita a fixture genérica (`repo`) com um nome novo está pedindo a recusa, e o `ensureProject`
não distingue "ainda não chegou" de "foi recusado": ele espera o botão aparecer e estoura no timeout.

A regra: **fixture usada por mais de um spec é fixture com nome fixo em um spec só.** Quem precisa de um
repositório com um formato próprio — sem `[scripts]`, sem commit, com `origin` — cria a sua em
`createFixtures()`, e a nomeia pelo que ela **não** tem. Achado na
[run-dock-open T3](../features/015-run-dock-open/tasks.md), onde `repo-noscripts` nasceu por isso.

### `toBeVisible` não vê recorte, e `getByRole` clica em coisa que não existe

**Sintoma:** o menu de `/comandos` do composer estava **100% invisível** no navegador — havia três
features com ele em produção assim —, e o teste de componente que o abre passava verde.

**Causa:** o popover ancora na própria caixa que o recortava (`.composer__box`, `overflow: hidden`),
em `bottom: calc(100% + 6px)` — cem por cento fora dela. Um elemento recortado por ancestral continua
no DOM, continua com `getBoundingClientRect`, e o `toBeVisible` do playwright continua satisfeito. Em
jsdom é pior: não há layout, então nada é recortado por nada e o `getByRole().click()` sempre acha
quem clicar.

A regra: **quando a afirmação é "dá para clicar", a pergunta é `document.elementFromPoint` no centro
do elemento — quem responde tem que ser ele mesmo.** É o que o
[composer-menus.spec.ts](../features/023-composer-menus/tasks.md) faz, e é o único matcher que fica vermelho
contra o código de antes. `toBeVisible` fica verde nos dois.

### O `drizzle-kit` perde a ação do estrangeiro no `ALTER TABLE`

A migração `0014` nasceu com `ALTER TABLE session ADD task_id text REFERENCES task(id);` — **sem
`ON DELETE`**. O schema declara `set null`; o disco ficaria com `NO ACTION`, que em SQLite significa
*recusar o delete do pai*. O sintoma seria apagar uma tarefa falhar com `FOREIGN KEY constraint
failed`, meses depois, em quem tentasse limpar — e nenhum teste que começa de um banco vazio pega
isso, porque nenhum deles apaga tarefa com sessão pendurada.

A linha foi reescrita à mão, e o teste que a sustenta está em `migrations.test.ts`, num banco parado
na revisão anterior. **Ele foi validado ficando vermelho de propósito**: com a linha gerada, falha
com `FOREIGN KEY constraint failed`.

A regra que sai daí: **toda migração que muda ação de estrangeiro por `ALTER TABLE` precisa de um
caso que exerça a ação**, e não só a presença da coluna.

### O `drizzle-kit` lê colunas que ainda não existem na tabela de origem

A migração `0018` nasceu com `INSERT INTO __new_workspace(…, "budget_cost_per_task", …) SELECT …,
"budget_cost_per_task", … FROM workspace` — lendo do **velho** as colunas do **novo**. O erro é
`no such column`, e **nenhum teste que começa de um banco vazio o pega**: sem linha, não há cópia.

É a mesma família do que o `0001` pagou e que o cabeçalho do `migrations.test.ts` descreve, e reapareceu
**cinco migrações depois** — o que quer dizer que a armadilha não é do `0001`, é do gerador. A lista do
`SELECT` foi reescrita à mão, e o caso foi validado ficando vermelho de propósito.

A regra que sai daí, e que vale para toda recriação de tabela: **leia o `SELECT` da migração gerada
antes de rodá-la**, e tenha um caso num banco parado na revisão anterior **com linha dentro**.

### Uma variante nova de evento quebra a tela, e isso é o contrato funcionando

Acrescentar `budget` ao `AcpEvent` **derrubou o typecheck do `@lumem/web`**: o `reduceConversation` é
um `switch` exaustivo sobre o tipo, então uma variante nova obriga o cliente a dizer o que faz com ela.
Isso não é atrito — é a única coisa que impede um evento de ser adicionado no daemon e sumir na tela
sem ninguém notar.

O par disso é o mock compartilhado: o `trpc-mock.ts` serve um `task.settings` default, e um campo novo
no contrato o deixa velho — **cinco testes** quebraram com `Cannot read properties of undefined`, em
telas que não têm nada a ver com orçamento. É a mesma armadilha que *"uma tela nova derruba testes cujo
mock não a conhece"* já descreve, vista do outro lado: **o mock compartilhado é parte do contrato**, e
esquecê-lo quebra testes distantes com um erro que não fala do assunto.

### `ResizeObserver` vê a caixa, e o que mudou é o conteúdo

A faixa que avisa *"2 colunas fora da tela"* nasceu observando a própria faixa de colunas com um
`ResizeObserver`. Parecia certo — deriva da coisa, como o selo e o relógio de encalhe — e **nunca
aparecia**. Medido no navegador: 836px de espaço para 1152 de colunas, e nenhum aviso.

O motivo é de ordem. Na primeira pintura a consulta ainda não voltou: **não há coluna nenhuma**,
então não há transbordo, e o observador mede zero corretamente. Quando os cartões chegam, quem muda é
o **conteúdo** — a caixa fica do mesmo tamanho, o observador não dispara, e a medida de zero
sobrevive para sempre.

E pior: nesta máquina o `ResizeObserver` não entregou **uma única notificação** em nenhum dos dois
sentidos — conferido com um observador criado à mão na página, que contou zero disparos ao encolher e
ao alargar. A faixa ficava **acesa** com `scrollWidth === clientWidth`, dizendo que duas colunas
estavam fora quando não estava nenhuma. Um aviso que não some é a mesma doença de um que não aparece.

A saída foi medir **a cada pintura** (`useLayoutEffect` sem deps, que converge porque `setState` com
o mesmo valor não repinta) mais o `resize` da janela, que é o único caminho que não passa pelo React.

A regra que sai daí: **jsdom não faz layout, então nenhum teste de componente responde isto** — quem
responde é o e2e, e a pergunta tem que ser feita **nos dois sentidos**. Um caso que só confere que o
aviso aparece fica verde contra um aviso que nunca some.

### O mesmo nome em duas peças clicáveis quebra 22 e2e de uma vez

O filtro de projeto da lista de tarefas nasceu como segmentado, com um botão por projeto. Na tela do
workspace isso pôs o nome do projeto numa **segunda** peça clicável — a primeira é a árvore da
sidebar —, e `getByRole("button", { name: "fixture", exact: true })` passou a achar dois elementos em
**22 specs**.

O conserto não foi nos testes: eles estavam certos, e escapar deles com locators mais específicos
empurraria a ambiguidade para sempre. Dois botões idênticos querendo dizer coisas diferentes é
ambiguidade para quem lê, não só para quem automatiza. O filtro virou **um controle que se nomeia**
(`projeto: todos ▾`), e ele ainda escala melhor: três projetos cabiam num segmentado, oito não.

A regra: **quando um locator de e2e fica ambíguo, a primeira pergunta é se a tela ficou ambígua.**

E o corolário, que custou mais um round: o `<select>` que substituiu o segmentado nasceu com um
rótulo visível — `projeto` —, e isso derrubou **outro** teste. Ele asseria que a palavra `projeto`
**não** aparece no painel do workspace, como prova de que o grupo de memória `projeto` não existe
naquele escopo. Ali a tela não ficou ambígua: o *proxy do teste* é que era largo demais. O conserto
foi tirar o rótulo — a primeira opção do select (`todos os projetos`) já o nomeia, e um `<span>` ao
lado de um controle é um segundo elemento para uma ideia só.

### Uma tela nova derruba testes cujo mock não a conhece

O cabeçalho do `trpc-mock.ts` já avisava, e aconteceu de novo: a seção de tarefas consulta o daemon
no `mount`, e dois testes antigos quebraram. Um com *"Found multiple elements with the role alert"* —
o banner de erro de uma query que devolveu `undefined` —, e outro porque o nome do projeto passou a
aparecer **em dois lugares** na mesma tela, e a busca por texto ficou ambígua.

Nenhum dos dois é um teste errado: os dois são testes que não sabiam da tela nova. O conserto é
`installTrpcDefaults()` no primeiro e um seletor escopado no segundo — e a lição é que **um default
vazio no mock é infraestrutura, não conveniência**.

### Um teste de handshake não vê um defeito de turno

**Sintoma:** todo turno de conversa morria com `400 … Claude Code 2.1.160 does not support this
model`, numa instalação limpa do produto, e o `gate:full` estava verde — inclusive o teste que fala
com o adaptador **real**.

**Causa:** o `AcpManager.integration.test.ts` para no `session/new`, de propósito, porque um
`session/prompt` cobraria da pessoa que roda a suíte. O defeito vivia **depois** desse ponto: o
`initialize` do `claude-agent-acp@0.40.0` responde exatamente como sempre respondeu, e o que estava
velho era o runtime que ele **embute** (`@anthropic-ai/claude-agent-sdk@0.3.160`). A linha de risco da
[agent-login](../features/009-agent-login/prd.md) dizia que o integration "falha se o handshake mudar de
forma", e estava certa: o handshake não mudou de forma. E o e2e de primeiro acesso, que chega a um
turno respondido, fala com o `fake-acp-agent.mjs` — que responde o que nós escrevemos.

A regra: **subir uma versão de adaptador é uma medição manual, não um bump de constante** — instalar
a candidata num prefixo descartável, rodar um turno de leitura e um de escrita contra o `AcpManager`
deste repositório, e contar `warn` e `unknown`. É o procedimento da fase 0 da
[second-agent](../features/021-second-agent/prd.md), e o registro de quando ele não foi seguido está em
[claude-agent-acp-0.75.md](claude-agent-acp-0.75.md).

**O que passou a avisar antes**, porque medição manual só acontece se alguém souber que está na hora:
`scripts/check-adapters.ts`, no `vitest` (e por `pnpm adapters:check`). Ele pergunta ao registro npm
duas coisas diferentes e trata cada uma como o que ela é:

| Pergunta | Sinal | O que faz |
|---|---|---|
| o pino está atrás do `latest`? | fraco — o pino `0.40.0` **era** o latest do dia | avisa, nunca reprova: exigir o latest é a A12 ao contrário |
| o runtime embutido está atrás do `latest` dele? | forte — é a mecânica do defeito | **reprova** acima de 30 releases |
| o runtime vem por faixa (`^0.153.3`)? | é o risco da fase 0 | avisa: pinar o adaptador não pina o agente |

O limite de 30 é **alarme de fumaça, não especificação**, e os dois pontos que existem estão escritos
no arquivo: `0.40.0` embutia um runtime **87 releases** atrás e a API recusava; `0.75.1` embute um
**6 releases** atrás e roda. Conferido ficando vermelho contra o pino velho, que é a única prova que
vale para um gate.

E ele **passa sem rede**, de propósito: gate que reprova no avião é gate que se aprende a contornar,
e o defeito que este previne leva meses para aparecer. O `describe` invertido diz que se pulou —
mesmo padrão do teste contra o adaptador real.

E a armadilha de segunda ordem, que é a pior: **"já está instalado" não é "está na versão que o
produto fixa"**. O `installAdapter` aceitava qualquer binário existente e reportava
`spec.pinnedVersion` — então trocar a constante não trocava nada em nenhuma máquina que já tinha
rodado o Lumem, e a tela dizia o número novo. Um campo de versão que repete a constante em vez de ler
o disco é um campo que **não pode ficar vermelho**.

### Chave de cache escrita à mão é chave que ninguém invalida

**Sintoma:** com a esteira andando e o quadro aberto na frente de quem olha, nada se mexia — selo,
relógio de encalhe, a contagem de *precisa de mim* e o aviso do topo, todos congelados até alguém
arrastar um cartão. E na lista de tarefas, clicar num degrau da esteira gravava no daemon e a barra
**voltava ao valor antigo**: o degrau não recebia `btn--brand` e o checkbox desmarcava sozinho.

**Causa:** duas chaves de query nasceram inline no componente — `["task", "board", …]` no `Board.tsx`
e `["task", "settings", …]` no `TaskList.tsx` — em vez de no
[`queryKeys.ts`](../../packages/web/src/lib/queryKeys.ts), que existe exatamente para isso e cujo
cabeçalho já dizia por quê: *"dois componentes invalidando o mesmo dado com chaves que diferem por um
caractere é um bug que parece UI velha, e é invisível em review"*. O `invalidateFor` invalida
`["task", "listByWorkspace", ws]` e `["task", "get"]`, e **nenhum dos dois é prefixo** das duas. Com
`refetchOnWindowFocus` desligado no cliente inteiro e sem `refetchInterval`, o que sobra é a própria
mutação — então a tela só reagia ao que ela mesma fazia.

A regra: **chave inline é a versão da chave que o `invalidateFor` não conhece.** O arquivo de chaves
não é organização, é a lista do que o daemon consegue alcançar.

**O que passou a avisar antes:** um caso em `useLiveState.test.tsx` que exige `["task", "board"]` e
`["task", "settings"]` no `task.changed`, e um em `tasks-ui.test.tsx` que clica no degrau e conta
**duas** chamadas de `task.settings.query` — a leitura do clique, e não o `btn--brand`, porque a
classe estaria certa com o dado errado no cache de qualquer jeito.

### Argumento opcional no fim da assinatura apaga a função em silêncio

**Sintoma:** nenhum cartão do quadro ficava âmbar ou vermelho, nunca. O ponto agregado no cabeçalho da
coluna continuava certo, o que é o que fez isso durar: a mesma regra, lida de dois lugares, discordando
em silêncio.

**Causa:** `staleLevel(card, now, status)` tem o terceiro parâmetro opcional e cai em `card.status`
quando ele falta. Só que `BoardCard` **não tem `status`** — o daemon agrupa a resposta por coluna, e a
coluna mora no grupo —, então `column` era `undefined` e a função devolvia `null` para todo cartão.
O `TaskCard` chamava com dois argumentos; o `staleCount` do cabeçalho, com três.

O opcional existia para um objeto que carregasse o próprio estado, e nenhum dos dois chamadores é
esse. **Um `?? card.status` sobre um campo que o tipo declara opcional não falha o typecheck e não
falha o teste — ele devolve o valor neutro**, que aqui é *"não há encalhe"*: a resposta mais parecida
com estar tudo bem.

**O que passou a avisar antes:** `status` virou prop obrigatória do `TaskCard`, e o teste pergunta
pela classe (`.stale--warn`, `.stale--over`) com a mesma idade em duas colunas — `in_progress`, que
tem limiar, e `open`, que não tem.

### O ramo que "nasce sem chamador" continua sem chamador quando o chamador chega

**Sintoma:** uma sessão da esteira com `budgetCostPerDay` configurado gastava acima do teto
indefinidamente. O `decideBudget` tem três saídas e a suíte cobria as três; o ramo `block` só nunca
acontecia em produção.

**Causa:** o `budget-source.ts` passava `"human"` literal, com um comentário honesto dizendo *"quando
a Parte 2 chegar, é este arquivo que passa a saber a diferença"*. A Parte 2 chegou **no mesmo branch**,
e o literal ficou. Como `decideBudget` é pura e testada com os dois condutores, a suíte permaneceu
verde: o que faltava não era o ramo, era **o dado chegando até ele**. A garantia *"a esteira para"*
(Q45) — que é o motivo de a Parte 3 ter vindo **antes** da Parte 2 — ficou inerte, e `0 = bloqueia
tudo` virou `0 = avisa tudo` para o único condutor que não tem quem leia o aviso.

E a correção tinha uma armadilha própria: deduzir o condutor de `lumem_mode = 'free'` seria confundir
a esteira com **a sua** conversa que atravessou o portão da [`016`](../features/016-session-mode/prd.md)
— o teto interromperia justamente quem está olhando. O condutor é campo do `AcpSessionInfo`, passado no
`spawn`.

A regra: **um ramo sem chamador é um TODO, e TODO não fica verde sozinho.** Quando o chamador chega, o
teste que fecha o ciclo é o que atravessa a costura inteira, não o que exercita a função pura de novo.

### Contar a tentativa antes de saber se vai haver turno

**Sintoma:** no degrau `assistido`, um cartão preparado esperando o clique de enviar era bloqueado
sozinho em ~30 s, com `parou depois de 2 tentativas` e a autonomia dele desligada junto — sem nenhum
turno ter aberto.

**Causa:** `countAttempt` rodava antes do `return` do ramo `assistido`. `park` não muda nenhuma das
duas condições que a `queueOf` lê — a autonomia da tarefa e o turno em voo —, então o cartão preparado
**continua candidato** a cada passada, e cada passada reincrementava `attempts`. O comentário que
justifica contar antes está certo e continua lá: o que estava errado era **o que se conta**. *Antes do
prompt* não é *antes do preparo*.

**O que passou a avisar antes:** um teste que roda `MAX_ATTEMPTS + 3` passadas em `assistido` e exige
que `block` nunca seja chamado. O teste antigo asseverava `["prepareCheckout", "countAttempt", "park"]`
— ele **codificava o defeito**, que é o que um teste de sequência de chamadas faz quando a sequência
não é a pergunta.

### Uma consulta global dentro de um laço por escopo multiplica a cota por N

**Sintoma:** nenhum, e é o ponto. O §3.2 do [estudo](orchestration-measurements.md) mediu que o
polling do tracker cabe em **2,4% da cota** do Linear, e o comentário no código repetia o número.

**Causa:** `host.labelled(LUMEM_LABEL)` era chamado dentro do laço por workspace, e nem o rótulo nem a
chave têm workspace dentro — as N chamadas devolviam **o mesmo conjunto**. O custo real era `N × 2,4%`;
com ~10 workspaces, ~24% da cota gasta em chamadas idênticas. A medição estava certa sobre a consulta
e errada sobre quantas delas existem.

A regra: **quando um número medido vira comentário, o que o mantém verdadeiro é um teste que conte
chamadas.** As issues passaram a chegar de fora do `syncTracker` — quem conhece o laço é quem sabe que
a consulta é uma —, e o `loop.test.ts` cria três workspaces e exige `toHaveBeenCalledTimes(1)`.

### `mode` no `writeFileSync` só vale na criação — inclusive no teste que o cobre

**Sintoma:** nenhum. `secrets.json` nasce `0600` e o teste dizia que a permissão era reaplicada a cada
escrita.

**Causa:** `writeFileSync(path, …, { mode })` abre com `O_CREAT`, e o modo só é aplicado **quando o
arquivo é criado**. Com ele já no disco, o Node ignora o `mode` e a permissão vigente fica — então um
`~/.lumem` restaurado de um backup que não preservou modo (ou vindo de um volume que não tem modo)
ficava `0644` para sempre, com o comentário no código afirmando o contrário. O que vaza não é o
segredo, que está cifrado, e sim **quais** serviços você usa, que o
[ADR do cofre](../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) trata como
informação a proteger.

**E a armadilha de segunda ordem é a que importa:** o teste que já existia para a *chave* montava o
cenário com `writeFileSync(keyPath, readFileSync(keyPath), { mode: 0o644 })` — pela mesma regra, isso
**não muda permissão nenhuma**. O cenário nunca acontecia, e o teste ficava verde com o `chmodSync` da
`key()` apagado. Provado removendo os dois `chmod`: só depois de o setup virar `chmodSync` é que os
dois casos ficam vermelhos.

A regra: **um teste de permissão tem que provar que consegue estragar a permissão** antes de afirmar
que o código a conserta.

### Índice de arrasto lido da lista filtrada, gravado como prioridade

**Sintoma:** com `precisa de mim` ligado, arrastar um cartão gravava a prioridade errada — e
persistente. Soltar no corpo da coluna inseria no meio em vez do fim.

**Causa:** o `index` saía do array já filtrado, e o daemon o lê como posição **na coluna inteira**,
renumerando-a numa transação — posição **é** prioridade. O defeito só aparece nas colunas da máquina
(`in_progress`, `review`, `testing`), que são as únicas em que o filtro esconde cartões — justamente
onde a ordem alimenta a esteira. Em `open` e `ready_to_merge` o `needsYou` não esconde nada, os dois
índices coincidem, e o gesto parece correto.

Não havia **nenhum** teste de arrasto — a mesma lacuna que a Q38 já tinha registrado ao descobrir que
o arrasto para `In Progress` *"já funcionava, sem um único teste cobrindo"*. O conserto é uma
tradução, não uma regra nova, e o terceiro caso do teste é o que garante isso: com o filtro desligado,
o número é o mesmo de sempre.

### Decidir remover e não passar `--force` é um interruptor que nunca remove

**Sintoma:** com *"PR mesclada sempre remove"* ligado e a worktree mesclada porém suja, o `finish`
devolvia erro para a tela. Na prática o interruptor nunca removia worktree suja, que é o **único**
caso para o qual ele foi escrito.

**Causa:** `decideCleanup` devolve `remove` com a frase `mesclada — N arquivos não commitados
descartados`, e a chamada seguinte usava `force: false`. `git worktree remove` sem `--force` recusa um
checkout com arquivo modificado ou não rastreado, e a exceção subia **depois** de a tarefa já estar em
`done` e do `stopAll`, mas **antes** de a linha sair do banco: tarefa concluída, scripts parados,
worktree intacta e erro na tela — o split que o comentário logo acima existe para evitar.

A decisão estava certa e testada; o que faltava era **executá-la**. É o mesmo formato do teto de
orçamento acima — uma função pura com todos os ramos cobertos, e o lado sujo não fazendo o que ela
decidiu.

**O que passou a avisar antes:** git de verdade, porque a recusa é do git e nenhum dublê a reproduz —
um checkout mesclado com arquivo não rastreado, e as três pontas asseridas juntas (o disco, a linha do
banco e a resposta da chamada), porque o defeito deixava as três em desacordo.

### O ramo de criação sem a guarda que o ramo de atualização tem

**Sintoma:** uma issue do Linear que já chega fechada com o rótulo `lumem` — rótulo posto numa issue
concluída, ou issue fechada antes da primeira passada — virava cartão em `open`.

**Causa:** o ramo `!existing` do `syncTracker` não olhava `issue.state`, enquanto o `changeOf` bloqueia
e desliga a autonomia quando uma issue **transiciona** para fechada. `open` é etapa devida da esteira e
a tarefa nasce em `autonomy: "inherit"`: num workspace em `autônomo`, a esteira puxaria o cartão e
gastaria um turno — cota, e possivelmente uma PR — num trabalho que o tracker já diz concluído.

**Bloqueada, e não pulada.** Pular deixaria o rótulo sem efeito visível nenhum, e *"marquei e não
apareceu nada"* é indistinguível de a integração estar quebrada.

A regra: **quando um ramo de atualização tem uma guarda, o ramo de criação precisa da mesma pergunta.**
O estado inicial é só o caso em que a transição já tinha acontecido antes de você chegar.

### Um instantâneo lido no começo da passada, usado no fim dela

**Sintoma:** todo primeiro turno de um cartão sem checkout era desperdiçado. O agente commitava, o
`test` passava, e o portão devolvia `unfinished` com *"a tarefa não tem checkout para julgar"* —
gastando uma tentativa e podendo bloquear o cartão cedo demais.

**Causa:** o `gate` lia `entry.task.worktreeId`, e `entry.task` é a **linha como ela estava no início
da passada**. Uma tarefa que entra na esteira sem worktree ganha a dela no `prepareCheckout`, que
escreve no banco e não muta o objeto em memória — o ponteiro continuava nulo. Dispara em qualquer
cartão de `open`, que é onde a issue do tracker cai.

A regra: **um objeto lido no começo de um fluxo não descreve o fim dele.** O conserto não é reler — é
passar adiante o que acabou de ser produzido, que é um argumento em vez de uma consulta.

### Falha antes do contador é repesca infinita

**Sintoma:** com a worktree registrada mas o diretório apagado do disco (`git worktree prune`, um `rm`
manual), a esteira repescava o mesmo cartão a cada 15 segundos **para sempre**. Sem tentativa gasta,
sem bloqueio, e o único rastro um `conveyor-tick-failed` no log de um daemon que ninguém está olhando.

**Causa:** a exceção subia de `prepareCheckout`, que roda **antes** do `countAttempt`. Todo o desenho
de *"tentativa gasta, com o motivo"* mora depois desse ponto — o comentário do código já dizia que era
isso que deveria acontecer, e o fluxo não passava por lá.

O conserto tem duas metades, e a segunda é a que se lê: a falha passa a contar tentativa e bloquear, **e**
o sumiço do diretório passa a ter frase própria. Sem ela, o que chegava ao cartão era `ENOENT: no such
file or directory` — que não fala de worktree nenhuma para quem está lendo um quadro de tarefas.

A regra: **todo caminho que pode falhar repetidamente precisa passar pelo contador**, senão o limite
de tentativas protege só os caminhos que já funcionavam.

### `200 OK` com `success: false` é uma falha que não lança

**Sintoma:** nenhum. Um marco no tracker ficava registrado como escrito e o comentário nunca saía.

**Causa:** as mutations do Linear selecionam `{ success }` e o host descartava o resultado. Uma
mutation recusada — issue arquivada, token sem permissão de comentar — volta **HTTP 200** com
`success: false` e **sem** `errors`, então nada no envelope lança. E o `writeMark` reserva o marco
**antes** de escrever, de propósito: o preço declarado dessa escolha é *"o marco fica registrado sem
ter saído"*, com a falha aparecendo no log. Sem conferir o `success`, ela não aparecia em lugar nenhum
e o marco nunca mais seria tentado.

A regra: **selecionar um campo de resultado e não olhá-lo é pior que não selecioná-lo** — o código
parece conferir.

### Um teto de paralelismo que a execução em série nunca alcança

**Sintoma:** nenhum, e o Open Design desenha o número: `autônomo · teto 2 · 2 em uso`. O `2 em uso`
não acontecia nunca.

**Causa:** o `tick` percorria as vagas com `await` em série, e cada `runOne` espera o **turno
inteiro** — a segunda vaga só começava quando a primeira acabasse. Pior: o laço do daemon percorria os
workspaces em série com um único sinalizador de *"passada em andamento"*, então um turno pendurado num
workspace segurava todos os outros por até os 30 minutos do teto, e um `throw` num deles acabava a
passada antes dos seguintes serem lidos.

**A concorrência foi medida antes de escrita**, porque o risco real era o git: 72 `git worktree add`
simultâneos no mesmo repositório, seis de cada vez, doze rodadas — **zero falhas**. O teste do pico
conta turnos em voo (`peak`), e não chamadas: com `toHaveBeenCalledTimes(2)` a versão em série também
ficaria verde.

### Uma restrição escrita em comentário não é uma restrição

**Sintoma:** nenhum, e o código dizia *"é a esteira, e só ela"*.

**Causa:** `session.createAgent` é `publicProcedure` e aceitava `autonomous: z.boolean()` direto do
fio. Com `true`, a sessão nasce no modo que **nunca pergunta permissão** — então qualquer chamador na
porta local (um `curl`, um script na própria página que a `014` serve) abria uma conversa que
auto-aprova toda ferramenta, contornando por fora o portão por sessão da
[`016`](../features/016-session-mode/prd.md).

O conserto **não é autenticação**, e chamar de autenticação seria pior que não ter: o produto é local,
de uma pessoa, e toda procedure é pública. O que ele faz é separar a porta que o daemon usa da porta
que a tela usa — um campo `internal` no contexto, ligado no único chamador do lado do servidor.

A regra: **se o comentário descreve quem pode chamar, o teste é quem impõe** — e o teste aqui é uma
recusa, não uma convenção.

### Memória de aba que só é limpa no caminho de erro

**Sintoma:** o contador *"N pararam enquanto você não estava"* travava, e uma tarefa que encalhava
**de novo** nunca notificava — até um reload inteiro.

**Causa:** o `Set` de *"já tratei"* do hook de notificação era limpo num lugar só: o `catch` da
marcação. Mas o daemon zera `notified_at` a **cada troca de estado**, então a mesma tarefa reentra num
estado de aviso com uma frase nova — e a aba, lembrando do id para sempre, dava `continue`, nunca
chamava `markNotified` e deixava `notified_at` nulo.

A regra: **um cache com entrada e sem saída é um vazamento de estado, não um cache.** O sinal de saída
já existia e estava sendo ignorado: a frase vir nula **é** o daemon dizendo que registrou.

### Texto de leitor de tela é texto, e a suíte procura por texto

**Sintoma:** um caso do `pull-request.spec.ts` que não tinha sido tocado passou a falhar com
*"strict mode violation: resolved to 2 elements"*, e o segundo elemento era um `<span class="sr-only">`
de outra tela.

**Causa:** a linha `Tarefas` da sidebar ganhou `1 tarefa precisa de você` para leitor de tela, e a
barra de PR já tinha um grupo de checks chamado `precisa de você`. O `sr-only` não está **na tela** —
`clip-path: inset(50%)` — mas está no **`textContent`**, que é por onde `getByText` procura. É a
armadilha do *mesmo nome em duas peças* que a `021` já pagou com 22 e2e, com uma volta a mais: a peça
nova é invisível.

O conserto é dos dois lados, e os dois se pagam: a frase nova virou `esperando você` — duplicar uma
frase que o produto já usa para outra coisa é ruim em copy antes de ser ruim em teste — e a asserção
antiga ganhou `{ exact: true }`, porque uma frase curta sem âncora quebra de novo no próximo texto
que a contiver.

A regra: **ao escrever `sr-only`, procure a frase na suíte antes.** Ela conta como texto para todo
`getByText` do repositório.

### Um caso que não pode falhar é um caso que não existe

**Sintoma:** nenhum — o e2e *"o bloco não rola com a árvore"* passava, inclusive contra o código com o
bloco deslocado 40px.

**Causa:** ele rolava a `.tree` e comparava o `y` do bloco antes e depois. **No fixture a árvore não
rola**: um projeto e três linhas cabem inteiros na coluna, então `scrollTop = scrollHeight` não move
nada e os dois `y` são iguais por construção.

O que o expôs foi uma linha de **teste do teste** — `expect(rolou).toBeGreaterThan(0)` sobre o
`scrollTop` que a rolagem produziu —, e ela ficou vermelha na hora. O conserto é encolher a janela
para 320px de altura, e aí o caso existe: com o bloco movido para dentro da `.tree`, o `y` sai de 89
para 76 e ele falha.

A regra é a que a seção de convenções já tem, dita de outro jeito: **asserção que não pode falhar
conta como teste faltando** — e a maneira de descobrir é asserir a **premissa** do caso, não só a
conclusão.

### Uma porta injetada e falsa em todo teste é uma costura sem teste

**Sintoma:** o daemon **recusava as próprias escritas**, e nada falhava. Três das quatro setas da
esteira — `open → in_progress`, `review → testing`, `testing → ready_to_merge` — lançavam `BLOCKED`,
o `throw` subia até o `catch` do laço e virava uma linha de log. As 48 tasks da `028` fecharam com a
suíte verde.

**Causa:** a esteira escreve com `setStatus(..., { actor: "agent" })`, e o `AGENT_MAY_SET` da `022` só
permite `review` — uma regra **certa**, que existe para impedir um agente de se declarar pronto. O
erro é a esteira se declarar um: ela é o daemon.

**E o motivo de ninguém ver:** o `conveyor.test.ts` injeta um `advance` **falso**. Ele prova a política
da esteira — a ordem das coisas, o que acontece quando o portão reprova — sem tocar o banco, e isso é
uma escolha boa. O que faltava era o outro arquivo: **não existia `conveyor-ports.test.ts`**, então a
tradução entre a política e o repositório nunca foi exercitada por nada.

O custo de não ter: uma tarefa de verdade, **US$ 11,41** e 453 884 tokens em seis sessões, com o
cartão parado em `In Review` e o revisor rodando contra ele até esgotar as tentativas. O sintoma que
chegou foi *"o revisor travou"* — que é a leitura errada de tudo.

A regra: **injetar a ponta é o que torna a política testável, e é o que torna a tradução invisível.**
Toda porta que um teste substitui por um dublê precisa de um segundo arquivo que a exercite de
verdade — e o `as "review"` naquela linha era o tipo mentindo exatamente onde o runtime recusava.

### O e2e da esteira joga o log do daemon fora

**Sintoma:** dois casos do `conveyor.spec.ts` ficaram vermelhos com
`blockedReason` **nulo** — o cartão simplesmente não bloqueava —, e a mensagem do Playwright não dizia
por quê, porque o defeito estava no daemon e não no navegador.

**Causa:** o `startDaemon` do e2e sobe o processo com `stdio: "ignore"`. Tudo que o daemon escreve —
inclusive o `conveyor-tick-failed`, que existe exatamente para dizer por que uma passada falhou — é
descartado. Diagnosticar exigiu trocar para `inherit` à mão, rodar um caso, ler, e reverter.

Com o log ligado, a resposta veio na primeira linha: `ACP connection closed`.

A regra: **quando o sujeito do teste é o daemon, o log dele é parte da saída do teste.** Trocar dois
caracteres à mão funciona uma vez; o custo é lembrar que dá.

### Fechar e retomar a conversa a cada turno não é de graça

**Sintoma:** o mesmo. A esteira contava tentativa, abria a sessão, e o `prompt` morria com
`ACP connection closed` — então o turno nunca era julgado e o cartão nunca bloqueava com o motivo do
portão.

**Causa:** duas tasks da Parte 7 se contradiziam sem que nenhuma das duas estivesse errada. A **T52**
manda fechar a conversa que a esteira abre (a `LUM-51` deixou três vivas). A **T57** manda a tentativa
seguinte continuar a conversa do mesmo encaixe, em vez de pagar o contexto de novo. Juntas, viravam
*fechar e retomar a cada turno* — e `session/load` sobe um adaptador **novo**: o par cliente/servidor
não sobrevive ao ciclo imediato.

O conserto não é escolher uma das duas: é **fechar no fim da etapa, e não no fim do turno**. A segunda
tentativa do mesmo encaixe continua no **mesmo processo** — o que a T57 queria, por um caminho mais
curto e sem `load` nenhum —, e a conversa fecha quando a tarefa avança, volta ou bloqueia.

A regra: **duas tasks que se contradizem no código é desenho que faltou**, e a medição é que diz qual
das duas leituras existe. Nenhum teste unitário pegaria esta — os dois lados têm dublê.

### Uma resposta que não grava nada é uma resposta que não aconteceu

**Sintoma:** com um revisor que **acertou** — *"olhei e não achei nada que segure"* —, o cartão ficava
em `In Review` até esgotar as tentativas. O portão respondia `o revisor não deixou parecer`, e o
revisor tinha deixado.

**Causa:** o parecer vazio é `{"findings":[]}`, e ele não grava linha nenhuma em `task_finding`. O
portão lia **os achados** para decidir se houve parecer, e a lista vazia é indistinguível de *"não
postou nada"*. O `decideGate` até distingue os dois casos (`null` contra `[]`) — o que não existia era
a informação para preencher a distinção.

O conserto é o **recibo**: uma linha em `task_review` dizendo que a revisão aconteceu, com o tamanho
dela. O parecer é o evento; os achados são o conteúdo.

A regra: **uma decisão sobre "isto aconteceu?" não se deriva do conteúdo do que aconteceu**, porque o
conteúdo vazio é o caso que importa. E o pior modo de falha de um portão é punir a resposta certa —
aqui ele punia exatamente o comportamento que a feature inteira existe para tornar possível.

### A coluna nula que a leitura de cima resolvia

**Sintoma:** a esteira não abria PR nenhuma e não comentava nada — em silêncio, e **só** nos projetos
adicionados por caminho, que são a maioria. Nenhum teste de unidade via: todos eles criam o projeto
com `remoteUrl` preenchido.

**Causa:** `project.remoteUrl` só é gravado no **clone**. Quem adiciona por caminho fica com `null`, e
a `013` já resolvia isso — `project.remoteUrl ?? git.getRemoteUrl(path)` —, mas **dentro do router da
PR**. A esteira leu a coluna crua em três lugares.

É a **segunda vez** que esta metade é esquecida: a barra da `013` pagou o mesmo defeito, e foi um e2e
que achou lá também. Agora a regra mora em `pr/remote.ts`.

A regra: **quando uma coluna precisa de uma leitura para valer, a leitura é a fonte — e ela mora num
arquivo, não numa camada.** Uma segunda cópia da resolução é a cópia que esquece a segunda metade.

### Um fake que repete o mesmo trabalho não trabalha na segunda vez

**Sintoma:** o cartão do e2e da esteira andava uma etapa e parava. O turno seguinte do mesmo encaixe
nunca acabava, e o teste morria no teto de tempo dizendo `timeout`.

**Causa:** o agente falso escrevia **o mesmo conteúdo** no mesmo arquivo a cada turno. Na segunda
passada não havia o que commitar, `git commit` saiu diferente de zero, o `execFileSync` lançou, e a
resposta do `session/prompt` nunca foi enviada — o daemon esperou os 30 minutos do teto.

Dois consertos, e os dois valem: o conteúdo passou a mudar a cada turno, e **o turno acaba mesmo que o
trabalho falhe** — um fake que lança é um turno que pendura, e o sintoma não fala do fake.

A regra: **um dublê que simula trabalho precisa simular trabalho diferente**, e nada que ele faça pode
deixar o protocolo sem resposta.

## Convenções

- Teste de git usa **repositório temporário real**, nunca mock. `git worktree` tem caso de borda em nome com barra e branch existente que mock nenhum reproduz.
- Cada teste de banco recebe um SQLite em arquivo temporário próprio — é o que sustenta o "parallel-safe" da matriz.
- E2E de agente usa **configuração de fixture**, nunca o `claude` de verdade: senão o teste depende de autenticação, quota e rede.
- Asserção fraca conta como teste faltando. Se dá pra mutar o código e o teste continua verde, o teste não existe.
