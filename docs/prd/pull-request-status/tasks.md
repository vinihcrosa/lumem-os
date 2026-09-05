# A barra da pull request — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **completa.** A fase 1 saiu para a [worktree-first-tab](../worktree-first-tab/prd.md) e
foi entregue lá; as fases 2 a 6 foram entregues aqui em **2026-09-05**, mais uma **fase 7** que não
existia no plano — a [Q3](open-questions.md) e a [Q4](open-questions.md) foram respondidas contra a
proposta do PRD, e a feature passou a escrever no remoto.

A ordem foi a do risco, e ela se pagou: o **spike** achou que `mergeable` volta `UNKNOWN` para PR
que já acabou (uma tabela que o lesse antes de `state` pintaria toda PR mesclada de âmbar), e o
**e2e** achou três defeitos de produto que nenhum teste de unidade pegaria — todos registrados na
P12.

---

## Antes de começar

**O que travava, e como fechou.** A **[Q1](open-questions.md)** decidiu o `gh` em vez de um token
nosso — e o que ela comprou não foi performance: foi **não ter superfície de segredo**. A **Q3** e a
**Q4** foram respondidas **contra a proposta**, e a feature deixou de só ler; elas viraram a fase 7.
A **Q11** foi respondida pela entrega da [worktree-first-tab](../worktree-first-tab/prd.md): só o
ponto na aba, nenhuma linha fina de estado.

**O que nunca travou:** o desenho (feito e sincronizado), o `git-url.ts` (já parseia remote e host, com
teste), o `resolveScope` (já resolve worktree → diretório), o `execGit` (o molde de "executar processo
com timeout e erro classificado") e o barramento de eventos.

**Por que a fase 1 é a estrutura:** ela **move** informação de uma tela que já é testada. Fazer isso
junto com a feature nova produziria um diff em que ninguém consegue dizer o que quebrou o quê — e o
alvo dos testes da [worktree-tabs](../worktree-tabs/tasks.md) muda no caminho.

---

## Fase 1 — a estrutura: a worktree vira a primeira aba

> **Movida em 2026-09-01, e entregue no mesmo dia.** As E1, E2 e E3 saíram desta feature e viraram a
> [worktree-first-tab](../worktree-first-tab/prd.md), que está **completa**. Ficam aqui como registro
> do que a barra da PR pressupõe — e ela já pode pressupor: a coluna do meio é `caminho → abas →
> conteúdo`, a primeira aba é a do checkout, e o ponto de sujeira dela é o `dirty` do `TabState`.
>
> Duas coisas que esta feature ganhou de graça e precisa saber: o `TabStrip` tem **dois** slots fixos
> à direita (o segundo é o interruptor da coluna de arquivos), e a aba do checkout **já tem ponto** —
> se a barra da PR quiser um sinal na aba, ele não pode ser um segundo ponto na mesma aba.

#### E1: O cabeçalho vira aba

**What**: `ScopePanel` deixa de ter cabeçalho com título e chips; a coluna do meio passa a ser
caminho → abas → conteúdo.
**Where**: `packages/web/src/components/ScopePanel.tsx`, `WorktreePanel.tsx`, `LocalPanel.tsx`,
`detail.css` + testes

**Done when**:
- [x] Acima da faixa de abas fica **só o caminho** (`workspace / projeto / worktree`), com os dois
      primeiros segmentos navegando como já navegam
- [x] A primeira aba é a da worktree: **primeira, fixa, sem `✕`** — fechar a worktree dentro da
      worktree não quer dizer nada
- [x] Ela é a aba padrão ao entrar num checkout, e é para onde a seleção volta quando a última sessão
      fecha
- [x] O comentário do `ScopePanel` que justifica o cabeçalho acima da faixa é **reescrito**, não
      apagado: ele passa a dizer o que mudou e o que a mudança cobra (§2.1 do PRD)
- [x] Os testes que provavam branch, caminho e sujeira no cabeçalho **continuam existindo** e passam a
      apontar para a aba
- [x] A mudança de altura da coluna **remede o terminal** — o `FitAddon` mede uma caixa que mudou
- [x] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): a worktree deixa de ser cabeçalho e vira a primeira aba`

---

#### E2: O que não cabia no cabeçalho

**What**: A aba da worktree ganha o que o daemon já sabe e a tela não mostrava.
**Where**: `packages/web/src/components/WorktreePanel.tsx` + testes

**Done when**:
- [x] Caminho em disco **inteiro**, sem truncar, com botão de copiar
- [x] Base com `↑/↓`, estado da árvore com a contagem de arquivos, e quando a worktree foi criada
- [x] Sessões da worktree em lista, com estado e idade
- [x] Ações (`nova sessão`, `remover worktree`) na aba, e a recusa de remoção continua sendo mostrada
      onde ela é acionada
- [x] Nada que já existia em outra tela é duplicado aqui: consumo, memória e diff continuam onde estão
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree mostra o que o cabeçalho não cabia`

---

#### E3: O ponto de sujeira na aba

**What**: O pedaço do estado que sobrevive com outra aba na frente.
**Where**: `packages/web/src/components/ScopePanel.tsx` + testes

**Done when**:
- [x] Árvore suja põe um ponto na aba da worktree, com o número no `title`/leitor de tela
- [x] Árvore limpa não põe nada — ponto que está sempre lá não é sinal
- [x] O ponto usa `worktree/dirty`, o token que a sidebar já usa para a mesma coisa
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree diz que a árvore está suja`

---

## Fase 2 — o spike

#### [x] P0: O que o `gh` responde, medido

**What**: Rodar o `gh` de verdade contra um repositório real e registrar a saída, os campos e o custo.
**Where**: `docs/prd/pull-request-status/spike.md` + fixtures em
`packages/server/src/pr/__fixtures__/`

**Done when**:
- [x] `gh --version` e `gh auth status` registrados, com o que cada um responde **instalado e não
      autenticado**
- [x] `gh pr list --json ...` executado com a lista de campos que a F4.4 precisa; os campos que `list`
      **recusa** estão nomeados, e a alternativa (um `pr view` por PR) está medida em tempo
- [x] Saída **capturada como fixture**, com dados reais anonimizados apenas onde houver nome de
      terceiro; o comando exato que a produziu está no topo do arquivo
- [x] Medido: tempo de uma chamada, com repositório pequeno e com um de 50+ PRs
- [x] Registrado o que ele responde em: repositório **sem nenhuma PR**, branch **não publicada**, **sem
      rede**, e **limite de API atingido** (este pode ficar como "não observado", desde que dito)
- [x] O `spike.md` termina numa recomendação de uma linha: dá para fazer a consulta **por projeto**
      (F4.3), ou não dá

**Commit**: `docs(pr): medir a saída real do gh antes de escrever o adaptador`

---

## Fase 3 — o daemon

#### [x] P1: O veredito, como função pura

**What**: De `(state, isDraft, mergeable, reviewDecision, rollup)` para `ready | blocked | pending |
none | draft | merged | closed` mais a `reason`.
**Where**: `packages/server/src/pr/verdict.ts` + teste

**Done when**:
- [x] Tabela de casos cobrindo cada combinação que o spike observou, incluindo os estados de
      `mergeable` que **não** são sim/não
- [x] Bloqueio devolve a causa de **maior prioridade** (conflito > check reprovado > mudanças pedidas >
      regra da base), e a prova é um caso com **duas** causas simultâneas
- [x] Verificação rodando ou na fila é `pending`, **nunca** `blocked` — é a decisão de cor do §2.2 do
      PRD, e é aqui que ela é obedecida ou traída
- [x] `reason` é **estruturada** (tipo + nomes), não frase pronta: a tradução é da tela
- [x] Campo desconhecido vindo do host não explode: cai em `pending` com motivo "não sei dizer"
- [x] Nenhum import de rede, processo ou banco neste arquivo
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): derivar o veredito de merge de uma função pura`

---

#### [x] P2: O adaptador de host, com o `gh` atrás de uma costura

**What**: `PrHost` + a implementação GitHub, executando `gh` com `argv` fixo.
**Where**: `packages/server/src/pr/PrHost.ts`, `pr/GhHost.ts`, `pr/exec.ts` + testes

**Done when**:
- [x] A interface é *"dado um repositório e as branches dele, o que o host sabe"* — e não *"rode este
      comando"*
- [x] Quem executa é **injetado**, como o `GitExec` é; os testes usam as fixtures da P0 e **nenhum teste
      chama o `gh`**
- [x] `argv` fixo: nada vindo do cliente entra na linha de comando (§4.1 do PRD), com teste que passa
      um nome de branch hostil e prova que ele não vira argumento
- [x] Timeout e `maxBuffer`, como o `execGit`
- [x] Cinco falhas classificadas e distinguíveis: **sem binário**, **sem auth**, **sem rede**,
      **limite de API** (com o horário de volta quando o host informa) e **repo sem PR**
- [x] `stderr` cru não sai daqui: sai a classificação (§4.4)
- [x] Host descoberto pelo `git-url.ts`; host que não é GitHub responde `sem integração`, com o host
      nomeado
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): ler pull requests do GitHub pelo gh, atrás de um adaptador`

---

#### [x] P3: Uma consulta por projeto, com cache e single-flight

**What**: O cache que faz oito worktrees custarem um processo.
**Where**: `packages/server/src/pr/PrCache.ts` + teste

**Done when**:
- [x] A chave é o **projeto**, não a worktree; a worktree é resolvida no consumo, pela branch
- [x] **Single-flight**: dez pedidos concorrentes com o cache frio produzem **uma** execução, provado
      contando chamadas na costura
- [x] Valor conhecido é devolvido **na hora** enquanto revalida por trás — a tela nunca pisca
- [x] TTL configurável, com o padrão da [Q5](open-questions.md); falha aumenta o intervalo até um teto
- [x] Falha **não apaga** o último valor conhecido: ele volta com a idade e o motivo da falha junto
- [x] Remoção de projeto limpa a entrada — cache que sobrevive ao dono é vazamento
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): uma consulta por projeto, com cache e single-flight`

---

#### [x] P4: O contrato e as procedures

**What**: `PullRequestView` no shared, `pr.getByWorktree` e `pr.listByProject`.
**Where**: `packages/shared/src/pr.ts`, `packages/server/src/routers/pr.ts` + testes

**Done when**:
- [x] O tipo tem número, URL, título, veredito, motivo, contagem por conclusão, lista de verificações e
      **carimbo de leitura** — a idade é dado, não enfeite
- [x] As duas procedures saem do **mesmo** cache: a sidebar e a barra não podem discordar (F3.3)
- [x] Toda URL é validada antes de sair do daemon: `https` e host **igual ao do remote** (§4.6), com
      teste de uma URL de outro host sendo recusada
- [x] Worktree cuja branch não tem PR responde `none` — resposta, não erro
- [x] Worktree sem diretório responde o mesmo erro de domínio que o resto do app pinta
- [x] Evento de invalidação publicado no barramento quando o cache renova com dado diferente
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): expor o estado da pull request por worktree e por projeto`

---

## Fase 4 — a barra, no painel direito

#### [x] P5: O CSS e a barra, nos sete estados

**What**: `PrBar`, com o CSS vindo inteiro do Open Design.
**Where**: `packages/web/src/components/PrBar.tsx`, `components/pr-bar.css` + testes

**Done when**:
- [x] O CSS é o do protótipo, sem tradução e **sem literal**: nenhuma cor, medida ou tipografia fora de
      `var(--token)`
- [x] Os cinco novos pares de contraste entram em `contrast.ts` e passam — o piso do teste sobe junto
- [x] Sete estados renderizam com cor, palavra e motivo, e cada um tem teste
- [x] Duas linhas: identidade e veredito em cima; motivo e idade embaixo
- [x] A pastilha `#<n>` é **um** alvo, com `rel="noopener noreferrer"`, e o texto acessível diz para
      onde leva
- [x] Motivo bloqueado nomeia a causa e o culpado, traduzindo a `reason` estruturada da P1
- [x] A idade aparece sempre, e fica âmbar acima do limite
- [x] O pulso do estado "rodando" some com `prefers-reduced-motion`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da pull request, nos sete estados`

---

#### [x] P6: A barra no topo do painel, com ritmo próprio

**What**: A barra dentro do `RightPanel`, com a consulta e o ritmo.
**Where**: `packages/web/src/components/RightPanel.tsx`, `hooks/usePullRequest.ts` + testes

**Done when**:
- [x] Fica **acima** da faixa de abas do painel, como um **slot novo** do quadro que já existe — os
      outros três andares (abas, conteúdo, rodapé de execução) não mudam de dono
- [x] Aparecer e sumir **remede o terminal do rodapé** de execução: ele mede uma caixa que encolheu
      (§2.2 do PRD), com teste
- [x] Ritmo da [Q5](open-questions.md), **pausado com a janela oculta** e **pausado com o painel
      colapsado**, com teste dos dois casos: painel fechado que continua consultando é processo gasto
      para ninguém ver
- [x] Invalidação pelo evento do daemon, além do relógio
- [x] Enquanto não se sabe, a barra **não existe** — nada de esqueleto piscando no topo do painel a cada
      troca de worktree
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da PR no topo do painel direito`

---

#### [x] P7: As duas larguras e a ordem de sacrifício

**What**: O que a barra faz entre 260px e 720px.
**Where**: `components/pr-bar.css` + teste de CSS

**Done when**:
- [x] Em 260: a idade some e o motivo cai para uma linha
- [x] Em 720: veredito e motivo cabem na mesma linha
- [x] Número, ponto, palavra do estado e `↗` **nunca** somem, em nenhuma largura — com teste
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a barra da PR aguenta as duas larguras do painel`

---

#### [x] P8: Os estados degradados

**What**: Sem `gh`, sem auth, host sem integração, offline, limite de API, branch não publicada.
**Where**: `PrBar.tsx` + testes

**Done when**:
- [x] Os seis estados do §6 do protótipo renderizam, cada um dizendo **o que fazer**
- [x] "Sem `gh`" e "host sem integração" têm `não mostrar mais`, persistido por projeto
- [x] Offline mantém o último veredito com a cor dele e a idade em âmbar — verde velho **continua
      verde**, com a idade dizendo a verdade
- [x] Limite de API diz o horário de volta quando o host informa
- [x] Nenhum destes estados derruba o painel: as abas continuam funcionando
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): dizer o que houve quando não dá para saber o estado da PR`

---

## Fase 5 — a aba `PR`

#### [x] P9: A quarta aba, e a lista de verificações

**What**: A aba do painel que só existe quando existe PR.
**Where**: `packages/web/src/components/RightPanel.tsx`, `components/ChecksTab.tsx` + testes

**Done when**:
- [x] A aba aparece **só** com PR, e some quando não há — com teste dos dois lados
- [x] Ela carrega a contagem por conclusão, colorida pelo pior estado (`✕` > `●` > `✓`)
- [x] As quatro abas **cabem em 360px** sem rolagem horizontal — medido no teste, não no olho
      ([Q10](open-questions.md))
- [x] Lista agrupada, com **reprovadas primeiro**; teste com trinta linhas verdes e uma vermelha prova
      a ordem
- [x] Cada linha: glifo com a palavra no leitor de tela, nome, quem executou abaixo do nome, duração e
      `↗` próprio
- [x] Verificação sem URL aparece sem link, e o motivo é dito (§4.6)
- [x] Nome de check é tratado como texto de fora: escapado e truncado
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba PR, com o reprovado no topo`

---

## Fase 6 — o paralelismo, que é onde a feature se paga

#### [x] P10: O marcador na sidebar

**What**: `● #19` na linha da worktree, com a cor do veredito.
**Where**: `packages/web/src/components/SidebarTree.tsx` + testes

**Done when**:
- [x] Uma consulta **por projeto** alimenta todas as linhas; teste prova que N worktrees não fazem N
      consultas
- [x] Worktree sem PR não ganha marcador ([Q9](open-questions.md))
- [x] O marcador **continua vivo com o painel direito colapsado** — é o requisito da F3.4, e é o que
      justifica ele existir; com teste
- [x] A cor do marcador e a da barra saem do **mesmo** veredito, com teste que quebra se divergirem
- [x] O número trunca por último: a linha perde o nome antes de perder o estado
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o estado da PR na linha da worktree`

---

#### [x] P11: Abrir no navegador, de verdade

**What**: Os três links — a PR, a execução, a comparação.
**Where**: `packages/web/src/components/PrBar.tsx`, `packages/server/src/pr/compare-url.ts` + testes

**Done when**:
- [x] Quem abre é o cliente; o daemon não aprende a chamar `open` (F5.2)
- [x] A URL de comparação é montada **no daemon**, a partir do host, da base e da head, e passa pela
      mesma validação das outras
- [x] Base ou head com caractere que precisa de escape produz URL correta, com teste
- [x] Nenhum caminho desta feature escreve no remoto — e a prova é a ausência de procedure de escrita,
      não uma promessa em comentário
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): abrir a PR, a verificação e a comparação no navegador`

---

#### [x] P12: O e2e, com um `gh` falso

**What**: Do repositório com PR até a barra verde, sem rede.
**Where**: `packages/web/e2e/` (ou onde os e2e vivem) + um `gh` de mentira num diretório temporário

**Done when**:
- [x] Um executável falso na frente do `PATH` responde as fixtures da P0 — **processo de verdade**,
      saída de verdade, zero rede
- [x] O teste passa por três estados: verificando → falhou → pronta, e a barra muda de cor em cada um
- [x] A aba `PR` abre e mostra o reprovado no topo
- [x] O `↗` tem o `href` esperado (o clique não sai do teste)
- [x] Um e2e da fase 1: entrar numa worktree cai na aba dela, e a informação que era do cabeçalho está
      lá
- [x] Gate: `pnpm gate:full`

**Commit**: `test(e2e): a barra da PR do amarelo ao verde, com um gh falso`

---

#### [x] P13: A documentação alcança o código

**What**: Índice, backlog e perguntas do projeto batendo com o que foi construído.
**Where**: `docs/README.md`, `docs/project/backlog.md`, `docs/project/questions.md`, `CLAUDE.md`,
`docs/prd/worktree-tabs/prd.md`

**Done when**:
- [x] O índice descreve a feature pelo que ela **faz**, não pelo que ela pretendia
- [x] O PRD da [worktree-tabs](../worktree-tabs/prd.md) ganha uma nota dizendo que o cabeçalho fixo
      dela virou aba, e por quê — decisão revertida sem registro é decisão que volta sozinha
- [x] O item *"Abstração de git host"* sai do backlog (ganhou PRD) e entra, no lugar, o que **ficou de
      fora**: mesclar, criar PR, reexecutar, notificar, o segundo host
- [x] [Q022](../../project/questions.md) e [Q023](../../project/questions.md) do projeto ganham a
      resposta que esta feature deu — e só ela: "o Lumem lê o host e não escreve nele" é resposta
      parcial da Q023, e dizer isso é parte da resposta
- [x] O `CLAUDE.md` menciona a feature na mesma frase em que menciona as outras
- [x] Gate: `pnpm gate:build`

**Commit**: `docs(pr): a barra da PR no índice, no backlog e nas perguntas do projeto`


---

## Fase 7 — os dois verbos que escrevem

> **Não estava no plano.** A [Q3](open-questions.md) e a [Q4](open-questions.md) foram respondidas em
> 2026-09-05 **contra** a proposta escrita no PRD, e o corte *"ler, não agir"* caiu. O que entra é
> curto de propósito: dois verbos, e a lista curta **é** a fronteira de segurança (§4.2 do PRD).

#### [x] P14: `pr.merge` e `pr.create`, com o portão no daemon

**What**: Os dois verbos, do `argv` até a confirmação.
**Where**: `packages/server/src/pr/GhHost.ts`, `packages/server/src/routers/pr.ts`,
`packages/web/src/components/PrWriteDialog.tsx` + testes

**Done when**:
- [x] Valor de UI viaja como `--flag=valor`, num **único** token de `argv` — com teste que passa um
      título começando com `--repo=` e prova que ele não vira outra flag
- [x] O corpo da PR vai por `--body-file`, e não por argumento: markdown longo esbarra em `ARG_MAX`
      numa máquina e não na outra
- [x] Caractere de controle é recusado **antes** de virar `argv`, e o teste prova que o processo nem
      chegou a existir
- [x] O portão do merge é o **veredito, relido no daemon** — e o teste que o prova chama a procedure
      direto, sem passar pela tela
- [x] As estratégias oferecidas são as que o **repositório** permite (`gh repo view`), e não uma
      constante nossa; o e2e prova que o terceiro botão não aparece quando o host diz que não
- [x] Criar exige branch publicada, e o motivo é dito
- [x] Número de PR vem do **cache do daemon**, nunca do cliente; número que não é inteiro positivo
      não vira processo
- [x] Escrita invalida o cache e publica o evento — a barra não continua verde depois do merge
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(pr): mesclar e criar pull request, cada um atrás de um portão`

---

## O que a execução achou

Sete coisas, e nenhuma delas estava no plano:

| O quê | Onde apareceu | O que mudou |
|---|---|---|
| **`mergeable` volta `UNKNOWN` para PR mesclada ou fechada** — o GitHub só calcula mergeabilidade sob demanda | spike (P0) | a tabela lê `state` **antes** de `mergeable`. Sem isso, toda PR mesclada ficaria âmbar |
| **`latestReviews` traz o corpo inteiro de cada revisão** — 300 KB para 50 PRs, e nada disso vai à tela | spike (P0) | uma projeção `--jq` constante, que corta antes de virar string no daemon — e de quebra torna a **forma da resposta nossa** |
| **`reviewDecision` vazio não é "falta revisão"** — é repositório que não exige nenhuma | P1 | tratá-lo como exigência bloquearia toda PR de repositório pessoal, que é o caso mais comum de quem usa o Lumem |
| **O backoff começava mais curto que o TTL normal** | P3, pelo teste | um projeto que falha consultaria **mais** que um que responde. Hoje o primeiro intervalo depois de falhar é o normal, e daí dobra |
| **`nameWithOwner` vem da rede e era concatenado numa URL** — um valor com `@` no meio movia o host da URL montada | P4, pelo teste | a forma `org/repo` é verificada antes de concatenar |
| **`remote_url` só é gravado para projeto que o Lumem clonou** | e2e (P12) | projeto adicionado por caminho — a maioria — nascia com ele nulo, e a barra dizia "sem integração" para um repositório do GitHub comum. Hoje o git responde quando o banco não sabe |
| **Um pedido explícito podia ser servido por uma leitura que começou antes dele** — nos **dois** lados | e2e (P12) | no daemon, um booleano `forced` limpo pela execução que já estava no ar; no cliente, `invalidateQueries` marcando uma busca como velha sem reiniciá-la. O sintoma era o pior possível: o estado de antes carimbado **"há 0 s"**. Hoje são gerações do lado do daemon e `cancelQueries` antes do refetch do lado do cliente |
