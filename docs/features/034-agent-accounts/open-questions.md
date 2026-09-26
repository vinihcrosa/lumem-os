# Mais de uma conta por agente — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 14 perguntas · **14 respondidas** (2026-09-25 e 2026-09-26). A
[Q7](#x-q7--isso-vira-adr) foi respondida pela fase 0 (**vira ADR**), e a
[Q10](#x-q10--o-que-uma-conta-nova-herda-da-sua-configuração-de-hoje), que nasceu dela, foi aceita
como proposta. A [Q11](#x-q11--uma-conta-de-assinatura-herda-o-anthropic_api_key-do-daemon) nasceu na T6.

A Q1 e a Q5 foram **emendadas no mesmo dia** — a interpretação delas estava errada, e a emenda está
dentro de cada resposta, com a versão anterior riscada.

A [Q1](#x-q1--a-conta-é-escolhida-onde-por-sessão-por-projeto-ou-pelos-dois) e a
[Q4](#x-q4--o-limite-de-janela-e-o-teto-de-orçamento-passam-a-ser-por-conta) foram respondidas
**contra a proposta**, e a [Q3](#x-q3--dá-para-trocar-a-conta-de-uma-conversa-já-aberta) abriu duas
perguntas derivadas — a [Q3a](#x-q3a--o-que-é-copiar-o-contexto) e a
[Q3b](#x-q3b--a-sessão-de-origem-fica-como).

---

### [x] Q1 — A conta é escolhida onde: por sessão, por projeto, ou pelos dois?

O pedido fala em escolher por tarefa ("conta 1 para uma coisa, conta 2 para outra"). Mas o UC1
(pessoal × trabalho) é naturalmente **por projeto** — ninguém quer escolher a conta toda vez que abre
uma conversa no repositório do trabalho.

**Proposta pra reagir:** ~~**default por projeto, sobrescrita por sessão.** O projeto guarda "conta
padrão do Claude aqui"; o diálogo de nova conversa já vem com ela marcada e deixa trocar.~~

**R (2026-09-25): por sessão, e só por sessão** — contra a proposta. *"No mesmo projeto, mesma
worktree, eu posso ter uma sessão de um agente na conta 1 e outra sessão de outro agente na conta
2."* Não existe conta padrão de projeto nem de worktree: a unidade da escolha é a conversa. O que a
proposta queria resolver — não escolher toda vez — fica sem resposta de propósito; se incomodar,
volta como pergunta nova, não como default escondido.

Consequência para a [Q5](#x-q5--cada-encaixe-da-esteira-pode-ter-conta-própria): o *"herdando a conta
padrão do projeto"* dela caiu junto, porque não há padrão para herdar.

**Emenda (2026-09-25), na mesma rodada:** ~~Não existe conta padrão de projeto nem de worktree~~ —
**existe um padrão, e ele é o que vem primeiro.** *"Eu vou conectar a conta claude 1, depois a 2, e
depois a 3; a claude 1 ficou como padrão para tudo, mas eu posso ir nas configs e mudar para outra
conta e modelo a hora que eu quiser. É sempre um trio: conta + modelo + effort (quando tem)."*

O que continua de pé da resposta original: **a escolha é por sessão** — na mesma worktree convivem
sessões em contas diferentes, e o diálogo de nova conversa deixa trocar. O que mudou:

- a sessão nova **vem pré-selecionada** com o padrão — ele não é projeto nem worktree, é da
  **configuração**;
- o padrão é um **trio** — conta, modelo e effort —, não só a conta; effort só quando o agente
  oferece (o `configOptions` já tem `effort` como categoria);
- o padrão nasce sozinho — é a **primeira conta conectada** — e se troca na configuração, a qualquer
  momento. Trocar o padrão **não mexe** em sessão aberta.

A emenda deixou uma lacuna — *um trio só para tudo, ou um por agente?* —, e ela é a
[Q1a](#x-q1a--o-padrão-é-um-só-ou-um-por-agente).

---

### [x] Q1a — O padrão é um só, ou um por agente?

Nasceu da emenda da Q1. Um trio único (*"Claude conta 1 + Opus 5"*) não diz o que uma conversa nova
do **Codex** usa.

**R (2026-09-26): padrão em dois níveis.** *"Se eu abrir um do Codex, o Codex tem o padrão para chats
dele. Cada provider + conta tem um default, e você usa ele para chats novos."*

- **cada agente tem uma conta padrão** — a primeira conectada dele. Conversa nova do Codex abre na
  conta padrão do Codex; do Claude, na do Claude;
- **cada conta tem o seu modelo e effort padrão**. Trocar a conta no diálogo de nova conversa troca
  o modelo e o effort para o padrão **daquela** conta — que pode ter outro plano e outra lista;
- os dois se mudam na configuração, a qualquer momento, sem mexer em sessão aberta.

É isso que faz o trio da Q1 ser **composto** e não guardado inteiro: agente → conta padrão dele →
modelo e effort padrão dela.

---

### [x] Q2 — A conta tem nome dado por você, ou o que o provedor diz?

O Codex manda `{ email, plan }` sem pedir; o Claude talvez não. Um rótulo livre (`pessoal`,
`trabalho`) é o que se lê numa sidebar de 264px; o e-mail é o que prova de quem é.

**Proposta pra reagir:** **rótulo seu, e-mail/plano como segunda linha quando o agente contar.**

**R (2026-09-25): o nome é seu.** *"O usuário deve inserir, ele controla o nome."* O rótulo é
digitado ao conectar a conta, e o produto não o deriva de nada que o provedor mande. A resposta
cobre o nome; a segunda linha com e-mail/plano **não foi confirmada nem recusada**, e não entra no
desenho até ser.

**Nota (2026-09-26), decidida na implementação com autonomia delegada:** **entra**, e só em
`/settings`. A fase 0 fez o e-mail deixar de ser enfeite: ele é **o que a conferência lê**
([ADR](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)), e mostrá-lo é o que
deixa você ver que a conta `trabalho` é mesmo a do trabalho. Na pílula da conversa nova ele não
aparece: lá cabe o rótulo, e o rótulo é seu.

**Nota (2026-09-26), do teste de design (T18):** a conta que **já existia** — o login desta máquina,
sem diretório — nascia com o nome do agente como rótulo, e o cabeçalho lia `claude · claude`: o nome
vinha do produto, contra a resposta acima. Ela passa a nascer **`principal`** (a `0038` renomeia a
de quem já tinha, só se o rótulo ainda era o do agente), e **se renomeia** em `/settings` → Agentes,
clicando no nome. `principal` é ponto de partida, não derivação do provedor: **o nome continua seu.**

---

### [x] Q3 — Dá para trocar a conta de uma conversa já aberta?

Trocar de conta = outro processo de adaptador. O `session/load` já sobe um adaptador novo (a Parte 7
da `028` pagou por isso), então é **possível**; a pergunta é se o histórico feito numa conta deve
continuar em outra — e o custo daquela conversa passa a estar em duas contas.

**Proposta pra reagir:** **não.** A conta é fixada no nascimento, como o agente. Quer outra conta,
abre outra conversa.

**R (2026-09-25): não troca — mas o produto faz a passagem.** *"Se for trocar de conta, deve se
abrir uma nova sessão, copiar o contexto, e continuar dali; no final terá duas sessões abertas."*

A conta continua fixa no nascimento, como a proposta dizia. O que a resposta acrescenta é um
**verbo**: *continuar em outra conta* — uma sessão nova, na conta escolhida, que nasce com o contexto
da de origem. A de origem **não fecha**. Isso é parente do `fork` que está no
[backlog](../../project/backlog.md) desde a acp-sessions A7, com uma diferença: o `fork` do ACP
bifurca **dentro** do mesmo adaptador, e aqui o adaptador é outro processo, com outra credencial —
o protocolo não carrega a conversa de um para o outro. Daí a [Q3a](#x-q3a--o-que-é-copiar-o-contexto).

---

### [x] Q3a — O que é "copiar o contexto"?

Nasceu da Q3. O adaptador novo não conhece a conversa da origem, então alguém tem de entregá-la. Três
formas, com custos diferentes:

1. **Transcript inteiro como primeiro prompt** — fiel, e caro: uma conversa longa vira um primeiro
   turno de centenas de milhares de tokens na conta nova, e pode não caber na janela do modelo
   escolhido.
2. **Resumo** feito pelo agente da origem antes da passagem — barato, e perde coisa; e quem resume
   gasta na conta **velha**.
3. **Transcript com corte** — as últimas N mensagens mais as ferramentas, sem as saídas longas.

Também pesa: a conversa de origem pode ser de **outro agente** (Claude → Codex). O transcript em
disco é do Lumem, não do adaptador, então a forma 1 e a 3 servem para os dois sentidos.

**Proposta pra reagir:** **transcript do Lumem, com corte**, e o primeiro turno da sessão nova
mostrando na conversa o que foi levado (quantas mensagens, quantos tokens) — para a passagem não ser
invisível.

**R (2026-09-25): cortada.** O corte, como foi explicado antes da resposta: vai **tudo o que foi
dito** (seus prompts, as respostas do agente) e o **registro** de cada ferramenta usada; a **saída**
longa de ferramenta — arquivo lido, saída de teste, diff — vira uma linha (`[leu schema.ts — 1.500
linhas, omitido]`). Na conta de exemplo, ~300 mil tokens viram ~20 mil. Nada se perde de verdade: os
arquivos estão na worktree, e o agente novo relê o que precisar. O limiar de *"longa"* é do desenho.

**Nota (2026-09-26), o limiar:** saída de ferramenta com mais de **2 000 caracteres** vira uma linha
— `[<título da ferramenta> — N linhas, omitido]`. É por volta de 50 linhas de código, o tamanho acima
do qual reler o arquivo na worktree sai mais barato que carregar a cópia.

---

### [x] Q3b — A sessão de origem fica como?

A Q3 diz que no final há duas sessões abertas. A de origem continua **viva e utilizável** (dá para
voltar e mandar prompt nela), ou fica marcada como *continuada em →* e só leitura?

**Proposta pra reagir:** **viva**, com uma linha no fim da conversa apontando para a nova — e a nova
com uma linha no começo apontando para a origem. Nada é travado; o vínculo é só navegação.

**R (2026-09-25): viva.** *"Ela continua funcionando; o que acontece é só que abre uma nova aba com o
novo agente."* A origem não muda em nada; o gesto abre **uma aba nova** na worktree, com a sessão da
conta escolhida — que pode ser de outro agente. As linhas de vínculo da proposta não foram
confirmadas e ficam como detalhe do desenho.

**Nota (2026-09-26), as linhas de vínculo:** entram as duas. A origem ganha, no fim da conversa, uma
linha `continuada em <agente · conta> →`, e a nova começa com `continuação de <agente · conta> —
levou N mensagens, ~T tokens`. As duas são navegação: clicar leva à outra aba, e nada é travado.

---

### [x] Q4 — O limite de janela e o teto de orçamento passam a ser por conta?

O rodapé de limite hoje é por agente. Com duas contas, "Claude a 80%" não diz qual. E os tetos da
Parte 3 da `028` moram no workspace — um teto por conta seria um terceiro eixo.

**Proposta pra reagir:** ~~**limite por conta, sim** (é dado do provedor, e é a razão do UC2). **Teto
de orçamento continua no workspace** — somando todas as contas — até alguém pedir o contrário.~~

**R (2026-09-25): nenhum limite por conta** — contra a proposta. *"Quem controla as contas é o
usuário; isso sai do objetivo do software."* O Lumem conecta e seleciona conta; não mede, não
compara e não barra conta. Nenhum teto novo nasce aqui, e os tetos do workspace da Parte 3 da `028`
continuam exatamente como estão — esta feature não mexe neles.

O UC2 (*somar limite*) continua sendo um motivo legítimo para ter duas contas, mas passa a ser
**seu**: o produto não oferece nada para ele além de deixar escolher a conta.

---

### [x] Q5 — Cada encaixe da esteira pode ter conta própria?

UC4. Amarrar o revisor a uma conta separada protege o limite de quem trabalha na mão — e é mais uma
configuração num quadro que já tem muitas.

**Proposta pra reagir:** ~~**sim, opcional**, herdando a conta padrão do projeto (Q1) quando vazio.~~

**R (2026-09-25): a esteira usa uma conta padrão, do agente.** *"Deve ter uma conta default para os
agentes que implementam, revisam e testam; a primeira conta configurada se torna default, e o
usuário deve poder trocar na parte de configuração."*

- cada agente tem **uma conta padrão**, e ela é a **primeira conectada** — sem passo extra;
- o encaixe da esteira abre a sessão na conta padrão do agente dele;
- trocar a padrão é um gesto da **configuração**, não do quadro.

Não contradiz a Q1: a conta padrão serve **à esteira**, que abre sessão sem ninguém para escolher. A
sessão que você abre na mão continua escolhendo a conta, sem pré-seleção. Remover a conta padrão
(Q8) exige que outra assuma — o formato fica para o desenho.

**Emenda (2026-09-25):** ~~trocar a padrão é um gesto da configuração, não do quadro~~ no sentido de
*uma padrão só para os três* — **cada encaixe é configurável separadamente.** *"Tudo deve ser
configurável: o padrão é a primeira conta faz tudo, mas o usuário pode querer trocar só o agente do
revisor, e ele deve poder fazer isso."* E ~~a sessão que você abre na mão continua sem pré-seleção~~:
a emenda da Q1 deu padrão a ela também.

**O lugar já existe.** A Parte 2 da [`028`](../028-autonomous-orchestration/prd.md) fez o
`named_agent` — adaptador, modelo e instruções — amarrado a cada encaixe por uma cascata
tarefa → projeto → workspace → padrão (`packages/server/src/agents/catalog.ts`). O trio desta feature
**completa** esse registro: ele ganha **conta** e **effort**, e o quarto degrau — o que não está no
banco — passa a ser *a primeira conta conectada*. Trocar só o revisor é amarrar um `named_agent` a
esse encaixe, que é exatamente o que a cascata já faz.

Com a [Q1a](#x-q1a--o-padrão-é-um-só-ou-um-por-agente): um `named_agent` que diz o adaptador e não
diz conta, modelo ou effort herda os padrões — a conta padrão daquele agente, e o modelo e effort
padrão daquela conta. Configurar o encaixe é dizer **só o que difere**.

---

### [x] Q6 — Isolar por variável do CLI ou por `HOME` inteiro?

§4 da PRD. A fase 0 decide medindo, mas a **preferência** precisa estar escrita antes, para a
medição saber o que está tentando provar.

**Proposta pra reagir:** **variável do CLI** (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`). Reescrever `HOME`
só se a medição provar que não há outro jeito — e aí é ADR, porque muda o ambiente em que o agente
roda comando no seu repositório.

**R (2026-09-25): variável do CLI.** A diferença, como foi explicada antes da resposta: a variável
muda **só onde o CLI procura o login**, e o agente continua commitando com o seu nome, dando `push`
com a sua chave SSH e rodando o `node` do seu nvm. Reescrever `HOME` troca a casa inteira do
processo — `git commit` sem autor, `push` sem chave, outra versão de `node`.

**O que a resposta não fecha:** se no macOS a credencial do Claude Code mora no **Keychain** numa
entrada que não varia com `CLAUDE_CONFIG_DIR`, a forma escolhida não separa as contas. É a primeira
medição da fase 0, e se ela der errado a pergunta **volta** — não se resolve trocando para `HOME` em
silêncio.

**Medido (2026-09-26), e a resposta fica de pé:** o Keychain **não colide**. O Claude Code nomeia a
entrada `Claude Code-credentials-<sha256(dir)[0:8]>` sempre que `CLAUDE_CONFIG_DIR` existe, e o
Codex guarda em arquivo dentro do `CODEX_HOME`
([estudo](../../project/agent-accounts-measurements.md), §2.1 e §3.2). O que **caiu** foi a
explicação que acompanhou a resposta: ~~a variável muda **só onde o CLI procura o login**~~. Ela muda
onde mora a **configuração inteira do agente** (plugins, `CLAUDE.md` de usuário, MCPs, permissões,
transcripts). Continua de pé o motivo que decidiu: `.gitconfig`, chave SSH e nvm não mudam. A
consequência virou a [Q10](#x-q10--o-que-uma-conta-nova-herda-da-sua-configuração-de-hoje), e a
decisão virou o ADR da [Q7](#x-q7--isso-vira-adr).

---

### [x] Q7 — Isso vira ADR?

Passa nos três testes? *Difícil de reverter:* sim — a sessão passa a apontar para conta, e toda
conversa em disco é migrada. *Surpreendente sem contexto:* talvez — "por que a credencial não está
no agente?". *Trade-off real:* sim, se a Q6 for decidida contra a forma genérica.

**Proposta pra reagir:** **ADR só se a fase 0 mudar o mecanismo** (Keychain colidindo, `HOME`
reescrito). Se `CLAUDE_CONFIG_DIR` bastar, é nota nesta PRD.

**Adiada (2026-09-25):** *"isso decide depois."* Fica aberta até a fase 0 medir o mecanismo — é a
medição que diz se há trade-off para registrar.

**R (2026-09-26): vira ADR** —
[*uma conta de agente é um diretório de configuração inteiro, e a primeira é a ausência
dele*](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md). O critério da proposta,
lido ao pé da letra, diria que não: a fase 0 **não** mudou o mecanismo, e a variável do CLI se
sustentou. Mas o critério era um atalho para *"há trade-off real?"*, e a
[medição](../../project/agent-accounts-measurements.md) achou um onde a PRD achava que não havia. A
variável não é cirúrgica: ela leva a configuração inteira do agente. A forma que isola só a
credencial (`CLAUDE_SECURESTORAGE_CONFIG_DIR`) existe e perde, porque deixa a identidade
compartilhada. Os três testes:

- *difícil de reverter:* sim — os transcripts do Claude passam a morar no diretório da conta, e o
  `session/load` depende dele para sempre;
- *surpreendente sem contexto:* sim, e em dois pontos. *"Por que a minha segunda conta não vê meus
  plugins?"* E *"por que a primeira conta sobe **sem** a variável, e as outras com?"* — medido:
  escrever o caminho padrão faz a conta de hoje aparecer deslogada;
- *trade-off real:* sim, e o ADR nomeia quatro alternativas. A que mais tenta é a variável
  cirúrgica, que faria a conta 1 se apresentar com o e-mail da conta 2.

---

### [x] Q8 — Remover uma conta faz o quê com as conversas dela?

Apagar o diretório da credencial deixa conversas em disco que não podem mais ser retomadas.

**Proposta pra reagir:** **a conta vira `desconectada`, não some** — as conversas continuam legíveis,
o `resume` pede para reconectar. Apagar de vez é um segundo gesto, com a contagem de conversas na
frase.

**R (2026-09-25): como proposto.**

**Nota (2026-09-26), a conta padrão desconectada** (a lacuna que a Q5 deixou para o desenho): a
padrão passa para a conta conectada **mais antiga** daquele agente. Sem nenhuma, o agente fica sem
padrão, e a conversa nova pede para conectar. É a mesma regra do nascimento (*a primeira conectada*)
lida de novo, e não uma regra nova.

**Nota (2026-09-26), o que *apagar de vez* apaga** (decidido na T8): a conta, **as conversas dela**
(as linhas de sessão, numa transação — o `session.agent_account_id` é `RESTRICT`, e a contagem na
frase é o que autoriza isso), o diretório da conta e a chave do cofre. O consumo fica, porque é
histórico e não tem estrangeiro; a transcrição do Lumem cai na manutenção do boot, que já remove o que
sobra de um purge. A chamada exige a contagem, e recusa se ela mudou entre ler e confirmar, ou se há
conversa aberta. A **conta sem diretório não se apaga de vez**: ela é o login desta máquina, o
conteúdo dela mora no `~/.claude` de verdade, e o Lumem só pode desconectá-la. E *conectado* só vale
para a conta que a conferência leu logada: a conta de assinatura nasce desconectada, e a de chave nasce
conectada ao ser guardada, porque não há leitura que confira uma chave sem gastar um turno (§3.3).

---

### [x] Q9 — De onde a configuração tira a lista de modelos e de effort?

Nasceu da emenda da Q1. O trio padrão é escolhido **na configuração**, sem conversa aberta — mas a
lista de modelos e de effort **não é do Lumem**: vem do `configOptions` que o adaptador manda no
handshake, e muda com a conta (plano diferente, modelos diferentes) e com a versão do adaptador (a
[`027`](../027-adapter-provenance/prd.md) nasceu de um Fable que o adaptador velho não conhecia).

Duas perguntas numa:

1. **mostrar o quê**, com nenhuma sessão viva daquela conta? Subir um adaptador só para ler a lista
   custa um processo de 243 MB e alguns segundos;
2. **e se o modelo guardado sumir** — o adaptador atualizou, ou a conta perdeu o plano?

**Proposta pra reagir:** guardar a **última lista vista** por conta, atualizada a cada handshake
daquela conta, e a configuração ler dela — com a data ao lado. Se o modelo guardado não estiver na
lista do handshake, a sessão abre no que o adaptador escolher e **diz isso na conversa**, em vez de
falhar ou trocar em silêncio.

**R (2026-09-25): delegada.** *"Eu não ligo como fazer, eu me importo com a funcionalidade, com a
experiência do usuário."* Decidido por experiência, e não por mecanismo:

- **a lista existe desde o instante em que a conta existe.** Conectar uma conta já termina com um
  `session/new` que confere o login (a regra da [`021`](../021-second-agent/prd.md): conferido, não
  acreditado) — e esse handshake traz o `configOptions`. A lista é gravada ali, por conta. Não há
  tela de configuração vazia, nem espera para abrir um seletor;
- **ela se atualiza sozinha**, a cada handshake daquela conta — toda sessão aberta é uma leitura
  nova, de graça. Nenhum botão de *atualizar*, nenhum adaptador subido só para ler a lista;
- **modelo guardado que sumiu não trava nada.** A sessão abre no que o adaptador escolher, com uma
  linha na conversa dizendo qual era o pedido e qual veio; e a configuração marca o trio como
  *indisponível* até alguém escolher outro. Falhar a sessão por causa de um padrão velho seria punir
  quem não mudou nada;
- **effort some quando o modelo não tem.** O terceiro item do trio só aparece se o `configOptions`
  daquele modelo oferece `effort`.

**Nota (2026-09-26), da fase 0:** ~~um `session/new` que confere o login~~ — o `session/new` do
Claude `0.75.1` **fecha sem credencial nenhuma**, e o do Codex aceita uma chave de API falsa
([estudo](../../project/agent-accounts-measurements.md), §2.2 e §3.3). Quem confere é outra leitura,
decidida no [ADR](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md):
`claude-agent-acp --cli auth status` e o `_auth/status_update` do Codex. O que fica de pé na
resposta: a lista de modelos continua vindo do `configOptions` do `session/new`, gravada por conta. A
medição confirmou que ela **é** por conta: no Codex, a conta ChatGPT e a chave de API oferecem listas
e escalas de effort diferentes. Uma ressalva: no Claude, uma conta recém-conectada tem cache de
modelos vazio (o Fable só aparece depois que o cache enche), então a primeira lista pode ser mais
curta que a de verdade. Isso vale como critério de aceite, não como pergunta.

---

### [x] Q10 — O que uma conta nova herda da sua configuração de hoje?

Nasceu da fase 0. O [ADR de 2026-09-26](../../adr/2026-09-26-0148-an-account-is-a-whole-agent-config-dir.md)
faz cada conta ser um diretório de configuração inteiro, e a
[medição](../../project/agent-accounts-measurements.md) (§2.5) mostra o que isso custa: a segunda
conta do Claude nasce **sem** os seus plugins, skills, subagentes, `CLAUDE.md` de usuário, MCPs de
usuário e permissões do `settings.json`. A do Codex nasce sem o `config.toml` (modelo, perfis,
`[mcp_servers]`) e sem o `AGENTS.md` global. Medido: o seletor de subagentes some do `session/new`, e
modelo e effort voltam ao padrão do adaptador.

A identidade nunca é herdada (credencial, `.claude.json`, `auth.json`): isso está no ADR, e é o que
separa as contas. A pergunta é sobre **o resto**, e ela tem três respostas com custos diferentes:

1. **nada** — a conta nova é um Claude Code recém-instalado. Honesto e simples. Quem tem plugins
   percebe a diferença na primeira conversa e não entende por quê;
2. **link para os itens de comportamento** (`settings.json`, `CLAUDE.md`, `rules/`, `skills/`,
   `plugins/`; `config.toml` e `AGENTS.md` no Codex), apontando para os de hoje. Mudar um plugin muda
   em todas as contas. Não medido: se os plugins aguentam ser lidos por link (eles guardam caminho
   absoluto), e se o `config.toml` do Codex compartilhado arrasta junto um `cli_auth_credentials_store`
   que quebre o isolamento;
3. **cópia no momento de conectar** — a conta nasce igual à de hoje e diverge depois. Não tem as
   surpresas do link, e tem as da cópia: o plugin instalado amanhã não chega na conta de ontem.

Os **MCPs do usuário** são o caso difícil, porque no Claude eles moram no mesmo `.claude.json` da
identidade: nenhum link os traz sem trazer também o `oauthAccount`.

**Proposta pra reagir:** **link (2) para o que é comportamento, com uma linha na tela de conectar
dizendo o que foi ligado**, e os MCPs de usuário do Claude **fora**, ditos em voz alta nessa mesma
linha. A medição que falta — plugin por link, e `config.toml` compartilhado — é critério de aceite
da task que fizer isso, e se ela falhar a resposta cai para (3).

**R (2026-09-26): como proposto.** A conta nova recebe **link** para o que é comportamento
(`settings.json`, `CLAUDE.md`, `rules/`, `skills/`, `plugins/` no Claude; `config.toml` e `AGENTS.md`
no Codex), e a tela de conectar diz numa linha o que foi ligado. Os MCPs de usuário do Claude ficam
**fora**, e essa mesma linha diz isso. A medição que falta (plugin lido por link, e `config.toml`
compartilhado sem arrastar um `cli_auth_credentials_store`) é critério de aceite da task. Se ela
falhar, a resposta cai para a **cópia no momento de conectar** (3), sem pergunta nova.

**Nota (2026-09-26), o que a T8 mediu e o que não mediu**, contra o `0.75.1` e o `1.10.0` do pino,
só com cópias num `HOME` descartável:

- **medido:** o `--cli auth status` do Claude lê a conta com `settings.json`, `CLAUDE.md` e
  `plugins/` ligados, e não troca o link por um arquivo dele; o `login status` do Codex lê o
  `config.toml` ligado sem erro, e ele continua sendo link;
- **o `config.toml` é por caso, e não por regra:** se ele traz `cli_auth_credentials_store`, o
  `connect` o **copia sem a chave** em vez de ligar — ligado, ele levaria a credencial da conta nova
  para o armazenamento da de hoje. A cópia é lida pelo Codex, e a conta segue sem login. O
  `~/.codex/config.toml` da máquina que mediu **não** tem a chave, então hoje ele é ligado;
- **não medido:** que um plugin **carrega** por link. Medir pediria os plugins de verdade, cujo
  `installed_plugins.json` aponta para o `~/.claude/plugins` real, e um teste da suíte não pode ler
  nem arriscar escrever lá. A primeira conta conectada com plugins é a medição; se o seletor de
  subagentes não aparecer nela, a herança de `plugins/` cai para cópia.

---

### [x] Q11 — Uma conta de assinatura herda o `ANTHROPIC_API_KEY` do daemon?

Nasceu na T6. O `spawn` soma o ambiente do daemon ao da conta, então um `ANTHROPIC_API_KEY` exportado
no terminal que subiu o Lumem chega também à conta `trabalho`. O Claude Code prefere a chave à
assinatura, e o turno passa a ser **cobrado por token** numa conta que você conectou por assinatura,
sem nada na tela dizer isso. É o mesmo defeito que a `034` existe para resolver: gastar na conta
errada em silêncio.

**R (2026-09-26), decidida na implementação com autonomia delegada:** **conta de assinatura com
diretório próprio não herda**. O resolvedor remove os nomes do `apiKeyEnv` do ambiente dela, do mesmo
jeito que já remove a variável de conta da primeira. A **primeira conta** (a sem diretório) continua
herdando, porque é o comportamento de hoje, e mudar isso trocaria a forma de cobrança de quem já
usa o produto sem que ninguém tenha pedido. Conta de chave recebe a chave do cofre, e só ela.
