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
| `server/` regra de **transporte** — limite de corpo, GET vs POST, status | integration sobre HTTP (`app.inject`) | Sim — o caller é cego a estas três |
| `server/` endpoint WebSocket | integration | Sim |
| `server/` transporte **ACP** | integration com **agente falso** no outro lado do pipe — o SDK nos dois lados, wire ndjson de verdade, **zero token** | Sim |
| **conversa ACP** de ponta a ponta | e2e contra `e2e/support/fake-acp-agent.mjs` — agente ACP de verdade sobre stdio de verdade, **zero token**. Exercita o turno inteiro: mensagem, ferramenta, permissão, plano, uso, comandos e o terminal que o agente pede. É onde vivem as medidas que jsdom não faz, porque jsdom não tem layout | **Não** |
| `server/` handshake do **adaptador real** | integration **marcado**: pulado quando `claude-agent-acp` não está no PATH. Para em `initialize` + `session/new`, que o spike mediu em zero token | Sim |
| `web/` componente | unit (Vitest + Testing Library) | Sim |
| `web/` tokens e paleta | unit, **e exige `python3`** — roda o gerador e compara byte a byte com o commitado | Sim |
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

**O gate rápido ficava vermelho quando só o e2e mudava — e o teste dele fixava isso como certo.** `e2e/**/*.ts` casava `GRAPH_GLOBS` e ia para o `vitest run --changed`, mas os projetos do vitest são `packages/*` e `scripts`: spec de playwright não está no grafo de módulo de teste nenhum. Seleção vazia com `passWithNoTests: false` sai com código 1, e o HEAD do branch respondia vermelho ao gate que o `CLAUDE.md` manda todo mundo rodar.

É a **quarta** desta família — as outras três foram cache do Turborepo (duas vezes) e `LUMEM_GATE_BASE` numérica — e a primeira em que **o próprio teste do gate congelava o defeito**: `gate-quick.test.ts` asseria que uma spec de e2e *casa* com os globs de grafo. Consertar o script sem mexer no teste deixaria o teste vermelho, e a tentação seria desfazer o conserto.

Hoje `e2e/**` é categoria própria, checada **depois** do grafo — fonte tocada junto com spec continua selecionando os testes afetados —, e a mensagem diz a verdade em vez de calar:

```
gate:quick — only the e2e suite changed since HEAD^; vitest has nothing to run.
Playwright is not in this gate: run `pnpm gate:full`.
```

A decisão por trás: **o gate rápido não sobe daemon.** Fazer ele rodar playwright quebraria o contrato de segundos que é a razão de ele existir, e a task de e2e já declara `Gate: full`. O que não podia continuar era o silêncio — um "nada mudou" num commit que mudou uma suíte inteira é o mesmo defeito virado do avesso.

Irmão conhecido e **ainda aberto**: `playwright.config.ts` é `*.ts` na raiz, casa `GRAPH_GLOBS`, e nenhum projeto do vitest o importa. Um commit que só mexa nele vai vermelho pela mesma razão.

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

Hoje um teste de vitest roda o gerador num tmpdir e compara `tokens.css`, `tokens.ts` e `palette.json` **byte a byte** com os commitados. A propriedade é mais forte que rodar o script: ela pega **regressão de contraste** (o gerador sai com código 1 diante de qualquer par reprovado) e **edição à mão do arquivo gerado**, que é o outro jeito de a paleta derivar.

Consequência operacional, e ela é nova: **a suíte unitária do `web` passou a exigir `python3`.** Numa máquina sem ele o teste **falha, não pula** — guarda que se auto-desliga é exatamente o defeito que este registro descreve. O `ubuntu-latest` do CI já traz `python3`, e o gerador só usa biblioteca padrão.

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

**Estado do e2e sobrevivendo entre execuções.** `.lumem-e2e/` é caminho fixo e não havia limpeza. Inofensivo enquanto o daemon não escreve nada; a partir do banco, a segunda execução herda os workspaces da primeira e o teste que cria `pessoal` quebra em constraint de unicidade — flaky por histórico, o pior vermelho de diagnosticar. Hoje o `globalSetup` do Playwright apaga o diretório antes da suíte.

---

## Convenções

- Teste de git usa **repositório temporário real**, nunca mock. `git worktree` tem caso de borda em nome com barra e branch existente que mock nenhum reproduz.
- Cada teste de banco recebe um SQLite em arquivo temporário próprio — é o que sustenta o "parallel-safe" da matriz.
- E2E de agente usa **configuração de fixture**, nunca o `claude` de verdade: senão o teste depende de autenticação, quota e rede.
- Asserção fraca conta como teste faltando. Se dá pra mutar o código e o teste continua verde, o teste não existe.
