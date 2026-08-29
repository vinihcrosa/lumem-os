# PRD — Projeto a partir de uma URL git

> **Status:** especificada, **não construída** — 22 perguntas, todas respondidas
> **Versão:** v0.3 — a v0.1 tinha destino editável e remoção que não tocava no disco ([Q14](open-questions.md), [Q15](open-questions.md)); a v0.2 ainda deixava as worktrees na árvore antiga ([Q20](open-questions.md))
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Sucede:** [file-editor](../file-editor/prd.md)

---

## 1. Objetivo

Hoje só se registra um projeto que **já está no disco**. O [PRD do walking-skeleton](../walking-skeleton/prd.md) diz isso em uma linha: *"Não há clone. O repo já tem que estar no disco."*

Esta feature clona. Você cola uma URL git — GitHub, GitLab, Bitbucket, Gitea, Forgejo, um bare repo num NFS, o servidor da empresa — o daemon clona, registra o projeto e ele aparece na sidebar pronto para cortar worktree.

**A URL não é de um provedor.** Não há API de provedor, não há OAuth de GitHub, não há listagem de repositórios de uma org. O que o Lumem entende é o que o `git` entende: um endereço de transporte. Isso é decisão de escopo, não limitação temporária — §8.

**Critério de sucesso em uma frase:** você cola `git@gitlab.interno.empresa:time/api.git`, vê a barra de progresso, e trinta segundos depois cria uma worktree dele sem ter aberto um terminal.

---

## 2. O que isto muda no que já existe

O caminho de registro, quase nada. O ciclo de vida do projeto, bastante — e essa segunda parte é o §2.1.

| Peça | Hoje | Depois |
|---|---|---|
| `project.add` | valida caminho absoluto, chama `isGitRepo`, resolve a branch default, insere | **inalterada** |
| Registro do projeto | uma rotina, dentro de `project.add` | **a mesma**, extraída para ser chamada também pelo fim do clone |
| `GitService` | cinco famílias de comando via `execFile` bufferizado | ganha um **sexto caminho**, por `spawn`, porque clone é longo e tem progresso |
| Linha do `project` | `path`, `name`, `default_branch` | ganha `remote_url` (anulável, **sanitizada**) e `managed` |
| `project.remove` | remove o registro, nunca toca no disco | **remove o registro e, se o projeto for gerenciado, apaga o diretório** (§2.1) |
| `config.worktreesDir` | `~/.lumem/worktrees` | **deixa de existir**. Vira `workspacesDir`, e as worktrees se mudam para debaixo do projeto (§2.2) |
| `worktreePath(worktreesDir, projeto, nome)` | dois segmentos | **precisa do workspace**, e passa por `projectHome` (§2.2) |
| Visão do projeto | `available`, calculado por requisição | ganha `hasCommits`, calculado do mesmo jeito e pelo mesmo motivo (F6.13) |

O princípio do registro: **clonar é um passo *antes* de registrar, não um segundo jeito de registrar.** Terminado o clone, o que roda é exatamente o código que roda quando você digita um caminho local — mesma validação, mesma resolução de branch, mesma inserção, mesmos erros. Dois caminhos de registro seriam duas definições de "projeto válido", e a segunda envelheceria.

Consequência direta: um clone que termine num diretório que não é raiz de repositório git é recusado no registro, igual a qualquer caminho digitado. O clone não ganha crédito por ter dado trabalho.

### 2.1 Isto reverte um requisito do walking-skeleton

O F2.5 daquele PRD é categórico: remover um projeto tira o registro e **nunca** toca no disco. A [Q15](open-questions.md) reverteu isso para uma classe de projeto:

> *"Se é um repos advindo do git, sim ele deve apagar o repositório, o que é gerenciado pelo Lumem deve ter ciclo de vida bem definido."*

O argumento mudou porque o **dono dos bytes** mudou:

| Então | Agora |
|---|---|
| Todo projeto apontava para um repositório que o usuário já tinha. Apagá-lo seria apagar trabalho que o Lumem não criou | Um projeto clonado tem bytes que **o Lumem escreveu**, num diretório que **o Lumem escolheu** (Q14). Deixá-los para trás não é prudência, é acúmulo silencioso que ninguém vai limpar |
| "nunca toca no disco" era uma regra fácil de explicar | "o que o Lumem gerencia, o Lumem limpa" também é — e é a mesma regra que já governa `~/.lumem/worktrees` |

O que **não** muda, e é o que mantém a regra explicável:

- projeto registrado por caminho continua com o F2.5 intacto: sai do registro, o disco fica;
- worktrees continuam bloqueando a remoção por `ON DELETE RESTRICT` — apagar um clone com worktrees penduradas nele não chega a ser decisão, é impossibilidade;
- apagar exige confirmação que **diz o caminho** que vai sumir.

A palavra "gerenciado" é uma coluna (`managed`), gravada no clone, e não uma dedução a partir de `remote_url != null` ou de o caminho começar com o diretório de estado. Dedução erra em silêncio na primeira vez que alguém mover alguma coisa, e o erro aqui apaga o repositório de outra pessoa.

Ao fechar esta feature, o F2.5 do walking-skeleton é corrigido apontando para cá. Requisito revertido sem registro é dívida de documentação — o precedente é a file-editor, que fez o mesmo com o §5 da right-panel.

### 2.2 E reorganiza o diretório de estado inteiro

A [Q20](open-questions.md) respondeu que as worktrees se mudam junto. O diretório de estado passa a descrever a hierarquia do produto — `workspace > projeto > worktree` — em vez de descrevê-la pela metade em duas árvores paralelas:

```
~/.lumem/workspaces/<workspace>/<projeto>/
                                 ├── repo/                ← o clone (só em projeto gerenciado)
                                 └── worktrees/<nome>/     ← toda worktree, gerenciada ou não
```

**Isto é escopo que vaza, e está dito em voz alta em vez de escondido numa task.** Uma feature de clone acabou mexendo em `config.ts`, em `worktree.create` e numa migração de dados. O que autoriza é a resposta da Q20 — *"o projeto não está em produção, isso não vai quebrar nada"* — e o que a mantém honesta é o F6.12 ser um requisito com nome, e não um efeito colateral de outro.

Duas coisas que a nova árvore obriga:

- **`projectHome` é função de `(workspace, projeto)`, nunca de `managed`.** Projeto registrado por caminho também ganha a pasta: ele não tem `repo/`, porque o repositório dele mora onde o usuário o deixou, mas tem `worktrees/`. Se o cálculo do caminho dependesse de ter sido clonado, haveria dois cálculos, e as regras do §4.4 valeriam só para metade dos projetos.
- **Worktree que se muda precisa de `git worktree repair`.** Ela guarda caminhos absolutos nos **dois lados** do vínculo — o arquivo `.git` dentro dela e o `gitdir` em `<repo>/.git/worktrees/<nome>/` — e um `mv` invalida só o segundo. Medido, não suposto: o checkout movido continua respondendo `git status`, porque o `.git` dele aponta para um repositório que não se moveu. O que quebra é o lado do repositório, que passa a listar uma worktree que não está mais lá — e um `git worktree prune`, que o git roda sozinho em várias operações comuns, apaga a administração dela. Aí ela quebra de vez, longe do movimento que a quebrou. É o único detalhe desta mudança que, esquecido, corrompe dado.

---

## 3. Forma

Um campo, colado, e o daemon decide o que é:

```
┌─ adicionar projeto ────────────────────────────────┐
│                                                    │
│  Caminho ou URL                                    │
│  ┌──────────────────────────────────────────────┐  │
│  │ git@gitlab.interno.empresa:time/api.git      │  │
│  └──────────────────────────────────────────────┘  │
│  ↳ clonar de gitlab.interno.empresa via ssh        │
│                                                    │
│  Nome    api                                       │
│  Vai em  ~/.lumem/workspaces/pessoal/api/repo [⧉]  │
│                                                    │
│              [ clonar ]  [ cancelar ]              │
└────────────────────────────────────────────────────┘
```

**"Vai em" não é campo — é resposta.** A [Q14](open-questions.md) tirou a escolha do destino: o lugar é calculado a partir do workspace e do nome. O caminho aparece porque a pessoa precisa saber onde os bytes vão cair, e é copiável (`⧉`) porque ela vai querer abrir aquilo em outra ferramenta. Editar, não.

E, enquanto clona, na própria sidebar — não num modal, porque o clone dura minutos e o modal prenderia a tela inteira:

```
▾ projetos
    lorebase              12 worktrees
    api        ▓▓▓▓▓▓░░░░  61%  recebendo objetos   [✕]
```

Quatro coisas que a forma decide:

1. **Um campo, não dois modos.** Caminho de projeto já é obrigatoriamente absoluto (`pathSchema` exige), então qualquer coisa que não comece com `/` ou `~` é URL. A linha `↳` diz, em português, o que o daemon entendeu — é ela que impede que a detecção seja mágica.
2. **O progresso mora na sidebar**, no lugar onde o projeto vai nascer. Fechar o diálogo não cancela nada; recarregar a página não perde nada (`project.cloneJobs`).
3. **Cancelar é botão de primeira classe.** Clone de repositório grande em rede ruim é o caso comum de arrependimento.
4. **Um clone por vez** ([Q17](open-questions.md)). Enquanto um roda, o botão diz qual é, em vez de enfileirar em silêncio.

### Desenho antes de React

Mesmo processo das quatro features anteriores (skill `ui-design-prototype`): protótipo HTML+CSS sobre o mesmo `tokens.css`, verificado por renderização, antes de qualquer componente. Arquivo: `packages/web/prototype/lumem-clone.html`.

Estados que o protótipo tem que mostrar, porque são eles que o desenho erra (nove, e sete não são o caminho feliz):

1. campo com caminho local — o `↳` diz "registrar o repositório em …", e nome e destino somem;
2. campo com URL reconhecida — os três estados do `↳` (https, ssh, file), com **"sem TLS"** escrito no caso `http`;
3. campo com URL **recusada** (`ext::`, `ftp://`, `git://`) e o motivo escrito;
4. clonando, com as quatro fases nomeadas em português;
5. **falha de autenticação** — a mais frequente que existe, e a única com fluxo próprio (F6.10): as duas saídas nomeadas, e o botão que converte a URL `https` para `ssh`;
6. falha genérica, com o texto do git, dispensável mas não sumindo sozinha;
7. concluído com **nome ajustado** por colisão (F6.4);
8. **confirmação de remoção de projeto gerenciado**, com o caminho que vai sumir — a tela nova que o §2.1 criou, e a mais perigosa das nove;
9. **projeto sem nenhum commit** no diálogo de criar worktree, explicando por que ainda não dá (F6.13) — a tela que o §2.2 trouxe de carona.

---

## 4. Segurança

Esta é a maior seção do documento pelo mesmo motivo que ela era grande na [file-editor](../file-editor/prd.md): a superfície nova é a perigosa. Ali o daemon passou a **escrever** no disco. Aqui ele passa a **executar rede a partir de uma string que o usuário cola** — e, desde a [Q15](open-questions.md), a **apagar diretório**.

E o agravante conhecido continua valendo: o daemon **não tem autenticação** (P2 da file-editor, [Q7](../file-editor/open-questions.md)). Tudo abaixo é escrito supondo que quem alcança a porta pode chamar a procedure.

### 4.1 A URL

Três checagens, nesta ordem, antes de qualquer processo nascer:

| # | Regra | Por quê |
|---|---|---|
| **U1** | Esquema em lista de permissão: `https`, `http`, `ssh`, `file`, mais a forma scp (`user@host:caminho`). **`git://` fora** ([Q11](open-questions.md)) | O git aceita `ext::<comando>` como transporte, e isso é **execução de comando arbitrário** com uma string colada. Lista de bloqueio erraria; lista de permissão não |
| **U2** | Nenhum byte de controle, nenhum `\n`, `\r` ou `\0`; a URL não começa com `-` | `-` vira opção. E `--upload-pack=<cmd>` também é execução de comando |
| **U3** | Host presente e não vazio para `https`/`http`/`ssh`; caminho absoluto para `file` | URL sem host cai em heurística do git, e heurística é onde `file://` vira caminho relativo |

`http` e `file` estão na lista com ressalva escrita ([Q10](open-questions.md), [Q12](open-questions.md)): são os dois primeiros a serem desligáveis quando a configuração de transportes existir ([Q22](open-questions.md)). Enquanto ela não existe, a lista é uma linha de código — e é por isso que cada teste de recusa cita a pergunta que a decidiu.

Cinto e suspensório no argv, mesmo com U1–U3 passando:

```
git -c protocol.allow=never \
    -c protocol.https.allow=always \
    -c protocol.http.allow=always \
    -c protocol.ssh.allow=always \
    -c protocol.file.allow=always \
    clone --progress --no-recurse-submodules -- <url> <destino-temporário>
```

- `protocol.allow=never` fecha tudo que a lista de permissão não abriu — inclusive o que um **redirect** de um servidor https tentar abrir depois que o processo já começou. U1 valida o que você colou; isto valida o que o servidor responde.
- `--` separa opções de argumentos. U2 já garante que a URL não começa com `-`; as duas defesas custam um token de argv.
- `--no-recurse-submodules` é explícito, embora seja o default: a URL de um submódulo vem do `.gitmodules` do repositório remoto, ou seja, **de quem controla o repositório, não de quem colou a URL**. Mesma classe de problema que U1 fecha, com um dono diferente ([Q16](open-questions.md)).

### 4.2 O processo nunca pergunta nada

Um daemon não tem a quem perguntar. Toda pergunta interativa vira processo pendurado até o timeout, e um timeout é mensagem de erro pior que a verdadeira.

| Variável | Valor | Fecha o quê |
|---|---|---|
| `GIT_TERMINAL_PROMPT` | `0` | usuário/senha no terminal. **Já existe** em `exec.ts` |
| `GIT_ASKPASS` e `SSH_ASKPASS` | `""` | o diálogo gráfico de senha, que apareceria na tela de quem estiver no Mac, sem contexto nenhum |
| `GIT_SSH_COMMAND` | o valor que já houver, ou `ssh`, **acrescido de** `-o BatchMode=yes` | a pergunta `Are you sure you want to continue connecting?` de host desconhecido, e a de passphrase |

`BatchMode=yes` não afrouxa a verificação de host: ela continua sendo a do `known_hosts` do usuário. Só troca *perguntar* por *falhar dizendo*. É a diferença entre um clone pendurado e a frase "o host gitlab.interno não está no seu known_hosts".

O `GIT_SSH_COMMAND` é **composto**, não sobrescrito, porque quem usa git server self-hosted frequentemente já tem um ali com `-i` e `-p`.

### 4.3 A credencial

O Lumem **não guarda credencial nenhuma** ([Q13](open-questions.md)). Não há campo de token, não há keychain, não há linha de segredo no SQLite. As credenciais são as **da máquina**, herdadas porque o daemon roda como o usuário:

| Como | Funciona porque |
|---|---|
| URL ssh com chave no `ssh-agent` | o daemon herda `SSH_AUTH_SOCK` |
| URL https com `credential.helper` (osxkeychain, libsecret, `gh auth`) | o helper responde sem terminal, que é o caso que `GIT_TERMINAL_PROMPT=0` preserva |
| URL https pública | não pede nada |

O que **não** funciona: https privado sem helper. E a Q13 é explícita sobre o que fazer nesse caso — falhar, e ter **fluxo próprio** para a falha. Vira o F6.10, e não é detalhe de UI: sem ele, "não guardamos token" seria beco sem saída para quem clona repositório privado por https.

**Se mesmo assim vier credencial embutida na URL** (`https://usuario:token@host/org/repo.git`), ela é usada para clonar e **nunca sobrevive ao processo**:

- `remote_url` guarda a URL **sanitizada**, sem o `userinfo`;
- o `git remote set-url origin <sanitizada>` roda logo após o clone, senão o token fica em `.git/config`, em texto puro, dentro do repositório — que é o pior lugar possível, porque é o que o agente lê;
- toda mensagem de erro, toda linha de log e todo campo do job passam pelo mesmo `sanitizeGitUrl` antes de existir.

O ponto do terceiro item: o segredo não pode ter **um** ponto de escape. Ou ele é apagado na fronteira, ou vaza pelo lugar que ninguém lembrou.

### 4.4 O destino, que o servidor calcula

A [Q14](open-questions.md) mudou a natureza desta seção. Na v0.1 o destino vinha do cliente e estas regras existiam para conter uma string hostil. Agora o destino é **calculado pelo servidor** a partir de dados que ele já tem:

```
projectHome = ~/.lumem/workspaces/<workspace>/<projeto>
destino     = projectHome/repo
```

O segmento do workspace não estava na resposta da Q14 e é obrigatório: `project_name_per_workspace` é índice único **por workspace**, não global. Dois workspaces podem ter, legitimamente, um projeto `api`, e `~/.lumem/workspaces/api` os faria colidir no disco.

O segmento `repo/` vem da [Q20](open-questions.md): `worktrees/` é irmão dele, e o repositório não pode ser a raiz de uma pasta que também guarda outra coisa.

As regras continuam existindo, com outro papel — deixam de defender contra ataque e passam a defender contra **erro do próprio daemon**, que é a categoria de bug que apaga diretório errado:

| # | Regra | Por quê continua |
|---|---|---|
| **D1** | Absoluto, normalizado, derivado de `stateDir` | um `stateDir` vindo de `LUMEM_STATE_DIR` ainda é entrada externa |
| **D2** | Não existe, **ou** existe vazio | resto de clone anterior, ou projeto removido do registro sem o disco ter sido limpo |
| **D3** | O pai existe e é diretório | `~/.lumem/workspaces/<workspace>` é criado pelo daemon, e criar é diferente de supor |
| **D4** | Não está dentro de repositório git existente | repositório aninhado é armadilha: o `git status` do de fora passa a mentir |
| **D5** | Não colide com `projectHome/worktrees` | são irmãos na mesma pasta desde a [Q20](open-questions.md), e um clone na raiz do `projectHome` engoliria o outro |
| **D6** | O caminho real do pai é resolvido com `realpath` antes de tudo | simbólico apontando para fora é a mesma evasão que a `path-guard` já fecha |

Os segmentos `<workspace>` e `<projeto>` são **slugificados** antes de virar caminho: só `[A-Za-z0-9._-]`, sem `.` nem `..` sozinhos, sem vazio. Nome de workspace e de projeto são texto livre que o usuário digita — a barra num nome não pode virar diretório.

### 4.5 O que o remoto diz aparece na sua tela

As linhas `remote: …` do progresso são **texto controlado pelo servidor**. Elas vão para a UI. Portanto:

- passam por remoção de ANSI e de bytes de controle antes de virar campo do job;
- são truncadas em 500 caracteres por linha;
- o buffer retido é um anel de 64 KiB — um servidor hostil que despeje um gigabyte de `remote:` encontra um teto, não a memória do daemon;
- são renderizadas como texto, nunca como marcação.

### 4.6 Apagar diretório

Superfície nova, criada pelo §2.1, e a de consequência menos reversível do documento inteiro. Cinco regras:

| # | Regra |
|---|---|
| **A1** | Só apaga com `managed = true` — coluna, não dedução |
| **A2** | Só apaga o que estiver **dentro** de `~/.lumem/workspaces`, verificado por `realpath` com separador no momento de apagar, e não pelo que a linha do banco diz |
| **A2.1** | Apaga `projectHome/repo`; e então apaga `projectHome` **se ele tiver ficado vazio**. Nunca apaga um `projectHome` que ainda tenha alguma coisa dentro — o que sobrou é sinal de que algo não foi contabilizado |
| **A3** | Nunca segue symlink: um `path` que virou link é motivo de recusa, não de travessia |
| **A4** | Worktrees e sessões rodando continuam bloqueando, **antes de qualquer `rm`**. E isso exigiu uma checagem própria: o `ON DELETE RESTRICT` dispara no `DELETE`, que roda **depois** de o diretório já ter sido apagado. Confiar só na chave estrangeira aqui seria apagar primeiro e recusar depois |
| **A5** | Confirmação **diz o caminho**, e o registro sai só depois de o diretório sumir — a ordem inversa deixaria bytes órfãos sem nome |

A A2 é a que carrega o peso: ela é a diferença entre "apago o que a linha manda" e "apago o que eu provo que é meu".

Projeto **não** gerenciado passa pela mesma rotina e ela não apaga repositório nenhum — o dele está fora da árvore. O que pode acontecer é o `projectHome` vazio ser recolhido pela A2.1, que é limpeza de andaime do próprio Lumem, e não o F2.5 sendo afrouxado.

### 4.7 O que continua aberto, e é dito aqui para não ser esquecido

| Risco | Estado |
|---|---|
| Daemon sem autenticação, agora com procedure que faz rede, escreve **e apaga** | **P2 da file-editor, ainda aberta.** Esta feature *amplifica* a dívida duas vezes e não a paga. É ela também que segura a [Q22](open-questions.md): configuração de segurança atrás de porta aberta protege contra engano, não contra ataque |
| `file://` permite clonar qualquer repositório legível pelo usuário; `http://` para IP interno é primitiva de sondagem de rede | aceitos na v1, com desconforto registrado ([Q10](open-questions.md), [Q12](open-questions.md)) e prazo: são os dois primeiros a desligar na [Q22](open-questions.md) |
| Clone enche o disco | sem cota na v1. Existe cancelar e o detector de estagnação |
| Conteúdo hostil no checkout | hooks **não** vêm no clone e filtros de `.gitattributes` precisam de config local, então a superfície é a do próprio git. A mitigação é o git do sistema estar atualizado |

---

## 5. O clone é um job, não uma chamada

Um `git clone` de repositório real leva de segundos a muitos minutos. Isso derruba três premissas do que existe hoje:

| Premissa de hoje | Por que quebra |
|---|---|
| `DEFAULT_GIT_TIMEOUT_MS = 30_000` | mata um clone legítimo aos trinta segundos |
| `execFile` bufferizado | não há progresso a mostrar enquanto o buffer não fecha |
| Mutation tRPC devolve o resultado | a conexão HTTP não é o lugar de esperar quatro minutos, e um F5 perderia o acompanhamento |

Então: `project.clone` **começa** um job e devolve o job. O acompanhamento é outra coisa.

### O job

```ts
type CloneState = "cloning" | "registering" | "done" | "failed" | "cancelled";
type ClonePhase = "connecting" | "counting" | "compressing" | "receiving" | "resolving" | "checkout";
/** `auth` é o único discriminado, porque é o único com fluxo próprio (F6.10). */
type CloneFailure = "auth" | "network" | "refused" | "git" | "internal";

interface CloneJob {
  id: string;
  workspaceId: string;
  /** Sanitizada. Nunca a que foi digitada, se ela tinha userinfo. */
  url: string;
  targetPath: string;
  name: string;
  state: CloneState;
  phase: ClonePhase | null;
  /** 0–100, ou null quando a fase não tem porcentagem. */
  percent: number | null;
  /** A última linha do git, limpa e truncada. É o que a UI mostra por extenso. */
  message: string | null;
  /** Preenchido quando `state` é `failed`. */
  failure: CloneFailure | null;
  /** Preenchido no `done`. */
  projectId: string | null;
  startedAt: number;
  updatedAt: number;
}
```

**Em memória, não no SQLite** ([Q4](open-questions.md)). Um job não sobrevive a um restart do daemon pelo motivo mais simples possível: o processo filho também não sobrevive. Persistir o job criaria uma linha que afirma "clonando" sobre um processo que não existe — a mesma classe de mentira que `available` evita ao ser recalculado em `project.ts`. O que o boot faz é varrer o **lixo no disco** (F6.7).

**Um de cada vez** ([Q17](open-questions.md)). Enquanto houver job em `cloning` ou `registering`, `project.clone` responde `BLOCKED` nomeando o que está rodando. Sem fila: fila é estado a mais, tela a mais e ordem a mais para explicar, tudo para um caso que não acontece.

### O progresso

Assinatura dedicada, `project.cloneProgress(jobId)`, e não o fluxo `events.onChange`.

O `events.ts` tem doutrina escrita: *"o evento diz qual lista está velha, não qual é o novo conteúdo"*. Progresso é o oposto — fluxo de dados, dez atualizações por segundo, sem lista para invalidar. Pelo canal grosso, seria um refetch por tique, para todo cliente conectado, por causa de um clone que só um deles pediu.

Fluxo próprio, com **estrangulamento de 250 ms**, e o estado terminal emite também `project.changed` no canal comum — que é onde a sidebar já sabe escutar.

### Estagnação e cancelamento

- **Sem timeout total.** Um monorepo de 4 GiB numa rede de hotel é lento, não travado.
- **Com timeout de silêncio:** 120 s sem uma linha de progresso do git mata o processo. Pega DNS pendurado, TCP que não fecha, servidor que aceitou a conexão e sumiu — sem punir quem é só lento.
- **Cancelar** manda `SIGTERM`, espera 5 s, manda `SIGKILL`, e só então apaga o temporário. Matar sem esperar deixa o git no meio de uma escrita de packfile.

### Atomicidade

Mesma regra do §8 do walking-skeleton, *"uma criação que falha não registra nada"*, aplicada a um passo que agora dura minutos:

1. clona para `<pai>/.lumem-clone-<jobId>` — irmão do destino, portanto no mesmo filesystem;
2. terminado o clone, `rename()` para o destino final — atômico, e é o instante em que o diretório passa a existir para quem olha;
3. registra, pelo mesmo caminho do `project.add`, com `managed = true`;
4. se **3** falhar por algo que não seja colisão de nome (F6.4), o diretório recém-renomeado é apagado e o job vai a `failed`.

Falhou em **1** ou foi cancelado: o temporário some. É a única coisa que fica no disco entre o começo e o fim, e o nome começa com `.lumem-clone-` justamente para a varredura de boot reconhecê-lo.

---

## 6. Requisitos funcionais

### F6.1 — Reconhecer o que foi colado

O campo aceita as duas coisas. É caminho local se começa com `/` ou `~`; é URL caso contrário. O cliente mostra o que foi entendido antes de qualquer ação; o servidor decide de novo, sozinho, porque a decisão do cliente não é confiável.

| Forma | Exemplo |
|---|---|
| `https://` / `http://` | `https://github.com/vinihcrosa/lorebase.git` |
| `ssh://` com porta | `ssh://git@git.empresa:2222/time/api.git` |
| scp | `git@gitlab.com:grupo/sub/projeto.git` |
| `file://` | `file:///Volumes/nfs/espelhos/api.git` |

### F6.2 — Recusar o resto, dizendo qual regra falhou

Igual ao F2.2 do walking-skeleton, que é explícito: *"caminho inválido" não é resposta*. `ext::sh -c id` recusa por esquema fora da lista; `git://` idem, e a mensagem diz **por quê** ele não está lá, porque é o único recusado que o usuário poderia razoavelmente esperar que funcionasse.

### F6.3 — Nome proposto e editável; destino calculado e mostrado

Nome padrão é o último segmento do caminho da URL, sem `.git`; editável antes de começar. O destino é `~/.lumem/workspaces/<workspace>/<projeto>/repo`, **calculado, exibido e copiável — nunca digitável** ([Q14](open-questions.md)). Mudar o nome muda o destino à vista, o que é a forma honesta de dizer que os dois são a mesma decisão.

### F6.4 — Colisão de nome não joga o clone fora

O nome é checado contra o workspace **antes** de começar. Se ainda assim colidir na hora de registrar — outro cliente registrou nesses quatro minutos — o projeto é registrado com sufixo `-2`, `-3`, e o job diz isso por extenso: *"o nome api já existia; registrado como api-2"*.

Como o nome é o diretório, o sufixo move os bytes junto. O `rename` final usa o nome resolvido logo antes dele, então o caso comum não move nada duas vezes — **mas a corrida de verdade é mais tarde do que este parágrafo supunha**: ela vai da última resolução até o `INSERT`, e quem perde ali já tem o diretório no lugar. Aí o registro pega o próximo nome livre e move os bytes uma vez a mais. Medido na implementação, não previsto no desenho.

### F6.5 — Progresso com fase nomeada em português

`conectando`, `contando objetos`, `comprimindo`, `recebendo objetos`, `resolvendo deltas`, `preparando arquivos`. Porcentagem quando o git dá uma; barra indeterminada quando não dá.

### F6.6 — Cancelar a qualquer momento

Enquanto `cloning`. Depois de `registering`, não: o disco já tem o repositório e o que falta é uma linha em SQLite. O botão some, em vez de mentir.

### F6.7 — O boot varre o que o clone deixou

`reconcileClones` remove todo diretório `.lumem-clone-*` sob `workspacesDir`. Roda junto de `reconcileWorktrees`, e reporta quantos removeu — pelo mesmo motivo daquela: o daemon não é a única coisa que mexe nesses diretórios.

### F6.8 — A origem e a gerência ficam registradas

`project.remote_url`, anulável e sanitizada: nulo significa "registrado por caminho, sem origem conhecida". E `project.managed`, booleana: verdadeiro só para o que o Lumem clonou dentro da própria árvore.

`remote_url` não é decoração — é o primeiro dado que a [Q291 do questions.md](../../project/questions.md) precisa para discutir identidade estável de projeto. `managed` é o que autoriza o F6.9.

### F6.9 — Remover projeto gerenciado apaga o clone

Reversão do F2.5 do walking-skeleton, limitada a `managed = true`, com as cinco regras do §4.6 e uma confirmação que diz o caminho. Projeto registrado por caminho continua com o F2.5 intacto: sai do registro, o disco fica.

### F6.10 — Falha de autenticação tem fluxo próprio

Não é falha genérica com o stderr do git repassado ([Q13](open-questions.md)). É `failure: "auth"`, reconhecida pelo que o git e o ssh dizem, e a tela que a mostra faz três coisas:

1. nomeia as duas saídas — chave no `ssh-agent`, ou `credential.helper` configurado;
2. para URL `https`, oferece **em um clique** a mesma URL na forma `ssh` (`https://host/org/repo.git` → `git@host:org/repo.git`), que é a saída mais rápida para quem já tem chave;
3. não some sozinha: fica até ser dispensada.

### F6.11 — Repositório vazio clona

E o projeto nasce válido ([Q19](open-questions.md)). Consequência conhecida: sem nenhum commit não há de onde cortar worktree — o que a tela faz a respeito é o F6.13.

### F6.12 — O diretório de estado passa a ter uma árvore só

`config.worktreesDir` some e `workspacesDir` toma o lugar. `projectHome` é `(workspace, projeto)`, e `repo/` e `worktrees/` são irmãos dentro dele (§2.2). Vale para **todo** projeto, gerenciado ou não.

As worktrees já registradas se mudam numa migração de boot, única, que para cada uma move o diretório, roda `git worktree repair` a partir do repositório principal e atualiza `worktree.path`. Sem o `repair`, uma worktree movida continua parecendo um diretório de trabalho e para de ser um — falha silenciosa, e a pior classe de falha que esta feature pode produzir.

Uma worktree que já esteja ausente do disco não é movida: ela é marcada `missing`, que é o que a reconciliação já faz com ela hoje.

### F6.13 — Projeto sem nenhum commit diz por que não corta worktree

A visão do projeto ganha `hasCommits`, calculado por requisição — como `available`, e pelo mesmo motivo: o primeiro commit pode acontecer no terminal ao lado, e um valor guardado seria uma mentira que sobrevive ao fato.

`CreateWorktreeDialog` explica em vez de deixar o git responder "invalid reference", e `worktree.create` recusa com a mesma frase — a tela evita o erro, o servidor o impede ([Q21](open-questions.md)).

---

## 7. Contrato

| Procedure | Tipo | O quê |
|---|---|---|
| `project.parseSource` | query | Recebe o texto do campo, devolve `{ kind: "path" \| "url", … }` com nome proposto e destino **calculado**, ou a recusa com o motivo. Alimenta a linha `↳` |
| `project.clone` | mutation | Valida URL (§4.1) e nome; recusa se já houver clone em andamento; cria o job; dispara o processo; devolve o `CloneJob` |
| `project.cloneJobs` | query | Jobs vivos do workspace. Existe para o F5 sobreviver a um recarregamento |
| `project.cloneProgress` | subscription | Instantâneos do job, estrangulados em 250 ms, até um estado terminal |
| `project.cloneCancel` | mutation | Só em `cloning` |
| `project.remove` | mutation | **Ganha comportamento**: apaga o diretório quando `managed`, e recolhe o `projectHome` vazio. Assinatura inalterada |
| `project.get` / `project.listByWorkspace` | query | **Ganham `hasCommits`** na visão, calculado por requisição (F6.13) |
| `worktree.create` | mutation | **Ganha destino novo** (`projectHome/worktrees/<nome>`) e uma recusa nova (projeto sem commit). Assinatura inalterada |

`project.add` permanece exatamente como está.

---

## 8. Não-objetivos

| O quê | Por quê |
|---|---|
| API de provedor (listar repos de uma org, OAuth do GitHub/GitLab) | Integração por provedor, N vezes, com credencial guardada. A URL git é o denominador comum de todos eles — e é o único que funciona no servidor da empresa |
| Guardar token ou senha | Exige armazenamento de segredo, cifra em repouso e um dono da chave. Vem **depois** de o daemon ter autenticação ([Q13](open-questions.md)) |
| `git://` | Sem autenticação e sem integridade ([Q11](open-questions.md)) |
| Configuração de transportes permitidos | Pedida pela [Q10](open-questions.md), adiada pela [Q22](open-questions.md): configuração de segurança atrás de porta aberta protege contra engano, não contra ataque |
| `fetch`, `pull`, `push`, gerenciar remotos | Esta feature traz o repositório para dentro. Mantê-lo em dia é outra |
| Submódulos | A URL do submódulo é escolhida por quem controla o repositório remoto ([Q16](open-questions.md)) |
| Clone raso ou parcial (`--depth`, `--filter=blob:none`) | Worktree precisa de histórico e de todas as branches. Um clone raso viraria um projeto que não corta worktree, que é o único motivo de o projeto existir |
| Escolher branch no clone | `resolveDefaultBranch` já responde certo depois de um clone, porque o clone grava o `origin/HEAD` |
| Importar vários repositórios de uma vez | A [Q17](open-questions.md) fechou: um por vez |
| Reclonar um projeto marcado como ausente | Parece pequeno e não é: o registro tem worktrees penduradas nele |

---

## 9. Riscos

| # | Risco | Resposta |
|---|---|---|
| **R1** | Daemon sem auth + procedure que faz rede, escreve e **apaga** | Não fechado aqui. É a P2 amplificada, e está dita no §4.7 em vez de escondida |
| **R2** | `ext::` / `--upload-pack` = execução de comando pela string colada | Lista de permissão (U1), `--` no argv (U2), `protocol.allow=never` para redirects |
| **R3** | Token embutido na URL vazando para `.git/config`, log ou mensagem de erro | Sanitização na fronteira + `remote set-url` pós-clone + campo do job sanitizado. Três lugares porque um só é o que se esquece |
| **R4** | **Apagar o diretório errado** | As cinco regras do §4.6, e principalmente a A2: prova por `realpath` no momento de apagar, não confiança na linha do banco |
| **R5** | Nome de workspace ou de projeto com barra virando diretório | Slugificação dos dois segmentos antes de virar caminho (§4.4) |
| **R6** | Texto do servidor remoto na UI | Limpeza de controle, truncamento, anel de 64 KiB, renderização como texto |
| **R7** | Clone que enche o disco | Sem cota na v1. Existe cancelar e o detector de estagnação |
| **R8** | Daemon morre no meio do clone e deixa lixo | Nome previsível `.lumem-clone-*` + varredura no boot (F6.7) |
| **R9** | Progresso afogando a conexão | Fluxo dedicado, 250 ms, e nunca no canal `events.onChange` |
| **R10** | Regressão no `project.add`, no `project.remove` ou no `worktree.create` — caminhos que **todo** projeto usa | A task que os toca passa nos testes existentes **sem editá-los**, e é esse o critério |
| **R11** | **Worktree movida sem `git worktree repair`** — quebra em silêncio, e continua parecendo íntegra | O `repair` é passo obrigatório da migração (F6.12), e o teste verifica a worktree **funcionando** depois de movida, não só o diretório existindo |
| **R12** | Escopo vazando: uma feature de clone mexendo em `config.ts`, em `worktree.create` e numa migração | Não é evitado, é **nomeado** — §2.2 e F6.12. A alternativa era fazer o mesmo trabalho sem dizer |
| **R13** | Teste que depende de rede | Nenhum. As fixtures clonam de um bare local por `file://`; falha de rede é `ssh://127.0.0.1:1/x`, que recusa conexão na hora |

---

## 10. Critérios de aceite

1. Colar `https://github.com/<algo público>.git`, ver as fases nomeadas, e o projeto aparecer na sidebar sem recarregar.
2. Colar `git@host:org/repo.git` com chave no agente: clona. Sem chave: falha em segundos **no fluxo do F6.10** — as duas saídas nomeadas — e **não** pendura.
3. Colar `https://` de repositório privado sem helper: mesma falha, e o botão que converte para `ssh` produz a URL certa.
4. Colar `ext::sh -c id` e `git://host/r.git`: recusados antes de qualquer processo nascer, cada um com seu motivo.
5. Colar `https://u:segredo@host/r.git`: clona, e `segredo` não existe em `.git/config`, nem em `remote_url`, nem em nenhum log, nem em nenhum campo do job.
6. Começar um segundo clone com um em andamento: recusado, nomeando o primeiro.
7. Cancelar no meio: processo morto, temporário some, nada registrado, nada no disco.
8. Matar o daemon no meio e subir de novo: a varredura remove o temporário e diz quantos removeu.
9. Nome duplicado no workspace: o projeto entra com sufixo, o diretório usa o mesmo nome, e o job diz o que fez.
10. Terminado o clone, criar worktree do projeto novo funciona — prova de que ele é um projeto igual aos outros, e não um de segunda classe.
11. Remover o projeto clonado: a confirmação diz o caminho, o diretório some, e o registro sai **depois** dele.
12. Remover um projeto registrado por caminho: o registro sai, o diretório fica. O F2.5 continua valendo para ele.
13. Clonar um repositório vazio: o projeto nasce, e a tela de criar worktree explica por que ainda não dá, em vez de repassar o erro do git.
14. Subir o daemon com worktrees na árvore antiga: elas se mudam, e cada uma **funciona** depois — `git status` dentro dela responde, que é a prova de que o `repair` rodou.
15. Criar worktree de um projeto registrado por caminho: ela nasce em `~/.lumem/workspaces/<workspace>/<projeto>/worktrees/<nome>`, mesmo o projeto não sendo gerenciado.
