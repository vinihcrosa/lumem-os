# O visualizador vira editor — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Protótipo:** `packages/web/prototype/lumem-file-editor.html` — entregue pela E1, cinco telas, verificado por renderização
**Sucede:** [right-panel](../right-panel/tasks.md)
**Status:** em execução — E1, E2 e E3 entregues e fechadas (Lote 1 aprovado em 2 rounds de review)
**Total:** 13 tasks em 5 fases

---

## Notas de contexto

Fonte de verdade das premissas e das pendências desta feature. Quem retoma o trabalho a frio lê
esta seção antes de qualquer task.

### Premissas travadas

Cada uma vem de uma pergunta **respondida** em [open-questions.md](open-questions.md). Implementar
contra qualquer outra coisa é apostar.

| # | Premissa | Origem |
|---|---|---|
| **A1** | O motor é **CodeMirror 6**. Não `<textarea>`, não Monaco | Q1 |
| **A2** | O realce é o do **Shiki que já existe**, pela ponte `@shikijs/codemirror` — uma paleta, um conjunto de gramáticas | Q1.1 |
| **A3** | **Autosave com debounce.** Sem `Cmd+S`, sem estado sujo persistente, e desmontar descarrega o pendente | Q2 |
| **A4** | Escopo é **CRUD completo**: editar, criar, renomear, apagar | Q3 |
| **A5** | Revisão é **hash do conteúdo**, nunca `mtime` nem `mtime+tamanho` | Q4 |
| **A6** | Conflito é **resposta discriminada**, não `DomainError` | Q4.1 |
| **A7** | Fim de linha, quebra final e bytes são **preservados**: o servidor grava o que recebe, a normalização é simétrica e fica no cliente | Q6 |
| **A8** | `.git` **aparece** na árvore e **recusa** escrita. Mostrar não é permitir | Q10 |

### Pendências

Numeradas, e nenhuma delas vive só numa mensagem ou num comentário de código.

| # | O quê | Estado |
|---|---|---|
| **P1** | Apagar manda para a lixeira ou apaga direto? A v1 apaga, e a confirmação diz quando o alvo **não** está no git | aberta ([Q5](open-questions.md)) — não bloqueia; a E11 implementa a v1 |
| **P2** | O daemon não tem autenticação, e escrita muda a categoria da superfície | aberta ([Q7](open-questions.md)) — feature própria, **não** bloqueia esta |
| **P3** | O número do debounce | **fechada pela E1**: 800 ms, com o argumento em [Q8](open-questions.md). O nome do lugar único é `AUTOSAVE_DEBOUNCE_MS` |
| **P4** | Arquivo que não é UTF-8: converter, recusar, ou ignorar | **fechada pelo Vinicius**: recusa editar, abre somente leitura, e o veredito é ida-e-volta em UTF-8 no servidor ([Q9](open-questions.md)). Vira a **quarta** recusa da E8 e um `Done when` da E3 |
| **P5** | O histórico de undo não sobrevive à troca de worktree | aberta ([Q11](open-questions.md)) — a v1 zera, como a right-panel |
| **P6** | `file-viewer.test.tsx` assertava sobre `<div className="l">`, que a E8 remove. É reescrita de teste, não perda de cobertura — e o revisor tem que ver a cobertura equivalente, não só o verde | prevista, na E8 |
| **P7** | O número do bundle do CodeMirror | a E8 mede e escreve no [PRD](prd.md) §7, como a R8 da right-panel fez |
| **P8** | `packages/web/src/components/viewer.css:134` usa `text-disabled` na medianiz, **hoje, no app**: 2,96:1 sobre o poço, abaixo do mínimo de objeto gráfico. O token que corrige (`editor/line-number`, 6,49:1) já existe e **ninguém o consome** | **aberta** — quem fecha é a E8. Estava marcada como fechada antes de a E8 existir, e o passe a frio pegou: pendência fechada por antecipação é pendência perdida |
| **P9** | A tela de conflito promete três números que o contrato original não carregava: "há 8 s", "3 linhas que você digitou", "+6 −2" do agente | **resolvida no desenho** pela verificação do orquestrador: `changedAt` entra na resposta (E4/E6), e os dois custos passam a ser medidos **no cliente** (E10), que é o único lado com as três versões do texto |
| **P10** | O diálogo de apagar promete saber se o git desfaz, e a contagem recursiva de uma pasta — dados que nenhuma procedure tinha | **resolvida no desenho**: `files.deletePreview` (F5.7), implementada na E5 e exposta na E6, consumida pela E11 |
| **P11** | `path-guard.ts` faz `stat(parent)` sem `try`: se o diretório sumir entre o `realpath` e o `stat`, escapa `Error` cru em vez de `DomainError`. É o padrão vizinho dominante no módulo, e a janela é real justo numa feature cujo §7 é concorrência com o agente | follow-up do review do Lote 1 — não bloqueia; vale arrumar junto da E4, que mexe no mesmo caminho |
| **P12** | `revisionOf` está exportado sem consumidor até a E4, e a mutação "revisão = tamanho em bytes" só morre por causa de **um** fixture (`files.test.ts`, 13 bytes contra 13 bytes) | follow-up do review do Lote 1 — quem mexer naquele fixture precisa saber que ele é a única coisa segurando a invariante |
| **P13** | Alvo que **não existe** e se chama `.GIT` num filesystem insensível a caixa seria criado: não há disco para consultar, então nada canoniza o nome | **decidida: aceita.** Fechar exigiria case-folding no ramo "não existe", o que recusaria `.GIT` no Linux, onde é nome legítimo. Não é alcançável no produto — todo checkout tem `.git`, e numa worktree ele é um **arquivo**, que cai no ramo do `realpath` e é recusado |
| **P14** | A guarda ainda recusa **tudo** para link que aponta para fora, inclusive apagar — assimetria com o link pendurado, que o rework tornou apagável | **decidida na [Q12](open-questions.md): também é apagável.** Vira `Done when` da **E5**, junto do resto do CRUD: apagar opera sobre a entrada, e a entrada está dentro do checkout |

---

## Ordem, e por quê ela é essa

**Desenho primeiro**, como nas três features anteriores: o editor tem seis estados de tela e cinco deles não são o caminho feliz. Descobrir isso em React custa o dobro.

**Guarda de escrita antes de qualquer escrita**, pelo mesmo motivo que a right-panel pôs a guarda de leitura na frente: é a única parte que, se sair errada, sai perigosa — e agora o estrago não é ler `~/.ssh`, é apagar `.git`.

Depois a **concorrência**, antes do editor existir. A revisão que guarda a escrita é a razão de o autosave ser aceitável, então ela nasce testada contra escrita concorrente de verdade, sem UI por perto para confundir o diagnóstico.

Só então o editor, e por último o CRUD na árvore — que é a parte com mais superfície de UI e menos risco.

O e2e fecha porque é o único que prova a frase do PRD inteira: corrigir uma linha com o agente rodando ao lado e ver a correção na aba `Mudanças`.

---

## Decisões que sustentam o resto

Detalhadas em [open-questions.md](open-questions.md); aqui só o que a implementação precisa ter na mão.

### D1 — CodeMirror 6, com o realce do Shiki

O motor traz cursor, seleção, undo/redo, numeração, indentação e busca. O realce **não** é o dele: a ponte `@shikijs/codemirror` usa o `lumemShikiTheme` e as 16 gramáticas que já existem. Uma paleta, um conjunto de gramáticas, um bundle medido.

### D2 — Autosave com debounce

Sem estado sujo persistente e sem `Cmd+S`. Em troca, **desmontar descarrega o pendente**: trocar de aba, fechar o split, fechar a aba e perder o foco gravam antes de sumir.

### D3 — Revisão em toda leitura, comparada em toda escrita

`files.read` devolve `revision` (hash do conteúdo). `files.write` manda a revisão em que o buffer se baseia e o daemon compara com o disco **no momento de gravar**.

### D3.1 — Conflito é resposta, não exceção

`{ ok: false, reason: "stale", revision }`, como `readFile` já faz com `binary` e `too-large`. Diante dele o autosave para, e as duas saídas aparecem nomeadas pelo que perdem. **Nenhuma é o default.**

### D4 — O disco manda, menos quando você está digitando

Buffer limpo adota mudança externa. Buffer sujo nunca é sobrescrito por refetch — a mudança externa vira aviso.

### D5 — Escrita não entra em `.git`, e nunca é parcial

`.git` continua **visível** na árvore (Q2 da right-panel) e recusa escrita. Toda gravação é temporário no mesmo diretório + `rename`, com o modo preservado e o `realpath` resolvido antes, para escrever no alvo do symlink em vez de substituir o link.

---

## Fase 0 — Desenho

#### E1: Protótipo do editor e seus estados

**What**: Desenhar em HTML+CSS, sobre o `tokens.css` que o app lê, os seis estados que o editor tem — e gerar os tokens que faltarem.
**Where**: `packages/web/prototype/lumem-file-editor.html`, `packages/web/scripts/generate-tokens.py` (bloco `CONFIG`), `packages/web/src/styles/tokens.css` (regerado, nunca à mão)
**Depends on**: nada

**Done when**:
- [ ] Arquivo em edição: cursor, seleção, linha ativa, numeração — com a quebra de linha ligada, que é o default herdado (D3.1 da right-panel)
- [ ] Os quatro estados do rodapé: `salvando…`, `salvo há Ns`, falha com motivo, `mudou no disco`
- [ ] Tela de conflito com as duas saídas nomeadas pelo que perdem, nenhuma em destaque de default (D3.1)
- [ ] As três recusas em modo somente leitura, cada uma com seu motivo: binário, grande demais, dentro de `.git`
- [ ] Criar, renomear e apagar na árvore, incluindo o diálogo de confirmação que **nomeia** o alvo e diz se ele está no git
- [ ] Tokens novos entram pelo gerador e saem na regeração, com a suíte de contraste verde (hoje 46 pares) — nada de cor solta no componente
- [ ] Renderizado e **olhado**, com os achados escritos no PRD, como as três features anteriores fizeram
- [ ] Número do debounce proposto e escrito na [Q8](open-questions.md)
- [ ] Gate: `pnpm gate:quick`

**Tests**: nenhum de comportamento; o teste de contraste dos tokens roda no gate · **Gate**: quick
**Commit**: `design(web): prototype the editor, its four saving states and its conflict`

---

## Fase 1 — O servidor escreve

#### E2: Guarda de caminho para escrita

**What**: Resolver `(escopo, caminho)` para um destino de escrita **provadamente** dentro do checkout e fora de `.git` — sem exigir que o alvo já exista.
**Where**: `packages/server/src/files/path-guard.ts` + teste
**Depends on**: nada

**Done when**:
- [ ] `resolveForWrite(root, requested)` devolve `{ relative, entry, target, exists }`: o **pai** é resolvido por `realpath` e checado por separador; o nome final não precisa existir. `entry` é a **entrada de diretório** — o que apagar e renomear tocam; `target` é o **destino**, onde gravar cai, e é `null` quando o link está pendurado. É esse `null` que faz o `tsc` recusar quem tentar gravar sem tratar o caso
- [ ] As regras 1 e 2 continuam valendo, reusando `normalizeRelative` — nada é reimplementado
- [ ] Pai que não existe é `NOT_FOUND`, e a mensagem diz **qual** diretório falta
- [ ] Pai que é symlink para fora do checkout é recusado — o alvo não existir não pode virar um jeito de escapar da regra 4
- [ ] Alvo que existe e é symlink resolve para o destino real; se ele cai fora do checkout, recusa (D5)
- [ ] `.git`, e qualquer coisa dentro dele, recusa escrita com motivo próprio — leitura continua permitida pelo caminho de leitura
- [ ] Caminho vazio (a raiz do checkout) é recusado para toda operação de escrita
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 8 casos — alvo novo válido, pai ausente, pai symlink escapando, alvo symlink interno (que **passa**), alvo symlink escapando, `.git` direto, dentro de `.git`, raiz

**Tests**: unit, com filesystem de verdade — symlink não se simula, mesma política da R1 da right-panel · **Gate**: quick
**Commit**: `feat(server): guard every write against escaping its checkout`

---

#### E3: `revision` na leitura

**What**: Toda leitura de arquivo passa a dizer em que versão do conteúdo ela se baseia.
**Where**: `packages/server/src/files/FileService.ts` + teste, `packages/server/src/routers/files.ts` + teste
**Depends on**: nada — pode ir em paralelo com E2

**Done when**:
- [ ] `readFile` devolve `revision` na forma `text`; hash do conteúdo lido, não `mtime` (Q4)
- [ ] Mesmo conteúdo, duas leituras: mesma revisão. Um byte diferente: revisão diferente
- [ ] Escrever e devolver o arquivo ao conteúdo anterior devolve a **revisão anterior** — é isso que separa hash de `mtime`
- [ ] `binary` e `too-large` seguem sem revisão: não há buffer para guardar
- [ ] A forma `text` também diz se aquele conteúdo é **gravável**: decodificar em UTF-8 e recodificar tem que devolver **os bytes originais**. Se não devolve, o arquivo é legível e não é editável ([Q9](open-questions.md), F1.4) — sem tabela de codificação e sem palpite sobre qual é a certa, só a pergunta de se gravar destruiria alguma coisa
- [ ] Teste com bytes Latin-1 de verdade (um `é` em `0xE9`, que não é UTF-8 válido e não tem byte NUL): passa pela detecção de binário, é lido, e vem marcado como não gravável
- [ ] Mudança aditiva — nenhum consumidor atual precisa mudar de linha
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(server): say which revision a file read is based on`

---

#### E3.1: O contrato final da guarda

**What**: Fechar `resolveForWrite` **antes** de existir qualquer consumidor: link que aponta para fora do checkout passa a ser apagável, pela regra da [Q12](open-questions.md).
**Where**: `packages/server/src/files/path-guard.ts` + teste
**Depends on**: E2

**Done when**:
- [ ] Link cujo destino cai fora do checkout devolve `target: null` em vez de lançar — a mesma forma que o link pendurado já usa, porque para quem apaga os dois casos são o mesmo: existe entrada, não existe destino gravável
- [ ] Apagar continua sendo assunto da E5; o que esta task entrega é **poder** apagar
- [ ] Gravar através dele continua recusado, e a mensagem continua dizendo que aponta para fora — a recusa muda de lugar (vai para quem grava), não de existência
- [ ] O caso de escape original continua fechado: nenhuma operação alcança caminho **fora** do checkout, e o teste que provava isso continua verde
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit, filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): let a link out of the checkout be deleted, never written`

> **Por que ela existe, e por que aqui.** O passe a frio pós-Lote 1 achou que a E5 prometia isto no `Done when` e não tinha `path-guard.ts` no `Where` — e que a mudança é de **seam**, consumida por E4 e E6. Fechar o contrato da guarda antes de qualquer consumidor é o que impede cascata sobre código já revisado; deixá-la dentro da E5 faria a E4 fechar assumindo um comportamento que a E5 mudaria depois.

---

#### E4: `writeFile` guardado por revisão

**What**: Gravar um arquivo existente, atomicamente, recusando quando o disco mudou desde a leitura.
**Where**: `packages/server/src/files/FileService.ts` + teste
**Depends on**: E2, E3, E3.1

**Done when**:
- [ ] `writeFile(root, path, { text, baseRevision })` devolve `{ ok: true, revision }` ou `{ ok: false, reason: "stale", revision, changedAt }` (D3.1)
- [ ] O `changedAt` é o `mtime` do disco lido na mesma passada da comparação — é o que sustenta o "o agente escreveu este arquivo há 8 s" que o protótipo desenhou. Sem ele a frase é invenção do cliente
- [ ] A comparação lê o disco **imediatamente antes** de gravar, dentro do daemon
- [ ] Gravação atômica: temporário no **mesmo diretório** e `rename` por cima — nunca meio arquivo no disco
- [ ] Modo do arquivo original preservado (um script executável continua executável depois de editado)
- [ ] Escrita através de symlink interno grava no **alvo**; o link continua link
- [ ] Texto acima de `MAX_FILE_BYTES` é recusado, senão o teto de leitura seria contornável escrevendo
- [ ] Arquivo cujo conteúdo **no disco** não sobrevive à ida e volta em UTF-8 recusa a escrita, mesmo que o cliente peça ([Q9](open-questions.md)). O cliente já não deixa editar; isto é a segunda tranca, do lado que tem os bytes
- [ ] Temporário é removido quando a gravação falha no meio — nada de `.tmp` órfão na árvore do usuário
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 6 casos — gravação limpa, revisão velha recusada, modo preservado, symlink interno, texto grande demais, falha no meio sem deixar lixo

**Tests**: unit, filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): write a file only when the disk still matches`

---

#### E5: Criar, renomear e apagar

**What**: As três operações que faltam para a árvore ser editável.
**Where**: `packages/server/src/files/FileService.ts` + teste
**Depends on**: E2

**Done when**:
- [ ] `createFile` e `createDir`: nome ocupado é `DUPLICATE`, não sobrescrita
- [ ] `rename(from, to)`: as **duas** pontas passam pela guarda; destino ocupado é `DUPLICATE`; diretório de destino inexistente é `NOT_FOUND` com o caminho dito
- [ ] `remove(path, { recursive })`: diretório com conteúdo sem `recursive` é recusado, com a contagem do que tem dentro na mensagem
- [ ] Apagar e renomear operam sobre a **entrada de diretório**, nunca sobre o destino ([Q12](open-questions.md)): apagar um symlink — válido ou pendurado — remove o link e deixa o destino intacto, e renomear move o link. A guarda devolve os dois caminhos justamente para isso; usar o `target` aqui apaga o arquivo apontado em vez do link, e o `tsc` **não** pega este lado do erro — ele só recusa gravar em `target` nulo. Este aviso escrito é a defesa que existe, e foi decisão consciente não criar um tipo nominal só para isso
- [ ] Link **pendurado** é apagável (e continua não sendo gravável, que é a decisão da E2)
- [ ] Nenhuma das três aceita alvo vazio nem alvo dentro de `.git` — herdado da E2, e verificado aqui de novo por chamada
- [ ] `deletePreview(root, path)` (F5.7): devolve se o caminho é **rastreado pelo git** e, para diretório, a contagem recursiva de entradas mais quantas delas não estão rastreadas. É o que o diálogo de apagar promete na tela — "o git desfaz os outros 3" — e sem isto a promessa é chute
- [ ] A contagem recursiva tem teto e **diz** quando truncou, como toda contagem desta feature. `node_modules` está visível na árvore e é apagável
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 9 casos — criar arquivo, criar pasta, nome ocupado, renomear movendo de diretório, destino ocupado, apagar diretório cheio sem `recursive`, apagar symlink, preview de arquivo rastreado versus não rastreado, preview de diretório misto

**Tests**: unit, filesystem de verdade · **Gate**: quick
**Commit**: `feat(server): create, rename and remove inside a checkout`

---

#### E6: Router `files` escreve

**What**: As quatro mutations sobre o wire, escopadas.
**Where**: `packages/server/src/routers/files.ts` + teste
**Depends on**: E4, E5

**Done when**:
- [ ] `files.write`, `files.create`, `files.rename`, `files.remove` — todas `mutation`, todas por `resolveScope` e depois pela guarda, nessa ordem
- [ ] `files.deletePreview` — `query`, não `mutation`: ela só lê, e é o que a confirmação de apagar consulta antes de perguntar (F5.7)
- [ ] `files.write` devolve o resultado discriminado; conflito **não** vira `TRPCError` (D3.1)
- [ ] Erros de domínio continuam virando os códigos que o `DOMAIN_TO_TRPC` já mapeia; nenhum código novo é inventado sem entrar naquele mapa
- [ ] `text` tem teto de tamanho no schema, antes de chegar ao serviço
- [ ] Escopo inexistente responde `NOT_FOUND`; checkout ausente do disco responde o erro de domínio, não `ENOENT` cru
- [ ] O comentário de topo do arquivo, que hoje declara "read-only by construction", é corrigido — ele documenta a D5 da right-panel, que esta feature reverte
- [ ] Gate: `pnpm gate:quick`

**Tests**: integration (caller tRPC + repositório de verdade) · **Gate**: quick
**Commit**: `feat(server): expose writing the checkout's files over trpc`

---

#### E7: Escrita concorrente, provada

**What**: O teste que justifica a feature inteira: um agente escrevendo no mesmo arquivo, ao mesmo tempo.
**Where**: `packages/server/src/files/FileService.test.ts` (ou arquivo próprio de concorrência)
**Depends on**: E4

**Done when**:
- [ ] Ler, escrever o arquivo **por fora** (outro processo ou outra escrita direta), e então gravar com a revisão antiga: recusa com `stale` e o conteúdo externo intacto no disco
- [ ] A revisão devolvida na recusa é a **do disco**, para o cliente conseguir oferecer "sobrescrever" sem uma segunda leitura
- [ ] Sobrescrever com a revisão que veio na recusa **passa** — é o caminho da escolha "sobrescrever" da tela
- [ ] Duas gravações do próprio Lumem em sequência (a segunda com a revisão devolvida pela primeira) passam as duas
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit/integration, filesystem de verdade, escrita externa de verdade — não simulada · **Gate**: quick
**Commit**: `test(server): prove a stale write never clobbers the agent`

---

## Fase 2 — O editor

#### E8: CodeMirror no split

**What**: Trocar o `<div>` de linhas por um editor de verdade, sem mudar a moldura nem o realce.
**Where**: `packages/web/src/components/FileViewer.tsx`, `packages/web/src/lib/codemirror-setup.ts`, `viewer.css`, `file-viewer.test.tsx`
**Depends on**: E1, E3

**Done when**:
- [ ] O arquivo abre num CodeMirror 6 dentro da mesma `ViewerFrame` — cabeçalho, `⇄` e `✕` inalterados
- [ ] Realce pela ponte `@shikijs/codemirror`, com o `lumemShikiTheme` e as gramáticas que já existem (D1). Extensão desconhecida continua abrindo como texto puro
- [ ] Tema do editor (cursor, seleção, linha ativa, gutter) sai de `tokens.ts` — nenhuma cor literal no arquivo
- [ ] Quebra de linha ligada por padrão, `⇄` desliga, e a numeração continua certa nos dois modos
- [ ] As **quatro** recusas abrem em somente leitura, cada uma com seu motivo no rodapé (F1.4): `binary`, `too-large`, dentro de `.git`, e conteúdo que a ida e volta em UTF-8 não devolve igual ([Q9](open-questions.md)). Nas quatro o arquivo continua **legível**; o que falta é a permissão de gravar
- [ ] O `PatchViewer` não muda: continua somente leitura, com o mesmo realce (F1.5)
- [ ] **Tamanho do bundle medido e escrito no PRD** — antes e depois, com o número real, como a R8 da right-panel fez
- [ ] Gate: `pnpm gate:build` (é a task que traz dependência nova)

**Tests**: unit · **Gate**: build
**Commit**: `feat(web): open the file in a real editor`

---

#### E9: Autosave

**What**: O buffer indo para o disco sozinho, sem nunca perder o que foi digitado.
**Where**: `packages/web/src/hooks/useFileBuffer.ts` + teste, `FileViewer.tsx`, `ViewerFrame.tsx` (rodapé de estado)
**Depends on**: E6, E8

**Done when**:
- [ ] Parar de digitar grava depois do debounce, com o número num só lugar, nomeado ([Q8](open-questions.md))
- [ ] Rodapé diz `salvando…`, `salvo há Ns` e a falha com o motivo do daemon
- [ ] Falha de escrita **não** descarta o buffer, e a próxima digitação tenta de novo (F2.4)
- [ ] Descarrega o pendente antes de sumir da tela, com um teste **por gatilho**: trocar de aba de sessão, fechar o split, fechar a aba, perder o foco da janela, desmontar
- [ ] Gravar invalida `["changes"]` e o `listDir` do diretório do arquivo, e **não** o `files.read` do arquivo aberto (F2.5) — o teste é que digitar durante um `worktree.changed` não perde caractere
- [ ] Gate: `pnpm gate:quick`
- [ ] Test count: ao menos 5 casos de descarregamento, um por gatilho

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): save what you type without asking`

---

#### E10: Conflito na tela

**What**: O que acontece quando o agente escreveu no arquivo que você está editando.
**Where**: `FileViewer.tsx`, `useFileBuffer.ts`, `viewer.css` + testes
**Depends on**: E9

**Done when**:
- [ ] Resposta `stale` **para** o autosave — nada mais é gravado até o usuário escolher
- [ ] As duas saídas aparecem nomeadas pelo que perdem, sem default visual (D3.1)
- [ ] O custo de cada saída é **medido pelo cliente**, não adjetivado: ao receber o `stale`, ele busca o conteúdo do disco e compara com as duas versões que já tem — o texto base que leu e o buffer. Daí saem "perde as 3 linhas que você digitou" e "perde a edição do agente (+6 −2)". O servidor não sabe calcular isso, e o teste é que os dois números batem com uma edição conhecida dos dois lados
- [ ] O "o agente escreveu este arquivo há Ns" vem do `changedAt` da resposta (E4), não do relógio do cliente
- [ ] *Recarregar do disco* traz o conteúdo novo e a revisão nova, e o autosave volta a andar
- [ ] *Sobrescrever* grava com a revisão que veio na recusa, e passa (é o caso provado na E7)
- [ ] Buffer **limpo** com mudança externa adota o disco em silêncio; buffer **sujo** nunca é sobrescrito por refetch (D4)
- [ ] Enquanto o conflito está na tela, o texto digitado continua visível — ele é o único lugar onde aquele trabalho existe
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): say when the agent wrote the file you are editing`

---

## Fase 3 — A árvore edita

#### E11: Criar, renomear e apagar na coluna

**What**: As três operações no lugar onde os arquivos já estão.
**Where**: `packages/web/src/components/FileTree.tsx`, `CheckoutFiles.tsx`, `right-panel.css`, `hooks/useFileTree.ts` + testes
**Depends on**: E6, E1

**Done when**:
- [ ] Criar arquivo e criar pasta a partir do diretório clicado, com o nome digitado na própria linha da árvore
- [ ] Renomear no lugar, aceitando caminho — renomear é mover (F4.2)
- [ ] Apagar com confirmação que **nomeia** o alvo e consulta `files.deletePreview` (E5/E6): arquivo rastreado mostra o `git checkout --` que o traz de volta, não rastreado mostra que nada traz, e diretório mostra a contagem mais quantas entradas o git não recupera ([Q5](open-questions.md))
- [ ] Nome ocupado mostra a recusa do servidor, sem sobrescrever nada
- [ ] Depois de cada operação, só o diretório afetado e a lista de mudanças recarregam (F4.5)
- [ ] Apagar o arquivo aberto fecha o split; renomear reaponta o split para o novo caminho (F4.6)
- [ ] Tentar escrever dentro de `.git` mostra o motivo, e a árvore continua **mostrando** `.git` normalmente ([Q10](open-questions.md))
- [ ] Gate: `pnpm gate:quick`

**Tests**: unit · **Gate**: quick
**Commit**: `feat(web): create, rename and delete from the files column`

---

## Fase 4 — Prova

#### E12: e2e

**What**: A frase do PRD, ponta a ponta, contra um repositório de verdade e com um terminal escrevendo do outro lado.
**Where**: `e2e/file-editor.spec.ts`, `e2e/support/`
**Depends on**: E10, E11

**Done when**:
- [ ] Abre um arquivo, corrige uma linha, espera o autosave, e a mudança aparece na aba `Mudanças` — com o terminal da sessão ainda visível ao lado
- [ ] O conteúdo novo está **no disco**, verificado fora do navegador
- [ ] Escreve no mesmo arquivo pelo terminal da sessão enquanto o editor está sujo: a tela mostra o conflito, e *sobrescrever* deixa o disco com o texto do editor
- [ ] Cria um arquivo pela árvore, renomeia e apaga, com a árvore refletindo cada passo
- [ ] Gate: `pnpm gate:full`

**Tests**: e2e · **Gate**: full
**Commit**: `test(e2e): fix a line while the agent runs beside it`

---

## Risco

| O quê | Por quê | Mitigação |
|---|---|---|
| Sobrescrever o trabalho do agente | Autosave grava sozinho num checkout que tem outro escritor | E3, E4 e E7 vêm **antes** de existir editor; E7 é escrita concorrente de verdade |
| Perder o que foi digitado | Debounce + desmontar = janela em que o texto só existe na memória | E9 tem um teste por gatilho de descarregamento |
| Apagar `.git` | A árvore mostra `.git`, e apagar leva a worktree junto | E2 recusa na guarda, E5 verifica por chamada, E11 mostra o motivo |
| Escrita parcial | O agente pode ler o arquivo no instante da gravação | Temp + `rename` desde a E4, com teste de falha no meio |
| Bundle do CodeMirror | O daemon serve o app sem CDN; a right-panel mediu o Shiki e não estimou | E8 fecha com `gate:build` e o número real no PRD |
| Dois sistemas de realce divergindo | Patch pelo Shiki, arquivo pelo editor, na mesma moldura | D1: a ponte reusa tema e gramáticas. Se ela não servir, a decisão volta para a mesa antes de entrar gramática nova |
| Daemon sem autenticação | Escrita muda a categoria da superfície, não só o tamanho | Declarado na [Q7](open-questions.md) como feature própria e agendada — não silenciado |
