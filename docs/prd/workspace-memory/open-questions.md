# Memória de workspace — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` — a pergunta fica
onde está, agrupada por tema, e ganha uma linha **Decisão:** com o que ficou valendo. Cada pergunta
traz uma **proposta pra reagir**; discordar dela é mais rápido que escrever do zero.

**Estado:** 46 perguntas · **43 respondidas · 3 abertas (Q38, Q39, Q44).** O que resta, além delas, são as
**D2, D5, D7 e D8**, no [context-delivery.md](context-delivery.md).

**Rodada 6 (2026-08-18):** quatro decisões que **a implementação do portão** obrigou a tomar, na
seção J: duplicata por assinatura semântica (Q40), reverter duas vezes alterna (Q41), o scan não
recusa o vocabulário desta própria feature (Q42), e limpar invisível ≠ normalizar para casar (Q43).

**Rodada 5 (2026-08-17):** a revisão da PR 01 abriu duas. A **Q38** veio do `Done when` da T6, que
prometia recusar "escopo inválido **para o tipo**" — matriz que nunca existiu em lugar nenhum do PRD;
o desvio está registrado na [E15](tasks.md#o-que-a-execução-achou). A **Q39** veio de uma sonda do
round 2: o `scope` do frontmatter e o diretório em que o arquivo está podem discordar, e o catálogo
acredita nos dois ao mesmo tempo.

**Rodada 7 (2026-08-18):** a execução da PR 03 abriu a **Q44** — o funil de acesso passou a registrar
toda leitura, inclusive `list`, e ninguém decidiu poda nem índice para essa tabela.

**Rodada 8 (2026-08-18):** a **Q45** nasceu da revisão da PR 04 — os números do ranking (pesos,
meia-vida, limiar de query trivial) e o lugar do índice FTS5 eram decisão de desenho tomada dentro do
código, sem registro em lugar nenhum.

**Rodada 4 (2026-08-17):** Q3.1, Q10, Q16, Q30 e Q37 fechadas. E o desenho de entrega de contexto foi
**redesenhado por você**: índice injetado saiu, entrou *núcleo comportamental + skill + serviço
`lumem-memory` com auto-learn*. O que isso cobra está no §5 daquele arquivo.

**Rodada 1 (2026-08-17):** Q2–Q9 e Q11–Q13 respondidas. Duas viraram documento próprio: a
[Q1 virou o estudo PTY × ACP](../../project/pty-vs-acp.md) e a Q2 criou o
[backlog](../../project/backlog.md). A decisão de **tirar toda memória de dentro do repositório**
(Q3, Q7, Q8) derrubou o §5 do PRD e criou três perguntas novas: Q3.1, Q35 e Q36.

**Rodada 3 (2026-08-17):** dezenove respostas. Duas decisões mudam desenho: **o `~/.lumem` passa a
ser versionado por git pelo próprio Lumem** (Q36, com o [ai-memory](https://github.com/akitaonrails/ai-memory)
de referência) — o que criou a **Q37**, porque agora há dois históricos —, e **a entrega de contexto
virou arquivo próprio** ([context-delivery.md](context-delivery.md)), com o fluxo *lazy* estilo
graphify que você levantou na Q33. A Q3.1 ganhou a regra que faltava: *o que é do repositório é do
time; o que é da instância é do Lumem*.

**Rodada 2 (2026-08-17):** **Q1 fechada em ACP** — a decisão de arquitetura mais cara do projeto, e
a que mais muda este arquivo. Ela dissolve a restrição do §4 do PRD, reordena as fases, e reabre
cinco perguntas que só existiam porque o daemon era cego: **Q19, Q20, Q21 e Q35** estão marcadas com
o que muda em cada uma.

**Tags de origem:** `[cz]` compozy · `[hm]` hermes · `[×2]` levantada pelas duas de forma independente
(sinal forte) · `[lm]` específica do Lumem-OS, sem precedente nas referências.

> As perguntas **Q050–Q066** do [questions.md do projeto](../../project/questions.md) são as mesmas de
> antes da feature existir. Elas continuam válidas; este arquivo as refina com o desenho na mão e
> acrescenta o que só apareceu depois. Quando uma daqui responder uma de lá, anote nas duas.

---

## A. A restrição (nada anda antes destas)

### [x] Q1 — Como o daemon aprende, se ele não vê o que o agente pensa? `[lm]`

A sessão de agente é um `node-pty` rodando um CLI de terceiro. O daemon vê bytes de terminal com
ANSI e spinner — não vê turno, não vê tool, não vê fim de raciocínio. O Compozy resolveu sendo dono
do protocolo (ACP); o Hermes, sendo o agente. Não somos nenhum dos dois. As cinco saídas estão na
tabela do [§4 do PRD](prd.md#4-a-restrição-que-decide-tudo).

**Proposta pra reagir:** **MCP para escrever e buscar + arquivo gerado no checkout para ler**. Hooks
do CLI entram depois, por CLI que suportar. Ler transcript de terceiro e trocar PTY por ACP ficam
fora do v1.

Consequência que precisa de aceite explícito: **captura vira cooperativa** — agente que não chama a
tool não ensina nada.

**R:** Antes de decidir eu quero saber duas coisas, primeiro é o custo de migrar ACP em vez do node-pty, o segundo é pros e contras de cada um desconsiderando a migração.

**Levantado em [project/pty-vs-acp.md](../../project/pty-vs-acp.md)** — as duas perguntas, medidas
contra este repositório. O resumo, para não precisar abrir o arquivo agora:

- **migrar custa menos do que este PRD dizia em transporte e muito mais em tela.** O PTY são ~1.270
  linhas isoladas atrás do `SessionStore` (o §4 deste PRD chamava isso de "reescrever a espinha" —
  está corrigido). O que custa caro é que, com ACP, **o Lumem passa a desenhar a conversa**:
  renderizador de mensagem, cartão de ferramenta, diálogo de permissão, plano, terminal dentro da
  conversa. É uma feature do tamanho da `ui-shell`, substituindo uma tela que já funciona;
- **PTY compra cobertura e velocidade e paga com cegueira; ACP compra entendimento e controle e paga
  com a tela inteira** e com dependência de adaptador de terceiro (`claude-agent-acp` é da Zed, não
  da Anthropic);
- **o daemon já controla `argv` e `env` do spawn** (`agent_config.command/args/env`) — injetar
  contexto no lançamento é possível hoje, sem protocolo nenhum.

A recomendação do arquivo é **não migrar agora e não fechar a porta**: MCP + injeção no lançamento
agora, hooks por CLI depois se doer, e ACP como experimento fechado para um agente. As perguntas
A1–A6 lá dentro são o que falta para fechar esta.

**R (rodada 2):** Migrar para ACP.

**Decisão:** **ACP.** Registrada no [§9 do estudo](../../project/pty-vs-acp.md), contra a
recomendação dele, com o argumento do Vinicius: controle para memória, para consumo de token por
projeto e por feature, e para o que vier depois.

O que isso faz com esta feature:

- **captura deixa de ser cooperativa** — o preço mais duro deste PRD morreu. Fim de turno,
  `tool_call` e `usage_update` chegam sozinhos;
- as tools de memória continuam sendo **MCP**, agora declaradas no `session/new`;
- as fases foram reordenadas (§15 do PRD): as três primeiras são justamente as que **não** esperam o
  ACP, para a memória não ficar bloqueada atrás da maior feature do projeto;
- entra um risco novo, que o spike da feature de ACP tem que medir antes da tela: autenticação por
  assinatura, pool de billing e janela de contexto podem não ser os mesmos do binário oficial
  (§9.2 do estudo).

---

### [x] Q2 — Contrato entre projetos é um tipo de memória ou uma entidade? `[lm]`

*"`api` expõe `POST /v2/checkout`; `web` consome"* pode ser (a) uma memória de workspace tipo
`contract`, texto como qualquer outra; ou (b) uma entidade com projeto-dono, lista de consumidores,
versão, e verificação contra o código.

(b) é o que transforma o workspace de "pasta com memória compartilhada" em algo que nenhum
concorrente tem — e é uma feature inteira, provavelmente maior que esta.

**Proposta pra reagir:** v1 como **tipo de memória com dois campos estruturados** (`owner_project`,
`consumer_projects`), que é barato e já permite a pergunta "o que quebra se eu mudar isto?". Entidade
com verificação fica para um PRD próprio.

**R:** acho que faz sentido. A partir de agora, todas as idéias de features futuras coloque de forma estruturada nas docs, eu quero um lugar que eu possa olhar para ver features futuras que a gente ja comentou, que ficou para depois, com um contexto pequeno só para lembrar.

**Decisão:** contrato é **tipo de memória** com `owner_project` e `consumer_projects`. A entidade com
verificação contra o código foi para o [backlog](../../project/backlog.md), criado nesta resposta —
é lá que toda ideia adiada passa a viver, com uma frase de contexto, de onde veio, e o gatilho que a
traz de volta.

---

### [x] Q3 — Qual é a unidade de identidade estável do workspace e do projeto? `[cz]`

Memória amarrada a `id` de linha do SQLite não sobrevive a recriar o banco; amarrada a path não
sobrevive a `mv`. O Compozy grava um ULID em arquivo dentro do repo e resolve por *nearest enclosing
root*.

**Proposta pra reagir:** ULID em `<repo>/.lumem/project.toml` para projeto, e ULID no diretório do
workspace no servidor. Refina a Q048 do projeto — se ela fechar diferente, esta segue.

**R:** gostei da idéia mas com uma ressalva, não gostaria de guardar a memória do projeto dentro do projeto, isso pode se torna um tipo de conecimento que é do Lumem sobre o projeto, e se o usuário parar de usar o Lumem esse conhecimento vira um monte de arquivo perdido lá, acho melhor guardar as memórias do projeto no lumem por exemplo `~/.lumem/memory/<project>` ou coisa parecida.

**Decisão (vale também para a [Q7](#-q7--memória-de-projeto-vive-dentro-do-repo-czhm-2) e a
[Q8](#-q8--o-que-acontece-com-um-repo-que-você-não-pode-poluir-lm)):** **nenhuma memória vive dentro
do repositório.** Tudo — projeto, workspace, você — fica sob `~/.lumem/`, gerenciado pelo Lumem, com
interface própria. O §5 do PRD foi reescrito.

O argumento que fechou: memória é **conhecimento do Lumem sobre o projeto**, não artefato do
projeto. Largar isso num repo que talvez nem seja seu produz arquivo órfão que ninguém sabe de onde
veio.

**O que se perde, e é preciso saber que se perde:**

| Perdido | Consequência |
|---|---|
| Versionamento por git | não dá para ver "quando essa memória mudou" pelo histórico do repo — quem passa a fazer isso é o WAL da [Q9](#-q9--wal-de-decisões-com-prior_content-e-revert-desde-o-v1-cz) |
| Review em PR | memória errada não morre numa review de código. Morre na inbox, que agora é o único portão |
| Herança pelo time | quem clonar o repo **não** recebe nada. O conhecimento é da sua máquina — ver [Q36](#-q36--se-o-conhecimento-não-vive-no-repo-como-ele-sai-da-sua-máquina-lm) |
| "O conhecimento anda com o repo" | passa a andar com o Lumem. Backup e migração de máquina viram problema real, não teórico |

E ganha-se: repositório limpo, um lugar só para olhar, funciona em repo de cliente, e desinstalar o
Lumem não deixa lixo em lugar nenhum.

---

### [x] Q3.1 — Se nada do Lumem entra no repo, o que identifica o projeto? `[lm]`

Consequência direta da decisão acima. O ULID em `<repo>/.lumem/project.toml` **também** é um arquivo
do Lumem dentro do projeto — pequeno, mas é. Sem ele, restam:

| Chave | Sobrevive a | Quebra em |
|---|---|---|
| caminho absoluto | nada | `mv`, clone em outro lugar, worktree |
| URL do remote | `mv`, re-clone | repo local sem remote, fork, múltiplos remotes, troca de host |
| **hash do primeiro commit** (`git rev-list --max-parents=0 HEAD`) | `mv`, clone, rename, troca de remote | repo sem commit, repo com raízes múltiplas, dois repos que compartilham origem |
| ULID em arquivo no repo | tudo | a sua decisão de não sujar o repo |

**Proposta pra reagir:** **hash do primeiro commit como chave, caminho como atalho de resolução, e
remote como desempate.** Não escreve nada no repositório, sobrevive a mover e a clonar, e o caso
degenerado (repo sem commit) é o mesmo que a `right-panel` já trata em outro lugar.

**R:** meu problema com as configurações dentro do repo é que cada usuário pode rodar o lumem locamente e ter seus workspaces e projetos diferentes, dessa forma o project.toml deve ser universal, e não dizer sobre o projeto na minha instancia do lumem que está na minha maquina, previsa ver aqui o que é universal, por exemplo scripts de setup e run do lumem (feature futura), mas não um ULID que só está referenciando o repositório no meu lumem e não do meu colega que usa o lumem na maquina dele. Dessa forma deve ter alguma forma de controle interno do lumem, onde ele tem os dados do projeto e das worktrees desse projeto, o gerenciamento dessas coisas é da responsabilidade do lumem e não deve ser passada para o repositório como um arquivo de project.toml.

Reforço que o problema não é a existencia do `<repo>/.lumem/project.toml`, é o que tem nele, se forem configurações gerais que uma equipe tem para o lumem ta ótimo, mas se for um ID especifico da instancia do lumem ou qualquer informação que não seja geral não pode estar nesse arquivo.

**Decisão parcial — a regra ficou clara e vale além desta feature:**

> **O que é do repositório é do time; o que é da instância é do Lumem.** Um arquivo dentro do repo só
> pode conter o que faz sentido para **qualquer pessoa** que clone o repo. ID de instância, caminho de
> worktree, escopo de memória e qualquer estado do seu daemon ficam do lado de cá.

Consequências:

- **identidade do projeto é interna ao Lumem**, e não pode depender de arquivo no repo;
- `<repo>/.lumem/project.toml` continua sendo um lugar legítimo — para config **universal** de time
  (script de setup, script de run). Isso é feature futura e foi para o
  [backlog](../../project/backlog.md);
- worktrees, sessões e memória são gerenciadas pelo Lumem, como já são hoje no banco.

**O que ainda falta decidir: qual é a chave.**

> **Procedência da proposta, porque você perguntou.** O hash do primeiro commit **foi proposta minha**
> — não saiu de nenhuma das quatro referências. O Compozy grava um ULID num arquivo commitado; o
> Hermes não tem identidade de projeto nenhuma. Procurando prior art, **não achei nenhuma ferramenta
> conhecida que use o commit raiz como identidade de repositório**. O que existe:
>
> - **git-annex** gera um **UUID por clone** e o guarda dentro do próprio repositório — precedente de
>   "identidade gerada", não de "identidade derivada do conteúdo";
> - ferramentas de verdade **já escrevem estado local em `.git/config`** — neste repositório mesmo há
>   `branch.main.gk-last-accessed` (GitKraken) e `vscode-merge-base`. É lugar aceito para metadado de
>   instância: não é commitado, não aparece para o time;
> - o commit raiz aparece na literatura como **fingerprint** de repositório (inclusive em pesquisa
>   sobre deduplicar clones), sempre com as mesmas ressalvas: repositório pode ter **mais de uma
>   raiz**, fork compartilha a raiz do pai, e em teoria dois commits iniciais idênticos colidem.
>
> Ou seja: a ideia é defensável, mas **não é padrão de indústria**, e eu não devia ter apresentado
> como se fosse.

**Proposta revisada, e ela separa duas coisas que eu tinha juntado:**

| | O quê | Onde vive |
|---|---|---|
| **Identidade** | o ULID do projeto | **no banco do Lumem**, gerado por ele. Nada no repositório, nada derivado do conteúdo |
| **Fingerprint** | commit raiz + URL do remote | atributos da linha, usados só para **reconhecer** um diretório como projeto já conhecido |
| **Resolução de worktree** | `git rev-parse --git-common-dir` | resolve qualquer worktree para o `.git` do projeto-mãe, exato, sem heurística |

Assim: a memória amarra no ULID interno; mover o repositório atualiza o caminho; recriar o banco é o
caso que dói, e é aí que o fingerprint serve — ao reencontrar o diretório, o Lumem pergunta *"este é o
projeto `lumem-os` que eu conhecia?"* em vez de adivinhar.

**Verificado neste ambiente:** `git rev-list --max-parents=0 HEAD` devolve `2a3fff07…` neste
repositório e `836d8e68…` no `lorebase`; e a worktree resolve por `--git-common-dir` para
`~/.superset/projects/lumem-os/.git`. As duas peças funcionam como descrito.

**Se você quiser identidade que sobreviva a recriar o banco sem depender de fingerprint**, a saída sem
sujar o repositório é o precedente do git-annex adaptado: uma chave em **`.git/config`**
(`lumem.projectId`). Não é commitada, o time não vê, sobrevive a `mv` — e morre num `git clone` novo,
que é justamente quando o fingerprint entra.

**R (rodada 2):** eu to começando a repensar minha opinião sobre um ID dentro do project.toml, seria possivel, ao adicionar um projeto a um workspace o lumem ja olhar se o projeto tem um `<repo>/.lumem/project.toml` e se houver um ID nele ja usar esse mesmo ID? Assim a identificação se torna uma caracteristica do projeto, e o Lumem usa essa caracteristica.

**Decisão: sim — o ID vive em `<repo>/.lumem/project.toml`, commitado.** É possível, é simples, e —
o mais importante — **passa na sua própria regra**: um ID que é o mesmo para você e para o seu colega
é uma característica **do projeto**, universal, não da instância. O que a regra proíbe é o inverso:
caminho de worktree, escopo de memória, estado do daemon.

Isso reverte parte da [Q3](#x-q3--qual-é-a-unidade-de-identidade-estável-do-workspace-e-do-projeto-cz)
e **não** reverte o essencial dela: **memória continua fora do repositório**. O que entra é um
identificador, não conhecimento.

#### O fluxo, ao adicionar um projeto

1. o Lumem lê `<repo>/.lumem/project.toml`;
2. **tem ID?** adota. Fim — worktrees e clones do mesmo repo caem no mesmo projeto automaticamente;
3. **não tem?** gera um ULID e **pergunta antes de escrever**. Escrever em repositório alheio sem
   pedir suja a árvore de trabalho, aparece no `git status` de quem não pediu nada, e pode entrar num
   commit por acidente;
4. **você recusa?** o ULID fica só no banco. O projeto funciona igual; só não tem identidade
   compartilhável. É um estado legítimo, não um erro;
5. **você aceita?** o arquivo é escrito **não commitado**, e o Lumem diz o que falta: *"commite este
   arquivo para o time herdar a identidade"*. Quem commita é você.

#### O buraco real, e como fechar

**Fork e template duplicam o ID.** Um fork carrega o `project.toml` do pai; "Use this template" no
GitHub copia tudo. Dois repositórios diferentes passam a afirmar a mesma identidade — e memória
amarrada nela ia se misturar.

Regra: quando um segundo caminho reivindica um ID **já ligado a outro caminho com outro remote**, o
Lumem **pergunta**: *mesmo projeto (clone/worktree) ou fork?* Se for fork, gera ID novo e reescreve o
arquivo. É a mesma pergunta que o fingerprint responderia sozinho — e aqui ela fica explícita, que é
melhor do que adivinhar errado.

O contrário — dois checkouts do mesmo repo na mesma máquina, ou worktrees — cai no **mesmo** ID de
propósito. É o comportamento correto.

#### Prior art (agora tem)

Diferente da minha proposta anterior, esta é **prática comum**:

| Ferramenta | Onde |
|---|---|
| **Expo EAS** | `extra.eas.projectId` no `app.json`, commitado |
| **Firebase** | `.firebaserc` |
| **SonarQube** | `projectKey` no `sonar-project.properties` |
| **Compozy** | ULID em `<root>/.compozy/workspace.toml` — exatamente isto |

#### O que o arquivo pode e não pode ter

| Pode | Não pode |
|---|---|
| `id` do projeto | ID da sua instância do Lumem |
| config universal de time — script de setup, script de run ([backlog](../../project/backlog.md)) | caminho de worktree, caminho de checkout |
| nome canônico do projeto | qualquer coisa sobre memória |
| — | estado, contadores, sessões |

Com o arquivo commitado, o `git log` dele vira a proveniência da identidade: dá para ver quando o
projeto entrou no Lumem e por quem.

**Efeito colateral que vale registrar:** se um colega usar Lumem no mesmo repo, os dois passam a ter a
**mesma chave** para o mesmo projeto. Isso não faz nada hoje — mas é a peça que um dia permite
compartilhar memória de projeto ou de contrato entre instâncias, sem migração. Anotado no
[backlog](../../project/backlog.md).

**Fingerprint continua útil, em papel menor:** commit raiz e remote deixam de ser identidade e viram
**verificação** — é como o Lumem detecta o caso do fork sem depender de você lembrar. 

---

## B. Escopo e taxonomia

### [x] Q4 — A taxonomia proposta fecha? `[cz][hm] [×2]`

`user`, `feedback`, `project`, `domain`, `process`, `contract`, `reference` — mais `playbook` fora da
tabela por não ser memória. O Compozy tem 4 e rejeita o resto na fronteira.

**Proposta pra reagir:** fecha nesses 7 + playbook, validado na fronteira, com escopo default por
tipo como no [§6 do PRD](prd.md#6-taxonomia-proposta).

**R:** por hora faz sentido sim.

**Decisão:** os 7 tipos + `playbook`, **validados na fronteira** — tipo fora da lista é erro, não
campo livre. "Por hora" fica registrado: acrescentar tipo depois é barato; o que não pode é a
taxonomia virar texto livre e o sistema perder a capacidade de decidir escopo sozinho.

**Observação:** Eu disse por hora pois é possivel que o user seja mexido em uma feature futura, os outros eu concordo e não vejo motivos futuros para moficação deles.

---

### [x] Q5 — Existe memória de worktree? `[lm]`

Worktree é onde o trabalho acontece, e é descartável.

**Proposta pra reagir:** **não.** Worktree é execução. O que se aprendeu ali ou vale para o projeto,
ou não vale. E nada aprendido numa worktree descartada vira memória de workspace sem revisão.

**R:** concordo.

**Decisão:** worktree não tem memória. Ela continua sendo **origem** — a proveniência guarda de qual
worktree veio o que se aprendeu —, mas não é escopo de leitura nem de escrita.

---

### [ ] Q38 — Existe escopo **proibido** para um tipo, ou só escopo default? `[lm]`

Levantada pela revisão da PR 01: o `Done when` da T6 dizia "escopo inválido para o tipo é recusado",
e o código não recusa nada — `resolveScope` devolve o escopo pedido, qualquer que seja. A [§6 do
PRD](prd.md#6-taxonomia-proposta) dá **escopo default** por tipo, e ao mesmo tempo diz que `reference`
é "projeto ou workspace", o que sugere mais de um escopo legítimo. Nunca houve a matriz do que é
proibido.

Duas leituras, e elas levam a códigos diferentes:

- **default e nada mais** — o tipo sugere onde a memória nasce, e o chamador que explicita ganha. Um
  `user` em escopo de projeto é estranho, não é erro. É o que está implementado hoje.
- **matriz fechada** — cada tipo declara os escopos em que pode viver, e o resto é `INVALID_ARGUMENT`.
  Fecha a porta para o agente inventar escopo, que é a decisão que o §6 diz que ele mais erra.

**Proposta pra reagir:** matriz fechada, com `contract` preso a workspace (ele é um fato **entre**
projetos) e `reference` valendo em projeto e workspace. O argumento é o mesmo da A9: a taxonomia só
dá ao sistema o direito de decidir escopo sozinho se o espaço de escopos por tipo for conhecido.

**Custo de esperar:** baixo. Enquanto a escrita não estiver exposta a agente (o portão é a PR 02),
quem escolhe escopo é você.

---

### [ ] Q39 — Quando o frontmatter e o diretório discordam sobre o escopo, quem manda? `[lm]`

Achada por sonda durante a revisão da PR 01, e é fato medido, não hipótese:

```
memory/user_x.md com `scope: workspace` no frontmatter
→ reindex: {"indexed":1,"failures":[]}
→ linha:   {"path":"memory/user_x.md","scope":"workspace","workspaceId":""}
```

`rowFor` tira o **escopo** do frontmatter e os **ids** do caminho. Quando os dois discordam, a linha
sai incoerente — escopo de workspace sem workspace — e em silêncio: o `reindex` reporta sucesso. Um
`read` naquele escopo procura em `workspaces/<id>/memory/` e não acha o arquivo que está indexado.

Só acontece com arquivo **editado à mão**, porque o caminho de escrita deriva o diretório do escopo.
Mas editar à mão é a premissa A2, não um acidente.

Três leituras:

- **o diretório manda** — o `scope` do frontmatter é redundante, e o `reindex` o ignora ou o corrige.
  Coerente com o §5 do PRD, que define o caminho **a partir** do escopo;
- **o frontmatter manda** — mover o arquivo de diretório passa a ser consequência, não causa.
  Exigiria o `reindex` mover arquivo, coisa que ele hoje não faz e que a Q3 desaconselha;
- **discordar é erro** — o arquivo entra em `failures[]` com o motivo, e alguém decide. É o que o
  `reindex` já faz com frontmatter inválido.

**Proposta pra reagir:** **discordar é erro**. O `reindex` existe para reconstruir sem adivinhar, e
as outras duas leituras pedem que ele escolha um lado em silêncio — que é como o catálogo passa a
mentir. O `failures[]` já é o canal para "existe arquivo que eu não sei indexar".

**Custo de esperar:** baixo enquanto a escrita não estiver exposta a agente (o portão é a PR 02).
Sobe quando o recall começar a resolver escopo, porque aí a linha incoerente vira resposta errada.

---

### [x] Q6 — Um projeto pode estar em dois workspaces? `[lm]`

Um `design-system` que serve dois produtos. Se sim, a memória de projeto é vista pelos dois
workspaces, e a de workspace por qual? Isso complica o escopo inteiro (é a Q005 do projeto, ainda
aberta).

**Proposta pra reagir:** **1:N no v1** (projeto pertence a um workspace). Se o caso doer, resolve
depois com "projeto referenciado", não com N:N de verdade.

**R:** concordo.

**Decisão:** 1:N. Projeto pertence a um workspace só, e o escopo de memória segue essa árvore sem
exceção. Refina a Q005 do projeto — se ela abrir N:N depois, esta volta junto.

---

### [x] Q7 — Memória de projeto vive dentro do repo? `[cz][hm] [×2]`

Dentro: versionada, revisável em PR, o time herda, e memória errada morre numa review. Fora:
privada, não polui repo de terceiro, e não vaza que você usa agente.

**Proposta pra reagir:** **`project`/`reference`/`playbook` dentro do repo** (`.lumem/`);
**`user`/`feedback` fora** (servidor); **workspace inteiro fora**, porque workspace não existe no git
de ninguém.

**R:** a idéia é a memória ser toda gerenciada dentro do lumem, com algum tipo de interface e coisas do tipo, entõa a memória do projeto eu acho melhor não ficar dentro do projeto.

**Decisão:** fora do repo, sempre — o registro completo, com o que se perde, está na
[Q3](#x-q3--qual-é-a-unidade-de-identidade-estável-do-workspace-e-do-projeto-cz). Consequência que
ainda precisa de resposta: como a memória **chega** no agente sem um arquivo dentro do checkout
([Q35](#-q35--como-a-memória-chega-no-cli-sem-escrever-nada-no-repositório-lm)).

---

### [x] Q8 — O que acontece com um repo que você não pode poluir? `[lm]`

Repo de cliente, ou onde ninguém mais usa Lumem. Um `.lumem/` commitado é discussão que você não quer
ter.

**Proposta pra reagir:** flag por projeto — memória de projeto **espelhada no servidor** em vez de no
repo, com o mesmo formato. O default é dentro do repo.

**R:** acho qeu as anteriores responderam isso.

**Decisão:** a pergunta deixou de existir. Sem `.lumem/` no repo, **todo** repositório é "repo que
não pode ser poluído" — o caso especial virou o caso único, e não há flag por projeto a manter.

---

### [x] Q35 — Como a memória chega no CLI, sem escrever nada no repositório? `[lm]`

O §8 do PRD propunha um bloco gerado dentro do `AGENTS.md`/`CLAUDE.md` do checkout — o caminho mais
barato que existe, porque **todo** CLI de agente já lê esses arquivos de graça. A decisão da
[Q3](#x-q3--qual-é-a-unidade-de-identidade-estável-do-workspace-e-do-projeto-cz) matou isso: é um
arquivo do Lumem dentro do projeto, e ainda por cima um que entra no commit por acidente.

As saídas, todas viáveis hoje porque o daemon controla `argv` e `env` do spawn:

| Caminho | Como | Preço |
|---|---|---|
| **Flag no lançamento** (`--append-system-prompt`, ou equivalente) | o daemon monta o texto e passa na linha de comando | depende de o CLI ter a flag; texto grande em argv é feio mas funciona |
| **Arquivo fora do checkout, apontado por flag/env** | `~/.lumem/context/<sessão>.md` + a flag que o CLI aceitar | nada no repo, e o arquivo é inspecionável |
| **Só MCP** — nada é injetado, o agente busca | uma tool `lumem_recall` e um lembrete no prompt de sistema | mais barato de todos em contexto; depende inteiramente do agente pedir |
| **Arquivo local ignorado** (`CLAUDE.local.md`) | o Lumem escreve, o git ignora | ainda é arquivo dentro do projeto; contraria a decisão, mas é o único que funciona sem flag |

~~**Proposta pra reagir:** arquivo fora do checkout apontado no lançamento~~ — **a decisão por ACP
quase dissolveu esta pergunta.** Com o Lumem sendo o cliente do protocolo, ele monta o prompt: o
bloco de memória vai como prepend no `session/prompt` e as tools vão declaradas no `session/new`.
Nenhum arquivo, nenhuma flag, nenhum repositório tocado.

**O que sobra de pergunta**, e é menor: (1) o bloco entra **em todo turno** ou só no primeiro — o
primeiro é o que preserva cache e imita o snapshot congelado da Q11; (2) o que fazer com sessão que
continuar em PTY, já que `transport` continua sendo coluna. Para essa, a proposta original ainda
vale como caminho degradado.

**R:** pode fazer o proposto.

**Decisão:** com ACP, o Lumem monta o prompt — o bloco de memória vai como prepend no **primeiro**
`session/prompt` (preserva cache, imita o snapshot congelado da Q11) e as tools vão declaradas no
`session/new`. **Nada é escrito no repositório.** Exceção prevista: quando **você** escrever uma
memória no meio da sessão, o próximo turno leva o delta — é a
[D2 do context-delivery](context-delivery.md).

Sessão que continuar em PTY usa o caminho degradado: arquivo em `~/.lumem/context/` apontado por flag
no lançamento, ou só MCP.

---

### [x] Q36 — Se o conhecimento não vive no repo, como ele sai da sua máquina? `[lm]`

Com a memória em `~/.lumem`, o conhecimento deixa de andar com o repositório. Isso significa: outra
máquina sua não tem nada; ninguém do time herda; e um `rm -rf ~/.lumem` apaga tudo o que o sistema
aprendeu, sem o git como rede.

Opções: exportar/importar por comando; um diretório sincronizável (iCloud/Dropbox/git privado seu);
publicar **por ação explícita** um recorte da memória de projeto dentro do repo (o inverso do
default, e só quando você mandar); ou aceitar que é local e resolver com backup.

**Proposta pra reagir:** `~/.lumem` **é um diretório de Markdown versionável por você** — se quiser,
`git init` nele e sincronize; o Lumem não gerencia isso. Mais um `lumem memory export/import` por
escopo, para mover de máquina. Publicar no repo fica no [backlog](../../project/backlog.md), como
ação manual, se um dia o time entrar na conta.

**R:** eu gosto da proposta, mas eu mudaria uma coisa, o `~/.lumem` deve ser versionado via git pelo próprio lumem, como referencia veja https://github.com/akitaonrails/ai-memory lá tem um exemplo disso, a cada mudança faz commit, se isso vai para um repositório remoto como o github é decisão do usuário. Isso mantem histórico na memória.

**Decisão:** **o Lumem versiona o `~/.lumem` com git, ele mesmo.** `git init` no bootstrap, um commit
por mudança aplicada, mensagem derivada da decisão (tipo, escopo, slug, origem). Remoto é opcional e
**seu** — o Lumem nunca dá `push` sozinho.

O [ai-memory](https://github.com/akitaonrails/ai-memory) faz exatamente isso e a divisão que ele usa
vale copiar inteira:

```
~/.lumem/
  memory/      → markdown, VERSIONADO (é o conteúdo)
  playbooks/   → markdown, VERSIONADO
  lumem.db     → SQLite: índice FTS5, WAL, sinais — IGNORADO pelo git
  context/     → blocos montados por sessão — IGNORADO
  _system/     → inbox bruta, DLQ — IGNORADO
```

A regra que separa: **versiona-se o que é fonte da verdade; ignora-se o que é derivado ou efêmero.**
O banco é reconstruível por `reindex`, e commitar binário SQLite a cada escrita seria histórico
ilegível e repositório inchado.

O que isso compra, e é mais do que parece:

- **histórico real da memória**, com `git log` por arquivo — quem, quando, por quê;
- **desfazer** ganha um segundo caminho, independente do WAL: `git revert`;
- **backup e sincronia** viram problema resolvido — `git remote add` e pronto, decisão sua;
- **`git diff` é a revisão** que a decisão da Q7 tirou do PR: a inbox vira a revisão *antes*, e o
  histórico do git vira a auditoria *depois*.

O que ele cobra, e precisa de resposta: sobreposição com o WAL
([Q37](#-q37--git-no-lumem-e-o-wal-de-decisões-se-sobrepõem-quem-guarda-o-quê-lm)), e conflito quando
o mesmo diretório é sincronizado em duas máquinas.

---

### [x] Q37 — Git no `~/.lumem` e o WAL de decisões se sobrepõem: quem guarda o quê? `[lm]`

A [Q9](#x-q9--wal-de-decisões-com-prior_content-e-revert-desde-o-v1-cz) fechou em WAL com
`prior_content` — porque, sem git por baixo, ele era o **único** histórico. A Q36 acabou de colocar
git por baixo. Agora há dois mecanismos de histórico, e manter os dois inteiros é dívida dobrada.

O que cada um faz melhor:

| | Git | WAL |
|---|---|---|
| Histórico do **conteúdo** | é para isso que ele existe | duplicaria |
| Desfazer uma escrita | `git revert` | reaplicar `prior_content` |
| **Por que** aquela escrita aconteceu (origem, sessão, regra que bateu, confiança) | mensagem de commit, e olhe lá | é o forte dele |
| Escrita **rejeitada** pelo scan (que nunca virou arquivo) | não existe no git | fica registrada |
| Retomar escrita interrompida por crash | não ajuda | `idempotency_key` + replay no boot |
| Atomicidade de um lote | não | sim |

**Proposta pra reagir:** os dois, com papéis separados e o WAL **mais magro do que o da Q9**:

- **git guarda o conteúdo e o histórico dele.** O WAL **para de guardar `prior_content`** — passa a
  guardar o SHA do commit anterior. Menos bytes, e uma fonte da verdade só para conteúdo;
- **o WAL guarda a decisão**: origem, sessão, regra que bateu, confiança, `idempotency_key`,
  resultado (`add|update|delete|noop|reject`) e o commit que ela produziu;
- **rejeição e no-op vivem só no WAL**, porque não produzem arquivo — e são exatamente o que você vai
  querer ver quando perguntar "por que isso não foi salvo?".

**R:** Concordo

**Decisão:** os dois, com papéis separados e o WAL **mais magro** do que a Q9 previa:

- **git** guarda conteúdo e histórico. O WAL **para de guardar `prior_content`** e passa a guardar o
  SHA do commit que a decisão produziu;
- **WAL** guarda a decisão: origem, sessão, regra que bateu, confiança, `idempotency_key`, resultado
  (`add|update|delete|noop|reject`) e o commit resultante;
- **rejeição e no-op vivem só no WAL** — não produzem arquivo, e são exatamente o que você vai querer
  ver quando perguntar *"por que isso não foi salvo?"*.

Efeito prático: desfazer tem dois caminhos (`git revert` e o replay do WAL), e a auditoria de "por que
esta memória existe" continua inteira.

---

## C. Escrita

### [x] Q9 — WAL de decisões (com `prior_content` e revert) desde o v1? `[cz]`

Custa uma tabela, um índice parcial e um passo de replay no boot. Dá reversão real, auditoria de "por
que essa memória existe" e recuperação de crash no meio da escrita. O Hermes não tem, e é o buraco
mais visível dele.

**Proposta pra reagir:** **sim, v1.** Sistema que escreve sozinho sem desfazer é sistema que você vai
desligar na primeira vez que ele errar.

**R:** sim.

**Decisão:** WAL desde o v1, com `prior_content`, `idempotency_key`, origem e replay no boot. E ele
ficou **mais** importante depois da Q3: sem o git por baixo, o WAL é o **único** histórico que a
memória tem.

---

### [x] Q10 — Quão agressivo é o scan determinístico? `[cz]`

O Compozy tem ~25 regras e o próprio estudo (§12.6) manda **não** copiar essa régua: rejeitar toda
crase tripla, todo path de repo e a palavra "cron" mata memória legítima o tempo todo.

**Proposta pra reagir:** três categorias só — **segredo/credencial**, **prompt injection**, **Unicode
invisível/bidi**. Mais uma categoria de *anotação* (linguagem de tempo relativo) que não bloqueia.

**R:** eu gosto da idéia, mas eu quero que vc explique melhor ela antes de decidir.

#### O que é o scan, e por que ele existe

É um filtro **de regra**, sem LLM, que roda **antes** de qualquer coisa ser escrita — no portão único
do [§7 do PRD](prd.md#7-o-portão-de-escrita), valendo para toda origem (tool do agente, comando seu,
importação). Ele olha o texto que está entrando e devolve uma de três coisas: `permitir`, `anotar`,
`rejeitar`.

Ele existe por causa de uma assimetria: **memória entra no prompt de toda sessão futura**. Um arquivo
lido pelo agente é lido uma vez; uma memória envenenada é relida para sempre, em todos os projetos do
workspace, até alguém perceber. E o material de onde a memória sai não é confiável — issue de
terceiro, README de dependência, comentário de PR, saída de ferramenta.

O scan **não** é uma fronteira de segurança contra atacante determinado. É um filtro contra
**acidente**: o agente colar um `.env` no que "aprendeu", ou salvar um parágrafo de um README que diz
*"ignore as instruções anteriores"*.

#### As três categorias que bloqueiam

**1. Segredo e credencial.** Padrão de forma, não de conteúdo — prefixo conhecido (`sk-ant-`, `ghp_`,
`xoxb-`, `AKIA…`), bloco `-----BEGIN … PRIVATE KEY-----`, `Authorization: Bearer <alta entropia>`,
linha no formato `CHAVE=<valor de alta entropia>`. Barato, quase sem falso positivo, e é o único
item da lista em que errar para o lado permissivo é catastrófico.

**2. Prompt injection.** Frases que só existem para instruir um modelo: *"ignore previous
instructions"*, *"you are now"*, *"do not tell the user"*, *"system prompt"*, *"disregard the above"*.
Fora de memória isso é texto inofensivo; dentro, é instrução com autoridade de sistema.

**3. Unicode invisível e bidirecional.** `U+200B–200F`, `U+202A–202E`, `U+2066–2069`, `U+FEFF`, tag
characters `U+E0000–E007F`. É a classe **Trojan Source**: o texto lê de um jeito para você e de outro
para o modelo. Aqui a ação certa provavelmente não é rejeitar e sim **limpar** — o caractere não
carrega significado nenhum numa memória legítima.

#### A categoria que só anota

Linguagem de tempo relativo — *"hoje"*, *"essa semana"*, *"agora"*, *"na versão atual"*. Não bloqueia:
gera um aviso pedindo data absoluta, porque memória com data relativa envelhece mentindo. É a regra
do prompt de consolidação do Compozy (*"convert relative dates into absolute dates"*), aplicada na
entrada em vez de na limpeza.

#### O que o Compozy faz e eu proponho **não** copiar

Ele tem ~25 regras e três delas rejeitam material legítimo o tempo todo: **qualquer** bloco de código
(crase tripla), **qualquer** caminho de repositório, e a palavra **"cron"** (na categoria
"persistência"). O próprio estudo marca isso como "não trazer" — memória de projeto legítima cita
caminho e comando o tempo todo. Se essas regras entrarem, entram como **anotação**, nunca como
bloqueio.

#### O que acontece quando bloqueia

- a escrita falha, com motivo tipado (`secret`, `injection`, `invisible_unicode`);
- **o motivo nunca inclui o conteúdo escaneado** — senão o log vira o vazamento que o scan queria
  evitar (regra do Compozy, e é boa);
- a tentativa vira linha no WAL, então "quantas escritas o scan barrou" é dado observável, não
  palpite;
- na inbox, a proposta rejeitada aparece com o motivo, e você pode reescrever à mão.

#### O custo honesto

Falso positivo custa **uma memória perdida em silêncio** se ninguém olhar a inbox — por isso a
contagem de rejeição precisa ser visível desde o começo. Falso negativo custa uma memória ruim que o
portão seguinte (proposta + sua revisão, para escopo de workspace) ainda pega.

**R (rodada 2):** entendi, pode seguir com o proposto.

**Decisão:** três categorias que **bloqueiam** — segredo/credencial, prompt injection, Unicode
invisível/bidi (este limpa em vez de rejeitar) — e uma que só **anota**: tempo relativo. As três
regras do Compozy que matam memória legítima (bloco de código, caminho de repo, a palavra "cron")
ficam de fora, ou entram como anotação. Motivo de rejeição **nunca** inclui o conteúdo escaneado, e
toda rejeição vira linha no WAL para ser contável.

---

### [x] Q11 — A memória vale na sessão atual ou só na próxima? `[cz][hm] [×2]`

As duas referências congelam o snapshot no início da sessão, pelo prefix cache. Mas o gesto que mais
importa é *"eu corrijo o agente e ele para de errar agora"*.

**Proposta pra reagir:** congelado no bloco injetado (cache), **e** a tool de busca sempre lê o estado
vivo. Quem quiser o novo, pede — e o nudge do bloco gerado diz para pedir depois de uma correção.

**R:** Concordo.

**Decisão:** injeção congelada por sessão (preserva o prefix cache), busca sempre viva. A escrita vale
no disco na hora; o que muda de sessão para sessão é só o bloco injetado.

---

### [x] Q12 — Como uma memória é substituída: identidade ou substring? `[hm]`

O Hermes casa por substring única no `replace`/`remove` — frágil depois de algumas edições. O Compozy
casa por par `(entidade, atributo)` e por identidade `(tipo, slug)`.

**Proposta pra reagir:** **identidade `(tipo, slug)`**, com o corpo inteiro substituído. Substring só
como conveniência de edição manual.

**R:** concordo

**Decisão:** identidade `(tipo, slug)`, corpo inteiro substituído. É o que faz o shadow da
[Q31](#-q31--contradição-entre-memórias-como-resolve-lm) e a proveniência (`superseded_by`)
funcionarem — os dois dependem de uma memória ter nome estável.

---

### [x] Q13 — Precisa do desempate por LLM no v1? `[cz]`

O Compozy resolve quase tudo por regra e só chama LLM em ambiguidade genuína, com timeout de 300ms e
fallback `noop`.

**Proposta pra reagir:** **não no v1.** Ambiguidade vira **proposta na inbox** em vez de decisão
automática. Você já é o desempate, e é mais barato que uma chamada.

**R:** concordo.

**Decisão:** sem LLM no caminho de escrita no v1. Regra decide; o que a regra não resolve vira
proposta na inbox. Efeito colateral bom: o portão inteiro fica **determinístico e testável**.

---

## D. Playbooks (procedimento)

### [x] Q14 — Playbook é formato próprio do Lumem, ou o Lumem gera skill no formato de cada CLI? `[hm][lm]`

Claude Code, Codex e Hermes já têm formato de skill. Inventar o nono formato é caro e ninguém mais lê;
gerar no formato de cada um significa manter N geradores e perder o campo que só nós temos (dono,
escopo, uso).

**Proposta pra reagir:** **fonte única no Lumem, projeção por CLI** — o mesmo padrão do §8 do PRD
(bloco gerado dentro de `AGENTS.md`/`CLAUDE.md`). O Lumem escreve `SKILL.md` no diretório que o CLI
lê, a partir do playbook.

**R:** gosto da idéia, pode seguir com ela.

**Decisão:** **fonte única no Lumem, projeção por CLI.** O playbook vive em `~/.lumem`; o Lumem
escreve a projeção no formato que cada CLI lê. Com a decisão por ACP isso ficou mais fácil do que
parecia: os servidores MCP são declarados no `session/new`, então boa parte da projeção pode ser
**tool**, não arquivo. Onde precisar ser arquivo, ele vai para o diretório de skills do CLI, nunca
para o repositório.

---

### [x] Q15 — Playbook e memória são a mesma feature ou duas? `[hm]`

O Hermes prova que são coisas diferentes (custo, ciclo de vida, gatilho). Mas são dois subsistemas —
e a fase 5 do PRD já os separa no tempo.

**Proposta pra reagir:** **duas**, com o playbook depois. E se a discussão mostrar que playbook é a
parte mais valiosa, inverter a ordem é legítimo — mas então diga isso agora.

**R:** Concordo plenamente, pode seguir com o proposto.

**Decisão:** duas features. Memória primeiro (fases 1–5 do PRD), playbook depois (fase 6).

---

### [x] Q16 — Como o Lumem mede o uso de um playbook, se ele não controla o agente? `[lm]`

O ciclo `active → stale → archived` do Hermes depende de contar carregamentos. Nós só sabemos o que
passou pela nossa tool.

**Proposta pra reagir:** conta o que dá para contar — leitura via tool MCP e menção no bloco gerado —
e **assume subcontagem**. Playbook nunca é arquivado por falta de uso sozinho: vira sugestão de poda
na revisão.

**R:** eu não entendi, explica melhor

#### Explicando

O Hermes arquiva skill que ninguém usa. Para isso ele **conta**: toda vez que uma skill é carregada,
um contador sobe num arquivo lateral (`.usage.json`), e o curador olha "última vez usada" para
decidir entre `active`, `stale` e `archived`. Ele consegue contar porque **ele é o agente** — a skill
passa por dentro dele.

A pergunta era: e nós, que não somos o agente, conseguimos contar? A resposta melhorou com o ACP:

| Caminho | Dá para contar? |
|---|---|
| agente chama nossa tool MCP (`lumem_playbook_view`) | **sim**, a chamada é nossa |
| agente carrega uma skill projetada, sem passar por nós | **agora sim** — o adaptador passou a expor chamadas de Skill com nome e tipo (`v0.67.0`), então o `tool_call` chega |
| agente lê o arquivo direto (`read_file`) | chega como `tool_call` com o caminho — dá para inferir |
| você abre o playbook na UI do Lumem | sim |

Ou seja: com ACP a contagem deixa de ser cega. Mesmo assim **é subcontagem** — um playbook pode
influenciar sem ser carregado naquela sessão, e pode ser carregado e ignorado.

**Por isso a proposta é conservadora:** contar, mostrar, e **nunca arquivar sozinho**. Playbook sem
uso há N dias aparece na revisão como *"ninguém carregou isto em 60 dias — arquivar?"*, e você
decide. Uso zera o relógio, como no Hermes.

**R (rodada 2):** gostei da idéia, pode seguir com ela,

**Decisão:** contar o que der (tool nossa, `tool_call` de Skill exposto pelo adaptador ACP, leitura de
arquivo, abertura na UI), assumir subcontagem, e **nunca arquivar sozinho** — playbook sem uso vira
sugestão na revisão, e uso zera o relógio.

---

## E. Captura

### [x] Q17 — Aprender de ações, não só do que foi dito? `[cz]`

É o buraco do Compozy e do Hermes: ambos extraem do transcript. Sinais que temos **de graça**, sem
ver o transcript: você editou por cima do que o agente escreveu (a `file-editor` sabe disso), você
reverteu o commit dele, você matou a sessão em 30 segundos, você descartou a worktree inteira.

**Proposta pra reagir:** **sim, e talvez comece por aqui** — é o único sinal que não depende de
cooperação do agente. Começa registrando o sinal cru, sem interpretar; interpretação vem depois.

**R:** Sim.

**Decisão:** sim, e é o insumo que **não** depende de cooperação nenhuma. Registrar o sinal cru desde
cedo — editou por cima, reverteu, descartou a worktree, matou a sessão em 30s — e interpretar só
quando houver volume.

**O que a S1 fechou ao implementar.** Quatro escolhas que a decisão acima não continha, e que a
revisão da PR cobrou por escrito em vez de deixar viver no código:

| # | Escolha | Por quê |
|---|---|---|
| **Q17.a** | `user_edited_after_agent` é **uma vez por (tipo, alvo, escopo) a cada 5 minutos**, não por gravação | O autosave grava a cada 800 ms de pausa. Um sinal por tique mede cadência de digitação, não "editei por cima dele", e a tabela cresce sem teto |
| **Q17.b** | Só conta **edição feita pelo editor do Lumem** | É o único caminho de escrita que o daemon vê. Editar pelo terminal, pelo Vim ou por outro editor não vira sinal — e isso é limite conhecido, não descuido |
| **Q17.c** | Os **30 s** de `session_killed_early` são fixos, sem configuração | Número sem dado atrás não merece knob. Quando houver volume, o dado é que move o corte |
| **Q17.d** | A varredura de revert roda no **fim de cada sessão de agente**, no checkout dela | Não há gancho para "você reverteu": você reverte por onde quiser. O fim de uma sessão de agente é quando o daemon sabe que houve agente escrevendo ali, e é barato — um `git log` de 200 commits. O preço é a latência: um revert feito hoje só vira sinal na próxima sessão de agente naquele checkout. Reencontrar o mesmo revert não grava de novo |

---

### [x] Q18 — Até onde vai o registro do seu comportamento? `[cz]`

Refina a Q021 do projeto. Quanto mais rico o sinal, mais invasivo. É projeto pessoal, mas o dado fica
no disco e entra em prompt.

**Proposta pra reagir:** só evento estrutural (editou, reverteu, descartou, interrompeu), **nunca**
conteúdo do que você digitou fora do que você mandou para o agente.

**R:** sim.

**Decisão:** só evento estrutural, com alvo e horário. **Nunca** conteúdo do que você digitou fora do
que foi para o agente. É regra de produto, e vira teste.

**A regra é do banco, não de quem chama (S1).** Não bastava não existir coluna de conteúdo: a
afinidade INTEGER do SQLite guarda texto não numérico como TEXT, então `detail` aceitava frase, e
`target` era TEXT sem limite nenhum. Dois `CHECK` fecham isso — `detail` só aceita inteiro, e
`target` só aceita identificador de uma linha, de até 1.024 caracteres. E o que a varredura de
revert devolve é **só SHA**: o assunto do commit é frase que você digitou, e ele vive como variável
local dentro da função, nunca como campo de um objeto que alguém possa gravar.

---

### [x] Q19 — Existe destilação no fim da sessão? Com qual modelo? `[cz][hm] [×2]`

Uma chamada por sessão, com modelo barato, sobre o material disponível. O Hermes roteia o review para
um modelo auxiliar e usa digest quando o cache não serve.

**Proposta pra reagir:** sim, fase 6, com modelo configurável e **desligado por padrão** até o portão
de escrita ter provado que segura.

> **Mudou com a decisão por ACP.** Antes, "fim de sessão" era um evento que o daemon mal conseguia
> detectar. Agora o fim de turno é explícito, e a pergunta fica mais parecida com a do Hermes: o
> passo de destilação roda **por turno** (caro, e foi o item que o estudo do Compozy mandou não
> copiar) ou **por sessão** (barato)? A proposta continua sendo por sessão.

**R:** Vamos começar com **por sessão**, mas no futuro quero deixar isso configurável.

**Decisão:** destilação **por sessão**, com o gatilho configurável desde o desenho (`sessão` no v1,
`turno` como valor previsto). Modelo configurável e **desligado por padrão** até o portão de escrita
provar que segura.

---

### [x] Q20 — O que o daemon consegue destilar, se ele só tem bytes de terminal? `[lm]`

Consequência direta da Q1. Scrollback com ANSI removido é material ruim, e a sessão pode ter durado
horas.

~~**Proposta pra reagir:** destila o que a tool registrou~~ — **a pergunta virou outra.** Com ACP o
daemon tem mensagem, raciocínio, chamada de ferramenta e uso de token, tipados. O problema deixou de
ser *escassez* de material e passou a ser **excesso**: o que de uma sessão de três horas entra no
prompt de destilação?

**Proposta pra reagir:** projeção limitada, como o Compozy faz no checkpoint — os turnos completos,
sem conteúdo de arquivo, sem saída bruta de ferramenta, com o resultado das ferramentas resumido a
`(nome, alvo, sucesso)`. Nunca o transcript inteiro.

**R:** Vamos começar dessa forma, mas eu quero algum jeito de medir essas coisas para entender o que é melhor fazer com o tempo.

**Decisão:** projeção limitada (turnos, sem conteúdo de arquivo, ferramenta resumida a
`(nome, alvo, sucesso)`), **com instrumentação desde o primeiro dia**: tokens que a destilação
consumiu, candidatos gerados, candidatos aceitos pelo portão, candidatos aprovados por você. Os
números moram junto dos do [context-delivery.md §6](context-delivery.md) — é a mesma pergunta
("isto está valendo a pena?") vista dos dois lados.

---

### [x] Q21 — Sub-agente e sessão filha alimentam a memória? `[cz]`

O Compozy diz não taxativamente: só a sessão raiz; sub-agente gera chatter operacional. O Hermes
esconde sessão de subagente até da busca.

**Proposta pra reagir:** **não** para captura automática; **sim** para escrita explícita — se o
sub-agente chamou a tool de propósito, a intenção é dele.

> **Mudou com a decisão por ACP.** A pergunta deixou de ser teórica: o protocolo tem linhagem de
> sessão, então "só a sessão raiz alimenta a memória" passa a ser uma regra **verificável no
> daemon**, e não uma esperança.

**R:** eu concordo.

**Decisão:** captura automática **só da sessão raiz**, verificada pela linhagem do ACP. Sub-agente
escreve se chamar a tool de propósito.

---

## F. Recall

### [x] Q22 — Lexical basta no v1? `[cz][hm] [×2]`

As duas referências são lexicais (FTS5). Determinístico, explicável, de graça. Não acha "deploy"
buscando "release".

**Proposta pra reagir:** **sim**, com a interface plugável. E o índice em `AGENTS.md` cobre a maior
parte do caso real, que é "o agente saber que aquilo existe".

**R:** Sim.

**Decisão:** lexical (FTS5/BM25) no v1, com a interface de recall plugável. Embeddings estão no
[backlog](../../project/backlog.md) com gatilho declarado.

---

### [x] Q23 — Índice, corpo, ou os dois? `[cz][hm] [×2]`

O Compozy injeta só o índice (custo proporcional ao número de memórias) e depende do agente pedir. O
Hermes injeta o corpo inteiro e resolve com teto duro de 2.200 caracteres.

**Proposta pra reagir:** **os dois, por camada** — teto duro e corpo inteiro para o núcleo destilado
(o que cabe no `AGENTS.md`), índice + tool para o resto.

**R:** Isso é uma discussão a parte, vamos falar sobre isso em outro arquivo, escreva um resumo nele que eu vou dar uma olhada e pensar melhor

**→ [context-delivery.md](context-delivery.md), e lá a resposta mudou de forma.** Você trocou o
índice injetado por **núcleo comportamental + skill + serviço `lumem-memory`** — nada que cresce com o
acervo entra no prompt. As quatro perguntas que sobraram lá são a D2, a D5, e as duas que o redesenho
criou (D7: auto-learn escreve direto ou propõe; D8: o que o agente de memória pode ler).

---

### [x] Q24 — Qual é o teto, e por escopo ou total? `[hm]`

O Hermes tem 2.200 chars para memória e 1.375 para o perfil, e a escrita **falha** quando estoura, em
vez de truncar.

**Proposta pra reagir:** teto **por escopo** (workspace, projeto, você), em caracteres, com falha e
com a ocupação visível no bloco. Números a calibrar na fase 2.

**R:** vai pro arquivo da Q23

**→ [context-delivery.md](context-delivery.md).** O redesenho matou o teto por escopo de índice — não
há índice. Sobrou **um teto do núcleo**, em caracteres, com falha em vez de truncamento e ocupação
visível. Número é a **D5**, para calibrar com medição.

---

### [x] Q25 — Recall registra sinal de uso? `[cz]`

O Compozy persiste `recall_count`, `last_recalled_at`, `recall_score` e promove só o que o recall já
validou. É o critério objetivo mais barato de utilidade — e depende de a busca passar por nós.

**Proposta pra reagir:** **sim**, desde a fase 3. É o insumo de toda poda futura, e sem ele a
consolidação vira LLM chutando o que importa.

**R:** Sim.

**Decisão:** sim, desde a fase 2. `recall_count`, `last_recalled_at` e o score do recall são o insumo
objetivo de toda poda e de toda consolidação futura — e são o que ordena o índice quando ele estourar
o teto de contagem ([context-delivery.md D6](context-delivery.md)).

---

### [x] Q45 — Como o recall combina os sinais, e onde vive o índice? `[lm]`

A [Q22](#x-q22--lexical-basta-no-v1-czhm-2) decidiu *lexical com interface plugável* e a
[Q25](#x-q25--recall-registra-sinal-de-uso-cz) decidiu *registrar sinal de uso*. Nenhuma das duas diz
**como somar** BM25, recência e uso, nem onde a tabela FTS5 nasce — e essas escolhas mudam o que a
busca devolve.

**R:** decidido na implementação da PR 04, e registrado aqui para não virar suposição silenciosa.

**Decisão:**

| O quê | Valor | Por quê |
|---|---|---|
| Pesos | `0.7` lexical · `0.2` recência · `0.1` uso | o texto responde à pergunta; recência é desempate; uso diz "já foi útil antes", nunca "responde a isto" |
| Escala do lexical | min–max **sobre os candidatos da busca** | o BM25 do SQLite vai de ~`1e-6` (termo frequente, IDF≈0) a ~`14` (termo raro). Somado cru, ou é ruído perto da recência ou a engole — nunca os três juntos. Saturar (`x/(1+x)`) achatava o topo a ponto de um casamento 3× melhor perder para o mais recente |
| Conjunto que define a escala | 50 candidatos visíveis, **constante** | min–max é **escala**: um conjunto que mudasse com o `limit` faria "mostre mais" trocar o primeiro colocado — e faz, medido. O `limit` não entra na conta dos candidatos, e o teto de 50 vive no **núcleo**, não só no Zod do router: a CLI e a superfície MCP chamam o núcleo direto, e invariante que só existe no schema de um chamador não é invariante |
| O que vai para `best_score` | o **bm25 cru**, não o score | o score é relativo aos candidatos daquela busca, e resultado único tira o teto por construção. Guardar o relativo faria o critério objetivo da poda saturar justamente para memória irrelevante |
| Meia-vida da recência | 14 dias | a curva que o Compozy mediu |
| Saturação do uso | 3 recuperações | acima disso o sinal para de crescer, senão memória velha e muito buscada trava o topo |
| Guarda de query trivial | menos de **2** termos significativos | uma palavra casa com meio acervo; o que volta é ruído com aparência de resposta |
| Termo significativo | ≥ 2 caracteres em `\p{L}\p{N}`, fora da lista de stopwords | o índice é `unicode61` e aceita qualquer alfabeto: cortar em `a-z0-9` fazia `"デプロイ 設定"` e `"api v2"` voltarem como query trivial — a busca dizendo "não busquei" quando o que houve foi falha de tokenização |
| Pesos por coluna do BM25 | `0.0` path · `4.0` name · `3.0` description · `1.0` slug · `1.0` body | o **valor** do peso de `path` é inerte — coluna `UNINDEXED` não guarda termo, e medido no `better-sqlite3` do repo `0.0` e `9.0` dão score idêntico. A **posição** não é: o FTS5 lê a lista por posição e completa o que falta com `1.0`, então passar quatro pesos desloca `name`, `description` e `slug` uma casa — que era o defeito real. Os números são **ordinais**: o que o teste pina é a ordem `name > description > {slug, body}`; as magnitudes são calibração e voltam quando houver acervo para medir. `slug` fica junto do corpo porque é derivado do nome — dar mais a ele seria contar o título duas vezes |
| Onde o índice vive | **fora** das migrations, derivado do catálogo | migration não deriva nada. O preço é que existe banco com catálogo e sem índice (toda instalação anterior à feature), e é por isso que o boot compara as contagens e refaz quando divergem |
| Quem registra o sinal | só o caminho do agente (`recall`, e a CLI com `--session`) | `search` é leitura: se toda chamada registrasse, refetch e retry do cliente inflariam o próprio número que o §6 do [context-delivery](context-delivery.md) quer medir, e o critério objetivo da Q25 passaria a medir o cliente |

E uma armadilha que essa mesma decisão criou, e que custou uma segunda rodada: preencher o índice a
partir do **catálogo** quando ele não existe parecia a saída gentil — só que o catálogo não guarda
corpo, então o índice nasceria mudo para metade das buscas **e com a contagem batendo**, isto é, se
declarando em dia para sempre. O índice ausente agora nasce **vazio e assumidamente atrasado**; quem
preenche é o `reindex`, que lê o disco, e ele roda no boot do daemon e no início da CLI. A busca
carrega `staleIndex` — sinal, nunca recusa: um arquivo ilegível não pode matar a busca inteira.

Uma propriedade do BM25 que vale registrar: em acervo pequeno o IDF **colapsa** — com dois documentos
os dois tiram zero, e o ranking vira recência mais uso. Não é bug, é a matemática; e é a razão de
recência e uso existirem no score desde o primeiro dia.

E o reparo do índice tem lugar certo: o boot do daemon, e o `search` da CLI — não o início de todo
comando. `list` e `read` não leem o índice, e `reindex` **substitui** o catálogo (apaga e reinsere,
sem transação): disparar isso num comando de leitura é escrita escondida, e num banco com arquivo
ilegível é escrita escondida que faz memória sumir da lista.

O que ainda **não** tem call site é o `inject` do §6: quem monta o contexto é a fase seguinte, e é lá
que a sessão passa a ser registrada na injeção. Até lá, `memory_usage` responde "quantas perguntas, de
quantas sessões" — e não "quantos tokens fixos por sessão".

---

## G. Cross-projeto

### [x] Q26 — Ler memória de outro projeto do mesmo workspace: livre, com registro, ou com aprovação? `[cz]`

O default do PRD é **permitido e registrado**. Sem controle, o agente do back lê o front à vontade —
que é metade do ponto do workspace. Com controle, você vira gargalo.

**Proposta pra reagir:** livre para **memória**; funil auditado e fail-closed para **arquivos** do
outro repo. São coisas diferentes e merecem regras diferentes.

**R:** totalmente livre, a memória do workspace deve ser livre para qualquer projeto do workspace.

**Decisão:** **leitura de memória é livre dentro do workspace** — de workspace e de qualquer projeto
dele. É o ponto do conceito de workspace, e restringir seria construir a feature e desligá-la.

Duas coisas continuam **não** cobertas por esta resposta, porque são outra coisa: ler **arquivos** do
repositório vizinho (funil auditado, §11 do PRD) e **escrever** memória de workspace
([Q27](#x-q27--escrever-memória-de-workspace-é-sempre-proposta-cz)).

---

### [x] Q27 — Escrever memória de workspace é sempre proposta? `[cz]`

É a regra que impede um agente de contaminar N projetos. Custa uma inbox e o seu tempo.

**Proposta pra reagir:** **sim, sempre**, para `domain`/`process`/`contract`. `project` continua
direto — erra barato, o repo desmente.

**R:** Sim.

**Decisão:** `domain`, `process` e `contract` escritos por agente entram como **proposta** na inbox.
`project` e `reference` vão direto. Leitura é livre (Q26); escrita para cima é revisada.

**Precisão que a implementação cobrou (PR 03):** a regra vale pelos **dois eixos**, e é a união deles
— cada um sozinho deixa uma porta aberta:

- **por tipo:** os três tipos são proposta em **qualquer** escopo. Só pelo escopo, um agente
  contornaria a regra pedindo `scope: "project"` explícito para um `contract`;
- **por escopo:** escrever em `workspace` ou `global` é proposta em **qualquer** tipo — é o que o §11
  do PRD chama de "escrita para cima é revisada". Só pelo tipo, um `project` gravado com
  `scope: "workspace"` subiria direto.

Sobra indo direto o que esta decisão libera: `project` e `reference` no escopo deles. Enquanto a inbox
da PR 05 não existe, proposta é **recusa com motivo**, registrada no WAL.

---

### [ ] Q44 — Quem poda o registro de acesso? `[lm]`

A PR 03 ligou o registro do funil: **toda** leitura de memória grava uma linha em `memory_access`,
inclusive `list` — e a tela da PR 05 é um chamador de `list` com refetch. A tabela cresce por leitura,
não por escrita, e é a única do sistema com esse perfil. Hoje ela não tem poda, nem índice em
`created_at` (que é por onde o `listAccess` ordena).

Isso não é a mesma pergunta da [Q29](#x-q29--quem-poda-czhm-2): memória é conhecimento, e apagar é
ação sua. Registro de acesso é **prova**, e prova velha vale menos que prova recente — mas prova
apagada não vale nada quando alguém pergunta "quem leu isso no mês passado?".

**Proposta pra reagir:** janela por tempo (90 dias) com poda no boot, índice em `created_at`, e
**nenhuma poda do que foi negado** — a linha negada é a que responde a pergunta que importa quando
algo dá errado. Alternativa mais barata: registrar só acesso **dirigido** (`read`), deixando `list`
fora, e aí a tabela volta a crescer devagar.

---

### [x] Q28 — Um workspace pode misturar repo de cliente com repo pessoal? `[lm]`

Se puder, a fronteira do §11 é a única coisa entre um e outro, e ela é de software.

**Proposta pra reagir:** documentar que **workspace é fronteira de confiança**, não pasta de
organização. Repo que não pode ver o vizinho não entra no mesmo workspace.

**R:** Sim, não tem muito como controlar quais repos estarão no workspace do usuário, se ele misturar pessoal com trabalho é problema dele, não cabe ao Lumem discernir entre os dois.

**Decisão:** **workspace é fronteira de confiança, e a fronteira é sua.** O Lumem não tenta adivinhar
o que pode ver o quê dentro de um workspace. Isso vira uma frase na documentação do produto, não um
mecanismo — e é coerente com a Q26.

---

## H. Poda e consolidação

### [x] Q29 — Quem poda? `[cz][hm] [×2]`

O Compozy não apaga nada — decay é de relevância (score, banner, shadow). O Hermes arquiva por
inatividade medida, nunca deleta.

**Proposta pra reagir:** **memória não é apagada automaticamente**; playbook é **arquivado** por
desuso, com reativação por uso; apagar de verdade é sempre seu, e sempre reversível pelo WAL.

**R:** Concordo, apagar apenas quando pedido diretamente.

**Decisão:** nada é apagado automaticamente. Memória decai em **relevância** (ranking, banner de
frescor, shadow); playbook decai em **estado** (`stale` → sugestão de arquivar, nunca automático,
[Q16](#-q16--como-o-lumem-mede-o-uso-de-um-playbook-se-ele-não-controla-o-agente-lm)). Apagar é
sempre ação sua — e reversível pelo histórico, que agora é git **e** WAL
([Q37](#-q37--git-no-lumem-e-o-wal-de-decisões-se-sobrepõem-quem-guarda-o-quê-lm)).

---

### [x] Q30 — Existe consolidação automática? O que dispara? `[cz][hm] [×2]`

O "dreaming" do Compozy tem portões (24h, 3 sessões, 5 candidatos, score 0.75) que, no uso pessoal,
podem nunca disparar. O curator do Hermes roda por inatividade e tem a passada cara **desligada por
padrão**.

**Proposta pra reagir:** **gatilho explícito** no v1 (um comando, um botão), com observabilidade de
"por que não rodou" quando virar automático.

**R:** não entendi, explica melhor.

#### Explicando

"Consolidação" é uma passada **de manutenção** sobre a memória que já existe. Ela não captura nada
novo: ela pega o que está guardado e **reescreve**. Três coisas, na prática:

1. **mesclar** — cinco memórias que dizem quase a mesma coisa viram uma, melhor escrita;
2. **promover** — algo que era `project` e se provou verdade para o workspace inteiro sobe de escopo;
3. **podar** — o que envelheceu ou foi contradito é marcado ou removido.

É a única etapa do sistema que **mexe no que você já aprovou**. Por isso ela é a mais perigosa: uma
consolidação ruim não acrescenta lixo, ela **estraga o que estava bom**.

As duas referências disparam de jeitos diferentes:

| | Compozy ("dreaming") | Hermes ("curator") |
|---|---|---|
| Gatilho | automático, por portões: ≥24h desde a última, ≥3 sessões novas, ≥5 candidatos não promovidos, score ≥0,75 | inatividade: agente ocioso ≥2h e última rodada há ≥7 dias |
| Critério | **sinal de recall medido** — memória nunca recuperada nunca é promovida | uso da skill (contador) |
| Default | ligado | a passada cara de LLM vem **desligada** |

O risco dos portões do Compozy é ficarem tão estritos que **nunca disparam** em uso pessoal — e você
nunca sabe por quê, porque não há observabilidade de "por que não rodou".

**A pergunta era:** o Lumem começa com gatilho automático ou com você mandando rodar?

**Proposta:** **gatilho explícito no v1** — um comando e um botão. Consolidação é a operação que
reescreve o que você aprovou; ela nascer sob demanda significa que, quando ela errar, você estava
olhando. Quando virar automática, dois requisitos: critério objetivo (o sinal de recall da
[Q25](#x-q25--recall-registra-sinal-de-uso-cz), não palpite de LLM) e uma tela que diga **por que não
rodou** — "faltam 3 candidatos", "última rodada há 4h".

Com o `~/.lumem` em git ([Q36](#x-q36--se-o-conhecimento-não-vive-no-repo-como-ele-sai-da-sua-máquina-lm)),
consolidação fica muito menos assustadora: ela vira **um commit**, e desfazer é `git revert`.

**R (rodada 2):**vamos fazer como vc disse por agora.

**Decisão:** **gatilho explícito** no v1 — comando e botão. Quando virar automático, dois requisitos
inegociáveis: critério objetivo (o sinal de recall da [Q25](#x-q25--recall-registra-sinal-de-uso-cz),
não palpite de LLM) e uma tela que diga **por que não rodou**. Com o `~/.lumem` em git, cada
consolidação é um commit e desfazer é `git revert`.

---

### [x] Q31 — Contradição entre memórias: como resolve? `[lm]`

Duas memórias de workspace se contradizem, ou uma memória de projeto contradiz uma de workspace.
Shadow resolve o segundo caso; o primeiro não.

**Proposta pra reagir:** shadow por identidade resolve o cruzamento de escopo. Contradição **dentro
do mesmo escopo** é bug de curadoria: aparece na inbox como conflito, e você decide. Nada de merge
automático.

**R:** Sim.

**Decisão:** shadow por identidade `(tipo, slug)` resolve o cruzamento de escopo — mais específico
ganha, o perdedor fica no disco e vira evento. Contradição **dentro do mesmo escopo** vira conflito na
inbox, para você decidir. Nunca há merge automático.

---

## I. Produto

### [x] Q32 — Como você sabe que o sistema está aprendendo? `[hm]`

O `journey` do Hermes é a resposta dele. Sem visibilidade, um sistema que escreve sozinho é
assustador — e um que não escreve nada é indistinguível de um quebrado.

**Proposta pra reagir:** linha do tempo + contador honesto ("3 das últimas 10 sessões ensinaram algo")
+ desfazer nó a nó.

**R:** Sim.

**Decisão:** linha do tempo do que foi aprendido + contador honesto + desfazer nó a nó. Com o
`~/.lumem` versionado por git ([Q36](#x-q36--se-o-conhecimento-não-vive-no-repo-como-ele-sai-da-sua-máquina-lm)),
"desfazer" ganha um segundo caminho de graça: `git log` e `git revert` no diretório de memória.

---

### [x] Q33 — Qual é o cenário concreto que prova a feature? `[lm]`

A Q004 do projeto pede isso para o produto todo; aqui é para a feature. Sem um cenário, "memória"
vira obra sem fim.

**Proposta pra reagir:** *"abro uma worktree no `web` e o agente já sabe qual endpoint do `api` está
em pé e o que ele devolve — sem eu contar, e sem ele abrir o outro repo."* Se isso funcionar, a
feature entregou.

**R:** Essa é uma forma de ver, a outra forma pode ser mais "lazy", em vez do lumem injetar tudo de uma vez, pode fazer como o https://github.com/Graphify-Labs/graphify expor uma cli, pode ser comando, ou coisa parecida, que o agente pode perguntar coisas e o graphify responde, o graphify é apenas um exmplo, ele funciona bem para um repositório, não é um exemplo multirepo, estou falando apenas do fluxo.

Aqui entra a discussão da Q23 sobre o que é injetado no agente.

**Decisão:** o cenário de sucesso **não** exige que tudo esteja injetado — exige que o agente
**chegue** à informação sem você contar. As duas formas valem:

> *"abro uma worktree no `web` e o agente sabe — ou descobre perguntando — qual endpoint do `api`
> está em pé e o que ele devolve, sem eu contar e sem abrir o outro repo."*

O fluxo *lazy* do graphify (`query`, `path`, `explain`, com orçamento de tokens por resposta) entrou
no [context-delivery.md §2(d)](context-delivery.md) como um dos quatro desenhos, e a proposta de três
camadas de lá é justamente **injetar o pouco que muda comportamento e deixar o resto atrás de uma
pergunta**. O detalhe que o graphify não resolve — e nós temos que resolver — é o cross-projeto: lá
é um grafo por repositório (com `merge-graphs` para juntar); aqui o workspace **é** a unidade.

Uma observação que vale registrar: se o agente não souber que a porta existe, ele não pergunta. É por
isso que o índice da camada 2 existe — ele é a **propaganda** da camada 3.

---

### [x] Q34 — Esta feature entra antes ou depois de tarefas? `[lm]`

A [vision.md](../../project/vision.md) põe os dois como pilares, e eles se cruzam: "agente cria tarefa
para o outro projeto" é o irmão de "agente ensina o workspace". Tarefas dão um lugar para a proposta
virar trabalho; memória dá o insumo para a tarefa fazer sentido.

**Proposta pra reagir:** **memória primeiro**, porque ela não depende de tarefa e tarefa fica muito
melhor com ela. Mas a inbox de propostas (fase 4) e a fila de tarefas são quase a mesma tela — vale
desenhar as duas juntas mesmo construindo uma.

**R:** memória primeiro.

**Decisão:** memória antes de tarefas. A inbox de propostas (fase 3) e a futura fila de tarefas são
quase a mesma tela — quando a inbox for desenhada, vale desenhar pensando nas duas, mesmo construindo
uma.

---

## J. O que a implementação do portão obrigou a decidir

Quatro decisões que não estavam em pergunta nenhuma e apareceram construindo a PR 02. Ficam aqui
pelo mesmo motivo das outras: decisão de desenho não vira suposição silenciosa.

### [x] Q40 — Duplicata é igualdade de bytes ou de assinatura semântica? `[lm]`

O portão promete `noop` quando a escrita não muda nada ([§7 do PRD](prd.md)). A primeira versão
comparava o **hash do arquivo serializado** — e o arquivo carrega `updated_at`, que muda a cada
escrita. Resultado: duas escritas idênticas produziam hashes diferentes, `noop` nunca disparava, e
cada regravação virava um commit anunciando uma mudança que não existiu.

**Decisão:** duplicata é igualdade de **assinatura semântica** — tudo que o usuário quis dizer (nome,
descrição, tipo, escopo, corpo, proveniência), **sem os carimbos que o sistema põe** (`created_at`,
`updated_at`). É a `entrySignature` do `entry.ts`.

O mesmo raciocínio derrubou a **chave de idempotência**: ela também saía do hash do arquivo, então
duas tentativas da mesma escrita nunca casavam, e o replay pós-crash que a
[Q9](#x-q9--wal-de-decisões-com-prior_content-e-revert-desde-o-v1-cz) promete não tinha como
reconhecer a tentativa anterior. A chave passou a sair da assinatura.

### [x] Q41 — Reverter duas vezes desfaz o revert, ou é idempotente? `[lm]`

`revert` volta pelo git e grava uma **decisão nova**, sem reescrever histórico. Então o segundo
`revert` do mesmo caminho encontra, como commit anterior, o commit que o primeiro produziu — e
desfaz o desfazer.

**Decisão:** **alternar é o comportamento correto**, e não um bug a corrigir. É a semântica de
`git revert`, e o contrário exigiria o portão guardar um estado de "já revertido" que o git não tem.
O que a chave de idempotência garante é outra coisa: **o mesmo ponto, revertido a partir do mesmo
`HEAD`, nunca vira duas decisões** — uma retentativa depois de commit falho continua sendo a mesma
decisão, com o SHA anexado quando o commit enfim acontece.

### [x] Q42 — O scan pode recusar memória sobre o próprio domínio do Lumem? `[lm]`

"System prompt" é vocabulário desta feature: memória legítima sobre como o bloco de memória é
entregue ao agente contém a expressão o tempo todo. A primeira régua bloqueava a expressão sozinha —
exatamente o erro que a [Q10](#x-q10--quão-agressivo-é-o-scan-determinístico-cz) mandou não copiar do
Compozy.

**Decisão:** o que bloqueia é **o verbo imperativo junto** (`ignore|override|reveal|… the system
prompt`). A **menção isolada anota** e fica no rastro da decisão, para revisão barata depois. As
regras do scan ganharam severidade por regra (`block` ou `annotate`) para sustentar isso.

**Limitação aceita:** citar uma frase-gatilho entre aspas — *"nunca escreva 'you are now' em
memória"* — continua sendo recusado. Abrir exceção para conteúdo entre aspas ou crases seria
publicar a evasão junto com a regra. Quem precisar registrar isso reescreve sem a citação literal.

### [x] Q43 — Todo caractere invisível deve ser apagado do texto gravado? `[lm]`

A [Q10](#x-q10--quão-agressivo-é-o-scan-determinístico-cz) decidiu **limpar** invisível em vez de
rejeitar, porque ele não carrega significado numa memória legítima. Só que a faixa enumerada lá
deixava de fora `U+00AD`, `U+2060–2064` e os seletores de variação — e um invisível fora da faixa é
evasão do scan de segredo, não curiosidade tipográfica. Ao mesmo tempo, `U+FE0F` **significa** algo:
é ele que faz `❤️` ser emoji em vez de `❤`.

**Decisão:** separar **limpar** de **normalizar**. O que não significa nada (zero-width, bidi, soft
hyphen, word joiner, tags) é **removido do texto gravado**. Os **seletores de variação** são
removidos apenas da cópia usada para **casar as regras** — o texto gravado continua com eles. Fecha a
evasão sem mudar o que o usuário escreveu.
