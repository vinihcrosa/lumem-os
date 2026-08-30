# A barra da pull request — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **16 tasks em 6 fases, nenhuma iniciada.** O desenho está fechado no Open Design
(`lumem-pr-bar.html`), renderizado e verificado. A ordem é a do risco, e ela mudou na v0.2: a
**estrutura vem primeiro** — ela mexe em tela que já funciona —, e o spike do `gh` vem em seguida,
porque a feature inteira depende de uma saída de programa que ninguém mediu ainda.

---

## Antes de começar

**O que trava:** a **[Q1](open-questions.md)** — `gh` ou API com token nosso. Ela decide se a fase 2
existe do jeito que está escrita. As **Q3** e **Q4** decidem se a feature termina lendo ou passa a
escrever no remoto. A **Q11** decide se a fase 1 nasce com uma linha fina de estado ou sem ela.

**O que não trava:** o desenho (feito e sincronizado), o `git-url.ts` (já parseia remote e host, com
teste), o `resolveScope` (já resolve worktree → diretório), o `execGit` (o molde de "executar processo
com timeout e erro classificado") e o barramento de eventos.

**Por que a fase 1 é a estrutura:** ela **move** informação de uma tela que já é testada. Fazer isso
junto com a feature nova produziria um diff em que ninguém consegue dizer o que quebrou o quê — e o
alvo dos testes da [worktree-tabs](../worktree-tabs/tasks.md) muda no caminho.

---

## Fase 1 — a estrutura: a worktree vira a primeira aba

#### E1: O cabeçalho vira aba

**What**: `ScopePanel` deixa de ter cabeçalho com título e chips; a coluna do meio passa a ser
caminho → abas → conteúdo.
**Where**: `packages/web/src/components/ScopePanel.tsx`, `WorktreePanel.tsx`, `LocalPanel.tsx`,
`detail.css` + testes

**Done when**:
- [ ] Acima da faixa de abas fica **só o caminho** (`workspace / projeto / worktree`), com os dois
      primeiros segmentos navegando como já navegam
- [ ] A primeira aba é a da worktree: **primeira, fixa, sem `✕`** — fechar a worktree dentro da
      worktree não quer dizer nada
- [ ] Ela é a aba padrão ao entrar num checkout, e é para onde a seleção volta quando a última sessão
      fecha
- [ ] O comentário do `ScopePanel` que justifica o cabeçalho acima da faixa é **reescrito**, não
      apagado: ele passa a dizer o que mudou e o que a mudança cobra (§2.1 do PRD)
- [ ] Os testes que provavam branch, caminho e sujeira no cabeçalho **continuam existindo** e passam a
      apontar para a aba
- [ ] A mudança de altura da coluna **remede o terminal** — o `FitAddon` mede uma caixa que mudou
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): a worktree deixa de ser cabeçalho e vira a primeira aba`

---

#### E2: O que não cabia no cabeçalho

**What**: A aba da worktree ganha o que o daemon já sabe e a tela não mostrava.
**Where**: `packages/web/src/components/WorktreePanel.tsx` + testes

**Done when**:
- [ ] Caminho em disco **inteiro**, sem truncar, com botão de copiar
- [ ] Base com `↑/↓`, estado da árvore com a contagem de arquivos, e quando a worktree foi criada
- [ ] Sessões da worktree em lista, com estado e idade
- [ ] Ações (`nova sessão`, `remover worktree`) na aba, e a recusa de remoção continua sendo mostrada
      onde ela é acionada
- [ ] Nada que já existia em outra tela é duplicado aqui: consumo, memória e diff continuam onde estão
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree mostra o que o cabeçalho não cabia`

---

#### E3: O ponto de sujeira na aba

**What**: O pedaço do estado que sobrevive com outra aba na frente.
**Where**: `packages/web/src/components/ScopePanel.tsx` + testes

**Done when**:
- [ ] Árvore suja põe um ponto na aba da worktree, com o número no `title`/leitor de tela
- [ ] Árvore limpa não põe nada — ponto que está sempre lá não é sinal
- [ ] O ponto usa `worktree/dirty`, o token que a sidebar já usa para a mesma coisa
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree diz que a árvore está suja`

---

## Fase 2 — o spike

#### P0: O que o `gh` responde, medido

**What**: Rodar o `gh` de verdade contra um repositório real e registrar a saída, os campos e o custo.
**Where**: `docs/prd/pull-request-status/spike.md` + fixtures em
`packages/server/src/pr/__fixtures__/`

**Done when**:
- [ ] `gh --version` e `gh auth status` registrados, com o que cada um responde **instalado e não
      autenticado**
- [ ] `gh pr list --json ...` executado com a lista de campos que a F4.4 precisa; os campos que `list`
      **recusa** estão nomeados, e a alternativa (um `pr view` por PR) está medida em tempo
- [ ] Saída **capturada como fixture**, com dados reais anonimizados apenas onde houver nome de
      terceiro; o comando exato que a produziu está no topo do arquivo
- [ ] Medido: tempo de uma chamada, com repositório pequeno e com um de 50+ PRs
- [ ] Registrado o que ele responde em: repositório **sem nenhuma PR**, branch **não publicada**, **sem
      rede**, e **limite de API atingido** (este pode ficar como "não observado", desde que dito)
- [ ] O `spike.md` termina numa recomendação de uma linha: dá para fazer a consulta **por projeto**
      (F4.3), ou não dá

**Commit**: `docs(pr): medir a saída real do gh antes de escrever o adaptador`

---

## Fase 3 — o daemon

#### P1: O veredito, como função pura

**What**: De `(state, isDraft, mergeable, reviewDecision, rollup)` para `ready | blocked | pending |
none | draft | merged | closed` mais a `reason`.
**Where**: `packages/server/src/pr/verdict.ts` + teste

**Done when**:
- [ ] Tabela de casos cobrindo cada combinação que o spike observou, incluindo os estados de
      `mergeable` que **não** são sim/não
- [ ] Bloqueio devolve a causa de **maior prioridade** (conflito > check reprovado > mudanças pedidas >
      regra da base), e a prova é um caso com **duas** causas simultâneas
- [ ] Verificação rodando ou na fila é `pending`, **nunca** `blocked` — é a decisão de cor do §2.2 do
      PRD, e é aqui que ela é obedecida ou traída
- [ ] `reason` é **estruturada** (tipo + nomes), não frase pronta: a tradução é da tela
- [ ] Campo desconhecido vindo do host não explode: cai em `pending` com motivo "não sei dizer"
- [ ] Nenhum import de rede, processo ou banco neste arquivo
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): derivar o veredito de merge de uma função pura`

---

#### P2: O adaptador de host, com o `gh` atrás de uma costura

**What**: `PrHost` + a implementação GitHub, executando `gh` com `argv` fixo.
**Where**: `packages/server/src/pr/PrHost.ts`, `pr/GhHost.ts`, `pr/exec.ts` + testes

**Done when**:
- [ ] A interface é *"dado um repositório e as branches dele, o que o host sabe"* — e não *"rode este
      comando"*
- [ ] Quem executa é **injetado**, como o `GitExec` é; os testes usam as fixtures da P0 e **nenhum teste
      chama o `gh`**
- [ ] `argv` fixo: nada vindo do cliente entra na linha de comando (§4.1 do PRD), com teste que passa
      um nome de branch hostil e prova que ele não vira argumento
- [ ] Timeout e `maxBuffer`, como o `execGit`
- [ ] Cinco falhas classificadas e distinguíveis: **sem binário**, **sem auth**, **sem rede**,
      **limite de API** (com o horário de volta quando o host informa) e **repo sem PR**
- [ ] `stderr` cru não sai daqui: sai a classificação (§4.4)
- [ ] Host descoberto pelo `git-url.ts`; host que não é GitHub responde `sem integração`, com o host
      nomeado
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): ler pull requests do GitHub pelo gh, atrás de um adaptador`

---

#### P3: Uma consulta por projeto, com cache e single-flight

**What**: O cache que faz oito worktrees custarem um processo.
**Where**: `packages/server/src/pr/PrCache.ts` + teste

**Done when**:
- [ ] A chave é o **projeto**, não a worktree; a worktree é resolvida no consumo, pela branch
- [ ] **Single-flight**: dez pedidos concorrentes com o cache frio produzem **uma** execução, provado
      contando chamadas na costura
- [ ] Valor conhecido é devolvido **na hora** enquanto revalida por trás — a tela nunca pisca
- [ ] TTL configurável, com o padrão da [Q5](open-questions.md); falha aumenta o intervalo até um teto
- [ ] Falha **não apaga** o último valor conhecido: ele volta com a idade e o motivo da falha junto
- [ ] Remoção de projeto limpa a entrada — cache que sobrevive ao dono é vazamento
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): uma consulta por projeto, com cache e single-flight`

---

#### P4: O contrato e as procedures

**What**: `PullRequestView` no shared, `pr.getByWorktree` e `pr.listByProject`.
**Where**: `packages/shared/src/pr.ts`, `packages/server/src/routers/pr.ts` + testes

**Done when**:
- [ ] O tipo tem número, URL, título, veredito, motivo, contagem por conclusão, lista de verificações e
      **carimbo de leitura** — a idade é dado, não enfeite
- [ ] As duas procedures saem do **mesmo** cache: a sidebar e a barra não podem discordar (F3.3)
- [ ] Toda URL é validada antes de sair do daemon: `https` e host **igual ao do remote** (§4.6), com
      teste de uma URL de outro host sendo recusada
- [ ] Worktree cuja branch não tem PR responde `none` — resposta, não erro
- [ ] Worktree sem diretório responde o mesmo erro de domínio que o resto do app pinta
- [ ] Evento de invalidação publicado no barramento quando o cache renova com dado diferente
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): expor o estado da pull request por worktree e por projeto`

---

## Fase 4 — a barra, no painel direito

#### P5: O CSS e a barra, nos sete estados

**What**: `PrBar`, com o CSS vindo inteiro do Open Design.
**Where**: `packages/web/src/components/PrBar.tsx`, `components/pr-bar.css` + testes

**Done when**:
- [ ] O CSS é o do protótipo, sem tradução e **sem literal**: nenhuma cor, medida ou tipografia fora de
      `var(--token)`
- [ ] Os cinco novos pares de contraste entram em `contrast.ts` e passam — o piso do teste sobe junto
- [ ] Sete estados renderizam com cor, palavra e motivo, e cada um tem teste
- [ ] Duas linhas: identidade e veredito em cima; motivo e idade embaixo
- [ ] A pastilha `#<n>` é **um** alvo, com `rel="noopener noreferrer"`, e o texto acessível diz para
      onde leva
- [ ] Motivo bloqueado nomeia a causa e o culpado, traduzindo a `reason` estruturada da P1
- [ ] A idade aparece sempre, e fica âmbar acima do limite
- [ ] O pulso do estado "rodando" some com `prefers-reduced-motion`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da pull request, nos sete estados`

---

#### P6: A barra no topo do painel, com ritmo próprio

**What**: A barra dentro do `RightPanel`, com a consulta e o ritmo.
**Where**: `packages/web/src/components/RightPanel.tsx`, `hooks/usePullRequest.ts` + testes

**Done when**:
- [ ] Fica **acima** da faixa de abas do painel, e não empurra a faixa para fora da vista
- [ ] Ritmo da [Q5](open-questions.md), **pausado com a janela oculta** e **pausado com o painel
      colapsado**, com teste dos dois casos: painel fechado que continua consultando é processo gasto
      para ninguém ver
- [ ] Invalidação pelo evento do daemon, além do relógio
- [ ] Enquanto não se sabe, a barra **não existe** — nada de esqueleto piscando no topo do painel a cada
      troca de worktree
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da PR no topo do painel direito`

---

#### P7: As duas larguras e a ordem de sacrifício

**What**: O que a barra faz entre 260px e 720px.
**Where**: `components/pr-bar.css` + teste de CSS

**Done when**:
- [ ] Em 260: a idade some e o motivo cai para uma linha
- [ ] Em 720: veredito e motivo cabem na mesma linha
- [ ] Número, ponto, palavra do estado e `↗` **nunca** somem, em nenhuma largura — com teste
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da PR aguenta as duas larguras do painel`

---

#### P8: Os estados degradados

**What**: Sem `gh`, sem auth, host sem integração, offline, limite de API, branch não publicada.
**Where**: `PrBar.tsx` + testes

**Done when**:
- [ ] Os seis estados do §6 do protótipo renderizam, cada um dizendo **o que fazer**
- [ ] "Sem `gh`" e "host sem integração" têm `não mostrar mais`, persistido por projeto
- [ ] Offline mantém o último veredito com a cor dele e a idade em âmbar — verde velho **continua
      verde**, com a idade dizendo a verdade
- [ ] Limite de API diz o horário de volta quando o host informa
- [ ] Nenhum destes estados derruba o painel: as abas continuam funcionando
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): dizer o que houve quando não dá para saber o estado da PR`

---

## Fase 5 — a aba `PR`

#### P9: A quarta aba, e a lista de verificações

**What**: A aba do painel que só existe quando existe PR.
**Where**: `packages/web/src/components/RightPanel.tsx`, `components/ChecksTab.tsx` + testes

**Done when**:
- [ ] A aba aparece **só** com PR, e some quando não há — com teste dos dois lados
- [ ] Ela carrega a contagem por conclusão, colorida pelo pior estado (`✕` > `●` > `✓`)
- [ ] As quatro abas **cabem em 360px** sem rolagem horizontal — medido no teste, não no olho
      ([Q10](open-questions.md))
- [ ] Lista agrupada, com **reprovadas primeiro**; teste com trinta linhas verdes e uma vermelha prova
      a ordem
- [ ] Cada linha: glifo com a palavra no leitor de tela, nome, quem executou abaixo do nome, duração e
      `↗` próprio
- [ ] Verificação sem URL aparece sem link, e o motivo é dito (§4.6)
- [ ] Nome de check é tratado como texto de fora: escapado e truncado
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba PR, com o reprovado no topo`

---

## Fase 6 — o paralelismo, que é onde a feature se paga

#### P10: O marcador na sidebar

**What**: `● #19` na linha da worktree, com a cor do veredito.
**Where**: `packages/web/src/components/SidebarTree.tsx` + testes

**Done when**:
- [ ] Uma consulta **por projeto** alimenta todas as linhas; teste prova que N worktrees não fazem N
      consultas
- [ ] Worktree sem PR não ganha marcador ([Q9](open-questions.md))
- [ ] O marcador **continua vivo com o painel direito colapsado** — é o requisito da F3.4, e é o que
      justifica ele existir; com teste
- [ ] A cor do marcador e a da barra saem do **mesmo** veredito, com teste que quebra se divergirem
- [ ] O número trunca por último: a linha perde o nome antes de perder o estado
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o estado da PR na linha da worktree`

---

#### P11: Abrir no navegador, de verdade

**What**: Os três links — a PR, a execução, a comparação.
**Where**: `packages/web/src/components/PrBar.tsx`, `packages/server/src/pr/compare-url.ts` + testes

**Done when**:
- [ ] Quem abre é o cliente; o daemon não aprende a chamar `open` (F5.2)
- [ ] A URL de comparação é montada **no daemon**, a partir do host, da base e da head, e passa pela
      mesma validação das outras
- [ ] Base ou head com caractere que precisa de escape produz URL correta, com teste
- [ ] Nenhum caminho desta feature escreve no remoto — e a prova é a ausência de procedure de escrita,
      não uma promessa em comentário
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): abrir a PR, a verificação e a comparação no navegador`

---

#### P12: O e2e, com um `gh` falso

**What**: Do repositório com PR até a barra verde, sem rede.
**Where**: `packages/web/e2e/` (ou onde os e2e vivem) + um `gh` de mentira num diretório temporário

**Done when**:
- [ ] Um executável falso na frente do `PATH` responde as fixtures da P0 — **processo de verdade**,
      saída de verdade, zero rede
- [ ] O teste passa por três estados: verificando → falhou → pronta, e a barra muda de cor em cada um
- [ ] A aba `PR` abre e mostra o reprovado no topo
- [ ] O `↗` tem o `href` esperado (o clique não sai do teste)
- [ ] Um e2e da fase 1: entrar numa worktree cai na aba dela, e a informação que era do cabeçalho está
      lá
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a barra da PR do amarelo ao verde, com um gh falso`

---

#### P13: A documentação alcança o código

**What**: Índice, backlog e perguntas do projeto batendo com o que foi construído.
**Where**: `docs/README.md`, `docs/project/backlog.md`, `docs/project/questions.md`, `CLAUDE.md`,
`docs/prd/worktree-tabs/prd.md`

**Done when**:
- [ ] O índice descreve a feature pelo que ela **faz**, não pelo que ela pretendia
- [ ] O PRD da [worktree-tabs](../worktree-tabs/prd.md) ganha uma nota dizendo que o cabeçalho fixo
      dela virou aba, e por quê — decisão revertida sem registro é decisão que volta sozinha
- [ ] O item *"Abstração de git host"* sai do backlog (ganhou PRD) e entra, no lugar, o que **ficou de
      fora**: mesclar, criar PR, reexecutar, notificar, o segundo host
- [ ] [Q022](../../project/questions.md) e [Q023](../../project/questions.md) do projeto ganham a
      resposta que esta feature deu — e só ela: "o Lumem lê o host e não escreve nele" é resposta
      parcial da Q023, e dizer isso é parte da resposta
- [ ] O `CLAUDE.md` menciona a feature na mesma frase em que menciona as outras
- [ ] Gate: `pnpm gate:build`

**Commit**: `docs(pr): a barra da PR no índice, no backlog e nas perguntas do projeto`
