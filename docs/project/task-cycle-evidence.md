# Evidência do ciclo de tasks

Registro de custo e achados do ciclo `lumem-dev` → `lumem-reviewer` → rework → commit, orquestrado
pela skill [`lumem-task-cycle`](../../.claude/skills/lumem-task-cycle/SKILL.md).

Existe por uma regra da própria skill: **regra que cita número precisa de arquivo que sobreviva a
`clone`**. Sem ele a skill viaja com estimativa sem lastro, e ninguém consegue dizer se ela está
calibrada ou repetindo folclore.

Este arquivo tem três partes com custos de manutenção muito diferentes, e vale saber qual é qual:
a **linha de lote** é o que alguém preenche em dois minutos e é a única coisa obrigatória; a
**linha de base** e as **hipóteses** foram medidas/escritas uma vez e só mudam quando o repositório
muda; o **anexo** é história de outro projeto e não se mexe.

---

## Cobertura — leia antes de acreditar na tabela

Lote fechado sem linha aqui é indistinguível de lote que nunca existiu. O mecanismo contra isso é um
número só:

> **Último commit coberto: `89ffb15`.**

`fd83053` fecha o lote `E1`, o primeiro medido. Antes dele, `6c620dc` era o fim do período **pré-skill**. As quatro features anteriores —
`walking-skeleton`, `ui-shell`, `worktree-tabs`, `right-panel`, 79 commits — foram feitas antes da
skill existir (ela é de 2026-08-14) e **não têm medição recuperável**. O que elas acharam está
registrado onde importa: em "Armadilhas já corrigidas" de [testing.md](testing.md) e em "O que a
execução achou" no `tasks.md` de cada feature. Custo, não.

Quem fecha um lote atualiza esse sha para o último commit do lote. Um comando diz o que ficou de
fora:

```bash
git log --oneline 89ffb15..HEAD
```

Commit de código que aparecer aí e não estiver dentro de nenhum `Range` da tabela é lote que entrou
sem registro. O passe a frio do fim de lote (§9.7 da skill) roda esse comando — é a auditoria mais
barata que resolve mentira por omissão, e não custa campo nenhum a mais.

O mecanismo se provou antes de completar um dia de vida: quando esta seção foi escrita, o comando
já devolvia o lote `E1`, que havia fechado enquanto o próprio arquivo era reescrito. Ele apareceu
sem ninguém precisar lembrar, e virou a primeira linha da tabela.

**Um lote medido, e ele não teve review.** Enquanto a tabela não tiver um lote de código com round
de review, toda estimativa de custo que a skill der ao usuário continua sendo chute herdado (anexo)
e tem de ser apresentada como tal.

---

## Linha de base deste repositório

Medido em 2026-08-15, no commit `86dad1c`, num MacBook de **11 cores e 18 GB**, com um segundo
agente trabalhando em paralelo o tempo todo (load average entre 8 e 16 durante toda a medição — a
máquina nunca ficou quieta, e isso é o normal deste projeto, não uma condição de teste). É o
contexto sem o qual nenhum número de lote significa nada, e é a metade do arquivo que faltava para
ele ser deste projeto.

| O quê | Medida | Como |
|---|---|---|
| suíte unit/integration | **50 arquivos, 685 testes**, 15–20 s | `pnpm exec vitest run` |
| suíte e2e | **5 specs, 13 testes** | não medida — sobe daemon e navegador |
| `gate:quick`, sem código mudado | **0,6 s**, não executa nada | árvore limpa |
| `gate:quick`, mudança rastreável | **12 de 50 arquivos, 174 de 685 testes**, 7,7 s | mudança em `path-guard.ts` |
| `gate:quick`, mudança não rastreável | **suíte inteira**, 685 testes | `.css`, `.py`, lockfile, migração |
| `gate:build`, cache cheio | **1,0 s** com a máquina folgada · **3,4 s** sob carga | `pnpm gate:build` |
| `gate:build`, `--force` | **7,7–9,5 s** | `turbo … --force` |
| código de produção | **120 arquivos, 10.485 linhas**; mediana 67, p90 177, máx 569 | `git ls-files '*.ts' '*.tsx'` |
| código de teste | **9.730 linhas** — quase 1:1 com produção | idem |
| tamanho de task | **+779 / −55 linhas** de média | 40 últimos commits `feat` |

Três leituras dessa tabela mudam como o ciclo se comporta, e nenhuma delas era verdade no projeto
de origem:

**O gate inteiro deste repositório roda em menos tempo que uma única chamada de ferramenta.** Não
existe "esperar o gate". O que sobra do custo do review é leitura.

**Wall clock aqui é da máquina, não do gate.** A suíte inteira levou 15,2 s com load 15 e **135 s**
num pico de load 18,7 — 9×, com o código idêntico e a mesma configuração. Em sete execuções da
suíte durante a medição, **duas ficaram vermelhas e voltaram a verde na repetição seguinte, sem
mudança de código** — uma com 4 workers, outra com 10, o que aponta para a carga e não para o teto.
Consequência para o registro: tempo sem a carga junto é ruído, e por isso **não existe coluna de
tempo na tabela de lotes**.

**`gate:quick` é bem menos seletivo do que o nome promete.** Uma mudança em `path-guard.ts`
selecionou 12 dos 50 arquivos de teste; e qualquer arquivo que não seja `.ts`/`.tsx`/documentação —
um `.css`, um `.py`, o lockfile, uma migração — cai em `FULL_SUITE_GLOBS` e roda os 685. Task de UI
quase sempre toca `.css`: para ela, `quick` **é** a suíte inteira. Não é defeito (está justificado
em [testing.md](testing.md)), mas desmonta a intuição de que perfil declarativo compra gate barato.

### Concorrência é parâmetro, não constante

`vitest.config.ts` usa `LUMEM_TEST_WORKERS ?? 4` e `gate:build` passa `--concurrency=${TURBO_CONCURRENCY:-3}`
ao turbo. Os dois tetos existem para a máquina respirar com dois agentes em cima dela, e os dois são
sobrepostos por variável de ambiente. Medido **intercalado** (4, 10, 4, 10) para que a deriva de
carga não escolhesse o vencedor:

| Concorrência | Suíte inteira | `gate:build` forçado |
|---|---|---|
| **4 workers / turbo 3** (default) | 17,7 s · 17,1 s | 7,7 s · 9,2 s |
| 10 workers / turbo 11 | 13,6 s · 13,6 s | 8,2 s · 9,5 s |

**O teto é barato.** Custa ~4 s (≈30%) na suíte e **nada** no `gate:build` — que tem 4 tasks e um
`tsc` serial na frente, então concorrência nenhuma o ajuda. Nada aqui vira minuto.

Regra que isso deixa, e ela é uma frase, não um campo: **tempo que aparecer num parágrafo deste
arquivo diz sob qual concorrência e sob qual carga foi medido, ou não é escrito.** Não vira coluna:
a tabela de lotes não tem tempo justamente porque o número não sobrevive à comparação entre lotes.

---

## Registro de lotes

| Lote | Perfil | Range | Rounds | Tokens | Bloqueantes |
|---|---|---|---|---|---|
| `file-editor` E1 — protótipo | desenho (§3 não tem a linha) | `6c620dc..fd83053` | 0 | 239k | 0 de review · **2 da verificação** (2 costura) |
| `file-editor` E2+E3 — guarda de escrita e revisão | **crítico** | `bbfef0b..89ffb15` | 2 | 582k | **1 blocker + 5 warnings** (r1) · 3 blockers (r2) · 2 costura |

Dois contadores, porque respondem a duas perguntas que a skill não consegue responder sozinha —
*isto aqui é cerimônia?* — e custam um dígito cada:

* **verificação independente do orquestrador:** 2 lotes, **1 refutação**
* **passe a frio pós-lote:** 0 passes, 0 achados que o orquestrador com contexto não tinha

**A verificação independente pagou o lote inteiro, e por um motivo que não estava previsto.** Não
houve round de review: task de desenho não tem `Done when` verificável por teste, então o
orquestrador re-renderizou os cinco estados em vez de aceitar o relato. Olhar o PNG achou **dois
defeitos de costura**, os dois na mesma direção — a tela promete dado que nenhuma procedure produz:
o aviso de conflito exibe "o agente escreveu há 8 s" e "+6 −2" da edição dele, e o diálogo de apagar
exibe se o git desfaz e a contagem recursiva da pasta. Nenhum dos quatro números existia no contrato
do PRD. Custo da correção com a feature ainda em documento: três edições. Custo se tivesse chegado
na `E11`: a tela pronta pedindo dado que ninguém produz, com o servidor já commitado e revisado.

Vale a distinção que a própria skill exige: isto **confirma** que verificação independente acha o
que review não acharia, e **não** confirma nada sobre o valor dela em lote de código — é n=1, num
perfil que a §3 nem descreve. A hipótese 5 desta página previu esse buraco antes do lote fechar.

**O que não dá para dizer deste lote:** nada sobre custo de review, porque não houve review; e nada
sobre a repartição dev/review/rework, porque só o estágio de dev existiu. Os 239k são um dev de
desenho sozinho, com renderização e leitura de PNG dentro.

**O primeiro lote de código: 2 rounds, e os dois se pagaram por motivos diferentes.** O round 1 achou um blocker que destruía a worktree — `.GIT` num filesystem insensível a caixa atravessava a recusa de `.git`, porque a última componente do caminho era a única coisa que nunca passava por `realpath`. O revisor não argumentou: pegou a saída da guarda, rodou contra um repositório de verdade e apagou o `.git` dele. **Nenhum dos 685 testes existentes podia ter pego isso, e o CI também não** — em `ubuntu-latest`, `.GIT` é outro nome e o caso não existe.

O round 2 foi de outra natureza: nenhum código errado, **três asserções fracas**. `.not.toBeNull()` aceitava as duas razões possíveis de `readOnly`, e quatro casos de `insideGit` resolviam todos para caminhos que já continham `.git`, então a passada sobre a grafia pedida não tinha teste. Isso é a bateria de mutação fazendo o que a regra do projeto promete: o código estava certo e nada impedia alguém de desfazê-lo.

**A bateria custa e entrega.** 23 mutações no round 1, 21 no round 2 — e as duas rodadas foram executadas contra os arquivos de teste reais, em cópia no scratchpad, não inspecionadas. Sete testes nasceram de mutação sobrevivente, incluindo dois que impedem o erro **oposto**: uma guarda que recusasse `.gitignore` e `.github/` passaria em todo teste de segurança e quebraria o produto.

**Um defeito de gate apareceu no meio e vale mais que o lote.** `LUMEM_GATE_BASE` com SHA curta só de dígitos degradava para `--changed true` — 13 arquivos de teste em vez de 50, mesmo commit. Custou uma rodada de review em falso vermelho, e podia ter dado falso verde. Está em `testing.md` com a correção e cinco testes.

**O dev derrubou três premissas minhas**, todas por evidência executada: a lista de 8 casos de teste que eu especifiquei era insuficiente em dois pontos de segurança, e o meu diagnóstico de qual teste matava uma mutação estava errado — com a segunda passada canonizando, quem a sustenta é outro caso. É o achado mais valioso do método, e é a terceira vez que ele aparece contando os dois projetos.

**O que a verificação independente fez desta vez: confirmou, não refutou.** Rodei as duas mutações centrais com a minha própria mão e vi as duas ficarem vermelhas. Registro porque uma verificação que nunca refuta ainda tem valor — ela autoriza fechar sem um terceiro round —, mas isso só é honesto se estiver escrito quando ela **não** acha nada.

---

## O que registrar

### O mínimo, e ele é obrigatório

Uma linha na tabela. Seis campos, e cada um está aí porque **muda uma decisão**:

| Campo | Que decisão ele muda | De onde sai |
|---|---|---|
| **Lote** | nenhuma sozinho — é a chave da linha | as tasks do lote |
| **Perfil** | é o eixo de calibração da §3 da skill; sem ele o número não agrega | você já anunciou antes de disparar |
| **Range** | `sha..sha`. Reconstrói diff, arquivos, tasks e commits para sempre | `git log --oneline` |
| **Rounds** | é o multiplicador da §10, o número que mais erra estimativa | você contou |
| **Tokens** | um total. É a §10 inteira | soma dos relatórios dos sub-agentes |
| **Bloqueantes** | é a Lei 2 e a Lei 3; anote `(n costura)` se algum foi defeito **entre** tasks | bloco YAML do revisor |

`Range` é o campo que paga por vários: enquanto ele estiver certo, tamanho de diff, arquivos
tocados e número de commits são recuperáveis a qualquer momento por quem quiser a pergunta. Por isso
não há coluna de diff — ela seria trabalho hoje para uma resposta que o git já guarda.

`(n costura)` é a única marca que a linha carrega além de números, e ela fica porque é **a métrica
que decide se o agrupamento está no tamanho certo** — a classe dominante de bloqueante, no projeto
de origem, era defeito entre tasks.

**Alvo: dois minutos.** Se estiver custando mais que isso, o excedente é ornamento e pode ficar de
fora.

### O aprofundamento, e ele é opcional

Um parágrafo abaixo da tabela, **só quando o lote produziu argumento novo** — regra nova, regra
refutada, ou defeito de classe não vista antes. Sem argumento novo, não escreva nada: parágrafo
obrigatório vira parágrafo vazio, e parágrafo vazio é pior que ausência.

Formato: frase de abertura em negrito com o **mecanismo**, duas ou três frases de contexto. É o
mesmo formato de "Armadilhas já corrigidas" em [testing.md](testing.md) e de "O que a execução
achou" nos `tasks.md` — o registro que já funciona neste repositório, e o único que sobreviveu a
quatro features.

Vale parágrafo:

* **mutação que sobreviveu ao revisor**, com o teste que deveria tê-la pegado — e se virou guarda
  nova, ela vai para [testing.md](testing.md), não para cá;
* **premissa derrubada pelo dev**, mas só se ela mudou uma regra da skill. Se mudou só a feature, o
  lugar dela é `tasks.md`/`open-questions.md` e duplicar aqui é trabalho a troco de nada;
* **hipótese desta página confirmada ou refutada** — é para isso que elas estão escritas;
* **custo que caiu num estágio inesperado**, quando você por acaso sabe a repartição. Não vá atrás
  dela; se os cinco números de estágio estiverem à mão, ótimo, escreva a frase.

Não vale parágrafo: achado que já está inteiro em outro documento, contagem que a tabela já dá, e
"correu tudo bem".

---

## Registrar nunca segura entregar

Regra de escape, e ela vale contra qualquer outra frase deste arquivo:

* **o ledger não é gate.** Não bloqueia commit, não bloqueia task, não bloqueia fase, não bloqueia
  portão. A linha vai **depois** do commit, nunca antes;
* **número que você não tem na mão vira `—`.** Linha com buraco vale mais que lote sem linha,
  porque ela ainda registra que o lote existiu e o `Range` ainda reconstrói o resto;
* **nunca re-rode nada para preencher campo.** Se o relatório do sub-agente se perdeu, `—`. Gastar
  um review para ter o número do review é a definição de cerimônia;
* **na pressa, o mínimo do mínimo é `Lote` + `Range`.** Os dois saem de um `git log`, em trinta
  segundos, e mantêm a cobertura honesta;
* **na dúvida entre estimar e deixar `—`, deixe `—`.** Ledger atrasado se recupera; medição
  inventada contamina a calibração e ninguém descobre depois qual linha era chute.

---

## O que a primeira medição deve desmentir

Hipóteses, não conclusões. Estão escritas para que a medição seja feita **com pergunta** e para que
possam estar erradas — o valor delas é serem falseáveis, não estarem certas. Cada uma diz o
mecanismo esperado e o que a refutaria.

**1. Gate rápido derruba wall clock e não derruba token.** No projeto de origem boa parte do review
era esperar gate de minutos; aqui o gate custa segundos (tabela acima). Mas o que o agente **lê** de
um gate é o sumário do vitest — algumas centenas de tokens, iguais se a execução levou vinte minutos
ou dez segundos. Espero, então, que o custo em token do review aqui caia na **mesma ordem de
grandeza** do anexo (~145k/lote), com o wall clock duas ordens abaixo. *Refuta*: review muito mais
barato que ~145k — o que significaria que o custo lá era leitura de código grande, não espera de
gate, e aí a Lei 1 transfere por um motivo diferente do que a skill supõe.

**2. Arquivo pequeno pode não baratear o review, porque metade do diff é teste.** A mediana de
arquivo aqui é 67 linhas, contra classes de C#/DDD bem maiores — a intuição diz review mais barato.
Só que produção e teste estão quase 1:1 (10.485 contra 9.730 linhas) e a task média mexe em +779
linhas. O revisor lê as duas metades, e a bateria de mutação obriga a raciocinar sobre a de teste
duas vezes. *Refuta*: review por task significativamente mais barato que o anexo, o que indicaria
que tamanho de arquivo domina mesmo assim.

**3. A bateria de mutação encarece o review e é onde está o achado.** Eixo obrigatório do
`lumem-reviewer` que não existia no revisor do projeto de origem — então os números do anexo
**subestimam** o review daqui por construção. Espero review mais caro e mais achado. *Refuta*:
custo de review dentro do anexo, ou zero mutação sobrevivente em vários lotes seguidos — o segundo
caso significaria que a bateria está sendo relatada, não executada.

**4. `lógica` continua sendo o perfil menos calibrado, e aqui é o mais frequente.** Os pontos
amostrais fortes do anexo são declarativo, fronteira e crítico. O `file-editor` é `E2`–`E11`:
guarda de caminho, serviço, router, componente React — quase tudo `lógica` ou `fronteira`. A
primeira medição vai calibrar justamente a linha mais fraca da tabela de custo.

**5. Falta um perfil para task de desenho, e o primeiro lote foi uma.** A `E1` do `file-editor` é
protótipo HTML+CSS sobre tokens: não tem `Done when` verificável por teste, o gate dela é olhar a
renderização, e ela toca `.css` — que, pela linha de base acima, dispara a suíte inteira no
`gate:quick`. Nenhuma das quatro linhas da §3 da skill descreve isso. Ela fechou em `fd83053` sem
que ninguém registrasse custo, então a pergunta continua aberta com um ponto amostral perdido.
*Refuta*: a próxima task de desenho fechar comportando-se como `declarativo` — lote grande, um
round, orquestrador lê o diff e fecha.

**6. Fronteira continua sendo o perfil que engana.** A Fase 0 deste repositório é evidência forte a
favor: config pura, diff pequeno, **seis rodadas** de review adversarial, e todas as armadilhas de
[testing.md](testing.md) nasceram ali. Evidência forte não é confirmação: aquilo foi medido sem a
skill, no ciclo informal, e não é ponto amostral do método.

**7. O teto de concorrência não é o que precisa de vigilância — a contenção é.** Medido acima, o
teto custa ~30% na suíte e nada no `gate:build`. O que custou 9× foi haver outro agente na máquina.
Se algum dia o gate aqui virar caro, a hipótese a testar primeiro é quantos agentes estavam
rodando, não qual era o `maxWorkers`. *Refuta*: um lote em que a suíte passe de dezenas de segundos
com a máquina comprovadamente folgada — aí o teto virou o gargalo e o número dele precisa subir.

---

## Anexo — números de outro projeto

**Não são deste repositório e não devem ser citados como se fossem.** Origem: serviço .NET/DDD, 6
experimentos, ~15 lotes, gates de dezenas de minutos, suíte de ~1500 testes, interop nativo. Estão
aqui, e não apagados, porque a §10 da skill os cita e a regra é que número citado tenha lastro
visível — e porque zero medição com uma referência antiga é melhor que zero medição com nada.

**Como usar até existir linha na tabela: use as razões, não os absolutos.** "Review quase constante
entre perfis" e "cada round ≈ +300k" são relações entre estágios e tendem a sobreviver à troca de
projeto. Os valores absolutos escalam com o tamanho do que se lê, que é exatamente a variável que
mais muda entre um serviço .NET/DDD e este monorepo. A primeira linha da tabela de lotes rebaixa
este anexo a curiosidade histórica.

| Perfil | Dev | Review (1 round) | Rework | Total, 1 round |
|---|---|---|---|---|
| declarativo | ~110k/task | ~145k/lote | ~165k | — |
| lógica | ~200k/task | ~150k/lote | ~200k | — |
| fronteira / crítico | ~290k/task | ~145k/lote | ~230k | ~700k/task |

Multiplicador de round: cada round adicional ≈ +300k. Tasks críticas ficaram em ~1,6 rounds.

Achados estruturais que sustentam as três leis da skill:

| Medição | Resultado |
|---|---|
| custo do review vs. tamanho do diff | 5,4× de diff → 1,28× de token; 9× de diff → 1,35× de token |
| lote de 1 task declarativa | 438k tokens, saída líquida de **um comentário** |
| lote de 3 tasks declarativas | 1,04M tokens, **5 bloqueantes**, 3 deles invisíveis a review por task |
| task crítica sozinha | ~700k a >1M, ~1,6 rounds |
| classe dominante de bloqueante | defeito **entre** tasks, 4 ocorrências |
| verificação independente do orquestrador | 1 refutação em 9 lotes |
