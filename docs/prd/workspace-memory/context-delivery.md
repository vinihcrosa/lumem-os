# Como a memória chega no agente

> **Status:** **v3 — desenho fechado.** As oito perguntas (D1–D8) estão respondidas; o §4 é o desenho,
> o §5 é o que ele cobra e como fechar cada buraco. A proposta original (índice injetado + tool) foi
> substituída pelo Vinicius por *núcleo comportamental + skill + serviço `lumem-memory`*. Escrito a
> pedido da
> [Q23](open-questions.md#x-q23--índice-corpo-ou-os-dois-czhm-2), que absorveu também a
> [Q24](open-questions.md#x-q24--qual-é-o-teto-e-por-escopo-ou-total-hm) e o fluxo *lazy* levantado na
> [Q33](open-questions.md).
>
> **A pergunta:** memória só existe se chegar ao agente. Como ela chega — e quanto isso custa em
> **todo turno de toda sessão** — é a decisão que separa "o sistema aprende" de "o sistema aprende e
> ninguém aguenta pagar".

---

## 1. Por que isso merece arquivo próprio

Todas as outras decisões desta feature são sobre **guardar bem**: escopo, portão, proveniência,
WAL. Esta é a única sobre **gastar**. E ela tem uma propriedade que nenhuma outra tem: o custo é
**recorrente e invisível**. Uma memória mal guardada é um problema pontual; um bloco de contexto
inchado é um imposto cobrado em cada requisição, para sempre, que ninguém percebe até a conta chegar.

Os dois produtos que estudamos escolheram lados opostos, e os dois estão certos dentro da própria
lógica:

| | Compozy | Hermes |
|---|---|---|
| O que injeta | **só o índice** (título + descrição) | **o corpo inteiro** |
| Como segura o custo | custo ∝ número de memórias | teto duro de caracteres (2.200 + 1.375) |
| Custo fixo por sessão | proporcional ao acervo | **~1.300 tokens, sempre** |
| Depende de | o agente pedir o corpo com uma tool | nada |
| Falha quando | o agente não pede | a memória não cabe |

Hermes compra previsibilidade e paga com um teto que obriga consolidação. Compozy compra escala e
paga com dependência de cooperação.

---

## 2. Os quatro desenhos possíveis

### (a) Injeção total

Tudo que é relevante entra no prompt, sempre. Funciona sem cooperação nenhuma. Custa em todo turno, e
o custo cresce com o acervo — ou exige um teto duro que force poda (o caminho do Hermes).

### (b) Índice + tool

Só o índice entra; o corpo vem sob demanda. Custo proporcional ao **número** de memórias, não ao
volume. É o caminho do Compozy. O preço é depender de o agente lembrar de pedir — e o Compozy
compensa isso explicando a taxonomia e os comandos dentro do próprio bloco.

### (c) Destilação em regras

Um job periódico transforma a memória num documento curto que todo agente já lê de graça
(`AGENTS.md`, `CLAUDE.md`). Custo zero de integração. **Está morto para nós** desde a decisão de não
escrever nada dentro do repositório — a não ser na forma do §4 abaixo.

### (d) *Lazy* — o agente pergunta, o sistema responde

Nada é injetado além de uma porta: uma tool (ou CLI) que responde perguntas sobre o conhecimento.
É o fluxo do [graphify](https://github.com/Graphify-Labs/graphify) que você citou: `query`, `path`,
`explain` — o agente pergunta *"como funciona X"* e recebe uma resposta montada na hora, com
orçamento de tokens declarado (`--budget 1500`).

A diferença entre (b) e (d) é sutil e importante:

- em **(b)** o agente recebe uma **lista do que existe** e pede um item pelo nome;
- em **(d)** o agente recebe **uma porta** e faz uma **pergunta em linguagem natural**, e quem decide
  o que é relevante é o sistema.

(d) é mais barato no caso comum, escala para acervo grande, e é o único que funciona bem
**cross-projeto** — porque "o que o `api` promete ao `web`" é uma pergunta, não um item de lista. Mas
tem um buraco: **se o agente não sabe que deve perguntar, ele não pergunta.** Uma tool que ninguém
chama é indistinguível de uma tool que não existe.

---

## 3. O que o ACP muda

Como o Lumem passa a ser o cliente do protocolo, ele controla os dois pontos de entrega:

- **`session/new`** — declara os servidores MCP. É onde a porta do desenho (d) é aberta.
- **`session/prompt`** — o Lumem monta o que vai junto do que você digitou. É onde (a) e (b) entram,
  e ele pode decidir **por turno** o que anexar.

Ou seja: os quatro desenhos são implementáveis, e dá para misturar. A pergunta deixa de ser "o que é
possível" e passa a ser "**qual é o orçamento, e quem decide o que cabe nele**".

---

## 4. O desenho — núcleo, skill e `lumem-memory`

> **Substituiu a proposta original.** A v1 deste arquivo propunha três camadas em que a camada 2 era
> um **índice** de memórias injetado no prompt. O Vinicius trocou isso por uma **skill que ensina a
> usar o serviço** — e a mudança é maior do que parece: o custo fixo deixa de crescer com o acervo.

| Camada | O quê | Como chega | Como o custo se comporta |
|---|---|---|---|
| **1. Núcleo** | **diretriz de comportamento** — o que o agente deve e não deve fazer. Estilo *rules* do Cursor. **Não** conta como as coisas funcionam, **não** fala de outros projetos | injetado sempre | cresce devagar, e é aceitável que cresça: é o que muda comportamento |
| **2. Skill** | ensina **a estrutura da memória** e **como chamar o `lumem-memory`** | injetada sempre | **fixo** — não muda com o tamanho do acervo |
| **3. `lumem-memory`** | o serviço que **é** a memória: guarda, busca, responde, e aprende | chamado sob demanda | por pergunta, não por turno |

A diferença central em relação ao desenho anterior: **nada que cresce com o acervo entra no prompt.**
Antes, cem memórias viravam cem linhas de índice; agora viram zero linhas — o que existe é uma porta e
a instrução de como usá-la.

### 4.1 O núcleo é comportamental, e só

A regra que separa o que entra: *"isto muda o que o agente **faz**"* entra; *"isto explica como algo
**funciona**"* não entra — vira resposta do serviço.

| Entra no núcleo | Não entra |
|---|---|
| "não relaxe teste para passar; conserte o código" | "o gate rápido é `pnpm gate:quick`" |
| "documentação em português, código em inglês" | "o `api` expõe `POST /v2/checkout`" |
| "antes de mexer em migration, pergunte" | "o `web` consome o endpoint de checkout" |

O lado direito não some — ele fica no serviço, a uma pergunta de distância.

### 4.2 `lumem-memory` é um serviço, não um arquivo

Formato indiferente — MCP, HTTP, CLI, ou os três sobre o mesmo núcleo. O que ele é, por dentro, deixa
de ser problema do cliente: pode ser FTS5 hoje, banco vetorial amanhã, grafo depois, sem mexer em uma
linha do que o agente vê. **Essa é a maior vantagem do desenho** — a interface é uma pergunta, e a
implementação fica livre.

E ele tem uma capacidade que nenhuma das quatro referências tem: **auto-learn.** Perguntaram algo que
ele não sabe? Ele pode subir um agente barato, procurar a resposta, **criar a memória** e responder.
O acervo cresce por demanda real, não por palpite de extractor.

---

## 5. O que este desenho cobra

Nada aqui derruba a proposta — são os pontos que precisam de mecanismo para ela não virar armadilha.

### 5.1 Descoberta: a skill ensina a **perguntar**, não diz **o que existe**

Índice tinha um efeito colateral bom: o agente via que a informação existia. Sem ele, o agente só
pergunta o que suspeita que exista — e não pergunta sobre o que não imagina.

Três anticorpos, todos de custo constante:

1. **a skill carrega um mapa, não uma lista** — os *tipos* de conhecimento, os *projetos* do
   workspace, e exemplos de perguntas boas. Tamanho fixo, independente do acervo;
2. **o núcleo carrega a diretiva mínima** — três linhas dizendo que a memória existe e **quando** é
   obrigatório consultar (antes de assumir contrato de outro projeto, antes de repetir uma decisão de
   arquitetura). Diretiva é comportamento, então isso é núcleo legítimo;
3. **medir** (§6): se `chamadas por sessão` for perto de zero, a camada 3 é decoração e o desenho
   precisa mudar.

⚠️ **Um detalhe de mecanismo que decide se isso funciona:** em CLI de agente, skill costuma entrar no
prompt como **nome + descrição curta**, com o corpo carregado sob demanda. Se a skill do
`lumem-memory` só for lida quando o agente resolver ler, a descoberta depende dela ser descoberta —
recursivo. Por isso o item 2 não é opcional: **o núcleo é o que garante que o agente saiba que a
porta existe.**

### 5.2 Auto-learn é escrita automática vestida de leitura

É a parte mais poderosa e a mais perigosa. Uma pergunta passa a **criar memória**, sem você pedir e
sem ninguém revisar no momento.

O que isso exige, e não é negociável:

- **passa pelo mesmo portão** do §7 do PRD — scan, identidade, WAL, git. Sem exceção de origem;
- **proveniência própria**: `source_actor: auto_research`, com **evidência** (o que foi lido para
  concluir aquilo) e `confidence` baixa por padrão;
- **critério de evidência** (decidido na D7): resposta sustentada por artefato verificável — arquivo,
  linha, saída de comando — vira memória direta com a evidência anexada; resposta que é síntese ou
  inferência vira **proposta**;
- **escopo de workspace entra como proposta sempre**, tenha evidência ou não — a regra da
  [Q27](open-questions.md) vale igual aqui, e com mais razão: ninguém revisou;
- **memória auto-criada nasce marcada como não verificada**, e só perde a marca quando é usada e
  confirmada — ou quando você aprova.

Sem isso, o caminho é curto: o agente pergunta, o sistema inventa, a invenção vira memória, e a
memória vira verdade permanente que outro projeto herda.

### 5.3 O agente de memória tem que ter escopo declarado

**Ler os repositórios do workspace é objetivo declarado** (D8), não hipótese — *"os projetos devem ter
algum nível de acesso aos outros projetos"* é o ponto do workspace existir. Mas isso faz do
`lumem-memory` um agente com acesso a disco, cruzando a fronteira do §11 do PRD.

Consequência para a v1: **o funil nasce junto, com a capacidade desligada.** Lista de projetos que ele
pode ler, registro de cada acesso, guarda de caminho igual à da `file-editor`, e **leitura apenas** —
o serviço responde perguntas, não edita repositório nenhum. Construir o funil depois seria retrabalho
no lugar mais sensível do sistema.

### 5.4 Latência, custo e loop

- **orçamento e timeout por pergunta.** A sessão principal fica esperando; uma pergunta que sobe
  agente não pode demorar o que um agente demora;
- **cache por sessão** — a mesma pergunta duas vezes não sobe agente duas vezes;
- **profundidade 1**: o agente de memória **não** chama o `lumem-memory`. Sem isso, existe loop;
- **degradação**: serviço fora do ar ou estourou o tempo → cai para busca lexical pura e **diz** que
  degradou. Nunca trava a sessão.

### 5.5 A resposta precisa citar a fonte

Trocar trecho ranqueado por resposta montada perde o `WhyRecalled` do Compozy — a explicabilidade de
"por que isto apareceu". Recuperar isso é barato: **toda resposta cita as memórias que a sustentam,
por id**, e a UI permite abrir cada uma.

---

## 6. O que precisa ser medido

Continua valendo inteiro, e ficou **mais** importante: com o custo saindo do prompt e indo para
chamadas, medir é a única forma de saber se o sistema está sendo usado.

> **Uma medida que já existe, e recalibra a discussão inteira.** O spike do `acp-sessions` mediu um
> turno trivial ("responda ok") em **39.200 tokens** — 22.708 de escrita de cache e 16.486 de leitura,
> ou seja, o system prompt do próprio Claude Code. **O piso de uma sessão não é nosso.** Um núcleo de
> 2.000 caracteres (~700 tokens) é ~2% disso. Isso não autoriza inchar o núcleo; autoriza parar de
> tratar cada token dele como se fosse o custo dominante — o que dominava a v1 deste arquivo.

| Número | Responde |
|---|---|
| tokens fixos por sessão (núcleo + skill) | quanto **nós** acrescentamos ao piso de ~39k do agente |
| chamadas ao `lumem-memory` por sessão | **o número mais importante.** Perto de zero = a camada 3 é decoração |
| custo e latência por pergunta (com e sem agente) | o auto-learn está caro? está lento? |
| respostas "não sei" ÷ perguntas | o acervo tem buraco — e é o gatilho natural do auto-learn |
| memórias criadas por auto-learn ÷ memórias criadas no total | quanto do acervo o sistema escreveu sozinho |
| sessões que escreveram alguma memória ÷ sessões totais | está aprendendo, ou só lendo? |

---

## 7. As oito decisões (D1–D8)

Todas respondidas. Ficam aqui como registro de por que cada uma ficou assim.

### [x] D1 — O núcleo é montado à mão ou destilado?

**Proposta original:** marcado à mão no v1 (`pinned`), destilação depois de medir.

**R:** Eu acho que uma mistura dos dois, deve ter destilação, mas quem decide se poe ou não o resultado da destilação é o usuário. Deve ter UI para tudo isso.

**Decisão:** os dois, com você no meio. A destilação **propõe** o núcleo; você aceita, edita ou
rejeita, pela UI. É a mesma forma da inbox de propostas do §12 do PRD — e é coerente: o núcleo é o
texto de maior alcance do sistema inteiro, então ele é o último lugar onde faz sentido escrever sem
revisão.

---

### [x] D2 — O bloco vai em todo turno ou só no primeiro?

Só no primeiro preserva o prefix cache e imita o snapshot congelado da [Q11](open-questions.md). Em
todo turno mantém a memória fresca, e quebra o cache toda vez.

**Proposta:** só no primeiro, com uma exceção: quando **você** escreve ou aceita uma memória de núcleo
no meio da sessão, o próximo turno leva o delta — é o gesto *"corrigi o agente e ele já para de
errar"*.

Com o desenho novo isso ficou mais barato de sustentar: o que é injetado é pequeno e muda pouco, então
o cache raramente é invalidado.

**R:** só no primeiro.

**Decisão:** só no primeiro `session/prompt`. Cache preservado, prompt estável.

E o redesenho tirou o preço disso: **só o núcleo é congelado.** O serviço é sempre vivo, então uma
memória escrita no meio da sessão já é encontrável pela pergunta seguinte — o que envelhece é apenas
a diretriz de comportamento, que é justamente a parte que muda devagar. O gesto *"corrigi o agente e
ele já para de errar"* continua funcionando pelo caminho do serviço.

---

### [x] D3 — `lumem_recall` responde com trechos ou com uma resposta montada?

**Resolvida pelo redesenho:** o `lumem-memory` **responde**, e pode subir agente para isso. Trecho
ranqueado continua existindo como o caminho barato e como degradação quando o serviço não pode subir
agente (§5.4).

Duas condições vieram junto: **citar as memórias-fonte por id** (§5.5) e **orçamento por pergunta**.

---

### [x] D4 — Existe uma CLI, além da tool MCP?

**Resolvida pelo redesenho:** *"não me importa o formato — MCP, API, REST, CLI"*. O serviço é um
núcleo com superfícies; a CLI existe, e é a mesma função com o mesmo contrato de erro.

Isso também mantém vivo o caminho degradado da sessão em PTY, que continua existindo como transporte
alternativo.

---

### [x] D5 — Qual é o teto do núcleo?

Mudou de forma com o redesenho: não há mais teto de índice, e o teto por escopo perdeu sentido. O que
resta é **um teto do núcleo** — em caracteres, com falha em vez de truncamento e ocupação visível.

**Proposta:** algo perto dos 2.200 caracteres do Hermes para o conjunto (você + workspace + projeto),
recalibrado com os números do §6. E, como o núcleo é diretriz, estourar é sinal de que virou
documentação — o excedente pertence ao serviço.

**R:** Não sei se faz sentido ter um teto do nucleo, como o nucleo tem diretrizes, roles, e outras coisas não faz sentido ele ter limite e ser cortado no meio, vai perder informação importante.

Para o futuro talvez faça sentido criar uma API (aqui de novo não faz diferença o format, MCP, CLI, API, tanto faz) que forneça os dados, ai o nucleo injeta é um indice, assim o o agente pode chamar quando for fazer alguma coisa que esbarra nesse indice, por exemplo fazer um commit, ai no indice tem uma regra para commit, ai ele busca essa regran antes de fazer commit, uma outra forma de lazy load de roles para otimizar os tokens, mas isso é futuro, agora vamos manter simples.

**Decisão: sem teto no núcleo.** Cortar diretriz no meio é pior do que pagar os tokens — uma regra
truncada não é uma regra menor, é uma regra errada.

**Mas sem teto não pode virar sem medida.** O núcleo é o único texto que entra em toda requisição, e
ele cresce por acréscimo — cada destilação aprovada empurra um pouco. Proposta de mecanismo, que
preserva inteira a sua objeção porque **nunca corta nada**:

- **marca d'água em vez de teto**: o tamanho do núcleo é medido e mostrado, com a variação
  (`4.100 chars · +38% em 30 dias`);
- **alarme, não corte**: passou de um valor que você define, a UI avisa que está na hora de
  consolidar. Consolidar continua sendo decisão sua ([Q30](open-questions.md));
- **teste de fronteira**: o que entra no núcleo tem que ser diretriz. Se for explicação, pertence ao
  serviço (§4.1). Esse é o filtro real — teto é sintoma, não causa.

A sua ideia de futuro — **índice de regras com carregamento sob demanda** ("vou commitar → busco a
regra de commit") — é a saída certa quando o alarme começar a tocar, e é mais elegante que teto. Foi
para o [backlog](../../project/backlog.md), com o gatilho declarado.

---

### [x] ~~D6 — Índice por contagem: quantas linhas?~~

**Dissolvida pelo redesenho.** Não há índice.

---

### [x] D7 — Auto-learn escreve direto ou propõe?

O §5.2 propõe: **projeto** direto, marcado como não verificado e com evidência; **workspace** sempre
proposta. A alternativa mais conservadora é tudo proposta — mais seguro, e transforma cada pergunta
sem resposta numa tarefa sua.

**Proposta:** a do §5.2. Se o volume de auto-criação incomodar, aperta.

**R:** aqui eu acho que depende, se a pergunta for uma questão puramente técnica, que basta olhar em outro repositório para saber como o formato de uma API, ou coisa do tipo, não precisa de validação, o agente tem capacidade para fazer isso bem, mas caso for uma pergunta mais abstrata ai sim precisa de validação.

**Decisão: depende do tipo — e o critério é a evidência, não o assunto.**

Concordo com a distinção, mas "puramente técnica" e "abstrata" são categorias que o sistema não
consegue aplicar sozinho sem chutar. O critério operacional equivalente, e testável:

| A resposta é sustentada por... | Vira |
|---|---|
| artefato verificável — arquivo, linha, saída de comando, definição no código | **memória direta**, com a evidência anexada (caminho + trecho) |
| síntese, inferência, opinião, "eu concluí que" | **proposta** na inbox |

É a mesma linha que você traçou, com um teste que o daemon consegue aplicar: **se o agente consegue
apontar de onde tirou, é fato; se ele conseguiu apenas concluir, é proposta.** Bônus: o critério
carrega a evidência junto, então uma memória direta errada é fácil de contestar depois — o caminho
está lá.

Escopo de workspace continua sendo proposta sempre ([Q27](open-questions.md)), independentemente da
evidência: errar ali contamina N projetos.

---

### [x] D8 — O que o agente do `lumem-memory` pode ler para responder?

Só o acervo de memória (barato, seguro, e responde pouco), ou também os repositórios do workspace
(responde muito mais, e vira um agente com acesso a disco cruzando a fronteira do §11)?

**Proposta:** começa **só no acervo**. Ler repositório entra como capacidade declarada por projeto,
depois, com registro de acesso — porque aí ele deixa de ser "memória" e vira "pesquisador".

**R:** podemos començar com acesso ao acervo, mas é muito importante ele ter acesso a todos os projetos do workspace para o futuro, esse é o objetivo de ter um workspace, os prjetos devem ter algum nível de acesso aos outros projetos.

**Decisão: começa no acervo, e ler os repositórios do workspace é objetivo declarado — não "talvez".**

A diferença entre "talvez um dia" e "objetivo declarado" muda o que precisa ser construído agora: o
funil de acesso cross-projeto do §11 do PRD **nasce junto**, mesmo sem uso, porque adaptar depois é
retrabalho no lugar mais sensível do sistema. O que a v1 entrega é o funil com a capacidade
desligada — e o registro de acesso já funcionando.

Três coisas que esse acesso exige, todas herdadas de código que já existe:

- **guarda de caminho** — a mesma da `file-editor`, com `realpath` e rejeição de symlink que sai da
  raiz;
- **registro de acesso** — quem leu o quê, de qual projeto, respondendo a qual pergunta. É o que
  torna a resposta auditável;
- **leitura, nunca escrita** — o `lumem-memory` responde perguntas; ele não edita repositório nenhum.
