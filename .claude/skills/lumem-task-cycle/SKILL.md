---
name: lumem-task-cycle
description: "Executa tasks de uma feature do Lumem-OS (docs/prd/<feature>/tasks.md) pelo ciclo dev → review → rework → commit, em lotes calibrados por risco. Use para 'roda a Fase 1 do walking-skeleton', 'implementa as próximas tasks', 'continua de onde parou', 'executa a feature <slug>'. Retoma trabalho interrompido a frio, sem contexto de sessão anterior. NÃO use para escrever PRD, perguntas ou tasks, nem para decidir arquitetura, nem para task única e trivial (chame o lumem-dev direto)."
---

# lumem-task-cycle

Orquestra `lumem-dev` e `lumem-reviewer` sobre as tasks de uma feature, em lotes, até fechar.

Você é o **orquestrador**. Não escreve o código nem faz o review — decide o lote, faz a triagem
dos achados, toma as decisões que não cabem a nenhum dos dois, e verifica de forma independente
o que é caro errar.

**Agentes**: `.claude/agents/{lumem-dev,lumem-reviewer}.md`, versionados no repositório.
**Registro de custo e achados**: [`docs/project/task-cycle-evidence.md`](../../../docs/project/task-cycle-evidence.md).

## Procedência das regras — leia antes de citar número

As regras estruturais desta skill (leis, perfis de risco, raio de alcance, triagem, passe a frio)
foram **medidas em outro projeto** — um serviço .NET/DDD, com gates de dezenas de minutos, suíte
de ~1500 testes e interop nativo. **Nenhum número foi medido no Lumem-OS ainda.**

Trate-as como **hipóteses calibradas**, não como fatos deste repositório. O que muda aqui e pode
mudar as conclusões: gate de **segundos** em vez de minutos, arquivos menores (mediana de 67
linhas), e TypeScript em vez de C#. A suíte tem **685 testes** unit/integration mais 13 e2e — não é
pequena, e o gate inteiro mesmo assim roda em menos tempo que uma chamada de ferramenta. Como
esperar gate deixa de ser custo, o que sobra do review é leitura: é plausível que o overhead fixo
pese **mais** proporcionalmente aqui, não menos. Os números medidos estão na "Linha de base deste
repositório" de [`task-cycle-evidence.md`](../../../docs/project/task-cycle-evidence.md).

Medir é passo obrigatório do fechamento de lote (item 9 da §9). Até o primeiro lote medido, diga
explicitamente ao usuário que a estimativa de custo é herdada.

---

## 1. Três leis (herdadas, não medidas aqui)

**Lei 1 — o custo do review é quase constante.** O overhead fixo — ler PRD, reconstruir intenção,
rodar gates, auditar documentação — domina o custo por linha do diff.

**Lei 2 — o valor do review escala com risco, não com tamanho.** O mesmo gasto compra "um
comentário desatualizado" num lote de tipos e "o daemon morre e deixa shell órfã" num lote de PTY.

**Lei 3 — o gargalo não é o custo do review, é a cascata de retrabalho.** A Lei 1 seduz para lotes
enormes. O que limita não é o preço do review, é o que quebra quando um nó de dependência é
invalidado.

> **Consequência das três, e é a regra que governa o resto:**
> **agrupe agressivamente _dentro_ de um nó de dependência, nunca atravessando um.
> Aprofunde por risco, não por linhas.**

O grafo de dependência já está desenhado: a seção "Plano de execução" de
`docs/prd/<feature>/tasks.md` tem os diagramas por fase. Use-os — não reconstrua o grafo de cabeça.

---

## 2. Passo 0 — descobrir o estado (sempre, mesmo parecendo óbvio)

Nunca assuma que a feature está onde a conversa diz. Agentes morrem no meio, sessões terminam.
**Derive o estado de fontes duráveis.**

```bash
git log --oneline -20
git status --short
git ls-files --others --exclude-standard
```

O terceiro comando não é opcional. `git status --short` mostra untracked, mas o `git diff` que
você vai usar depois **não lista arquivo novo** — e arquivo novo é exatamente o que escrever uma
feature produz. Essa armadilha já mordeu o gate deste repositório.

Depois leia `docs/prd/<feature>/tasks.md`: a seção "Notas de contexto" no header (premissas
travadas `A1..An`, pendências numeradas — §9.7) e a definição de cada task.

Cruze as fontes:

| Sinal | Leitura |
|---|---|
| commit cujo assunto é o campo `Commit` da task, com a linha `T<N> of docs/prd/<feature>/tasks.md` | task fechada |
| arquivo do `Where` existe, sem commit | **task parcial** — artefato órfão |
| working tree sujo em arquivo de task | interrompida no meio |
| arquivo untracked no `Where` | idem, e invisível ao `git diff` |

**Este repositório não tem convenção de marcar checkbox no `tasks.md`.** Os `Done when` ficam
`[ ]` mesmo em task fechada. O estado real vem do commit, não do documento — não tente ler
checkbox como progresso e não mande ninguém marcar.

### Artefato órfão nunca é confiável

Arquivo de task sem commit correspondente **não foi verificado** — pode nunca ter passado no
typecheck. Trate a task como nova: audite o arquivo contra o `Done when`, escreva o teste que
falta, rode o gate. "Existe" não é "funciona".

### Nunca renomeie nem force

Não rode `reset`, `rebase`, `amend`, `push` nem renomeie branch para "limpar" estado. Retomada é
aditiva: commit novo em cima. O repositório trabalha com branch por feature e PR — descubra em qual
você está (`git branch --show-current`) em vez de supor, e nunca troque de branch no meio de um
lote.

---

## 3. Passo 1 — classificar risco e formar o lote

Risco tem **dois eixos**. Usar só um é o erro clássico: um lote de fiação parece declarativo e
esconde a consequência máxima.

> **risco = natureza do código × posição no sistema**

| Perfil | Sinais no Lumem-OS | Lote | Review | Verificação do orquestrador |
|---|---|---|---|---|
| **declarativo** | tipos e constantes em `shared`, protocolo de mensagem, schema Zod, documentação | grande, até o limite do nó de dependência | 1 round | ler o diff |
| **lógica** | repositório Drizzle, router tRPC, componente React, validação, mapeamento de erro | médio (3–5 tasks) | round 2 se o rework tiver **raio de alcance** (§7) | rodar os gates |
| **fronteira** | `bootstrap.ts`, `main.ts`, registro de router, `ports.json`/`ports.ts`, `turbo.json`, `vitest.config.ts`, `playwright.config.ts`, `scripts/gate-quick.ts`, `tsconfig*`, proxy do Vite, `package.json` de pacote | **pequeno, independente do tamanho do diff** | **completo, sempre** | **obrigatória** |
| **crítico** | `PtyManager`/`RingBuffer`, endpoint WebSocket, `GitService` e worktree, migração Drizzle, reconciliação de boot, desligamento e sinais, sessão órfã, spawn de agente, e2e de portão | pequeno (2–3 tasks) | **completo, sempre** | **obrigatória** |

**Fronteira é o perfil que engana**: diff minúsculo, consequência máxima. O gatilho não é quanto
código a task escreve — é se ela decide **por onde a produção passa**. Neste repositório, a Fase 0
inteira é fronteira, e ela consumiu **seis rodadas de review adversarial** antes de fechar. Toda
armadilha de `docs/project/testing.md` nasceu ali.

Regras de formação:

* **a fronteira do lote é o nó de dependência.** Agrupe o que compartilha o mesmo nó; pare antes de
  atravessar para o próximo. Lote que cruza nó é onde a cascata mora (Lei 3);
* **respeite a ordem de dependência** (`Depends on`) e os diagramas da fase;
* **task marcada como portão de fase** fecha o lote nela — é a task que prova a fase inteira, e no
  `file-editor` é a `E12` (e2e). Portão vermelho significa arquitetura errada: pare, reporte, não
  abra o lote seguinte;
* **não misture perfis** — o lote herda a profundidade do mais alto, e misturar faz você pagar
  review crítico em cima de tipos;
* **task `[P]` — serialize por padrão.** Dois `lumem-dev` no mesmo repo competem por working tree e
  commit. Worktree isolado só se a serialização se provar cara, e nunca sem `isolation: worktree`;
* **task cujo `Tests` é `e2e` nunca entra em lote paralelo** — a matriz de `testing.md` proíbe:
  daemon único, porta única, estado compartilhado;
* **task bloqueada** (dependência aberta, decisão pendente) não entra. Bloqueio no meio da cadeia
  para o lote nela;
* **task cujo desenho depende de pergunta sem `**R:**`** em `open-questions.md` também não entra —
  implementar antes é apostar, e o `CLAUDE.md` proíbe suposição silenciosa.

Anuncie lote, perfil e custo estimado (§10) antes de disparar. Uma linha basta.

---

## 4. Passo 2 — implementar

Um `lumem-dev` em **modo fase** (§1.1 da definição dele) para o lote inteiro.

O prompt precisa conter, sem exceção:

* as tasks em ordem, com `Where`/`Done when`/`Test count`/`Gate`/`Commit` — mandando ler o
  `tasks.md` como fonte de verdade;
* as **premissas travadas** relevantes (`A1..An`) e as decisões de `open-questions.md` que a task
  cita (`WS-Q15`), com o texto da resposta, não só o código da pergunta;
* o que já está commitado que ele herda;
* **commit próprio por task** — não negociável, §8;
* **um relatório por task**, não consolidado no fim;
* gate entre as tasks; gate vermelho interrompe a fase;
* que ele rode o gate **antes** de commitar, porque `gate:quick` compara contra `HEAD^`;
* o que **não** tocar (arquivo alheio no working tree);
* nada de `push`/PR/`rebase`/`reset`.

### Quando o resultado esperado é falha

Se a task exercita algo pela primeira vez contra um sistema real — `node-pty` na plataforma do
usuário, browser do Playwright, `git worktree` com nome contendo barra, SQLite em disco — diga
explicitamente: **falha reproduzível é entrega válida, desde que reportada com evidência** (exit
code, stderr, passo alcançado). Proíba contornar, afrouxar ou `.skip`.

Precedente deste repositório: `node-pty` falhava com um `posix_spawnp failed` sem mencionar
permissão nem arquivo, porque a extração do pnpm derrubava o bit de execução do `spawn-helper`.
Só apareceu porque alguém rodou de verdade e reportou a falha crua.

### O dev tem evidência que você não tem — e isso corrige você

"Orquestrador decide, dev executa" descreve a autoridade, **não** o fluxo de informação. O dev está
lendo o código, o `package.json`, a saída do gate.

* **dev que para e pergunta não é atrito — é sinal de premissa suspeita.** Antes de responder,
  verifique a premissa em vez de repeti-la;
* mande ele discordar **com evidência** (`arquivo:linha`, saída de comando) em vez de implementar
  em silêncio ou ignorar em silêncio;
* quando ele trouxer evidência que derruba uma premissa travada, **atualize o `tasks.md`**, e se a
  premissa vier de uma decisão de `open-questions.md`, atualize também lá. Premissa mudou não é
  dúvida esclarecida.

---

## 5. Passo 3 — review do lote

Um `lumem-reviewer` sobre o **range de commits** do lote, de uma vez.

### Diga qual é a base do gate

`pnpm gate:quick` compara contra `HEAD^`. Para um lote de N tasks, isso mede só a última.
**Passe a base explicitamente** no prompt: `LUMEM_GATE_BASE=<sha antes do lote> pnpm gate:quick`.
Sem isso o revisor mede a coisa errada e reporta verde falso — e você não tem como saber.

### O histórico de execução, não só o diff

Diff nenhum mostra que um teste jamais ficou vermelho. Informe:

* o RED falhou de verdade em cada task? houve etapa GREEN?
* alguma task retomou artefato órfão?
* alguma correção foi feita depois de um review anterior?
* algum gate foi rodado com base diferente do default?

Sem isso o revisor não distingue teste que prova contrato de teste escrito contra a implementação.

### Teste de costura — obrigatório quando o lote consome artefato de outro lote

**A classe dominante de achado bloqueante é defeito entre tasks**, não dentro de uma. Agrupar não
resolve isso — as tasks estão em lotes diferentes, que é o caso normal em qualquer feature de mais de meia dúzia.

> **Quando uma task produz artefato que outra consome, o review do consumidor tem de rodar a saída
> real do produtor contra a validação real do consumidor.**

Não é inspeção dos dois lados: é **execução** de um contra o outro.

Costuras da feature em execução (`file-editor`), para você não ter que procurar. Quando a feature
mudar, refaça esta tabela a partir do `Where`/`Depends on` do `tasks.md` dela — a lista é derivada,
não decorada:

| Produtor | Consumidor | O que rodar contra o quê |
|---|---|---|
| guarda de escrita (E2) | `FileService` de escrita e CRUD (E4, E5) | caminho recusado de verdade contra o que o serviço assume que chega até ele |
| `revision` da leitura (E3) | escrita guardada (E4), autosave (E9) | a revisão que a leitura devolveu contra a que a escrita compara — mesmo arquivo, ida e volta |
| resposta `stale` com `changedAt` (E4, E6) | tela de conflito (E10) | resposta real do servidor contra o que a tela desenha, incluindo o cálculo de custo que ficou no cliente |
| `deletePreview` (E5, E6) | diálogo de apagar (E11) | veredito real do git contra a frase que o diálogo promete ("o git desfaz os outros 3") |
| tokens `editor/*` e `save/*` (E1) | tema do CodeMirror (E8) | o token gerado contra o que o tema importa de `tokens.ts` — nome que não existe vira cor `undefined`, silenciosa |

**Gatilho barato, derivável do `tasks.md` sem julgamento**: se o `Where`/`Reuses` do lote nomeia
artefato que outra task nomeia, a costura existe e o teste é obrigatório. Liste as costuras no
prompt do review, com o nome dos dois lados.

Variante que já apareceu em outro projeto e vale vigiar aqui: **a costura pode estar num artefato
que uma task DESLIGA e outra deveria ter substituído** — não só em dado que uma produz e outra
consome. Quando uma task remove um caminho (T31 remove a tela do T8), liste **tudo** que aquele
caminho fazia, não só o que a task nova reimplanta.

### Exija a bateria de mutação

O `lumem-reviewer` tem isso como eixo obrigatório (§5.13 dele) porque é a regra escrita do
projeto: *"se dá pra mutar o código e o teste continua verde, o teste não existe"*. Cobre no
prompt: quais mutações foram testadas, quais sobreviveram, e o campo `surviving_mutations` do
bloco YAML preenchido.

### O revisor pode executar — deixe explícito

"Read-only" na definição dele significa **não modifica o repositório sob review**. Construir
harness descartável **fora** do repo (no scratchpad da sessão) para medir em vez de argumentar
sempre foi permitido. Diga no prompt que ele pode — a permissão existe e tende a ser descoberta em
vez de usada.

### Onde olhar, sem entregar o achado

Aponte a **superfície de risco** (o que é nó de dependência, o que outras tasks reusam, o que cruza
fronteira) sem dizer o que está errado. Se você já sabe o que está errado, não precisa de review —
corrija.

### Proporcionalidade

`gate:build` e `gate:quick` sempre. `gate:full` só quando o diff toca caminho coberto por e2e, ou
muda boot, desligamento, porta ou estado — sobe daemon e navegador. Cite flakiness já
caracterizada em `testing.md` ou na lista numerada em vez de deixá-lo redescobrir.

### Exija o bloco YAML da §8.1 dele

`verdict`, `blocking_count`, `gate_base`, `findings[]` com `propagates_to` e `blocks`,
`surviving_mutations`, `follow_ups`. É o que torna o ciclo orquestrável sem leitura humana.

---

## 6. Passo 4 — triagem

Cada achado vai para **um de três destinos**. Classifique todos antes de responder qualquer um.

| Destino | Quando | O que fazer |
|---|---|---|
| **dev resolve** | mecanismo claro, correção cabe no escopo da task | entra no rework |
| **orquestrador decide** | duas leituras válidas, ou desenho dentro do que o PRD já decidiu | **decida**, registre a razão, mande executar |
| **usuário responde** | pergunta de design que o PRD não tomou, ou decisão de produto | **parqueia sem travar a fase** |

### Achado do terceiro tipo não bloqueia a fase

O canal externo aqui é o próprio Vinicius, e o registro durável é `docs/prd/<feature>/open-questions.md`
(ou `docs/project/questions.md`, se for do projeto todo). Escreva a pergunta lá, com a evidência e
as opções, entre na lista numerada (§9.7), feche o resto do lote, leve a pergunta ao usuário. O
ciclo continua.

Isso é a mesma regra do `CLAUDE.md`: *"pergunta de design não vira suposição silenciosa"*. A skill
só diz **onde** ela vive e que ela não trava a fase.

### Resposta do usuário dispara re-varredura

A resposta **não** preenche só a lacuna perguntada. Varra todos os artefatos da mesma classe,
decida onde a consequência mora, propague exigência de teste para as tasks dependentes, e marque
`[x]` com o texto em `**R:**`. Espere que ela gere **pergunta nova**.

### "Evidência forte" nunca vira "confirmado"

Ausência de contradição não é confirmação. Registre a distinção explicitamente no ledger.

### Regra de parada

Volta para o dev se houver **qualquer blocker ou warning**. Só nit → fecha, nit vira follow-up
registrado.

**Agrupe todos os blockers/warnings num round só.** Retomar um agente replaia o transcript inteiro:
cada round custa quase um review completo.

---

## 7. Passo 5 — rework e fechamento

O `lumem-dev` em **modo rework** (§5.8): corrige só a lista, discorda com evidência, re-roda o
gate, commit separado no padrão `fix: close round-N review findings on <escopo>`.

### Dimensione o round seguinte pelo RAIO DE ALCANCE da correção

Não por "substância", não por severidade.

> **A pergunta é uma só: a correção tocou um seam que outra task consome?**

| Raio da correção | Faça |
|---|---|
| morre dentro da task (comentário, doc, corpo de função privada, teste local) | **você** lê o diff e fecha |
| asserção ou estrutura de suíte | **você** verifica quebrando de propósito (abaixo) |
| **toca tipo em `shared`, protocolo, assinatura de procedure, schema, `ports.json`, config de build/teste, ou qualquer seam consumido por outra task** | **round completo** sobre o delta, mesmo que você já tenha verificado |

Este é o **mesmo eixo** da regra de propagação do revisor (§7.1 da definição dele). Um conceito
governa as duas coisas: severidade e necessidade de novo round.

Corolário que o eixo resolve: um **warning cuja correção é texto** (comentário, doc, entrada de
ledger) satisfaz "volta para o dev" pela §6 e "você lê e fecha" pela §7 ao mesmo tempo. **O raio
vence.** Severidade alta com correção que não pode regredir código não justifica um round de dev.

### Verificação independente do orquestrador — obrigatória em lote crítico e de fronteira

Não aceite o relato. Rode você mesmo:

* os gates, **com a base certa** (`LUMEM_GATE_BASE=<sha antes do lote>`), mais `pnpm gate:build`;
* se algum resultado verde puder ter vindo de cache do Turborepo, **force**
  (`pnpm exec turbo typecheck --force`). Já mentiu duas vezes neste repositório;
* **quebre de propósito o que a asserção nova deveria pegar, veja vermelho, reverta sem commitar.**
  Dois comandos, e prova o que leitura nenhuma prova. É a bateria de mutação aplicada por você, na
  árvore de trabalho, com `git checkout` no fim — a única mutação que você pode fazer no repo, e só
  porque é revertida antes de qualquer commit;
* para valor derivado de fonte normativa (default de porta, limite do ring buffer, nome de
  constraint do PRD §6), **derive da fonte à mão** — PRD, `ports.json`, header da lib. Golden medido
  do próprio código sob teste confirma o bug em vez de pegá-lo.

> **Correção que o orquestrador *decidiu* merece verificação mais dura que correção que o revisor
> *especificou*.** O revisor descreve um defeito observado; o orquestrador projeta uma solução, e
> projeto subespecificado é onde nasce o defeito novo. O review seguinte não o pega porque, quando
> ele rodou, o defeito ainda não existia.

Consequência prática, e é onde a regra se paga: ao mandar executar uma decisão de projeto sua,
**enuncie as propriedades que a solução tem de satisfazer, não só o mecanismo.** "Deduplique o log"
produz defeito; "uma condição que persiste reporta uma vez, uma que some e volta reporta de novo, e
várias condições convivem" produz solução.

### Quando a correção cria ou fortalece um gate

Se o rework produziu um teste-guarda novo — e neste repositório isso é comum, porque metade das
armadilhas de `testing.md` virou guarda —, o round seguinte tem de perguntar **"o que este gate NÃO
pega?"** e medir a resposta, em vez de revisar só se o defeito original sumiu. Gate novo é artefato
consumido por tasks futuras: herda a regra de propagação, e a afirmação sobre o poder de detecção
dele é parte do contrato.

---

## 8. Passos mecânicos do DEV — exija sempre

Não são julgamento, são comando.

1. **Commit por task, sempre.** Checkpoint de resiliência, não estilo. Quando um agente morre no
   meio de um lote, o commit por task limita o dano à task em andamento.
2. **Gate antes do commit.** `gate:quick` compara contra `HEAD^`; rodar depois de commitar mede o
   commit anterior.
3. **Varredura de referência órfã após rename/remoção.** `Grep` pelo nome antigo em código, teste e
   `docs/`. O revisor revisa **o diff**, e arquivo não tocado que a mudança tornou errado é o ponto
   cego estrutural dele.
4. **Toda asserção nova sobre comportamento tem de ser vista falhando ao menos uma vez.** Sonda
   comportamental precisa ser **discriminante**, não apenas verdadeira.
5. **Nada de `.skip`/`.todo` para contornar falha.** Teste que depende de recurso externo precisa de
   mecanismo real de exclusão, verificado rodando a suíte padrão — não de rótulo.
6. **Arquivo novo entra no commit explicitamente.** `git add -A` é proibido, e `git diff` não
   enxerga untracked: arquivo novo esquecido é o modo de falha mais silencioso deste repositório.

---

## 9. Passos mecânicos do ORQUESTRADOR — os seus

7. **Passe de descoberta a frio ao fim de cada lote.** Suba um agente **sem contexto da sessão**,
   com esta skill e a instrução "descubra onde parou; Passo 0 e Passo 1; não implemente nada".
   Compare com o que você acha que é verdade.

   **Contexto é também viés**: quem acompanhou o lote sabe que uma correção foi feita e para de
   reler a linha que ainda diz o oposto.

8. **Lista numerada única de pendências, e ela é a fonte de verdade.** Todo achado que sobrevive ao
   lote — pergunta ao usuário, decisão adiada, dívida aceita, flakiness caracterizada — entra
   numerado numa seção **"Notas de contexto"** no header de `docs/prd/<feature>/tasks.md`, junto
   com as premissas travadas `A1..An`. **Não** só numa mensagem, **não** só num comentário de
   código, **não** só dentro de item já fechado.

   O passe a frio **audita essa lista** contra o código e contra `open-questions.md`: toda pergunta
   em aberto está numerada? todo `TODO` no código tem entrada correspondente? todo item riscado está
   mesmo resolvido?

   Refinamento: audite também **todo documento de análise que a feature produziu**. Seção cujo
   título contenha "a confirmar", "a pedir", "para o usuário" é uma fila de pendências que ninguém
   registrou como fila.

9. **Registre o custo real do lote** ao fechar, em
   [`docs/project/task-cycle-evidence.md`](../../../docs/project/task-cycle-evidence.md). O mínimo
   obrigatório é **uma linha de seis campos** — `Lote`, `Perfil`, `Range`, `Rounds`, `Tokens`,
   `Bloqueantes` — e o alvo é dois minutos; o aprofundamento em prosa só existe quando o lote
   produziu argumento novo. O próprio ledger manda o resto: número que você não tem vira `—`, e
   **registrar nunca segura entregar**. Enquanto o "Registro de lotes" de lá não tiver um lote de
   código com round de review, a estimativa que você dá ao usuário é chute herdado, não medida.

10. **Armadilha nova vai para `docs/project/testing.md`.** Bug de teste ou de gate descoberto e
    corrigido entra na seção "Armadilhas já corrigidas", com o mecanismo. É o registro que impede o
    retorno, e o `lumem-reviewer` usa a lista como checklist de regressão (§5.14 dele).

11. **Arquivo novo em `docs/` entra no `docs/README.md` na mesma hora.** Regra do `CLAUDE.md`, e o
    revisor cobra.

---

## 10. Custo

**Ainda não há medição no Lumem-OS.** A tabela abaixo é herdada de um projeto .NET com gates
lentos e suíte grande; a ordem de grandeza pode não transferir. Preencha
[`task-cycle-evidence.md`](../../../docs/project/task-cycle-evidence.md) e substitua.

| Perfil | Dev | Review (1 round) | Rework | Total, 1 round |
|---|---|---|---|---|
| declarativo | ~110k/task | ~145k/lote | ~165k | — |
| lógica | ~200k/task | ~150k/lote | ~200k | — |
| fronteira / crítico | ~290k/task | ~145k/lote | ~230k | ~700k/task |

**Multiplicador de round** (herdado): cada round adicional custa `review + rework` ≈ +300k; tasks
críticas ficaram em ~1,6 rounds ⇒ multiplique por 1,6.

**Some a verificação do orquestrador**, que não é barata: rodar gates, reproduzir RED, derivar
valor da fonte normativa.

O que provavelmente difere aqui, e é o que a primeira medição vai mostrar: gate de segundos em vez
de minutos derruba o wall clock, mas **não** derruba o custo em token do review, que é dominado por
leitura de PRD e de código. Se a Lei 1 valer, o lote maior continua ganhando.

**Não presuma escopo.** Se o usuário não pediu a feature inteira, proponha o próximo lote com o
custo estimado — dizendo que é herdado — e confirme.

---

## 11. O que NÃO fazer

* **não** revisar task por task — desperdiça o overhead fixo (Lei 1);
* **não** calibrar profundidade por número de linhas (Lei 2);
* **não** formar lote que atravessa nó de dependência (Lei 3);
* **não** tratar config de build, teste, porta ou bootstrap como declarativo por ser diff pequeno;
* **não** abrir round de review para correção que morre dentro da task;
* **não** fechar sem round quando a correção tocou seam consumido por outra task;
* **não** deixar achado para "o próximo round" — cada round custa um review;
* **não** deixar pendência viver só numa mensagem ou só num comentário de código;
* **não** decidir pergunta de design que o PRD não tomou; leve ao usuário com o trade-off, e
  registre em `open-questions.md`;
* **não** travar a fase esperando resposta do usuário;
* **não** aceitar gate verde de relato em lote crítico ou de fronteira;
* **não** aceitar gate verde rodado com a base errada;
* **não** confiar em verde que pode ter vindo de cache do Turborepo;
* **não** tratar pergunta de dev como atrito;
* **não** mandar ninguém marcar checkbox no `tasks.md` — não é convenção deste repo;
* **não** avançar de fase com o portão (T9) vermelho;
* **não** tocar arquivo alheio no working tree, nem incluí-lo em commit;
* **não** rodar `push`, PR, `rebase`, `reset --hard` ou renomear branch.

---

## 12. Por quê — origem das regras

Nenhuma regra aqui é preferência, mas **nenhuma foi medida neste projeto**. A coluna de origem
descreve o defeito que produziu a regra no projeto onde ela foi medida, exceto onde marcado
`[lumem]`, que vem do histórico deste repositório.

| Regra | Defeito que a originou |
|---|---|
| lote grande | 1 task sozinha: 438k tokens, saída líquida de **um comentário** |
| lote não atravessa nó de dependência | probes de uma task **reabriram task já fechada** |
| teste de costura entre lotes | 4 ocorrências: a classe dominante de bloqueante é defeito **entre** tasks |
| perfil **fronteira** | flag + DI, diff mínimo, defeito no caminho **default de produção** |
| perfil fronteira `[lumem]` | Fase 0 é config pura e custou **seis rodadas** de review; todas as armadilhas de `testing.md` nasceram nela |
| round por **raio de alcance** | round 2 sobre correção já verificada achou regressão (mexeu em interface); outro igualmente estrutural teria sido desperdício |
| commit por task | agente morreu no meio de uma fase; as tasks commitadas sobreviveram |
| auditar artefato órfão | arquivo existia, parecia completo, **nunca tinha compilado** |
| incluir untracked no Passo 0 `[lumem]` | `git diff` não lista arquivo novo; o gate deste repo reportava "nothing to run" sobre um módulo inteiro recém-criado |
| gate com base explícita `[lumem]` | `gate:quick` compara `HEAD^`; num lote de N tasks isso mede só a última |
| desconfiar de cache `[lumem]` | cache do Turborepo reportou verde sobre código que não compilava — **duas vezes** |
| histórico de execução no review | RED verde = testes escritos contra a implementação |
| bateria de mutação `[lumem]` | 15 testes do gate eram vazios; corromper 6 de 7 globs deixava tudo verde |
| sonda discriminante | 3 testes de um estado passavam também no estado vizinho |
| varredura de órfã | doc citava classe removida pelo próprio rework; sobreviveu a 2 reviews |
| golden da fonte normativa `[lumem]` | a porta 4317 vivia em três arquivos e nenhum teste a fixava |
| triagem em três destinos | pergunta externa ficou aberta e não podia travar a fase |
| re-varredura pós-resposta | uma confirmação de unidade obrigou revarrer todos os read models |
| verificação independente | smoke contra binário real revelou crash que mata o host |
| verificação mais dura em correção **decidida pelo orquestrador** | dedup decidida na triagem abriu buraco de falha silenciosa no canal de erro que ela consertava |
| enunciar **propriedades**, não mecanismo | mesma dedup: instrução por mecanismo saiu com defeito, instrução por propriedades saiu certa de primeira |
| perguntar "o que este gate NÃO pega?" | correção que criou um gate documentou um poder de detecção que o gate não tinha |
| passe a frio pós-lote | agente sem contexto achou o que o orquestrador com contexto não via |
| lista numerada única | pedido externo vivia só numa mensagem; item que era gate do default nunca foi pedido a ninguém |
| revisor pode executar | melhores achados vieram de harness descartável — permissão teve de ser descoberta |
| fluxo bidirecional | 3 premissas do orquestrador derrubadas por devs mandados executá-las |
| evidência versionada | skill commitada citava evidência em diretório ignorado; clone limpo = números sem lastro |
| custo por task/round | estimativa por lote de n=1 errou ~2× |

### Limites conhecidos

* **um lote medido no Lumem-OS, e ele não teve review.** O primeiro foi a `E1` do `file-editor`,
  uma task de **desenho** — perfil que a §3 nem descreve. Toda a §10 e as três leis continuam
  importadas até existir lote de código com round;
* **o projeto de origem tem gates de minutos e suíte de ~1500 testes.** Aqui a suíte tem 685 e o
  gate ainda leva segundos. A conta de wall clock certamente não transfere; a de token,
  provavelmente transfere em parte — e a hipótese 1 do ledger diz o que a refutaria;
* **`gate:quick` é menos seletivo do que parece.** Medido: mudança em um módulo do servidor
  selecionou 12 dos 50 arquivos de teste, e qualquer `.css`, `.py`, lockfile ou migração roda a
  suíte inteira. Não conte com gate barato só porque o perfil é declarativo;
* **paralelismo não foi testado** em nenhum dos dois projetos. "Serialize por padrão" é decisão de
  projeto, não resultado;
* **cascata de retrabalho foi observada uma vez**, não medida em custo. A Lei 3 é qualitativa;
* **perfil `lógica` é o menos calibrado** — os pontos amostrais fortes são declarativo, fronteira e
  crítico. E aqui a maior parte da feature (repositórios, routers, componentes) cai justamente em
  `lógica`;
* **"warning de texto o orquestrador aplica" é n=2**, nenhuma delas aqui;
* **a verificação independente refutou 1 vez em 9 lotes** no projeto de origem. Quanto do valor dela
  é economia de round versus captura de erro continua sem número.
