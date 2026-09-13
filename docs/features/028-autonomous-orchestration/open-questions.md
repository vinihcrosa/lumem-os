# O orquestrador autônomo — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md) — só a Parte 1 · **Medições:** [orchestration-measurements.md](../../project/orchestration-measurements.md)

**Quarenta e cinco perguntas, em oito rodadas.** As 20 do rascunho, 9 que as respostas abriram e 4 que a
segunda rodada abriu — todas em 2026-09-11 — mais **4 que a sessão de desenho no Open Design abriu**,
respondidas em **2026-09-12**, **3 da sexta rodada** e **3 da sétima**. **Quarenta e quatro respondidas.** A [Q43](#q43--qual-dos-cinco-modos-do-claude-é-o-automático) fechou
medindo no mesmo dia em que nasceu, e fechou as sete primeiras rodadas — que são a Parte 1 inteira. A
oitava é da **Parte 3**, aberta depois: a [Q44](#q44--o-teto-tem-duas-unidades-qual-delas-a-tela-mostra)
e a [Q45](#q45--o-teto-vale-para-a-sessão-que-você-está-conduzindo) nasceram **escrevendo as tasks**,
antes de existir código. A Q45 foi respondida na proposta — **avisa quem está conduzindo, para quem
não está** —, e com ela o portão da T16 virou uma **função pura de três saídas**. A Q44 segue aberta e
é de tela.

A sétima rodada é a primeira que nasceu de **gastar token** — 20 turnos, US$ 4,60, Haiku e Opus. A
[Q41](#q41--em-que-modo-a-esteira-abre-a-sessão-e-quem-escolhe) apareceu ao montar a bancada, quando o
turno pendurou no primeiro `Edit` com o `lumemMode` em `ask` **e** em `free`: a política do Lumem é
**inerte** para um agente que tem modo próprio, e o Claude tem. A
[Q42](#q42--o-selo-aguardando-você-é-ortogonal-e-o-desenho-o-fez-exclusivo) veio da resposta da Q39, e
é o tipo de achado que só a medição dá: **`terminou` e `te perguntou` não são exclusivos** — 31% dos
turnos que commitaram deixaram pergunta em aberto, e o selo foi desenhado como escolha entre os dois.
As duas foram respondidas no mesmo dia, e a da Q41 abriu a **Q43**: *"o modo automático do agente"*
pressupõe saber **qual** dos cinco do Claude é o automático, e a resposta é que **só `bypassPermissions` fecha o
laço** — `acceptEdits` edita e pendura no comando, e `auto` nem existe para todo modelo.

A sexta rodada não veio de discussão nem de medir a tela: veio de **ler o código que já está de pé**.
E a primeira dela é a única pergunta do documento que **já estava respondida**: a
[Q38](#q38--arrastar-para-in-progress-se-ele-é-derivado) levantou o arrasto para `In Progress` como
contradição com a `022` entregue, e a resposta é que a [Q3](#q3--quais-colunas-a-máquina-move-sozinha)
já decidira — o que faltava era **escritor**, não decisão. A proposta que veio com ela estava errada
pelo motivo que o §4.1 existe para evitar: **confundia coluna com selo**. Ela fica registrada porque o
erro produziu a [Q40](#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), que é o problema de
verdade — **a fila da esteira pegaria o trabalho que você está fazendo na mão**.

A [Q39](#q39--quem-diz-que-o-agente-está-esperando-você) foi **respondida medindo**, e a resposta é
que ela estava mal formada. E a [Q40](#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão) foi
respondida em 2026-09-12 com a melhor resposta possível: **o interruptor que ela pedia já existia** —
o §6, Parte 4 define `assumir` como *"desliga a autonomia daquela tarefa"* —, e arrastar para uma coluna da
máquina é um segundo caminho para ele.

As quatro últimas não vieram de discussão: vieram de **medir a tela**, e três contradiziam a PRD. As
quatro foram respondidas **na proposta**, e a primeira delas renomeia um conceito — o encaixe
`executor` passa a se chamar **`implementador`**, porque o verbo do selo cobrou o nome.

Cinco respostas vieram **contra** a proposta, e a maior delas — a **Q2** — mudou o que a feature é.
Mas o achado da segunda rodada foi outro: a sua pergunta dentro da **Q21** — *"quando o cartão está
em In Review, eu tenho garantia que um agente já pegou a tarefa para revisar?"* — mostrou que **três
das seis colunas não sabiam dizer se alguém estava trabalhando nelas**. A discussão está na
[Q30](#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo), e ela resolve de uma vez a Q21, a Q22 e
*"de onde o agente pega trabalho"*.

**Todas respondidas.** A última a cair foi a [Q21](#q21--ready-to-merge-a-sétima-coluna) — `Ready to
Merge` **é** uma coluna —, e ela caiu por um argumento que a Q30 produziu: sem a coluna, um cartão em
`Testing` sem trabalhador quereria dizer duas coisas opostas.

| # | Pergunta | Estado |
|---|---|---|
| [Q1](#q1--esta-prd-absorve-a-022-workspace-tasks) | esta PRD absorve a `022-workspace-tasks`? | ✅ não — empilha |
| [Q2](#q2--o-que-é-testing-e-quem-move-para-lá) | o que é **Testing**? | ✅ **contra a proposta** — um agente testador |
| [Q3](#q3--quais-colunas-a-máquina-move-sozinha) | quais colunas a máquina move? | ✅ três seguidas, e abriu a Q21 |
| [Q4](#q4--mover-para-to-do-é-o-consentimento) | mover para To-Do é a autorização? | ✅ sim |
| [Q5](#q5--quantos-agentes-ao-mesmo-tempo-e-quem-escolhe-qual) | quantos agentes, e quem escolhe? | ✅ 1 por vez, e **três papéis** |
| [Q6](#q6--orçamento-teto-de-quê-e-o-que-acontece-ao-estourar) | orçamento: teto de quê? | ✅ os três, como experimento |
| [Q7](#q7--bloqueado-é-coluna-ou-selo) | bloqueado é coluna ou selo? | ✅ selo |
| [Q8](#q8--o-lumem-mescla-sozinho) | o Lumem mescla sozinho? | ✅ não na v1, **sim como objetivo** |
| [Q9](#q9--in-review-é-revisão-de-quem) | **In Review** é revisão de quem? | ✅ **contra a proposta** — de outro agente |
| [Q10](#q10--o-agente-travou-no-meio-o-que-acontece) | o agente travou no meio | ✅ **em parte contra** — permissão é larga |
| [Q11](#q11--como-o-lumem-é-escolhido-no-tracker-externo) | como se atribui ao Lumem lá fora? | ✅ identidade, senão rótulo · **cai na To-Do** |
| [Q12](#q12--o-lumem-escreve-de-volta-no-tracker) | escreve de volta no tracker? | ✅ comentário + estado com mapa |
| [Q13](#q13--a-tarefa-externa-mudou-depois-que-o-lumem-começou) | a tarefa externa mudou no meio | ✅ bloqueia, com o motivo certo |
| [Q14](#q14--uma-tarefa-uma-worktree) | uma tarefa, uma worktree? | ✅ sim |
| [Q15](#q15--onde-você-é-avisado) | onde você é avisado? | ✅ Lumem + sistema |
| [Q16](#q16--prioridade-e-ordem-da-fila) | prioridade e ordem da fila | ✅ chegada, e arrastar mudou |
| [Q17](#q17--a-máquina-desligada) | a máquina desligada | ✅ aceitável se visível |
| [Q18](#q18--o-quadro-é-a-tela-do-workspace-ou-uma-tela-nova) | o quadro é qual tela? | ✅ é a tela do workspace |
| [Q19](#q19--o-que-acontece-com-a-worktree-quando-vai-para-done) | a worktree, depois do Done | ✅ **contra a proposta** — remove |
| [Q20](#q20--tarefa-recorrente-ou-agendada-entra) | tarefa agendada entra? | ✅ fora da v1, anotada |
| [Q21](#q21--ready-to-merge-a-sétima-coluna) | a sétima coluna, **Ready to Merge** | ✅ mantém |
| [Q22](#q22--reprovou-para-onde-volta-e-quantas-vezes) | reprovou: volta para onde, quantas vezes? | ✅ em parte — o resto virou a Q30 |
| [Q23](#q23--papel-é-outro-agente-ou-o-mesmo-agente-com-outra-instrução) | papel é outro agente ou outra instrução? | ✅ **contra a proposta** — o adaptador é irrelevante |
| [Q24](#q24--o-teto-de-paralelismo-conta-tarefas-ou-sessões) | o teto conta tarefas ou sessões? | ✅ tarefas |
| [Q25](#q25--qual-é-a-borda-da-permissividade) | onde termina a permissividade? | ✅ as faixas são o **default**, tudo configurável |
| [Q26](#q26--como-o-lumem-sabe-que-o-agente-fez-uma-pergunta) | como saber que o agente perguntou? | ✅ porta explícita + rede de segurança |
| [Q27](#q27--done-remove-a-worktree-e-se-estiver-suja) | Done remove — e se estiver suja? | ✅ pergunta por default, com interruptor |
| [Q28](#q28--o-revisor-compara-o-diff-contra-o-quê) | o revisor compara contra o quê? | ✅ corpo + regras do repo + memória |
| [Q29](#q29--quem-sobe-os-outros-projetos-para-o-teste) | quem sobe os outros projetos? | ✅ o testador se vira; v1 não precisa estar boa |
| [Q30](#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo) | a coluna garante que alguém está trabalhando? | ✅ não — coluna é etapa, selo é quem |
| [Q31](#q31--como-o-quadro-cobra-um-cartão-parado) | como o quadro cobra um cartão parado? | ✅ 1 dia no fim da esteira |
| [Q32](#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio) | limite de taxa: pausa ≠ bloqueio | ✅ pausa, 3 retries, teto de 4 h |
| [Q33](#q33--agentes-nomeados-e-papel-por-projeto) | agentes nomeados, papel por projeto | ✅ catálogo no Lumem, 3 encaixes fixos |
| [Q34](#q34--o-encaixe-se-chama-executor-ou-implementador) | o encaixe se chama `executor` ou `implementador`? | ✅ **`implementador`**, e o verbo `implementando` |
| [Q35](#q35--o-rodapé-da-sidebar-passa-a-dizer-adaptadores) | o rodapé da sidebar passa a dizer **Adaptadores**? | ✅ sim — e a `021` ganha nota |
| [Q36](#q36--qual-dos-dois-tetos-segurou) | qual dos dois tetos segurou? | ✅ o bloqueio nomeia o teto |
| [Q37](#q37--abaixo-de-1418px-o-que-o-quadro-faz) | abaixo de 1418px, o que o quadro faz? | ✅ rola, **e diz que está rolando** |

---

## Q1 — esta PRD absorve a `022-workspace-tasks`?

A [`022`](../022-workspace-tasks/prd.md) é proposta, sem tasks, e já define **a tarefa como entidade**:
tabela, estados, `session.task_id`, custo por tarefa, o agente criando tarefa por HTTP, triagem. Esta
PRD precisa de tudo isso — e **contraria** duas coisas dela: o §6 diz *"sem quadro"*, e o `Done`
humano é reafirmado aqui mas o caminho até ele muda.

Três saídas: **(a) absorver** (a `022` vira `superada por <ADR>`), **(b) empilhar** (a `022` entrega
o modelo, esta entrega quadro + autonomia + tracker), **(c) fatiar em quatro features**.

**Resposta: (b), empilha.** Nas suas palavras: *"não acho que uma supera ou absorve, a 022 deve ser
feita para essa aqui ser feita depois"*.

**O que isso fixa:** a `022` é **pré-requisito**, não alternativa — e esta PRD não pode começar antes
dela. Nenhum ADR é necessário, porque nada foi superado. Mas a regra do repositório continua valendo
para os dois requisitos contraditos (*"sem quadro"* e *"sem sincronizar"*): **quando esta PRD sair de
proposta, a nota entra no §6 e no §4 da `022`**, no próprio requisito, com âncora para cá e
delimitando o que sobrou de pé — que é bastante: sem sprint, sem estimativa, sem dependência, e
espelho de mão dupla continua fora.

## Q2 — o que é **Testing**, e quem move para lá?

Você nomeou seis etapas e cinco eu sabia escrever. Esta não. Quatro leituras: (a) você com o app na
mão, (b) o CI, (c) um segundo agente testando, (d) a suíte local. **A proposta era (a).**

**Resposta: (c), e ela é a mais estruturante do documento.** Suas palavras:

> *"eu quero um agente atuando como um usuário, se for uma UI, ele deve abrir a UI, ver se está tudo
> ok, clicar onde deve clicar e assim por diante, se for um endpoint, o agente deve testar o endpoint
> e ver os casos de borda e tudo mais. Essa coluna é uma etapa que eu pensei em workspaces com vários
> projetos, onde um agente de teste do workspace pode pegar a tarefa, rodar os outros projetos, e
> rodar o projeto a ser testado e fazer as verificações."*

E as três leituras recusadas, cada uma por um motivo diferente:

- **teste manual** *"pode acontecer, mas não é o foco aqui"* — então não é coluna;
- **CI** não é `Testing`: ele é **portão de transição**. Os checks têm que estar verdes para sair de
  In Progress, e rodam de novo para avançar depois. Portão não opina;
- **suíte local** não é isto.

**O que a resposta abriu:** o testador é um agente **do workspace**, não do projeto — ele sobe
`acme-api` e `acme-web` juntos. Isso é o [UC4](prd.md#uc4--o-teste-que-precisa-dos-dois-projetos), e é
o argumento mais forte que o conceito de workspace já teve: **nenhum CI de repositório único pega um
defeito que mora entre dois repositórios.** Também abriu a
[Q29](#q29--quem-sobe-os-outros-projetos-para-o-teste), que é como isso funciona na prática.

## Q3 — quais colunas a máquina move sozinha?

**Proposta:** máquina move `In Progress` e `In Review`; você move o resto. Regra: *a máquina só move
quando o fato é verificável do lado de fora do agente*.

**Resposta: a máquina move três setas seguidas** — `To-Do → In Progress`, `In Progress → In Review` e
`In Review → Testing`. O resto é humano. E **arrastar é sempre permitido** para você, inclusive para
as colunas da máquina, que é como se diz *"estou fazendo isto na mão"*.

**O que a resposta abriu — e virou a [Q21](#q21--ready-to-merge-a-sétima-coluna):** você propôs uma
coluna entre `Testing` e `Done`, a **Ready to Merge**, *"que diz que a task foi completada e todo o
processo foi feito, mas o humano deve ir lá e validar"* — marcada por você mesmo como *"só um
pensamento, deve ser discutido"*.

## Q4 — mover para **To-Do** é o consentimento?

A pergunta mais importante da feature: **o que autoriza um agente a gastar seu dinheiro e escrever no
seu disco sem você lá?**

**Resposta: sim — a coluna é o consentimento.** *"Se está em To-Do o Lumem pode pegar a tarefa."*
Duas condições: o workspace está em `autônomo` **e** a tarefa está na To-Do. Sem modal, sem botão,
sem segundo gesto.

**O que isso cobra, e você aceitou:** a To-Do deixa de ser lista de intenção e vira **fila de
execução**. Coisa jogada lá "para não esquecer" passa a custar dinheiro — o lugar de não esquecer é o
Backlog.

## Q5 — quantos agentes ao mesmo tempo, e quem escolhe qual?

**Resposta: 1 por vez de default, ajustável — e três papéis distintos.** Suas palavras:

> *"a ideia é um agente pegar o To-Do e passar para progress, quando ele terminar, ele passar para
> review, e outro agente faz o review, isso é bem importante, o agente que faz o review é diferente
> do agente que implementa, que devem ser diferentes do agente que testa."*

Isto não é uma resposta sobre paralelismo: é **a esteira**, e virou o §5 da PRD. O motivo de ser
importante tem nome: um revisor que herdou a conversa do implementador herdou os enganos dele.
Contexto independente é o que faz a revisão valer alguma coisa.

**O que a resposta abriu:** a [Q23](#q23--papel-é-outro-agente-ou-o-mesmo-agente-com-outra-instrução)
(papel é outro adaptador, ou o mesmo com outra instrução?) e a
[Q24](#q24--o-teto-de-paralelismo-conta-tarefas-ou-sessões) (com teto 1, uma revisão em andamento
impede uma implementação de começar?).

**O que continua no backlog:** lease com deadline, heartbeat e recuperação. Com teto 1 e uma máquina
ainda não se paga; com teto 4, se paga.

## Q6 — orçamento: teto de quê, e o que acontece ao estourar?

**Resposta: os três — custo por tarefa, custo por dia, teto de turnos — e a tarefa para, bloqueia,
mostra o número e a worktree fica.** Não reduz sozinha, não pede mais, não continua.

**Com uma ressalva sua, registrada:** *"eu aceito a sua proposta, mas quero deixar claro que isso vai
ser um teste, e isso pode mudar depois"*. Então os números nascem como experimento, e a tela tem que
deixar mudá-los sem cerimônia.

## Q7 — bloqueado é coluna ou selo?

**Resposta: selo.** Uma sétima coluna de bloqueio faria o quadro mentir sobre o progresso — uma
tarefa travada no meio da revisão *está* na revisão. O selo fica no cartão, com o filtro **"precisa
de mim"**, que é provavelmente a visão mais usada do produto.

O contra continua de pé: selo é mais fácil de não ver que uma coluna cheia. É por isso que a
notificação da [Q15](#q15--onde-você-é-avisado) não é opcional.

## Q8 — o Lumem mescla sozinho?

**Resposta: (a) na v1 — não mescla — e o objetivo declarado é chegar lá.** Suas palavras: *"na V1 eu
concordo com A, e concordo também que o objetivo é chegar no ponto do agente mergear sozinho"*.

Então isto **não** é um não-objetivo permanente: é um degrau. O caminho é o (b) — checks verdes,
revisão aprovada, teste passou, e um interruptor por projeto. O motivo de não ser agora: merge é a
única ação da esteira **sem desfazer barato**, e é o momento em que você aprende o que o agente fez.

## Q9 — **In Review** é revisão de quem?

**Proposta: sua, com o CI como dado.** **Resposta: de outro agente** — *"eu já respondi isso antes, é
um agente diferente que faz review"* (Q5).

O risco que a proposta nomeava continua real e vira medida no §9 da PRD: **um revisor que nunca
reprova é um carimbo que ninguém lê.** A defesa é a taxa de reprovação — se for zero por um mês, o
papel está decorativo. E o caminho de volta (a [Q22](#q22--reprovou-para-onde-volta-e-quantas-vezes))
é o que faz reprovar ser uma ação de verdade.

Onde você entra: na **Ready to Merge**, lendo o diff antes de mesclar.

## Q10 — o agente travou no meio: o que acontece?

**Proposta: tudo o que subiria pedido de permissão vira bloqueio.** **Resposta: não — isso inverte o
produto.** Suas palavras:

> *"sobre permissão de fazer coisas ou rodar comando ele deve sempre estar no modo auto, a não ser
> que o usuário mude, e as permissões devem ser bem permissivas, se o agente pede permissão para tudo
> o objetivo de ser um orquestrador de agentes autônomos se perde completamente, o usuário tem que
> virar uma babá de agente de IA. Por outro lado, perguntas de modelo de domínio, decisão de produto,
> isso sim deve parar o agente e esperar o usuário intervir."*

**A regra, então:** *permissão de execução é larga; decisão de domínio para a esteira.* Quando ele
precisa decidir algo que não está no código nem na memória, a tarefa fica **bloqueada — aguardando
decisão**, com a pergunta escrita no cartão. Isso virou o princípio 4 da PRD e o
[UC3](prd.md#uc3--a-pergunta-que-para-tudo-e-as-cem-que-não-param).

**O que a resposta abriu, e são duas perguntas de peso:** onde exatamente **termina** o largo
([Q25](#q25--qual-é-a-borda-da-permissividade)) e como o Lumem **percebe** que a frase do agente era
uma pergunta, e não um fim de trabalho ([Q26](#q26--como-o-lumem-sabe-que-o-agente-fez-uma-pergunta)).

## Q11 — como o Lumem é escolhido no tracker externo?

**Resposta: identidade quando a ferramenta permite, rótulo quando não permite** — *"o ideal é que o
usuário possa atribuir a uma identidade, mas quando não for possível, pode ser o rótulo"*.

**E a sub-pergunta foi respondida contra a proposta:** a tarefa atribuída cai **direto na To-Do**, não
no Backlog. *"Esse deve ser o comportamento padrão, se o usuário quiser diferente ele deve configurar
isso."*

**O que isso significa, dito na cara:** atribuir uma issue ao Lumem no Linear **inicia trabalho e
gasto imediatamente**. É o pedido original levado a sério — e é por isso que o orçamento da Q6 e a
notificação da Q15 são parte da mesma feature, não enfeites.

## Q12 — o Lumem escreve de volta no tracker?

**Resposta: nível 2 + nível 3 atrás de mapa explícito.** Comentário nos marcos (*peguei*, *PR #87*,
*travei em X*, *pronta para mesclar*), e mover o estado lá conforme a coluna aqui só quando existir um
mapa de colunas configurado por projeto. Espelho de mão dupla fica fora.

**Com o seu lembrete, que vira requisito de desenho:** *"deve sempre manter em mente que o objetivo é
ampliar, o Linear é apenas a primeira integração, depois deve ter outras"*. Então nada no modelo pode
ser em forma de Linear: o que o Lumem escreve de volta é **um vocabulário do Lumem** que cada
adaptador traduz — e um tracker que não saiba fazer alguma das quatro coisas deixa de fazer **aquela**,
não a integração inteira.

## Q13 — a tarefa externa mudou depois que o Lumem começou?

**Resposta: bloqueia, e o motivo diz qual das três mudanças foi.** Sua correção sobre a descrição:
*"eu colocaria ela como bloqueada, mas por um motivo diferente: está bloqueada pois a descrição
mudou. O usuário decide o que fazer nesses casos."*

Então são três motivos distintos no cartão — reatribuída · fechada · descrição editada — e nenhum
deles injeta texto no meio de um turno em andamento. Você decide: retomar com o texto novo, descartar
ou assumir.

## Q14 — uma tarefa, uma worktree?

**Resposta: sim.** Uma worktree por tarefa, criada quando ela sai da To-Do, e tarefa é de **um**
projeto. Trabalho no outro projeto é **outra tarefa, ligada** — que é exatamente o
[UC8](prd.md#uc8--o-agente-descobre-que-o-outro-projeto-precisa-mudar).

## Q15 — onde você é avisado?

**Resposta: no Lumem e no sistema operacional, na v1.** Fora da máquina — comentário no tracker,
Slack, celular — fica para quando existir a conversa de servidor.

Fica registrado o que isso implica: **(c) é a única que funciona quando você não está no
computador**, que é justamente quando a autonomia importa mais. É um argumento guardado a favor do
relé, não um item resolvido.

## Q16 — prioridade e ordem da fila

**Resposta: ordem de chegada, e arrastar muda.** *"As tarefas são colocadas no board por ordem de
chegada, se o usuário quiser mudar uma ordem é só mudar a ordem de visualização no board."*

Nenhum campo de prioridade nasce. A posição na coluna **é** a prioridade.

## Q17 — a máquina desligada

**Resposta: aceitável, desde que visível** — ao abrir, o quadro diz o que chegou enquanto você
esteve fora e o que ficou parado, com há quanto tempo. **E sim, ao ligar ele pega automaticamente** o
que está na To-Do, respeitando o teto de paralelismo — que é exatamente para isso que o teto serve.

## Q18 — o quadro é a tela do workspace, ou uma tela nova?

**Resposta: (a) — o quadro É a tela do workspace.** O resto (memória, consumo) convive como aba ou
seção. Se o produto vira orquestrador, *"o que está acontecendo"* é a primeira pergunta de todas.

O risco nomeado pela [workspace-screen](../010-workspace-screen/prd.md) — *"a tela de tudo"* — continua,
e o desenho é quem responde: sete colunas já ocupam a largura inteira.

## Q19 — o que acontece com a worktree quando vai para Done?

**Proposta: `Done` não remove nada, e existe um "limpar" em lote.** **Resposta: contra —** *"`Done`
remove a worktree, se a tarefa terminou não tem motivo para a worktree continuar lá"*.

Aceito, e o motivo é bom: uma worktree por tarefa acumula rápido, e tarefa concluída com worktree
viva é lixo com aparência de trabalho.

**Mas a remoção precisa de uma guarda, e ela virou a [Q27](#q27--done-remove-a-worktree-e-se-estiver-suja):**
remover worktree apaga trabalho não commitado, e isso não tem desfazer.

## Q20 — tarefa recorrente ou agendada entra?

**Resposta: fora da v1 — e anotada, porque é importante.** *"Toda segunda, atualizar dependências"* é
o mesmo motor com outro gatilho.

Vai para o [backlog](../../project/backlog.md) quando esta PRD sair de proposta, com o gatilho de
volta: **uma tarefa autônoma atravessando a esteira inteira com confiança**. Antes disso, agendar é
multiplicar um risco que ainda não foi medido.

---

# As nove que as respostas abriram

## Q21 — `Ready to Merge`: a sétima coluna?

Sua ideia, na Q3: uma coluna entre `Testing` e `Done` que *"diz que a task foi completada e todo o
processo foi feito, mas o humano deve ir lá e validar"*.

**Proposta: sim, e ela é a peça que faltava.** Com ela, o quadro fica coerente de ponta a ponta:

- **as duas pontas são suas** (To-Do é consentimento, Done é julgamento) e **tudo no meio é da
  máquina** — sem essa coluna, `Testing` seria ao mesmo tempo *"o testador está trabalhando"* e *"a
  sua vez"*, que são duas coisas;
- ela é **a sua caixa de entrada**: a única coluna cujo cartão exige ação sua. *"Precisa de mim?"*
  vira *"tem cartão na Ready to Merge?"*;
- ela é onde a Q8 acontece — e é exatamente a coluna que **desaparece** no dia em que o merge for
  automático. Isso é bom: a coluna torna visível o degrau que ainda não foi dado.

**O custo:** sete colunas numa tela. Provavelmente `Done` precisa ser recolhida por default, e é o
desenho que decide.

**Sub-pergunta:** um cartão em Ready to Merge que fica lá três dias é um encalhe seu. O quadro
cobra? Proposta: mostra o tempo, e não cobra.

**Resposta da sub-pergunta: o quadro cobra.** *"Um cartão parado por muito tempo deve ser cobrado com
certeza."* Como ele cobra é a [Q31](#q31--como-o-quadro-cobra-um-cartão-parado).

**Resposta: mantém.** *"Eu gosto de ter a coluna Ready to Merge."* Sete colunas, com `Done` recolhida
por default — o desenho confirma a densidade.

O argumento que fechou, e vale registrar porque ele **corrige o que eu tinha escrito**: a resposta da
[Q30](#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo) mudou o argumento, para o lado de manter.

Eu tinha escrito que ela deixava de ser necessária, porque *"Testing, teste aprovado, sem
trabalhador"* diria a mesma coisa. **Está errado, e o motivo é a própria regra que você aprovou:** a
fila da máquina é *todo cartão sem trabalhador*. Sem a coluna, um cartão em `Testing` sem trabalhador
significa **duas coisas opostas** — *"esperando um testador"* (vez da máquina) e *"aprovado, esperando
você"* (sua vez) — e o daemon precisaria de um sinalizador extra para não pegar o segundo de volta.
**A coluna é esse sinalizador, e ela é visível.** Um sinalizador invisível custaria o mesmo e diria
menos.

Somando: ela é a sua caixa de entrada (*"precisa de mim?"* vira *"tem cartão aqui?"*), é simétrica à
To-Do (a To-Do é o que você entrega à máquina; esta é o que a máquina entrega a você), é onde o
relógio de 1 dia da [Q31](#q31--como-o-quadro-cobra-um-cartão-parado) corre, e é a coluna que
**desaparece** no dia em que o merge for automático — ela torna visível o degrau que falta.

**Com isto, as 33 perguntas estão respondidas.** O que falta para esta PRD sair de proposta não é
pergunta de produto: é o desenho no Open Design (§10 da PRD), a conversa técnica (§11) e a
[`022`](../022-workspace-tasks/prd.md), que vem antes.

**O que a sua pergunta abriu, e é o achado do dia:**

> *"A passagem `In Progress` → `In Review` é do agente, mas não está explícito quem passa de um para o
> outro — o executor que terminou a tarefa, ou o revisor que vai revisar? E quando está no estado `In
> Review`, eu tenho garantia que um agente já pegou a tarefa para revisar? Esses passos não são
> automáticos. Isso serve também para `In Review` → `Testing`. Como resolver isso? Eu pensei em criar
> sub-colunas: `ready to review`, `ready to test`. O problema é que isso adiciona ainda mais colunas ao
> processo."*

Você achou um buraco que estava em todas as três setas da máquina, e a saída que você propôs tem o
custo que você mesmo nomeou. Virou a [Q30](#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo), com
uma resposta que não custa coluna nenhuma — e que resolve a Q22 de graça.
## Q22 — reprovou: para onde volta, e quantas vezes?

O buraco que a esteira criou. O revisor reprova, ou o testador reprova. E aí?

- **para onde volta:** In Progress, com o parecer como próximo prompt do implementador? Ou bloqueia
  e chama você?
- **quantas vezes:** duas rodadas? três? sem teto?
- **é o mesmo implementador**, com a conversa dele inteira, ou um novo?

**Proposta:** volta para **In Progress**, com o parecer do revisor como prompt, **no mesmo
implementador** (ele tem o contexto do que escreveu, e refazer isso é caro). Teto de **duas voltas**;
na terceira reprovação a tarefa bloqueia e chama você, porque dois agentes discordando em loop é a
forma mais cara de não produzir nada.

**O caso que me preocupa:** o revisor reprova por preferência de estilo, não por defeito. Isso queima
orçamento e não melhora nada. Talvez o parecer precise declarar **severidade**, e só *defeito*
devolva a tarefa.

**Resposta: o teto de duas voltas e a volta para In Progress ficam de pé; o resto virou a Q30.** Sua
observação:

> *"Sobre para onde voltar, esbarra na discussão que eu fiz na Q21. Pode ser para a coluna `In
> Progress`, mas quando o agente pega essa tarefa? Ele geralmente pega a tarefa da `To-Do` — agora
> pega tanto as `In Progress` órfãs quanto as em `To-Do`?"*

Está certa, e ela mostra que *"o agente pega da To-Do"* era uma descrição errada do produto. A
resposta está na [Q30](#q30--a-coluna-é-a-etapa-e-quem-está-nela-é-um-selo): **a fila não é uma
coluna — é o conjunto de cartões sem trabalhador**, e um cartão devolvido pelo revisor está nesse
conjunto exatamente como um cartão novo na To-Do. Nenhum caso especial, nenhuma "órfã".
## Q23 — papel é outro agente, ou o mesmo agente com outra instrução?

Você disse que os três **devem ser diferentes**. Diferentes em qual sentido?

- **(a) sessões diferentes, mesmo adaptador** — Claude implementa, Claude revisa, com contexto zerado
  e instrução de revisor;
- **(b) adaptadores diferentes** — Claude implementa, Codex revisa. Independência de verdade:
  modelos diferentes erram diferente;
- **(c) você configura por papel**, e o default usa (b) quando há mais de um adaptador instalado.

**Proposta: (c).** O valor da revisão vem da independência, e dois modelos diferentes são mais
independentes que duas sessões do mesmo. Mas exigir dois adaptadores instalados para a feature
funcionar é um pré-requisito duro demais — então (a) é o piso, (b) é o default quando dá.

**Resposta: nenhuma das três — a pergunta estava errada.** Suas palavras:

> *"O adaptador é irrelevante nesse contexto, o usuário pode configurar como quiser, essa parte deve
> estar no controle do usuário. A mudança está no papel de cada agente: podemos ter um papel de
> executor, revisor e testador, mas o usuário deve poder customizar esses papéis com granularidade de
> projeto — então ele pode ter um revisor diferente para cada projeto. Como referência veja como o
> Compozy faz isso: lá é possível criar vários agentes diferentes e usar cada agente no momento que
> você quiser. Com relação à extensibilidade o Compozy é o melhor que tem, na minha opinião."*

Isto **não** é uma resposta sobre independência de modelo: é um pedido de **extensibilidade**, e ele
muda o modelo de dados da feature. Deixa de existir "o agente do projeto" e passa a existir um
**catálogo de agentes nomeados**, com os papéis como *encaixes* que apontam para um deles, resolvidos
por projeto.

O [estudo do Compozy](../../references/compozy.md) neste repositório descreve exatamente a forma:
agente é um **arquivo** (`AGENT.md` — frontmatter mais o corpo como prompt), e o papel é um **input
tipado** com default (`implementer: { type: agent, default: code_implementer }`). O papel não é uma
constante do código: é um parâmetro com valor padrão.

Virou a [Q33](#q33--agentes-nomeados-e-papel-por-projeto), que é onde isso se desenha — e ela é
bloqueante, porque muda o §5 da PRD.
## Q24 — o teto de paralelismo conta tarefas ou sessões?

Com teto 1 e a esteira de três papéis: enquanto o revisor lê a tarefa A, a tarefa B pode começar a
ser implementada?

- **conta tarefas:** teto 1 = uma tarefa na esteira inteira. Simples, e a fila fica lenta — a
  máquina fica ociosa enquanto você não mescla nada;
- **conta sessões:** teto 1 = um agente rodando a qualquer momento, de qualquer papel. Mais
  eficiente, e mais difícil de entender olhando o quadro.

**Proposta: conta tarefas.** O teto é sobre **sua atenção** e sobre custo, e "quantas tarefas estão
andando" é a pergunta que você faz olhando o quadro. Um número que você entende vale mais que um
número que otimiza.

**Resposta: conta tarefas.** O teto é sobre a sua atenção e sobre custo, e *"quantas tarefas estão
andando"* é a pergunta que você faz olhando o quadro.

**A consequência, que a Q32 cobra:** uma tarefa pausada por limite de taxa **não pode** ocupar a vaga
— com teto 1, quatro horas de pausa seriam quatro horas de máquina parada.
## Q25 — qual é a borda da permissividade?

A Q10 disse *"bem permissivas"*, e está certa — mas *permissivo* sem borda escrita não é uma decisão,
é uma ausência. Um agente rodando sozinho, sem ninguém olhando, com as **suas** permissões de
usuário.

**Proposta — três faixas:**

| Faixa | O quê | Comportamento |
|---|---|---|
| **larga** | qualquer leitura e escrita **dentro da worktree da tarefa**, os `[scripts]` do projeto, a suíte, o gerenciador de pacotes, `git` local, rede de saída | passa sozinho, sem perguntar, e **aparece na conversa** assinado |
| **para** | escrita **fora da worktree** — outro checkout, `~`, o `~/.lumem`, arquivo de configuração global | bloqueia a tarefa e chama você |
| **nunca sozinho** | escrita no **host remoto** além de empurrar a própria branch: `push --force`, apagar branch remota, mesclar, escrever em outro repositório | recusa, sempre, e diz por quê |

A terceira faixa não é cautela genérica: ela é o que faz a Q8 (*"não mescla na v1"*) ser uma regra do
sistema e não uma promessa do prompt. **Um agente que pode mesclar quando quiser já mescla sozinho,
independentemente do que a PRD diga.**

**O que eu preciso de você:** confirmar as três faixas, e dizer se alguma coisa que você faz no dia a
dia cai na faixa do meio e te irritaria. Exemplo real: um script de setup que escreve em `~/.cache`.

**Resposta: as três faixas viram o default, e tudo é configurável.** *"Eu acho que todas as
permissões devem ser configuradas pelo usuário, mas eu concordo em ter essas faixas de permissão como
default."*

Uma emenda necessária, e é a única coisa nesta feature em que eu insisto contra a generalidade:

> **A terceira faixa é configurável, mas não em silêncio.** Enquanto a Q8 disser *"não mescla na v1"*,
> a regra do sistema é o que garante isso — um agente que pode mesclar quando quiser mescla, por mais
> que o prompt diga o contrário. Então ligar escrita no host remoto (`push --force`, apagar branch
> remota, mesclar) é **um interruptor por projeto, com o texto do que ele permite**, e não um item
> numa lista de permissões que se marca sem ler. O resto — as faixas larga e do meio — você configura
> como quiser, inclusive por projeto.
## Q26 — como o Lumem sabe que o agente fez uma pergunta?

*"Decisão de domínio para a esteira"* precisa de um sinal, e hoje não existe nenhum. O agente termina
o turno com um texto que **é** uma pergunta, e o daemon vê só um fim de turno.

- **(a) porta explícita** — o agente chama algo (`POST /tasks/:id/block`, ou uma ferramenta) dizendo
  *"preciso de decisão: <pergunta>"*. Mesma solução que a memória já usa para o `curl`;
- **(b) inferir do texto** — o turno acabou e termina com uma pergunta;
- **(c) heurística de estado** — o turno acabou e **nada mudou**: sem commit, sem PR, sem arquivo
  escrito.

**Proposta: (a) como caminho principal, (c) como rede de segurança.** O (b) é adivinhação, e agente
faz pergunta retórica o tempo todo. O (c) pega o caso em que o agente simplesmente parou.

**O custo do (a):** mais um parágrafo no preâmbulo de toda sessão, e o preâmbulo já tem orçamento
medido em caracteres.

**Resposta: (a) porta explícita, com (c) como rede de segurança.** *"Concordo com a proposta, é
simples mas eficaz."*

O agente declara *"preciso de decisão: &lt;pergunta&gt;"* pela mesma porta HTTP que a memória já usa; e se
um turno terminar sem commit, sem PR e sem arquivo escrito, o Lumem bloqueia de qualquer forma —
porque o agente que parou calado é o mesmo problema com outra cara.
## Q27 — `Done` remove a worktree: e se estiver suja?

Você respondeu que `Done` remove. A remoção apaga trabalho não commitado, e isso não tem desfazer.

**Proposta:** `Done` remove **se** o checkout estiver limpo **e** a branch tiver sido mesclada ou
empurrada. Se não estiver: a tarefa **não vai** para Done — o quadro recusa e diz por quê, em uma
frase (*"3 arquivos não commitados na worktree"*). Nunca um modal de confirmação, que se aprende a
clicar sem ler.

**O caso que preciso que você decida:** você mesclou a PR pelo GitHub, a worktree ficou com um
arquivo de rascunho seu e você arrasta para Done. Recusar é chato. Mas apagar é pior — e os dois são
defensáveis.

**Resposta: pergunta por default, e existe um interruptor.** *"Por default sempre perguntas, mas deve
ter uma configuração para o usuário decidir se uma PR mergeada sempre deleta a worktree."*

Uma emenda de desenho, pelo motivo que a proposta já dizia: um modal que aparece **sempre** é um
modal que se aprende a clicar sem ler, e aí ele não protege nada. Então:

- **checkout limpo** e PR mesclada → remove sem perguntar. Não há nada a perder;
- **checkout sujo** → pergunta, e a pergunta **diz o que vai perder** (*"3 arquivos não commitados"*),
  com a opção de ver o diff antes;
- o interruptor *"PR mesclada sempre remove a worktree"* liga o primeiro caso para o segundo também —
  e é aí que ele fica claro: você está dizendo *"pode apagar rascunho meu"*, o que é uma escolha
  legítima e precisa estar escrita nesses termos.
## Q28 — o revisor compara o diff contra o quê?

O revisor recebe o diff. E o critério?

- **(a) o corpo da tarefa** — e aí a qualidade da revisão é a qualidade do que você escreveu. Uma
  tarefa de uma linha produz uma revisão de uma linha;
- **(b) o corpo + as regras do repositório** (`CLAUDE.md`, convenções, a memória do workspace);
- **(c) (b) + critério de aceite explícito** por tarefa — o que empurra o produto para exigir
  critério de aceite, e isso é **cerimônia**: você passa a escrever tarefa para agradar o revisor.

**Proposta: (b).** O critério é o corpo mais o que o workspace já sabe — que é exatamente o que a
[workspace-memory](../007-workspace-memory/prd.md) entrega, e é o primeiro uso dela que muda dinheiro.
Critério de aceite fica **opcional**, nunca obrigatório.

**Resposta: (b) — o corpo da tarefa mais as regras do repositório e a memória do workspace.**
Concordado. Critério de aceite explícito continua **opcional**, nunca obrigatório: no dia em que o
produto exigir critério de aceite para o revisor funcionar, você começa a escrever tarefa para agradar
o revisor, e isso é cerimônia.

É também o primeiro uso da [workspace-memory](../007-workspace-memory/prd.md) que muda dinheiro em vez
de mudar texto.
## Q29 — quem sobe os outros projetos para o teste?

O [UC4](prd.md#uc4--o-teste-que-precisa-dos-dois-projetos) é o coração da coluna `Testing`, e ele pede
mais de um projeto de pé ao mesmo tempo. Perguntas concretas:

- o testador sobe **a worktree da tarefa** (óbvio) e, dos outros projetos, **o quê**? O checkout
  principal? A worktree deles que estiver aberta? A branch default?
- como o `acme-web` sabe apontar para a **porta** do `acme-api` daquela worktree? A
  [project-scripts](../012-project-scripts/prd.md) reserva um bloco de portas por checkout, mas quem
  diz ao front qual porta usar?
- e quando o par exige **as duas tarefas juntas** — a mudança da API e a do front, uma dependendo da
  outra? A Q14 disse que tarefa é de um projeto só.

**Proposta:** a v1 sobe a worktree da tarefa e o **checkout principal** dos outros projetos, com as
portas passadas por variável de ambiente. O par que exige as duas mudanças juntas **fica de fora da
v1** e vira um caso conhecido — é a fronteira honesta entre *"testa entre projetos"* e *"orquestra
mudanças coordenadas"*, que é outra feature.

**Este é o item que eu mais quero medir antes de escrever código** — do jeito que a `021` e a `026`
fizeram. Subir dois projetos de verdade, com um agente testador real, e ver quanto custa e quanto
demora. É provável que a medição mude o desenho.

**Resposta: o testador tem acesso ao workspace e se vira. Na v1 não precisa estar boa.** Suas
palavras: *"eu entendo que esse item ficou meio abstrato, mas a ideia é ter um agente que tem acesso a
todo o workspace, ele se vira pra fazer o teste. Na v1 esse não é o principal, ele não precisa estar
perfeito, será refinado depois. Não encana com a fase de teste agora."*

Aceito, e o spike sai do caminho crítico. O que fica registrado como consequência, para ninguém se
surpreender depois:

- a coluna `Testing` entra na v1 **com expectativa baixa** — ela existe, o agente tenta, e o parecer
  dele é informação, não portão. Se ele reprovar, o cartão para e você decide;
- **o que a v1 precisa garantir é o acesso**, não a esperteza: o testador enxerga os checkouts do
  workspace e pode rodar os `[scripts]` deles. Com isso ele "se vira";
- o par que exige **as duas mudanças juntas** (API e front na mesma feature) continua fora, e continua
  sendo a fronteira entre *"testa entre projetos"* e *"orquestra mudanças coordenadas"*.
---

# As quatro que a segunda rodada abriu

## Q30 — a coluna é a etapa, e quem está nela é um selo?

**Esta é a pergunta mais importante que apareceu até aqui**, e ela é sua (Q21). O problema, dito de
forma geral: **cada uma das três colunas da máquina significa duas coisas ao mesmo tempo** — *"esta
etapa é devida"* e *"alguém está trabalhando nela"*. Enquanto as duas moram na mesma coluna, o quadro
não consegue responder *"já pegaram para revisar?"*, e *"quem move a seta"* não tem resposta: nem o
executor que terminou, nem o revisor que ainda não começou.

Três saídas:

| | O quê | Custo |
|---|---|---|
| **(a) sub-colunas** — sua ideia | `ready to review` e `ready to test` explícitas | **9 colunas.** Honesto e largo. Você mesmo nomeou o custo |
| **(b) selo no cartão** | a coluna é a **etapa**; o cartão diz `aguardando revisor` ou `revisando há 2 min` | zero coluna nova. Um selo se vê menos que uma coluna |
| **(c) só entra quando reivindicam** | o cartão fica em In Progress até um revisor **começar** | garante o que você pediu, e cria a mentira oposta: cartão em In Progress com ninguém trabalhando |

**Proposta: (b), e por três motivos que se somam.**

**1. É a mesma decisão da [Q7](#q7--bloqueado-é-coluna-ou-selo), já tomada.** Lá, `bloqueada` não virou
coluna porque *"uma tarefa travada no meio da revisão está na revisão"*. `aguardando revisor` é
exatamente o mesmo tipo de informação: **a coluna é onde a tarefa está, o selo é a situação dela
ali.** Se `bloqueada` é selo e `aguardando` é coluna, o quadro passa a ter duas gramáticas.

**2. Selo derivado não mente; coluna guardada mente.** Coluna é estado gravado — e estado gravado
diverge da realidade no dia em que uma sessão morre. O selo é **derivado** de um fato: existe uma
sessão viva com esta tarefa reivindicada? O [estudo do Compozy](../../references/compozy.md) fez
exatamente essa escolha, e vale citar: os motivos de bloqueio dele são *"uma projeção read-only,
derivada a cada leitura e nunca armazenada — logo não pode divergir da realidade"*. Uma sub-coluna
`ready to review` seria a mesma informação, gravada, e portanto capaz de estar errada.

**3. Ela responde as suas duas perguntas, e uma terceira de graça.**

> **Quem move a seta?** **Nenhum dos dois agentes: o daemon.** Nem o executor "entrega", nem o revisor
> "pega e move". O daemon observa um **fato verificável** — a PR existe, o CI ficou verde, o parecer
> foi registrado — e move. Agente nunca escreve no quadro. Isso já era a regra do §4 da PRD; o que
> faltava era dizer que ela **também** vale para a seta, e não só para a coluna.

> **Tenho garantia que já pegaram para revisar?** **Não — e é melhor não ter.** O que você tem é a
> **visibilidade**: o cartão em In Review diz `aguardando revisor` por 40 segundos e depois
> `revisando há 2 min`. A garantia só existiria no (c), e o preço dela é uma coluna que mente do
> outro lado.

> **De onde o agente pega trabalho?** A terceira, que a [Q22](#q22--reprovou-para-onde-volta-e-quantas-vezes)
> cobrou: **a fila não é a coluna To-Do.** A fila é *o conjunto de cartões cuja etapa é devida e que
> não têm trabalhador* — e nesse conjunto cabem, com a mesma regra e sem caso especial: o cartão novo
> na To-Do, o cartão em In Review esperando revisor, o em Testing esperando testador, e o devolvido
> pelo revisor para In Progress. Some as "órfãs" da sua pergunta: elas eram só cartões sem
> trabalhador, como todos os outros.

**A ordem dessa fila: da direita para a esquerda.** Revisar e testar antes de começar coisa nova —
terminar vale mais que começar, e é o que impede o quadro de virar uma parede de tarefas pela metade.
(Com teto 1 isso quase não aparece; com teto 3, é a diferença entre um quadro que anda e um que
acumula.)

**O selo, então, tem quatro estados:** `aguardando <papel>` · `<papel> trabalhando há Xm` ·
`bloqueada: <motivo>` · `pausada até ~HH:MM` (a [Q32](#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio)).

**O que isso faz com a [Q21](#q21--ready-to-merge-a-sétima-coluna):** `Ready to Merge` deixa de ser
**necessária** — *"Testing, teste aprovado, sem trabalhador"* já é a mesma informação. Mas continua
podendo ser **útil**: uma coluna se acha de longe, um selo não. A decisão passa a ser de desenho, e
continua sua.

**Nota de vocabulário, do Compozy, que vale copiar:** lá, criar a tarefa **não** enfileira nada — a
fronteira durável de execução é um `publish`/`start` separado. É exatamente a sua resposta à
[Q4](#q4--mover-para-to-do-é-o-consentimento): **mover para To-Do é o `publish`.** Duas pessoas
chegaram no mesmo lugar por caminhos diferentes, o que é um bom sinal de que o lugar é certo.

**Resposta: (b), o selo.** *"Concordo com o selo, opção b."*

Fica decidido, então, e vale escrever junto porque as três coisas são a mesma decisão:

1. **quem move a seta é o daemon**, por fato verificável — nunca um agente;
2. **a coluna é a etapa, o selo é a situação** — e o selo é derivado a cada leitura, não guardado;
3. **a fila é todo cartão sem trabalhador**, puxada da direita para a esquerda. As "órfãs" da Q22
   deixam de ser um caso.

As sub-colunas `ready to review` e `ready to test` **não entram**, e o custo que isso deixa de pé está
registrado no §8 da PRD: um selo se vê menos que uma coluna. A defesa é o encalhe da
[Q31](#q31--como-o-quadro-cobra-um-cartão-parado).
## Q31 — como o quadro cobra um cartão parado?

Você respondeu que cobra, *"com certeza"*. Falta **como**, e tem uma armadilha no meio.

**A armadilha:** com teto 1, um cartão na To-Do está parado **por desenho**. Cobrar isso é ensinar
você a ignorar o aviso — e um aviso que se aprende a ignorar é pior que nenhum. O Compozy separa
essas duas coisas com nome próprio: *"não há capacidade agora"* (`capacity_waiting`, mantém
enfileirado, não é problema) contra encalhe real.

**Proposta:**

- **o relógio só conta o tempo em que o cartão podia ter andado.** Esperar vaga não conta; esperar
  você conta; ter trabalhador e não progredir conta;
- **dois limiares por coluna**, âmbar e vermelho, no cartão — e o filtro *"precisa de mim"* ordena
  pelo pior;
- defaults para discutir: **etapas da máquina** âmbar 30 min / vermelho 2 h · **Ready to Merge** (ou
  o fim da esteira) âmbar 4 h / vermelho 24 h · **To-Do** não cobra;
- o vermelho **notifica uma vez**, e não repete.

**O que eu preciso de você:** os números. Quanto tempo um cartão pronto para mesclar pode ficar te
esperando antes de o quadro te cobrar — 4 h? um dia? uma semana?

**Resposta: um dia, no fim da esteira.** É o único número que faltava; os outros seguem a proposta,
que não foi contrariada:

| Onde | Âmbar | Vermelho |
|---|---|---|
| etapas da máquina (sem trabalhador, ou com trabalhador e sem progresso) | 30 min | 2 h |
| **fim da esteira — esperando você** | 4 h | **1 dia** |
| To-Do | não cobra | não cobra |

E as duas regras que fazem o aviso valer alguma coisa: **o relógio só conta o tempo em que o cartão
podia ter andado** (esperar vaga não conta — isso é desenho, não problema), e **o vermelho notifica
uma vez**, sem repetir.
## Q32 — limite de taxa do agente: pausa não é bloqueio

Sua observação no UC6, e ela está certa e é grande:

> *"Existe um outro caso sobre orçamento: se o orçamento não tiver estourado no cálculo do Lumem, mas
> o limite de 4 h do Claude for atingido, ele para. O Lumem deve poder esperar e continuar quando o
> limite voltar, se demorar 3h50m ou se demorar apenas 10m."*

**Proposta: `pausada` é uma situação própria, e não um bloqueio.** Cinco regras:

1. **não consome orçamento nem turno** — não gastou nada esperando;
2. **libera a vaga do teto**, que é a consequência direta da [Q24](#q24--o-teto-de-paralelismo-conta-tarefas-ou-sessões):
   com teto 1, 4 h de pausa seriam 4 h de máquina parada por nada;
3. **volta para a fila quando o limite reabre**, e entra pela direita — estava no meio do caminho;
4. **retoma sozinha**, sejam 10 min ou 3h50. Sem você;
5. **não notifica.** Ela não precisa de você; ela aparece no quadro com `pausada até ~14:20`.

**A quarta regra, que é a boa:** com os papéis apontando para **agentes nomeados**
([Q33](#q33--agentes-nomeados-e-papel-por-projeto)), o limite do Claude não para a esteira inteira —
um revisor que aponta para o Codex continua trabalhando. O quadro fica parcialmente vivo em vez de
parado, e isso é um argumento a mais a favor de agentes nomeados.

**O sinal para isso já existe no protocolo — e está apagado neste repositório.** A
[adapter-provenance](../027-adapter-provenance/prd.md) achou dias atrás que o `rateLimitOf` exigia
`utilization` na raiz de `_claude/rateLimit`, e o adaptador `0.75.1` a aninhou em
`unifiedWindows.<janela>` — o rodapé de limite está escuro em **todo** transcript do repositório. Então
esta feature depende de um sinal que precisa ser consertado antes, e o conserto já tem dono.

**Duas perguntas dentro desta:**

- **e quando não há sinal?** Um agente que só devolve erro de limite, sem dizer quando reabre.
  Proposta: tentar de novo com espera crescente, no máximo 3 vezes, e depois **bloquear** dizendo que
  não sabe quando volta;
- **e quando a espera é longa demais?** Limite semanal, que reabre em dois dias. Proposta: acima de um
  teto (4 h?) ela deixa de ser `pausada` e vira `bloqueada`, porque aí você quer decidir — trocar de
  agente, ou deixar para depois. Qual é o teto?

**Resposta: a proposta inteira, com as duas sub-perguntas.** *"Concordo."* Então:

- `pausada` **não consome orçamento nem turno**, **libera a vaga do teto**, **retoma sozinha** — 10 min
  ou 3h50 — e **não notifica**;
- **sem sinal de quando reabre:** tenta de novo com espera crescente, **no máximo 3 vezes**, e depois
  **bloqueia** dizendo que não sabe quando volta;
- **espera longa demais:** acima de **4 h**, deixa de ser `pausada` e vira `bloqueada` — porque aí você
  quer decidir: trocar o agente do encaixe, ou deixar para depois.

**A dependência fica registrada:** o sinal vem do `rateLimit` que o adaptador reporta, e ele está
apagado hoje — a [adapter-provenance](../027-adapter-provenance/prd.md) é quem conserta. Sem ele, só
resta o caminho dos 3 retries, que é o pior dos dois.
## Q33 — agentes nomeados, e papel por projeto

A [Q23](#q23--papel-é-outro-agente-ou-o-mesmo-agente-com-outra-instrução) pediu extensibilidade no
espírito do Compozy: *"vários agentes diferentes, e usar cada agente no momento que você quiser"*, com
**granularidade de projeto** — *"um revisor diferente para cada projeto"*.

**Proposta: um catálogo de agentes nomeados, e três encaixes que apontam para eles.**

| Conceito | O quê |
|---|---|
| **agente nomeado** | nome + adaptador + modelo + instrução (o prompt do papel) + faixa de permissão + orçamento próprio. Ex.: `revisor-severo`, `executor-rapido`, `testador-ui` |
| **encaixe** (papel) | `executor`, `revisor`, `testador` — cada um aponta para **um** agente nomeado |
| **resolução** | tarefa → **projeto** → workspace → default do catálogo. A primeira que responder ganha |

Isso é o que o Compozy faz, no vocabulário dele: o agente é um **arquivo** com frontmatter e o corpo
como prompt, e o papel é um **input tipado com default** (`implementer: { type: agent, default:
code_implementer }`). Papel não é constante de código; é parâmetro com valor padrão.

**Três decisões que eu preciso de você:**

1. **onde o agente é definido?** No Lumem (catálogo do workspace, no SQLite, com tela) ou num
   **arquivo do repositório** (`<repo>/.lumem/agents/*.md`, como o Compozy)? O arquivo versiona, viaja
   com o projeto e deixa o revisor do projeto ser *do* projeto — mas é conteúdo executável vindo de um
   repositório, então entra pelo **mesmo portão de confiança** que a
   [project-scripts](../012-project-scripts/prd.md) já criou para o `[scripts]` clonado.
   **Proposta: catálogo no Lumem na v1; arquivo no repo depois, atrás daquele portão.**
2. **os três encaixes são fixos?** Ou dá para criar um quarto — um `documentador`, um
   `arquiteto`? **Proposta: fixos na v1.** Cada encaixe tem **uma seta no quadro**; papel novo é
   **coluna nova**, e aí o quadro deixa de ter forma fixa. A extensibilidade que você pediu é de
   *quais agentes*, e essa cabe inteira. A de *quantas etapas* é o grafo declarativo do Compozy, e é
   outra feature — grande, e provavelmente depois.
3. **permissão e orçamento são do agente ou do papel?** **Proposta: do agente.** Assim um
   `revisor-so-leitura` existe de verdade — ele **não consegue** escrever, em vez de ter sido instruído
   a não escrever. Instrução não é limite; permissão é.

**Resposta: as três propostas.** *"Concordo com os 3."*

1. **o agente é definido no Lumem na v1** — catálogo do workspace, com tela. Arquivo no repositório
   (`<repo>/.lumem/agents/*.md`) vem depois, e entra pelo **mesmo portão de confiança** que a
   [project-scripts](../012-project-scripts/prd.md) já criou para o `[scripts]` clonado: é conteúdo
   executável vindo de um repositório, e o portão já existe;
2. **três encaixes fixos na v1.** Cada encaixe é uma seta no quadro, então papel novo é coluna nova. A
   extensibilidade que você pediu — *quais agentes* — cabe inteira; a de *quantas etapas* é o grafo
   declarativo do Compozy, e é outra feature;
3. **permissão e orçamento moram no agente, não no encaixe.** Um `revisor-so-leitura` **não consegue**
   escrever, em vez de ter sido instruído a não escrever.

**O que isso já decide, de graça:** a resolução em cascata **tarefa → projeto → workspace → default**,
e o fato de que o limite de taxa de um agente não para a esteira inteira ([Q32](#q32--limite-de-taxa-do-agente-pausa-não-é-bloqueio)).

---

## As quatro do desenho

Elas não saíram de discussão: saíram de **medir a tela**, em 2026-09-11, nos arquivos
`lumem-board.html` e `lumem-agents.html` do Open Design. Três contradizem a PRD, e a nota de cada
contradição está no requisito contradito — não aqui.

### Q34 — o encaixe se chama `executor` ou `implementador`?

O selo do cartão não cabia: `executor trabalhando há 12 min` pede **168px** e a caixa tem **152**. O
conserto é guardar o verbo e devolver o substantivo, porque **o papel já está escrito no cabeçalho da
coluna** — em `In Review` só existe revisor. Aí o verbo cobra o nome:

- `revisando há 2 min` e `testando há 8 min` saem de `revisor` e `testador` sem atrito;
- do `executor` sai **`executando`**, que num produto de agente quer dizer *rodar comando* — e não é
  isso que ele está fazendo.

O desenho ficou com **`implementando há 12 min`**, e aí o encaixe chamado `executor` tem um verbo que
não é dele. A PRD já usa os dois nomes: o §5 diz `executor`, e metade dos casos de uso escreve *"o
**implementador** commita"*.

**Proposta: o encaixe passa a se chamar `implementador`.** Custa uma busca-e-troca na PRD e nada mais
— não existe código nem tabela ainda. A alternativa é ficar com `executor` e o verbo
`implementando`, que é uma costura que alguém vai reabrir toda vez que ler a tela.

> **Aberta.**

**Resposta: `implementador`, com o verbo `implementando`.** *"eu gosto de implementador, e usar o
verbo implementando."*

**O que isso obriga, e é mais do que trocar uma palavra:** o §5 da PRD, o §6, Parte 2 e o §4.1 passam a
dizer `implementador`; o selo do cartão vira `implementando há 12 min` trabalhando e
`aguardando implementador` esperando. **E esse segundo é o mais longo dos três** — medido em
**148px** contra **151px** de caixa, com **3px de folga**. O número está registrado no §4.1 da PRD
porque é ele que impede alguém de engordar o ponto do selo, o espaçamento ou a fonte sem perceber que
truncou a linha mais importante do cartão. `aguardando revisor` mede 104 e `aguardando testador` 112:
a folga é toda do `implementador`.

### Q35 — o rodapé da sidebar passa a dizer **Adaptadores**?

A [second-agent](../021-second-agent/prd.md) pôs no rodapé um cabeçalho **Agentes**, com uma linha por
`claude` e `codex` dizendo `conectado`. Aquilo são **adaptadores**: transporte, versão fixada, login.
O catálogo desta feature traz `revisor-severo`, `testador`, `revisor-so-leitura` — que também se
chamam agentes e que *apontam* para um adaptador.

A cascata da [Q33](#q33--agentes-nomeados-e-papel-por-projeto) se escreve *"o encaixe **revisor** usa
o agente `revisor-severo`, que fala pelo adaptador `codex`"* — e essa frase é impossível com as duas
pontas chamadas "agente".

**Proposta: o rodapé passa a dizer `Adaptadores`.** Uma palavra, e é o que ele sempre listou — a
linha diz `conectado`, que é estado de login, não de trabalho. O quadro 1 do `lumem-agents.html` põe
os dois rodapés lado a lado. O custo de não fazer é uma tela onde *agente* quer dizer duas coisas
dependendo de onde você está olhando.

> **Aberta.** Se a resposta for sim, a `021` ganha nota no requisito do rodapé.

**Resposta: sim.**

A partir daqui, no documento e na tela: **adaptador** é por onde o agente fala (`claude`, `codex`,
com versão fixada e login) e **agente** é o que você nomeia, instrui e dá orçamento
(`revisor-severo`). A nota entra no requisito do rodapé da [`021`](../021-second-agent/prd.md)
**quando esta PRD sair de proposta** — mesma regra que o §7 já aplica à `022`, e pelo mesmo motivo:
uma PRD proposta não reescreve o requisito de uma feature entregue. O resto da `021` fica de pé
inteiro: uma linha por adaptador, o `＋` no cabeçalho, os três estados da linha.

### Q36 — qual dos dois tetos segurou?

A [Q33](#q33--agentes-nomeados-e-papel-por-projeto) decidiu que **orçamento mora no agente**, e o
§6, Parte 3 tem teto por tarefa, por dia e de turnos **no workspace**. As duas coisas estão certas e
convivem — mas significam que *"por que esta tarefa parou em US$ 0,50?"* tem **duas respostas
possíveis**, e o cartão bloqueado do desenho hoje mostra só o número.

Com o `revisor-severo` em US$ 0,50 e o workspace em US$ 2,00, o cartão que diz *"parou em US$ 0,50 e
6 turnos"* não diz **o que mudar** — e mexer no teto errado não destrava nada.

**Proposta: o bloqueio de orçamento nomeia o teto**, com o verbo apontando para o lugar certo:
*"parou no teto do agente `revisor-severo` — US$ 0,50 · 6 turnos"* contra *"parou no teto do
workspace — US$ 2,00 por tarefa"*. Um verbo só, e ele leva à tela onde aquele número mora.

> **Aberta.** É desenho que falta, não decisão de produto — mas é o tipo de falta que só aparece
> depois de o orçamento existir em dois lugares.

**Resposta: a proposta.** *"concordo."* O bloqueio de orçamento nomeia o teto que segurou, e o verbo
leva à tela onde aquele número mora. Está no §6, Parte 3 da PRD e no quadro 5 do `lumem-board.html`.

### Q37 — abaixo de 1418px, o que o quadro faz?

Medido: com **5 colunas e 2 trilhos**, a janela mínima é **1418px**. Abrir uma ponta pede 1582; as
sete abertas pedem 1746. Abaixo de 1418 não existe combinação que caiba — a sidebar são 264px fixos e
a coluna tem piso de 200.

As três saídas, e nenhuma é boa:

- **rolagem horizontal** — funciona, e **mata a promessa da feature**: *"você olha por cinco segundos
  e sabe se precisa entrar"* não sobrevive a uma coluna fora da tela;
- **coluna abaixo de 200px** — o título vira três linhas e a linha viva perde o nome do arquivo, que
  é a única coisa que ela tem para dizer;
- **recolher uma coluna da esteira** — é a única que não foi testada, e a que mais me incomoda:
  recolher `In Progress` esconde exatamente o que está acontecendo agora.

**Proposta: rolagem horizontal, e o quadro diz em voz alta que está assim.** Uma faixa discreta —
*"duas colunas fora da tela"* — em vez de o produto fingir que cabe. É pior que as outras telas do
Lumem, e é honesto: o quadro é a primeira tela do produto com um piso de largura de verdade.

> **Aberta.** Se a resposta for *"não me importo, rola"*, some a faixa e vira uma linha de nota na
> PRD.

**Resposta: rolagem horizontal.**

Fica a proposta inteira — **rola, e o quadro diz que está rolando**: uma faixa com *"2 colunas fora
da tela"* e o nome das que saíram, porque um quadro de sete etapas mostrando cinco sem avisar é um
quadro que mente por omissão. Se a intenção era só *"rola, e não precisa avisar"*, o conserto é
apagar **um elemento** — a faixa `.bd__clip` do `lumem-board.css` — e nada mais depende dela.

O que isso **não** muda: o piso de 200px da coluna continua valendo, e é ele que garante que as
colunas visíveis continuem legíveis em vez de todas encolherem juntas. E vira o **primeiro requisito
de largura mínima do produto** (§6, Parte 1).

---

## Sexta rodada — o que a medição abriu (2026-09-12)

A [T1](tasks.md#t1-o-estudo-que-o-11-pedia) mediu três das nove conversas do §11 e abriu **duas**
perguntas. Nenhuma das duas veio de discussão: vieram de ler o código que já está de pé.

### Q38 — arrastar para `In Progress`, se ele é derivado?

**Esta pergunta nunca precisou existir, e o registro de por quê vale mais que ela.**

Eu li o comentário do `repositories/task.ts` — *"`in_progress` não está em nenhuma das duas listas de
propósito"* — e concluí que arrastar para `In Progress` era impossível, que isso contradizia o §4 da
PRD, e propus que `In Progress` fosse a única coluna sem arrasto.

**Errado duas vezes, e as duas medidas na T4:**

1. **A proposta estava errada.** A [Q3](#q3--quais-colunas-a-máquina-move-sozinha) já decidira que
   *"arrastar é sempre permitido para você, inclusive para as colunas da máquina"*. E o argumento
   contra confundia coluna com selo — a distinção que o §4.1 passou a PRD inteira estabelecendo. Um
   cartão arrastado à mão desenha coluna `In Progress` com selo `manual — ninguém pega`, que é
   exatamente o que ele é. **A honestidade mora no selo, e o selo continua derivado.**
2. **A premissa também estava errada.** Não existem "duas listas": existe **uma**, `AGENT_MAY_SET`, e
   ela é do agente. Você não tem allowlist — tudo que está em `TASK_STATUSES` passa pelo seu caminho.
   Um humano **já conseguia** pôr `in_progress` antes desta feature; provado rodando, não deduzido.

O comentário da `022` descreve a **intenção** (`in_progress` é derivado, ninguém aperta "comecei") e
eu li como se descrevesse o **mecanismo**. Ele foi reescrito na T4 para dizer as duas coisas
separadas, e o que faltava não era escritor nem decisão: **era teste.** A propriedade que faz o
arrasto funcionar — você não tem allowlist — era verdadeira **por acidente**, sem um único caso a
cobrindo. Agora tem cinco, e os cinco foram conferidos ficando vermelhos de propósito.

**O que muda na PRD:** nada. **O que muda no código:** um comentário e cinco testes.

**O que a pergunta abriu, e é o que sobrou dela:** a
[Q40](#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão).

### Q39 — quem diz que o agente está esperando você?

O §4.1 lista `aguardando você` entre os estados do selo, e o §10.2 gastou uma decisão de desenho nele
(*"é luminância, não matiz"*). A [medição do §2](../../project/orchestration-measurements.md) mostrou
que ele **não é derivável do transporte**: o `StopReason` do ACP tem cinco valores e nenhum é
*"esperando"*.

**Respondida em 2026-09-13, e a resposta é que a pergunta estava mal formada.**

A [segunda medição](../../project/orchestration-measurements.md) — 20 turnos com token de verdade,
Haiku e Opus, **US$ 4,60** — foi feita para contar quantos turnos de um implementador autônomo acabam
sem ter terminado. O que ela achou foi outra coisa:

> **`terminou` e `te perguntou` não são estados exclusivos de um turno.**
> **6 dos 19 turnos que commitaram (31%) deixaram uma pergunta ou uma oferta em aberto.**

No mesmo turno, no mesmo texto: *"`biggest` still broke in `src/orders.ts:12`; **say the word and
I'll fix**"* — e commitou. *"Ordena lexicograficamente… **Quer que eu corrija?**"* — e commitou.

**Consequência para o §4.1:** `aguardando você` **não é alternativa a ter andado**. É um sinalizador
**ortogonal** — o cartão pode estar na coluna seguinte *e* esperando você. Um selo que escolhe entre
os dois estará errado em quase um terço dos turnos, e o desenho de 2026-09-11 o desenhou como
escolha.

**E o que a pergunta original queria — um sinal de transporte — perdeu a urgência**, porque a decisão
que ela alimentava não existe: se o cartão anda pelo fato verificável de qualquer jeito, o sinal muda
só *quando avisar* (40 s contra os 30 min do relógio de encalhe), não *se o cartão anda*. Isso é
afinação, e afinação se faz com a esteira no ar.

**O que a medição achou no lugar, e é pior:** o commit **não separa** *"terminou"* de *"desistiu
inventando"*. A tarefa impossível — um serviço que não existe — produziu **commit em 3 de 4
execuções**, com o serviço inventado junto (`src/catalog.ts`, 22/14/32 linhas). Só o Opus em modo de
conversa recusou. Está no §4bis.4 do estudo, e o que sobra de pé é a outra metade do §4.1: *"o CI
ficou verde"*. **A força da esteira é a força da suíte do projeto** — e isso a PRD não escreve.

**O que isso abre:** a [Q42](#q42--o-selo-aguardando-você-é-ortogonal-e-o-desenho-o-fez-exclusivo).

### Q40 — a fila não distingue o que você está fazendo na mão

Achado ao responder a Q38, e é o problema real que estava embaixo do errado.

A regra da fila do §4.1 é *"todo cartão cuja etapa é devida e que não tem trabalhador"*. Um cartão que
você arrastou para `In Progress` para trabalhar na mão é, por essa definição, **exatamente isso**:
etapa devida, sem trabalhador. Com a autonomia ligada, **o daemon pegaria o trabalho que você está
fazendo** — criaria a worktree, abriria a sessão do implementador e começaria a gastar.

E o selo não te protege: `manual — ninguém pega` é o mesmo texto nos dois casos. A tela não distingue
*"eu estou nesta"* de *"ninguém está nesta"*.

As saídas visíveis:

- **o arrasto para uma coluna da máquina desliga a autonomia daquela tarefa** — é o mesmo gesto que o
  §6, Parte 4 já define para **assumir** (*"abre a conversa e desliga a autonomia daquela tarefa"*), e
  arrastar seria um segundo caminho para o mesmo lugar;
- **um sexto estado de selo** — `você está nesta` —, que custa um estado num selo que acabou de subir
  para cinco;
- **a fila só pega cartão que ela mesma pôs na coluna**, o que exige guardar proveniência da
  transição e é o tipo de estado que o §4.1 evitou a feature inteira.

**Sem proposta, e de propósito:** isto é **Parte 2**. Com a autonomia desligada — o default do produto, e o
que a Parte 1 entrega — não existe quem pegue, então nada disto é alcançável ainda. Decidir agora seria
decidir sem a esteira existir para medir contra.

**Resposta: a primeira, e ela não é uma saída nova — é um interruptor que já existe.** Nas suas
palavras: *"se tiver uma flag nas tasks manuais que impede de um agente pegar, então o agente não
pega, simples assim."*

E a flag **já está escrita**: o §6, Parte 4 define **assumir** como *"abre a conversa e **desliga a
autonomia daquela tarefa**"*. É um interruptor por tarefa, decidido antes desta pergunta existir.
Arrastar para uma coluna da máquina é um **segundo caminho para ele** — o gesto do quadro chegando
onde a conversa já chegava. Nenhum conceito novo, nenhuma coluna com exceção, nenhuma proveniência de
transição guardada.

As outras duas saídas eram piores pelo mesmo motivo: eu listei três alternativas sem ter visto que a
primeira **já era a decisão de outro parágrafo**. O sexto estado de selo pagaria com vocabulário o que
um interruptor existente resolve; a fila lembrar quem pôs o cartão ali guardaria estado que o §4.1
passou a feature inteira evitando.

**O que fica de pé, e é pequeno:** o selo diria `manual — ninguém pega` tanto para *"eu estou nesta"*
quanto para *"ninguém está"*. Com o interruptor, isso deixa de ser perigo e vira **leitura**: com a
esteira ligada, um cartão parado numa coluna da máquina levanta a pergunta *"por que ninguém pegou?"*,
e a resposta — *você desligou* — não está na tela. Custa um sexto estado num selo que acabou de subir
para cinco, e a Parte 2 decide quando existir uma esteira para olhar. Não é a Q40: é o resíduo dela.

### Q41 — em que modo a esteira abre a sessão, e quem escolhe?

Achado **medindo** a Q39, em 2026-09-12, e ele não depende do resultado dela.

O `AcpManager` decide permissão assim (`AcpManager.ts:1316`):

```ts
const decision =
  modeOwnerOf(session.info) === "lumem"
    ? decidePermission(session.info.lumemMode, session.info.cwd, {...})
    : ({ approve: false, reason: null } as const);
```

**A política do Lumem — a `016-session-mode` inteira — só decide quando o agente não tem modo
próprio.** O Claude tem: `mode` está nos `configOptions` dele. Então, para o Claude, o `lumemMode` é
**inerte** e todo pedido sobe para uma pessoa, em qualquer valor.

Isso está **certo** e é a A1 da `016` — *quem é dono do seletor de modo desta conversa*. O que a
`028` nunca escreveu é a consequência:

> **A postura de permissão da esteira não é o modo do Lumem — é o modo do agente.**

Medido, e não deduzido: com `lumemMode: "ask"` **e** com `"free"`, o turno pendura no primeiro `Edit`,
indefinidamente. Um implementador autônomo nunca escreve uma linha. O que destrava é
`session/set_mode` para `bypassPermissions`, que é vocabulário do **Claude**.

Três coisas que isso cobra da Parte 2:

- **é por agente, não por workspace.** `bypassPermissions` não existe no Codex, que tem outro
  catálogo. O encaixe do §5 aponta para um agente nomeado — então a postura mora com ele;
- **a esteira não pode herdar o default do workspace**, que nasce em `ask` de propósito. Ela precisa
  do oposto, e escolher o oposto do default em silêncio é o tipo de coisa que se descobre tarde;
- **é onde o princípio 4 encosta no 2.** *"Um agente que pergunta tudo não é autônomo"* pede a
  postura larga; *"você tem que poder assumir o volante"* pede que ele **pare** quando devia perguntar.
  Em `bypassPermissions` ele não para nunca — e a [Q39](#q39--quem-diz-que-o-agente-está-esperando-você)
  é exatamente sobre não saber quando ele devia ter parado.

> **Aberta, e é da F2.** Não bloqueia a Parte 1: com a autonomia desligada, quem escolhe o modo é você,
> pela pílula que a `016` já desenhou.

**Resposta: a postura é do provider, e o Lumem define a interface — não o contrário.** Suas palavras:

> *"Como os providers são diferentes entre si — claude, codex, open router —, a gente precisa definir
> a nossa interface e adaptar os providers a ela. E quando tiver um provider, podem ter features
> habilitadas ou não; isso deve ser uma cultura geral do Lumem, assim não ficamos limitados ao que um
> provider ou outro podem oferecer.*
>
> *Se houver um modo automático como o do Claude, deve ser esse o modo. Se não, para cada provider
> configurado o usuário deve poder selecionar o que ele quer, e cada um tem um default — mas isso deve
> ser tratado individualmente."*

Então a regra da esteira é: **modo automático do agente quando ele tem um; escolha do usuário por
provider quando não tem, com um default por provider.** Quem escolhe é você, uma vez, por agente — e
não por tarefa nem por workspace.

**Isso não contradiz a [`016`](../016-session-mode/prd.md), estende.** O §2.1 dela já diz que o modo é
do agente quando ele relata modos, e do Lumem quando não relata. O que a resposta acrescenta é o
**default por provider** — que a `016` não precisava ter, porque lá quem escolhia era uma pessoa
olhando a pílula, e aqui é o daemon abrindo a sessão sozinho.

**O que ela cobra, e é o resíduo:** a `016` também diz que, quando o modo é do agente, *"o Lumem
**não interpreta** o valor"*. E *"se houver um modo automático como o do Claude"* **é** interpretar:
o Claude oferece cinco — `default`, `acceptEdits`, `plan`, `auto`, `bypassPermissions` — e escolher
entre eles é decidir qual é "o automático". Isso virou a
[Q43](#q43--qual-dos-cinco-modos-do-claude-é-o-automático), e ela é **medível**.

**A primeira metade é maior que esta pergunta.** *"Definir a nossa interface e adaptar os providers a
ela, com features habilitadas ou não"* é direção de arquitetura, não de feature — e o
[catálogo `ADAPTERS`](../021-second-agent/prd.md) já é a primeira parcela dela, com a `spec` que cada
adaptador preenche. Ela tem alternativa real e nomeada (é o que a `016` escolheu para o seletor de
modo: seguir o vocabulário do agente), então **é candidata a ADR** — ver o
[backlog](../../project/backlog.md).

### Q43 — qual dos cinco modos do Claude é "o automático"?

Aberta pela resposta da [Q41](#q41--em-que-modo-a-esteira-abre-a-sessão-e-quem-escolhe), e é a parte
dela que não dá para escrever sem medir.

O Claude relata **cinco**: `default` · `acceptEdits` · `plan` · `auto` · `bypassPermissions`. Três
são candidatos plausíveis a *"o automático"*, com raios de explosão muito diferentes:

| Modo | O que passa sozinho | O que isso custa |
|---|---|---|
| `acceptEdits` | edição de arquivo | comando **não** passa — e a esteira precisa de `git commit` |
| `auto` | não medido | — |
| `bypassPermissions` | tudo | o agente não te pergunta nada, **inclusive quando devia** |

A medição da Q39 usou `bypassPermissions`, e é por isso que os 20 turnos fecharam: o agente rodou
`git commit`. **Com `acceptEdits`, a mesma bancada penduraria no commit** — a mesma doença que o
`lumemMode` produziu, um passo adiante.

Isso importa porque é onde o princípio 4 encosta no 2: `bypassPermissions` compra a autonomia pagando
com **nunca parar**, e a [Q39](#q39--quem-diz-que-o-agente-está-esperando-você) mediu o que isso
produz — a tarefa impossível virou commit em 3 de 4 execuções.

**Resposta: só `bypassPermissions` fecha o laço — medido em 2026-09-13.** As mesmas cinco tarefas, o
mesmo braço autônomo, trocando um argumento. Teto de 150 s por turno, porque **pendurar é um
resultado**:

| Modo | Commitou | O que aconteceu |
|---|---|---|
| `bypassPermissions` | **5/5** | o laço fecha (é a corrida da Q39) |
| `acceptEdits` | **0/5** | **os cinco penduraram.** O arquivo é editado — `M src/orders.ts` no disco — e o turno para no primeiro comando |
| `auto` | **0/5** | os cinco penduraram, e o agente **diz por quê** |

O `auto` é o achado de brinde, e ele é pior que não funcionar. O próprio agente relatou:

> *"**Auto mode unavailable:** the selected model does not support Auto mode; using Accept edits
> instead."*

**É um modo cujo significado depende do modelo, e que degrada em silêncio para outro.** Pedir `auto`
e receber `acceptEdits` sem que nada falhe é exatamente a forma de acoplamento que o
[ADR de 2026-09-13](../../adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md) existe para
impedir — e a medição saiu **depois** do ADR, confirmando-o em vez de inspirá-lo.

**A consequência é desconfortável e é a que importa:** o único modo que deixa a esteira andar é o
único que **nunca pergunta**. E a [Q39](#q39--quem-diz-que-o-agente-está-esperando-você) mediu o que
isso produz — a tarefa impossível virou commit em 3 de 4 execuções, com o serviço inventado junto.

> **Então a segurança da esteira não pode vir do modo de permissão.** Ela tem que vir dos outros três
> lugares que a PRD já nomeia: o **CI** do §4.1 (o fato verificável que separa *terminou* de
> *inventou*), o **orçamento** da Parte 3, e o **teto de turnos**. Isso não muda a resposta da
> [Q41](#q41--em-que-modo-a-esteira-abre-a-sessão-e-quem-escolhe) — muda o que a Parte 2 tem que ter de
> pé **antes** de ligar a autonomia, e é uma frase que a PRD não tem.

O custo da medição foi **US$ 0,00**: os dez turnos penduraram antes de qualquer evento de consumo
chegar.

### Q42 — o selo `aguardando você` é ortogonal, e o desenho o fez exclusivo

Consequência direta da Q39. O quadro 2 do `lumem-board.html` desenha cinco estados de selo como uma
**escolha**: `manual` · `aguardando <papel>` · `<verbo> há Xm` · `bloqueada` · `pausada`. A medição
diz que um cartão pode estar em `revisando há 2 min` **e** esperando você ao mesmo tempo — em 31% dos
turnos, medido.

As saídas, e todas custam:

- **um sexto estado**, que continua sendo escolha e continua errado no mesmo terço;
- **dois eixos no cartão** — o selo diz a etapa, um segundo elemento diz *"tem pergunta em aberto"*.
  Custa altura num cartão cujo título já é de duas linhas, e a barra de 2px carrega **um eixo só** de
  propósito (§10.2);
- **o filtro em vez do selo**: `precisa de mim` já existe e já é *"provavelmente a visão mais usada do
  produto"*. Talvez a pergunta em aberto não precise de pixel no cartão — precisa de um lugar na
  lista.

> **Aberta, e é da Parte 2 mais desenho.** Ela volta ao Open Design junto com o resíduo da
> [Q40](#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), que é da mesma família: os dois
> são coisas que o selo precisaria dizer e não diz.

**Resposta: a segunda saída — dois eixos no cartão.** Suas palavras: *"põe uma linha a mais, isso não
vai deixar o cartão super estranho, tá tudo certo."*

O selo continua dizendo a **etapa** (os cinco estados ficam como estão), e uma linha condicional
acrescenta *"tem pergunta em aberto"*. É condicional como a linha viva já é — e isso **reforça** a
propriedade que o §10.2 mediu, em vez de brigar com ela: *"a altura também é sinal"*, e um cartão que
espera você passa a ser mais alto que um que não espera.

**O custo é medível e é do Open Design**, não deste lado: a medida 3.2 do desenho diz **cinco**
cartões por coluna de 682px sem rolar, e **quatro** quando todos têm linha viva. Uma terceira linha
condicional pode levar isso a três, e três cartões por coluna é o número que o briefing chamou de
*"item demais no cartão"*. A folha volta ao Open Design com esse número para conferir — junto do
resíduo da [Q40](#q40--a-fila-não-distingue-o-que-você-está-fazendo-na-mão), que é da mesma família.

---

## Oitava rodada — o que a Parte 3 abriu (2026-09-13)

Duas perguntas, e as duas nasceram **antes do código**, ao escrever as tasks do orçamento.

### Q44 — o teto tem duas unidades. Qual delas a tela mostra?

A [T13](tasks.md#t13-o-que-cada-adaptador-relata-sobre-dinheiro) achou, sem gastar nada, que **um
teto em dinheiro não é cobrável contra todo adaptador**: a fase 0 da
[`021`](../021-second-agent/prd.md) mediu o Codex atravessando um turno inteiro com `cost: null`. O
que todo adaptador relata é **token e turno** — no evento `usage`, `used` e `size` são obrigatórios e
só `cost` é `nullish`.

Então o teto tem duas unidades: **dinheiro quando o agente informa, token ou turno como o chão que
sempre existe.** A pergunta é o que a tela faz com isso.

- **mostrar a unidade que o agente daquele workspace informa** — o workspace com Claude mostra
  dólares, o com Codex mostra turnos. Custa: dois workspaces mostrando coisas diferentes no mesmo
  lugar, e nenhuma comparação entre eles;
- **mostrar sempre as duas**, com o dinheiro vazio quando não há. Custa espaço e põe um `—` numa linha
  que é sobre limite, que é onde um vazio parece defeito;
- **o teto é sempre em turnos, e o dinheiro é só relatado.** A unidade universal vira a única que
  bloqueia. Custa: *"parou em US$ 2,00"* é uma frase que uma pessoa entende e *"parou em 40 turnos"*
  não — o turno não tem preço fixo, e o mesmo número custa dez vezes mais em Opus que em Haiku.

**Sem proposta.** As três têm um custo que eu não sei pesar sem ver a tela, e ela é da
[Fase 8](tasks.md#fase-8--a-tela). O que **não** está em aberto é o modelo: os três tetos existem nas
duas unidades desde a [T14](tasks.md#t14-onde-os-tetos-moram), porque decidir a tela depois é barato
e decidir o schema depois não é.

> **Aberta, e não bloqueia as fases 6 e 7** — o portão da
> [T16](tasks.md#t16-a-decisão-do-teto-e-ela-é-uma-função-pura) cobra a unidade que
> existir, e a tela escolhe o que dizer.

### Q45 — o teto vale para a sessão que você está conduzindo?

A Parte 3 vem antes da esteira, então os tetos são cobrados sobre a **única sessão que existe hoje**:
aquela que você abriu com a mão e está olhando.

E isso é diferente do que a PRD tinha em mente. O §2 diz que a feature é a passagem de *harness* —
você dirige — para *orquestrador* — você supervisiona; o orçamento existe porque **"autonomia sem
orçamento é um vazamento"**, e o vazamento é o agente gastando enquanto ninguém olha. Numa conversa
que você conduz, ninguém está deixando de olhar.

- **vale igual** — é um teto do workspace, e o dinheiro é o mesmo dinheiro. Custa: o produto
  interrompe **você**, no meio de uma conversa, por um número que você configurou há um mês e não
  lembra. É o comportamento que faz a pessoa desligar o teto e nunca mais ligar;
- **só vale para o que a esteira pegou** — o teto é do trabalho autônomo, e a conversa que você
  conduz é sua. Custa: até a Parte 2 existir, **o teto não bloqueia nada**, e as fases 6 a 9 entregam
  um portão sem nada passando por ele;
- **vale, e avisa em vez de bloquear** — a conversa que você conduz recebe o aviso *"passou do teto"*
  e continua; a da esteira para. Custa uma terceira semântica num produto que já tem `bloqueada` e
  `pausada`.

**Proposta: a terceira**, e o motivo é a assimetria que a própria PRD nomeia. *"Para, bloqueia, mostra
o número, não reduz nem continua"* é a resposta certa para quem **não está lá** — o §6, Parte 3
escreve isso para a esteira. Para quem está lá, a informação é a mesma e a interrupção é hostil: você
pode decidir parar, e o produto não precisa decidir por você. E isso não é uma terceira semântica de
verdade — é o teto do workspace se comportando como o
[`session-mode`](../016-session-mode/prd.md) se comporta, que **nunca nega sozinho**: *"denial stays a
human act"*.

**Resposta: a terceira — avisa quem está conduzindo, para quem não está.** *"Concordo com o
proposto."*

Então o teto tem **dois destinos para a mesma conta**: o número é o mesmo, a leitura é a mesma, e o
que muda é o verbo. Quem conduz recebe *"passou do teto"* e decide; a esteira **para, bloqueia,
mostra o número, não reduz nem continua** (§6, Parte 3).

**O que isso obriga, e é o que muda a [T16](tasks.md#t16-a-decisão-do-teto-e-ela-é-uma-função-pura):**
o portão deixa de ser *"recusa o próximo turno"* e passa a ser uma **decisão** — `passa`, `avisa` ou
`bloqueia` —, tomada a partir de quem está conduzindo. É a mesma forma do
[`decidePermission`](../016-session-mode/prd.md) e do `sealOf`: função pura, separada do lugar cheio
de I/O, porque *"toda ramificação aqui é uma frase com que alguém pode discordar"*.

**E o caminho de bloquear nasce sem chamador**, porque a esteira é a Parte 2. Isso é aceitável aqui e
não seria em CSS: uma função pura com os dois ramos cobertos por teste é um contrato escrito; uma
classe de CSS para marcação que não existe é lixo esperando divergir. Quando a Parte 2 chegar, ela
passa `esteira` no lugar de `você` e nada mais muda.
