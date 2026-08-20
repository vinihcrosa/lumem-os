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
| **conversa ACP** de ponta a ponta | e2e contra `e2e/support/fake-acp-agent.mjs` — agente ACP de verdade sobre stdio de verdade, **zero token**. Exercita o turno inteiro: mensagem, ferramenta, permissão, plano, uso, comandos e o terminal que o agente pede. É onde vivem as medidas que jsdom não faz, porque jsdom não tem layout | **Não** |
| `server/` handshake do **adaptador real** | integration **marcado**: pulado quando `claude-agent-acp` não está no PATH. Para em `initialize` + `session/new`, que o spike mediu em zero token. Desde o `onboarding`, ele também confere o **`agentInfo`** — é onde a versão pinada vem, e uma release do adaptador que parasse de mandá-la viraria um `null` silencioso | Sim |
| `server/` **pré-voo da máquina** e detecção de binário | unit com `PATH` e executor de processo **fabricados**: os casos que interessam — git 2.29, git ausente, `--version` que trava, `statfs` que estoura — não existem numa máquina que funciona | Sim |
| `server/` **instalação do adaptador** | unit com `npm` dublado: os casos que interessam — npm ausente, registry inalcançável, npm saindo 0 sem escrever o binário — são os que uma rede que funciona não produz. **Nenhum `npm install` de verdade roda na suíte** | Sim |
| `server/` **login do agente** | integration com agente falso: roda o comando que o adaptador nomeou e **recusa** id que ele não ofereceu. É a guarda que impede o cliente de mandar uma linha de comando | Sim |
| `server/` **sonda ACP** | integration com agente falso, **zero token** (não há `session/prompt` no caminho). O teste com dentes é o do processo: sem o `kill` no `finally`, o caminho em que `session/new` recusa deixa adaptador órfão | Sim |
| `server/` **transcrição em disco** | integration com SQLite em arquivo temporário — um banco por sessão, e o teste que reabre o arquivo com um store novo é o que prova que a conversa sobrevive ao processo | Sim — cada teste cria seu próprio tmpdir |
| `server/` **passe de manutenção** de transcrição | integration com filesystem de verdade: comprime a fria, poupa a viva, apaga a órfã. Um dos testes exige que o arquivo **encolha de fato** — sem isso a decisão de comprimir é cerimônia | Sim |
| **configuração de agente pela tela** | e2e que não toca na API para nada: workspace, projeto, agente e sessão, tudo pelo formulário. É a única prova que interessa, porque o resto da suíte cria a configuração pela API — que é justamente o caminho que a fase 6 existe para tornar dispensável | **Não** |
| **primeiro acesso** de ponta a ponta | e2e `00-onboarding.spec.ts`, e o prefixo `00-` é estrutural: é o único spec que precisa de daemon **sem workspace**, e qualquer outro spec rodando antes cria um. Ele sai de `~/.lumem` vazio e chega a um turno respondido **sem tocar a API** em nenhum passo — que é o caminho que a feature existe para tornar dispensável, e a razão pela qual o resto da suíte pode continuar usando. O adaptador é um shim com o nome `claude-agent-acp` no PATH do daemon, porque **detectar** é parte do que está sendo provado | **Não** |
| **memória do workspace** de ponta a ponta | e2e `memory.spec.ts`. O buraco que a integração das duas pilhas revelou: a feature tinha ~357 testes de unidade e integração e **nenhum** e2e, e a tela dela é a terceira aba do painel direito. A API entra como **setup** e é a única forma honesta — uma proposta nasce de ator não-humano escrevendo para cima (Q27), e não existe gesto de tela que produza uma. O que está sob teste é a revisão, e o que prova a aprovação é o **daemon**: a proposta sai de pendente e a memória passa a existir no acervo | **Não** |
| **painel de login** de ponta a ponta | e2e contra o adaptador de fixture: a versão vem do handshake, não existe botão `sair` porque o adaptador não declara `auth.logout`, e a gaveta `avançado` mostra o comando como fato. O clique `nenhum → conectado` **não** está aqui, e o spec diz por quê — chegar nesse estado no meio da suíte exige remover configuração que pode estar em uso | **Não** |
| **retomada de conversa** de ponta a ponta | e2e em duas metades, porque a afirmação tem duas. O **reinício** só dá contra daemon que a suíte controla (o Playwright não reinicia o que ele gerencia) e é conduzido pela API, que o §7 do PRD exige poder fazer tudo que o cliente faz; a **tela** — conversa encerrada em leitura e o botão que retoma — é a metade do browser, contra o daemon compartilhado. Ambas com o agente falso, **zero token** | **Não** |
| `server/` CLI | integration **in-process** — a função (`runMemoryCli`) recebe `env`, `out` e `err` por parâmetro | Sim — nada de `process.env` nem de captura de `process.stdout` |
| `web/` componente | unit (Vitest + Testing Library) | Sim |
| `web/` **porte de CSS** | unit que lê os arquivos, nas **duas direções**: classe pedida por componente que não existe no stylesheet, e classe definida que ninguém pede. jsdom não aplica stylesheet, então é a única forma de ver regra faltando. A lista de componentes é `readdirSync`, não array — array deixa de estar completo no dia em que alguém acrescenta tela | Sim |
| `web/` tokens e paleta | unit — roda os 99 pares de contraste declarados, a escada de cinzas, e confere que o `tokens.ts` commitado é o que a derivação produz do `tokens.css` | Sim |
| `web/` fluxo de usuário | e2e (Playwright) | **Não** — daemon único, porta única, estado compartilhado |

**Consequência dura:** task cujo `Tests` é `e2e` **não pode** receber `[P]`. O gargalo é a execução do teste, não o código.

---

## Gates

| Gate | Comando | O que garante |
|---|---|---|
| `quick` | `pnpm gate:quick` | Testes afetados pelo trabalho atual |
| `full` | `pnpm gate:full` | Suíte inteira + e2e |
| `build` | `pnpm gate:build` | Typecheck de todo TS do repositório + build do web |

### Na PR, os mesmos gates

`.github/workflows/ci.yml` roda em **toda PR, contra qualquer branch**, em dois jobs paralelos: `checks` (`gate:build` e a suíte unit/integration) e `e2e` (Playwright com chromium). São os mesmos comandos da máquina, na mesma ordem — se passou aqui e falhou lá, a diferença está no ambiente, não no critério.

Duas coisas que o runner precisa e a máquina de quem desenvolve já tem:

- **Identidade do git.** A suíte commita dentro dos repositórios de fixture — inclusive de dentro de um terminal, no spec da coluna de arquivos. Sem `user.name`, o `git commit` recusa.
- **O navegador.** Só o chromium, que é o único projeto do `playwright.config.ts`.

**O filtro de branch já mordeu, e a mordida é silenciosa.** Enquanto o gatilho era `branches: [main]`, PR encadeada — feature que sai de outra feature ainda não mergeada — não disparava CI nenhum. Ausência de check não aparece como vermelho; aparece como nada, e `gh pr checks` responde "no checks reported" para quem for procurar. A PR do `file-editor` foi aberta assim: 50 commits de código que escreve em disco, 961 testes verdes no macOS, **zero execuções em Linux** — justamente onde três dos defeitos históricos desta base apareceram, e onde um teste de guarda de caminho se auto-pula por o filesystem ser sensível a caixa.

Hoje o gatilho é `on: pull_request`, sem filtro. PR é PR.

Falha guarda `playwright-report/` e `test-results/` como artefato por 7 dias: o config já grava trace em `retain-on-failure`, e sem subir isso o rastro morre com o runner.

**O CI achou três defeitos de teste na primeira execução, nenhum de produto** — todos escondidos por o desenvolvimento acontecer só no macOS:

| O quê | Por que passava no macOS |
|---|---|
| `PtyManager` assertava buffer vazio ao spawnar binário inexistente | O Linux escreve `execvp(3) failed.` no PTY; o macOS não escreve nada |
| `execGit` corria `git log --all` contra um orçamento de 1ms | No Linux o comando termina antes do timer, e o teste falha perguntando por que um comando travado respondeu. Hoje usa `hash-object --stdin`, que bloqueia de verdade |
| `startDaemon` sinalizava só o `pnpm`, não o daemon | No Linux o daemon sobrevivia ao `stop`, a porta seguia ocupada e o teste de reinício lia o estado de um processo que nunca reiniciou. Hoje o filho tem grupo próprio e o SIGTERM vai para o grupo |

Mais um de produto-adjacente: o vite escutava no default `localhost`, que num runner com IPv6 resolve para `::1` — e o Playwright pede `127.0.0.1`. Hoje o dev server declara o endereço.

### Por que `gate:quick` é um script e não `vitest --changed`

Duas falhas em direções opostas, e evitar uma de cada vez criou a outra:

1. `vitest run --changed` sem argumento compara contra alterações **não commitadas**. Com a árvore limpa — o estado logo depois de todo commit — ele sai com código 0 sem executar teste nenhum. Verde por vacuidade.
2. Corrigir só com `passWithNoTests: false` troca falso-verde por **falso-vermelho**: todo commit de documentação passa a derrubar o gate, e gate que grita à toa é gate que as pessoas aprendem a ignorar.

`scripts/gate-quick.ts` pergunta ao git se algum arquivo de código mudou. Se nenhum mudou, não há o que rodar e isso é um sucesso legítimo. Se mudou, o vitest **tem** que selecionar e rodar algo — seleção vazia é falha. A base é `HEAD^`, pode ser trocada por `LUMEM_GATE_BASE`, e passa por `git rev-parse` antes de chegar ao vitest — pelo motivo registrado na primeira armadilha abaixo.

### Por que `gate:build` não é `tsc --noEmit && turbo build`

O `tsc` puro na raiz não enxergava `e2e/`, `playwright.config.ts` nem os `vitest.config.ts` — nenhum `tsconfig` os incluía, e erro de tipo neles passava direto. Hoje existe um `tsconfig.json` na raiz cobrindo `e2e/` e os configs da raiz, cada pacote inclui o próprio `vitest.config.ts`, e `gate:build` roda `pnpm typecheck` = `tsc` na raiz **e** `turbo typecheck` nos pacotes.

---

## Armadilhas já corrigidas

Registro do que já mordeu, pra não voltar:

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

**Um `git commit` que falha depois do `git add` deixa a mudança no índice — e o commit seguinte a varre junto.** O `commitChange` é deliberadamente não-fatal: com o repositório impedido de commitar, a escrita ainda acontece e a falha vira aviso ([T3](../prd/workspace-memory/tasks.md)). O que não estava previsto é que o `add` já rodou: o arquivo fica **staged**, e o próximo `commit` — de qualquer outra memória — leva junto o que ninguém pediu naquele commit.

Apareceu escrevendo o teste da chave de idempotência do `revert`, que precisava de um `commit: null` **sem** mover o histórico do arquivo. Injetar a falha no `commit` não servia: o commit seguinte movia o histórico assim mesmo, e o teste media outra coisa. A falha passou a ser injetada no **staging**, e o comentário no teste diz por quê.

Fica anotado como **P6** no [tasks.md da memória](../prd/workspace-memory/tasks.md): agrupar commit por transação resolve esta e a P4 de uma vez.

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

A API importa e a troca é silenciosa: `fs/promises.realpath` canoniza a caixa da última componente no macOS, e `fs.realpathSync` **não** — trocar uma pela outra devolveria `.GIT` como alvo de escrita, com a suíte verde no Linux do CI. A regra de produto que ficou disso está no §5 do [PRD do file-editor](../prd/file-editor/prd.md): toda checagem vale sobre o caminho **resolvido**, inclusive a última componente. Tudo era canonizado por `realpath` menos ela, e a assimetria era o buraco.

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

## Convenções

- Teste de git usa **repositório temporário real**, nunca mock. `git worktree` tem caso de borda em nome com barra e branch existente que mock nenhum reproduz.
- Cada teste de banco recebe um SQLite em arquivo temporário próprio — é o que sustenta o "parallel-safe" da matriz.
- E2E de agente usa **configuração de fixture**, nunca o `claude` de verdade: senão o teste depende de autenticação, quota e rede.
- Asserção fraca conta como teste faltando. Se dá pra mutar o código e o teste continua verde, o teste não existe.
