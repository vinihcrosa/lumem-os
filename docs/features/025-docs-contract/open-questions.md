# Contrato de documentação — Perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

**12 perguntas, 12 respondidas** (2026-09-07). Três foram respondidas **contra** a proposta original
do pedido: a Q6 tirou a precedência do número, a Q3 recusou a proibição total de supersessão parcial
que a referência impõe, e a Q12 renomeou a categoria inteira. Cada `**R:**` carrega a data.

A referência estudada é [`github.com/vinihcrosa/lumem`](https://github.com/vinihcrosa/lumem) — outro
projeto, com um contrato de documentação e três ADRs. **Nada foi copiado**: o que ela ofereceu foram
opções já derrubadas com razão escrita, e duas delas foram derrubadas de novo aqui.

---

### Q1 — O identificador do ADR é data ou número?

A referência escolheu data (`docs/adr/2026-08-11-slug.md`) com uma razão que se aplica aqui em
dobro: *"an agent that proposes ADRs makes parallel creation normal rather than exceptional"* — e
este repositório roda N agentes em N worktrees pelo Conductor ao mesmo tempo.

| Opção | Ganho | Custo |
|---|---|---|
| **A. `YYYY-MM-DD-slug.md`** | colisão quase impossível; ordena cronologicamente de graça; o nome não precisa de coordenação entre worktrees | **sem handle curto** — não existe "ADR-7", só o nome inteiro. E o slug tem teto (60 chars na referência), então o nome é *lossy*: um dos três ADRs de lá perdeu a última palavra do título |
| **B. `NNN-slug.md`** | "ADR-7" funciona na conversa e no commit; ordem de leitura = ordem de decisão | duas worktrees criam `007` e **o git não vê conflito — fica com os dois arquivos** |
| **C. data + sufixo de desempate** (`-2`…`-99`) | é o que a referência implementou de fato | mais uma regra para lembrar |

**Minha inclinação: A.** O handle curto é a única coisa que se perde, e ele é conveniência de
conversa; a colisão silenciosa é corrupção. E ADR se cita por link, não por número.

**R (2026-09-07): A com timestamp — `YYYY-MM-DD-HHMM-slug.md`.** O timestamp não precisa ser grande,
só o suficiente para garantir ordem e evitar colisão no mesmo dia.

O que isso fixa em concreto:

- **Precisão de minuto, 4 dígitos.** `2026-09-07-2143-o-numero-da-prd-e-ordem-nao-prioridade.md`.
  Ordena lexicograficamente de graça, o que é a propriedade que se está comprando.
- **`date:` no frontmatter continua `YYYY-MM-DD`.** É a data da *decisão*, legível por gente; o
  timestamp é componente de nome de arquivo, para ordem e unicidade, e não vira campo. Um campo a
  menos é um campo a menos para discordar (D14).
- **Não precisa de regra de sufixo `-2`.** O modo de falha que a D10 nomeia é *"two branches both
  create `0007` and git does not see a conflict"* — e ele existe porque um ordinal **afirma**
  unicidade: `0007-a.md` e `0007-b.md` são dois arquivos diferentes e os dois ficam. Aqui o
  identificador não afirma nada: dois ADRs no mesmo minuto com slugs diferentes são só dois
  arquivos, e a ordem entre eles ficar indefinida é inofensiva. O único jeito de colidir de verdade
  é data + minuto + slug **idênticos** — e aí é o mesmo caminho, então o git levanta `add/add`
  conflict e a colisão é **visível**, que era o problema todo.
- **ADR retrospectivo usa a data real da decisão, não hoje** — `2026-08-17` para o ACP,
  `2026-08-19` para o Open Design. E o timestamp sai do `git log` do commit que fechou a decisão, em
  vez de ser inventado. Isso também dissolve o único caso ruim do minuto: escrever 5 ADRs
  retrospectivos numa sessão só não os põe todos no mesmo minuto, porque cada um carrega o seu.

**R:** A, `YYYY-MM-DD-HHMM-slug.md`

### Q2 — `status` do ADR: campo escrito ou derivado da cadeia?

Derivado significa: um ADR está superado exatamente quando outro o nomeia em `supersedes`, e
**nenhum arquivo é editado depois de escrito**. Escrito significa um campo `status:` mais um
`superseded_by:` de volta no antigo — dois lugares que podem discordar.

O §3 é a evidência empírica: 5 dos 23 `Status:` deste repo estão errados hoje. A referência tinha o
`superseded_by` na inclinação inicial da pergunta e **cortou durante o TDD**.

**Minha inclinação: derivado**, e o custo dito — para saber a posição atual você caminha a cadeia,
o que é barato para um agente e chato para uma pessoa que abriu o arquivo velho direto.

**R (2026-09-07): derivado.** Um ADR é superado exatamente quando outro o nomeia em `supersedes`, e
**nenhum arquivo é editado depois de escrito** — sem `status:`, sem `superseded_by:`, sem write-back.

**O custo, dito por inteiro porque ele é real:** quem abre um ADR velho direto **não vê aviso
nenhum** de que ele foi superado. O agente caminha a cadeia; a pessoa não. Isso é aceito, e a
mitigação é a que a referência usa — o ponteiro que manda listar `docs/adr/` antes de propor
arquitetura, não um campo dentro do arquivo. A referência registra isso como a pergunta que o
desenho dela **não** respondeu: *"whether an agent reliably reads a decision it was merely pointed
at is the open question this design is waiting on real use to answer."* Aqui vale o mesmo — e é o
tipo de coisa que a `memory-dogfooding` mediria.

**R:** derivado

### Q3 — Supersessão parcial: proibida, ou o padrão que este repo já usa?

**Esta é a pergunta que mais muda o desenho, e é onde os dois repos discordam.**

A D11 da referência proíbe: *"turns every decision into a diff against another decision until nobody
can state the current position without assembling fragments. When only part changed, the new ADR
restates what still holds."*

Este repositório faz o oposto, e faz bem — `walking-skeleton/prd.md:81` reverte o F2.5 **só para
projeto gerenciado** e escreve o que sobrou: *"Continua valendo inteiro para projeto registrado por
caminho"*. Reescrever isso como ADR total obrigaria a reafirmar o F2.5 inteiro num documento novo.

| Opção | Ganho | Custo |
|---|---|---|
| **A. Proibida** (o ADR novo reafirma o que fica) | a posição atual se lê num arquivo só; a cadeia é rasa | ADR novo repete texto do velho; reversão de uma linha custa um documento inteiro; e este repo perde o padrão que ele inventou |
| **B. Permitida com escopo escrito** (o que já se faz) | reversão pequena custa nota pequena; o escopo do que sobrou fica explícito e delimitado | para saber a posição atual você monta fragmentos — exatamente o que a D11 nomeia; e o número de fragmentos só cresce |
| **C. Proibida no ADR, permitida na PRD** | ADR fica somável e limpo; a nota fina continua no requisito contradito, onde ela é encontrável | duas gramáticas de supersessão para aprender; e a fronteira "isso é fino ou é grosso" vira julgamento |

**Minha inclinação: C.** A D11 está certa sobre *decisão arquitetural* — é o tipo de coisa cuja
posição atual precisa caber num arquivo. Mas a nota do `walking-skeleton:81` não é sobre arquitetura:
é sobre um requisito de feature, e é justamente a delimitação (*"o que autoriza é a coluna
`managed`"*) que a torna útil. As duas coisas têm vidas diferentes, do jeito que a D1 separa
documento de memória.

**R (2026-09-07): C — proibida no ADR, permitida na PRD.** Duas gramáticas, e a fronteira é o que a
D7 da referência já separa: decisão que atravessa o sistema → ADR, e lá ela é total (o ADR novo
reafirma o que fica). Requisito que morre com a feature → nota no requisito contradito, com escopo
delimitado, do jeito que o `walking-skeleton:81` faz. **Consequência a escrever na regra:** um ADR
nunca é reaberto "em parte" — se só parte mudou, o ADR novo reafirma o resto. E a nota de PRD nunca
sozinha derruba um ADR; se ela precisa disso, o que falta é um ADR.

**R:** C

### Q4 — Onde o ADR mora?

A referência recusou duas coisas com razão escrita: pasta `adrs/` por feature (*"a decision outlives
the slice that produced it"*) e rascunho promovido na aprovação (*"two locations and a drift
window"*).

| Opção | Ganho | Custo |
|---|---|---|
| **A. `docs/adr/` global, com `feature:` no frontmatter** | um lugar só; a decisão sobrevive à feature; o `feature:` mantém a rastreabilidade | `docs/adr/` cresce plano — a referência assume isso e diz que só dói a partir de ~60 |
| **B. `docs/features/NNN-x/adr/`** | a decisão nasce perto de onde foi tomada | "como se decide autenticação" obriga a adivinhar a pasta; e decisão que atravessa duas features não tem casa |

**Minha inclinação: A.** É o que a regra de documentação do `CLAUDE.md` já sustenta —
`docs/<categoria>/`, e `adr` é uma categoria.

**R (2026-09-07): A, respondida por implicação da Q5.** Pôr `docs/project/` no papel de *"estudo que
sustenta o ADR"* já exige que o ADR tenha casa própria e única. `docs/adr/`, plano, com `feature:`
no frontmatter para a rastreabilidade — e a categoria entra na tabela do `CLAUDE.md:182`, que é a
regra que autoriza `docs/<categoria>/`.

Duas coisas ficam de fora de propósito, seguindo a referência: **sem subdiretório** em `docs/adr/`
(*"holds ADRs and nothing else"*) e **sem `docs/adr/drafts/`** — rascunho promovido é o mesmo
*"two locations and a drift window"* que a Q7 recusou.

**R:** A

### Q5 — O que acontece com `pty-vs-acp.md` e `design-source-of-truth.md`?

Os dois já são ADR em tudo menos no nome. O `pty-vs-acp.md` tem 557 linhas, e o valor dele está
justamente no que um ADR chama de `Alternatives`: os §§1–7 preservam *"a recomendação contrária, que
perdeu"*.

| Opção | Ganho | Custo |
|---|---|---|
| **A. Ficam onde estão; um ADR novo os referencia** | zero risco de perder contexto; zero link quebrado | duas categorias com o mesmo papel — `docs/project/` e `docs/adr/` — e ninguém sabe onde procurar |
| **B. Viram ADR** (`docs/adr/2026-08-17-…`), o corpo longo fica como anexo em `docs/project/` | uma casa só para decisão | 2 arquivos movidos, N links a corrigir, e o `summary` de uma frase tem que resumir 557 linhas |
| **C. Ficam, e `docs/project/` passa a ser explicitamente *"estudo que sustentou um ADR"*** | nomeia o papel de cada categoria sem mover nada | o `pty-vs-acp.md` teria que perder o `Status: DECIDIDO`, que migra para o ADR |

**R (2026-09-07): C.** `docs/project/` passa a ter papel nomeado: **estudo, medição e discussão que
sustentam uma decisão** — não a decisão. O que isso obriga, e é o custo aceito:

- `pty-vs-acp.md:3` perde o `**Status:** DECIDIDO em 2026-08-17`; ele migra para o ADR. Sem isso,
  dois arquivos afirmam a mesma decisão e um deles vai apodrecer — que é o achado do §3.
- `design-source-of-truth.md:3` perde o `> **Decisão, 2026-08-19.**` pela mesma razão.
- Os dois ganham uma linha de cabeçalho apontando para o ADR que a decisão virou. Nos dois casos é
  a **primeira vez** que um arquivo de `docs/project/` aponta para um sucessor.
- O `Alternatives` do ADR do ACP cita o **§7 do `pty-vs-acp.md`** — a recomendação contrária, que
  perdeu — em vez de reescrevê-la. É a Q10/C aplicada.
- A tabela de categorias do `CLAUDE.md:182` ganha a linha `docs/adr/`, e a de `docs/project/` ganha
  a distinção. As duas frases têm que ficar curtas o suficiente para caber na cabeça de quem lê:
  **`docs/adr/` decide; `docs/project/` sustenta; `docs/features/` executa.**

**R:** C

### Q6 — O número da PRD significa prioridade, ou só ordem?

O pedido original era prioridade temporal: PRD mais recente manda. Com ADR carregando a decisão, o
número pode virar só ordem de leitura — e isso resolve de graça três problemas que a prioridade
tinha:

1. **Emenda × criação.** A Q6 da `run-dock-open` foi respondida em 2026-09-01 e **revertida em
   2026-09-06**. O número dela é o de 09-05. Se o número é a lei, a lei nasce errada.
2. **Colisão em paralelo.** Duas worktrees pegam `025` e o git não reclama.
3. **Nenhum arquivo descreve o presente.** Se a regra é "o mais novo manda", saber o comportamento
   de hoje é reproduzir 24 PRDs em ordem na cabeça.

| Opção | Ganho | Custo |
|---|---|---|
| **A. Só ordem** | os três problemas acima desaparecem; o número nunca mente porque não afirma nada | um agente que só olha o número não sabe o que está em vigor — ele *tem* que ir ao `docs/adr/` |
| **B. Prioridade dura** | um agente pode ignorar PRD velha sem ler | precisa de regra para emenda, para colisão e para projeção do estado atual — três regras novas |

**Minha inclinação: A**, e ela depende de a Q4/Q5 darem casa ao ADR — sem ADR, "só ordem" deixa o
repo sem nenhuma fonte de precedência.

**R (2026-09-07): A — só ordem de leitura.** O número responde *"o que veio antes"* e mais nada.
**Isso torna a Q10 bloqueante, não opcional:** se o número não afirma precedência e o `docs/adr/`
nasce vazio, o repositório fica por um tempo **sem nenhuma fonte de precedência** — pior do que
hoje, onde a nota informal no requisito contradito ao menos existe em 44 lugares. A ordem de
execução tem que ser: `docs/adr/` com lastro **antes** de a regra nova valer, não depois.

**R:** A

### Q7 — Proposta não implementada: fica em `docs/features/NNN-`, ou em lugar separado?

Hoje são três — `daemon-auth`, `memory-dogfooding`, `workspace-tasks` — e o repo **já resolve isso
sem saber**: nenhuma tem `tasks.md`, e o campo `Tasks:` de cada uma diz literalmente *"ainda não —
nascem depois das perguntas respondidas"*. É a regra da referência (`SPEC-10`, artefato preguiçoso)
já em prática.

O que elas custam se mudarem de lugar: **11 referências de fora** apontam para `daemon-auth`, 9 para
`workspace-tasks`, 7 para `memory-dogfooding`. Uma promoção por rename quebra as 27.

| Opção | Ganho | Custo |
|---|---|---|
| **A. Ficam. "Proposta" = não tem `tasks.md`** | o número existe desde o começo, então dá para linkar; zero movimentação; é o que já se faz | `docs/features/` mistura entregue e sonhado, e o `ls` não distingue |
| **B. `docs/proposals/` → move ao implementar** | `docs/features/` só contém coisa real | **é o "two locations and a drift window" que a referência recusou**; o número não existe enquanto é proposta, então nada pode linkar; e a promoção quebra as 27 refs |
| **C. Ficam, com prefixo de estado** (`NNN-p-nome`) | o `ls` distingue | o rename na promoção quebra tudo de novo, e agora duas vezes por feature |
| **D. Ficam; o `docs/README.md` é que separa** (uma seção "propostas") | o `ls` não distingue mas o índice sim; zero rename | o índice é escrito à mão — e o heading `docs/README.md:361` **já está falso** |

**Minha inclinação: A**, com uma correção que vale mais que a escolha: o problema que você sentiu
não é o lugar, é que **"proposto" hoje é prosa que ninguém valida** — e é por isso que 5 `Status:`
mentem e o índice tem um heading falso. Se o estado se deriva de quais arquivos existem, "proposta"
para de precisar de lugar próprio.

**R (2026-09-07): A — ficam, e "proposta" é a ausência de `tasks.md`.** Não é prática ruim: é a
`SPEC-10` da referência, já em uso aqui sem nome. O que fica escrito na regra:

- **`tasks.md` não nasce vazio.** Arquivo vazio afirma que uma fase rodou; ausência é o estado
  correto de uma fase que não rodou. O campo `Tasks:` dizendo *"ainda não — nascem depois das
  perguntas respondidas"* é a forma certa e as três já a usam.
- **Numeração não muda na promoção.** Uma proposta de `NNN` baixo implementada depois de uma de
  `NNN` alto **fica com o número baixo** — ele é ordem de criação (Q6), e renumerar quebraria as 27
  refs de fora e pagaria o custo dos 45 trailers de novo (Q9).
- **`memory-dogfooding` é caso à parte, e vale nomear:** ela não é feature de código —
  *"é um período de uso medido"*, e o entregável é **uma decisão**. Pelo contrato novo isso é um
  candidato natural a virar ADR quando o período fechar, e a pasta dela é o estudo que o sustenta.

**R:** A

### Q8 — `Status:` continua sendo campo de prosa?

Se a fase se deriva do filesystem (tem `tasks.md`? tem checkbox aberto?), o campo `Status:` fica
como *ornamento que pode mentir* — e mente em 5 de 23. Se ele fica, alguém tem que consertar os 5
agora e manter os próximos.

| Opção | Ganho |
|---|---|
| **A. Sai.** A fase se lê do `tasks.md` | não existe o que apodrecer |
| **B. Fica, com gramática fechada** (`proposta \| em execução \| completa \| superada por <ADR>`) | legível de relance, e uma gramática fechada é verificável |
| **C. Fica livre como hoje** | zero trabalho; e continua mentindo |

**R (2026-09-07): B — gramática fechada.** Quatro valores, e nada mais:

```
**Status:** proposta | em execução | completa | superada por <link do ADR>
```

- **`proposta`** ⇔ não existe `tasks.md` (Q7). Os dois têm que concordar, e é isso que o gate checa.
- **`em execução`** ⇔ existe `tasks.md` com checkbox aberto.
- **`completa`** ⇔ existe `tasks.md` sem checkbox aberto.
- **`superada por <ADR>`** é o único valor que **não** se deriva do filesystem, e é o único que a
  Q3/C permite: uma PRD inteira cair é decisão arquitetural, então tem ADR.
- **A prosa rica não se perde** — ela desce uma linha. O `second-agent` mantém *"proposta em
  2026-09-05, medida em 2026-09-06 e fechada em 2026-09-07"*, só que como `**Histórico:**` e não
  dentro do campo que o gate lê. Os 19 campos de cabeçalho ad-hoc continuam livres de propósito: o
  gate olha um campo, não o cabeçalho.
- **Os 5 que mentem são consertados no passo 6**, e os 2 do README, e o heading do índice.

**R:** B

### Q9 — Numeração: atribuída quando, e o que acontece na colisão?

Os **45 trailers de commit** no histórico (`T<N> of docs/features/001-walking-skeleton/tasks.md`) já vão
passar a citar caminho inexistente com esta migração — isso é irreversível e aceito uma vez. O que
não se pode é pagar de novo.

Consequência: **numera-se uma vez, na criação da pasta, e nunca se renumera** — nem para tapar
lacuna, nem para "arrumar" a ordem quando uma proposta antiga é implementada depois de uma nova.

Sobra a colisão: duas worktrees criam `025-`. Opções: aceitar e renumerar a segunda no merge (paga o
rename uma vez, em pasta nova sem links de fora); ou reservar o número no `docs/README.md` como
parte de abrir a PRD.

**R (2026-09-07): renumera a segunda no merge.** Barato porque pasta recém-criada ainda não tem
referência de fora — o rename nesse momento custa quase nada, e é a única janela em que isso é
verdade. O que fica escrito:

- **Numera na criação da pasta, ordem de merge do git. Uma vez, e nunca renumera** depois de a
  pasta ter refs de fora — nem para tapar lacuna, nem quando uma proposta antiga é implementada
  depois de uma nova (Q7).
- **Colisão se resolve renumerando a que mergeou depois**, não a que tem número "errado".
- **Lacuna é permitida.** Se uma PRD for abandonada e a pasta apagada, o número fica vago. Renumerar
  para fechar a lacuna é o que a regra proíbe.
- Isso não é gate — é rotina de merge, e o custo de errar é uma pasta com número duplicado, que o
  `ls` mostra.

**R:** renumera a segunda no merge

### Q10 — Escrevem-se ADRs retroativos? Quantos?

O §3 inventariou 44 declarações informais de supersessão e 2 arquivos que já são ADR sem o nome.
Escrever ADR para tudo isso é um projeto por si.

| Opção | Ganho | Custo |
|---|---|---|
| **A. Nenhum.** ADR começa a valer daqui pra frente | barato; e o contexto velho não se perde — está nas PRDs | `docs/adr/` nasce quase vazio, e a regra "ADR é a fonte de verdade" fica sem lastro no dia um |
| **B. Só os que passam nos três testes hoje** — provavelmente PTY×ACP, Open Design como fonte, e o portão de escrita da memória | o `docs/adr/` nasce com as decisões que de fato atravessam o sistema | trabalho de escrita real, e reconstruir `Alternatives` de memória é o que a D12 chama de *"reads authoritative while missing the only part that mattered"* |
| **C. B, mas o `Alternatives` só cita a fonte** (o §7 do `pty-vs-acp.md`) em vez de reescrever | não inventa nada | o ADR deixa de ser autossuficiente |

**Minha inclinação: C** para os 2 que já existem, e A para o resto — os 44 casos informais são
supersessão de *requisito de feature*, não de arquitetura, e pela Q3/C eles ficam onde estão.

**R (2026-09-07): C — os que passam nos três testes, com `Alternatives` citando a fonte.** Não
inventar o que perdeu é a regra; a D12 é explícita sobre por quê. Os 44 casos informais **não**
viram ADR: são supersessão de requisito de feature, e pela Q3/C ficam onde estão.

Candidatos, cada um com a fonte que sustenta o `Alternatives` — **a lista tem que ser confirmada
antes de escrever**, porque "passa nos três testes" é julgamento e é onde a feature vaza escopo:

| Decisão | `date:` | Fonte do `Alternatives` | Passa nos três? |
|---|---|---|---|
| A sessão de agente é ACP, não PTY | 2026-08-17 | `docs/project/pty-vs-acp.md` §§1–7, **inclusive o §7, que recomendou não migrar** | difícil de reverter ✓ · surpreendente ✓ · trade-off real ✓ — o caso mais forte dos dois repos |
| O design é feito no Open Design, não no repo | 2026-08-19 | `docs/project/design-source-of-truth.md` §§1–3 | ✓ · ✓ · ✓ |
| A memória escreve atrás de portão, inbox e interruptor **desligado** | ~2026-08-22 | `docs/features/007-workspace-memory/open-questions.md` | ✓ · ✓ · ✓ |
| O status de PR vem do `gh` da sua máquina; o Lumem não vê, não pede e não grava token | 2026-09-05 | `docs/features/013-pull-request-status/{prd,spike}.md` | ✓ · ✓ · ✓ — é a maior parte da resposta de segurança da feature |
| O daemon é um bundle ESM e serve o web na própria porta | ~2026-08-30 | `docs/features/014-distribution/prd.md` | ✓ · ✓ · ✓ |
| O adaptador de agente é catálogo (`ADAPTERS`), não constante de Claude | 2026-09-07 | `docs/features/021-second-agent/prd.md` §4 (a fase 0 mediu antes) | talvez — a reversibilidade é discutível |
| Um popover ancora no que o abre | 2026-09-07 | `docs/features/023-composer-menus/prd.md` | provavelmente **não** — é regra de design, e a Q3/C manda isso ficar na PRD |

**A armadilha, dita:** escrever 5–7 ADRs é uma feature por si, e o §6 põe isso **antes** do `git mv`.
Se a lista crescer para 15, é escopo vazando — o corte é "difícil de reverter", e a maioria das 96
perguntas do `questions.md` não é.

**R:** C

### Q11 — Existe gate?

Hoje não existe link-checker nenhum, e o repositório já tem **4 links mortos** para um arquivo que
nunca existiu, criados por tasks marcadas `[x]`. A migração multiplica a superfície.

| Candidato | O que pega |
|---|---|
| **link-checker de markdown em `docs/`** | o rename incompleto, e os 4 links mortos de hoje. É o único que paga por si na hora |
| `broken-supersedes` / `supersedes-cycle` (os dois gates da referência) | cadeia de ADR ilegível. Só depois de existirem ADRs |
| `Status:` contra o `tasks.md` | os 5 que mentem — mas só se a Q8 mantiver o campo |

Entra no `gate:quick`, no `gate:full`, ou em nenhum? (`scripts/gate-quick.ts:67` hoje **exclui**
`docs/**` de propósito.)

**R (2026-09-07): link-checker no `gate:full`.** Um só, e ele paga por si na hora: pega o rename
incompleto do passo 4 **e** os 4 links mortos que já existem. Fica no `full` e não no `quick` porque
é I/O em ~70 arquivos e o `quick` existe para ser rápido — a exclusão deliberada de `docs/**` em
`scripts/gate-quick.ts:67` continua valendo.

O que ele tem que checar, em ordem de valor:

1. **Link relativo entre arquivos de `docs/`** resolve para arquivo existente. É o que pega o rename
   incompleto.
2. **Âncora de heading** (`#21-isto-reverte-um-requisito-do-walking-skeleton`) resolve. É o que grep
   **não** pega, e é justamente o mecanismo da nota de reversão — o padrão que sustenta a Q3/C.
3. **`Status:` contra o filesystem** (Q8): `proposta` ⇔ sem `tasks.md`; `completa` ⇔ sem checkbox
   aberto. Pega os 5 que mentem e impede o próximo.

Os dois gates de cadeia de ADR (`broken-supersedes`, `supersedes-cycle`) **ficam de fora** — para
5–7 ADRs sem nenhum `supersedes`, é código para um problema que não existe, e a evidência é que na
referência eles existem e **não rodam em CI nenhum**. O gatilho de voltar: o primeiro `supersedes:`
escrito.

**R:** link-checker no `gate:full`

### Q12 — A pasta continua se chamando `prd`?

A referência usa `docs/features/NNN-slug/` porque a pasta guarda mais que um PRD — e aqui também:
`prd.md`, `open-questions.md`, `tasks.md`, mais `spike.md`, `journal.md`, `roadmap.md`,
`context-delivery.md`. Chamar a pasta de `prd` e ter um `prd.md` dentro é uma repetição que já
confunde.

Renomear `docs/features/` → `docs/features/` **junto com** a numeração custa quase nada a mais (o `sed` é
o mesmo, e já vai passar em 86 + 117 + 129 linhas). Feito depois, custa tudo de novo.

**R (2026-09-07): sim, no mesmo passo.** `docs/features/<x>/` → `docs/features/<NNN>-<x>/`. O que isso
adiciona ao corte, além do que já estava contado:

- a tabela de categorias do `CLAUDE.md:182-191` e a réplica dela em `docs/README.md:442-447` — é a
  **definição** da convenção, não uma citação dela;
- as duas regras do `docs/project/backlog.md:8` e `:12` (*"Tarefa vive em `docs/features/<NNN>-<feature>/tasks.md`;
  ideia sem PRD vive aqui"* / *"Item que ganhar PRD sai daqui e vira uma pasta em `docs/features/`"*);
- os 12 placeholders `docs/features/<NNN>-<feature>/` nos dois agentes, incluindo `lumem-reviewer.md:113` e
  `:272`, que **definem o trailer de commit** `T<N> of docs/features/<NNN>-<feature>/tasks.md`. A convenção
  passa a ser `T<N> of docs/features/<NNN>-<feature>/tasks.md`, e os 45 trailers já no histórico
  ficam citando as duas coisas erradas de uma vez. Aceito uma vez;
- `docs/features/` genérico (sem feature) em `CLAUDE.md:134`, `lumem-dev.md:12`, `lumem-reviewer.md:308`.

O nome do arquivo `prd.md` **fica** — só a categoria muda. `docs/features/017-file-editor/prd.md`.

**R:** sim

---
