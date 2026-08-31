# PRD — Walking Skeleton

> **Status:** decisões fechadas, pronto pra revisão final
> **Versão:** v0.3 — primeiro passo, não é o MVP
> **Perguntas:** [open-questions.md](open-questions.md) — todas respondidas
>
> **v0.1 → v0.2:** agentes entraram no escopo. A v0.1 tratava "abrir terminal" como terminal pelado e jogava agente pra depois; a leitura estava errada. O primeiro passo é o sistema **completo e conectado** — servidor com agentes configurados — só que na versão mais simples que funciona.
> **v0.2 → v0.3:** decisões em aberto fechadas — tRPC, PTY, só Claude Code de fábrica, agente liberado no projeto principal, sem flags de permissão.

---

## 1. Objetivo

Ter o esqueleto do Lumem-OS de pé e utilizável ponta a ponta: um cliente web com sidebar de projetos de um workspace, capaz de criar worktrees, abrir terminal e **subir um agente de IA dentro de uma worktree**, com o servidor sendo dono de tudo.

O objetivo não é ser bom ainda. É provar que a espinha aguenta peso — cliente fala com servidor, servidor mexe em git de verdade, PTY roda de verdade, agente trabalha de verdade, estado sobrevive a restart — antes de empilhar qualquer coisa em cima.

**Critério de sucesso em uma frase:** você abre o Lumem, vê o `lorebase` na sidebar, cria a worktree `teste`, sobe um Claude Code nela, manda uma tarefa, **fecha a UI**, reabre, e ele continua lá trabalhando de onde parou.

Essa última parte é o teste real. É o que separa "app que abre um terminal" de "harness com daemon".

---

## 2. Não-objetivos

Explicitamente **fora** desta versão. Cada linha aqui é uma tentação que vai aparecer durante a implementação.

| Fora | Por quê |
|---|---|
| Orquestração multi-agente | Um agente por sessão, você aponta e dispara. Sem DAG, sem fila, sem dependência, sem coordenador. |
| Sinal de "tarefa concluída" | O servidor não sabe se o agente terminou. Quem olha é você. *(é a Q069 da raiz, e não tem resposta boa ainda)* |
| Memória / self-learning | Precisa de agente rodando primeiro — agora tem. Entra na próxima. |
| Tarefas | Nem entidade nem UI. |
| Protocolo estruturado com o agente | PTY e só. Sem ACP, sem SDK, sem parsing de evento. |
| Política de permissão do agente | Vale o default do CLI. Sem interceptar aprovação, sem allowlist, sem flag de skip. |
| Retomar sessão de agente (`--resume`) | Sessão morreu, morreu. Vira feature isolada depois. |
| Prompt inicial junto com a criação | Sobe o agente e digita nele, como num terminal. |
| Integração com GitHub/GitLab | Nada de PR, issue, CI, review. |
| Multi-host | Servidor local e único. |
| Autenticação / multi-usuário | Um usuário, uma máquina, um cliente por vez. |
| Container / sandbox | Worktree pelada. |
| Setup/teardown script por projeto | `npm install` é você no terminal. |
| Alocação de portas | Sem `$LUMEM_PORT_BASE`. |
| Merge, PR, push, commit pelo sistema | Git de escrita só cria e remove worktree/branch. O resto é você ou o agente, no terminal. |
| Notificação, inbox, fila de atenção | Volta quando existir mais de um agente pra acompanhar. |

---

## 3. Conceitos nesta versão

- **Workspace** — agrupamento nomeado de projetos. Aqui é quase só um rótulo com uma lista; o que o torna importante (memória e tarefas compartilhadas) vem depois. Existe desde já porque é a ruptura central do projeto e retrofitar hierarquia é caro.
- **Projeto** — repositório git no disco, registrado no workspace por caminho absoluto.
- **Worktree** — `git worktree` criado a partir de um projeto, com branch própria.
- **Configuração de agente** — receita declarativa de como lançar um CLI de agente: comando, argumentos, variáveis de ambiente. Vive no servidor. Adicionar um agente novo é adicionar uma linha, não escrever código.
- **Sessão** — um processo interativo rodando no servidor com `cwd` num escopo. Tem dois tipos: **shell** (seu shell de login) e **agente** (lançado a partir de uma configuração de agente). São a mesma primitiva com rótulo diferente — é isso que mantém a versão pequena.

Hierarquia: `Workspace > Projeto > Worktree`. Sessão pendura em projeto ou em worktree.

---

## 4. Escopo funcional

### F1 — Workspace

**F1.1** Criar workspace informando um nome.
**F1.2** Listar workspaces.
**F1.3** Selecionar o workspace ativo; a sidebar reflete a seleção.
**F1.4** Renomear workspace.
**F1.5** Remover workspace, permitido só se não tiver projetos — sem cascata.

Na primeira execução, sem nenhum workspace, o cliente pede pra criar um antes de mostrar qualquer outra coisa.

### F2 — Projetos

**F2.1** Adicionar projeto ao workspace ativo informando caminho absoluto de repo git já existente no disco.
**F2.2** Validar na adição: caminho existe, é diretório, é raiz de repo git. Falhou, recusa dizendo qual.
**F2.3** Nome do projeto default é o nome do diretório, editável.
**F2.4** Listar projetos do workspace ativo.
**F2.5** Remover projeto **não toca no disco** — só tira o registro. As worktrees registradas saem **junto** (só o registro delas; os checkouts sob `~/.lumem` ficam no disco). A tela **pergunta antes**, nomeando quantas worktrees vão junto e dizendo que os diretórios ficam — não porque o disco corra risco, mas porque não há como readotar um checkout depois. Bloqueado apenas por sessão rodando — a do projeto ou a de qualquer worktree dele (§6). Ver [WS-Q22](open-questions.md).

Não há clone. O repo já tem que estar no disco.

### F3 — Sidebar

**F3.1** Lista os projetos do workspace ativo.
**F3.2** Projeto expande mostrando suas worktrees.
**F3.3** Worktree mostra nome e branch.
**F3.4** Worktree expande mostrando suas sessões abertas, com ícone distinguindo shell de agente.
**F3.5** Seletor de workspace no topo.
**F3.6** Clicar seleciona; a área principal mostra o detalhe.
**F3.7** Reflete mudança de estado sem refresh manual.

### F4 — Worktrees

**F4.1** Criar worktree a partir de um projeto informando um nome.
**F4.2** A branch tem o mesmo nome da worktree. Branch já existente é recusada, pede outro nome — não existe "usar branch existente" nesta versão.
**F4.3** Nasce da **branch default** do repositório. Sem `fetch` antes — usa o que está em disco.
**F4.4** Criada em `~/.lumem/worktrees/<projeto>/<nome>`, fora do repositório.
**F4.5** Nome aceita qualquer caractere válido de branch, incluindo `/`, que vira diretório aninhado.
**F4.6** Listar worktrees de um projeto com nome, branch e caminho.
**F4.7** Remover worktree roda `git worktree remove` e apaga o registro. **A branch não é deletada.**
**F4.8** Worktree suja bloqueia a remoção, com opção explícita de forçar.
**F4.9** Sessões vivas na worktree bloqueiam a remoção até serem encerradas.
**F4.10** O detalhe mostra branch, caminho, limpa ou suja, e commits à frente/atrás da base.

### F5 — Sessões (shell e agente)

**F5.1** Abrir sessão de shell com `cwd` na raiz de um projeto ou de uma worktree.
**F5.2** Abrir sessão de agente escolhendo uma configuração de agente, com `cwd` na raiz de uma worktree **ou de um projeto**. Agente no projeto principal é permitido — serve pra perguntar sobre o repo sem criar branch.
**F5.3** Sessão é interativa de verdade: teclado, cores, redimensionamento.
**F5.4** Várias sessões simultâneas, inclusive no mesmo escopo.
**F5.5** Shell roda o shell de login do usuário, herdando o ambiente. Agente roda o comando da configuração, com o ambiente do usuário mais as variáveis declaradas nela.
**F5.6** Navegar pra outro item da sidebar **não mata a sessão** — ela sai da tela e continua rodando.
**F5.7** Voltar pra sessão restaura o conteúdo anterior.
**F5.8** Fechar sessão explicitamente encerra o processo.
**F5.9** Processo que morre sozinho marca a sessão como encerrada; o buffer continua legível até você fechar.
**F5.10** O detalhe da sessão mostra tipo, escopo, comando lançado e estado.

### F6 — Configurações de agente

**F6.1** O servidor guarda configurações de agente com: nome, comando, argumentos, variáveis de ambiente.
**F6.2** Listar configurações disponíveis.
**F6.3** Criar, editar e remover configuração.
**F6.4** O servidor vem com **uma** configuração de fábrica: Claude Code, comando `claude`, sem argumento nenhum. Nada de flag de permissão — o CLI se comporta como se comportaria se você o abrisse na mão.
**F6.5** Se o comando não existir no `PATH` do servidor, a configuração aparece como indisponível e o lançamento é recusado antes de tentar.

Só o Claude Code nesta versão. Adicionar outro agente depois é adicionar uma configuração — não existe código por agente.

### F7 — Persistência

**F7.1** Workspaces, projetos, worktrees e configurações de agente sobrevivem a restart do cliente e do servidor.
**F7.2** Sessões sobrevivem a **fechar o cliente** — o processo vive no servidor. Reabrir reconecta e restaura o buffer.
**F7.3** Sessões **não** sobrevivem a restart do servidor nesta versão. Ao subir, o servidor marca as órfãs como encerradas.
**F7.4** No boot, o servidor reconcilia registro com disco: worktree que sumiu vira `missing`, não some calada.

---

## 5. Fluxos

### Primeiro uso

1. Daemon já está rodando. Abre o cliente no navegador.
2. Sem workspace → tela pedindo pra criar. Cria `pessoal`.
3. Sidebar vazia, com ação "adicionar projeto".
4. Informa `/Users/viniciusrosa/Documents/GitHub/lorebase`.
5. Servidor valida, registra, nome default `lorebase`.
6. Projeto aparece na sidebar.

### Subir um agente numa worktree

1. Seleciona `lorebase`, ação "nova worktree", nome `teste-prd`.
2. Servidor cria branch e worktree em `~/.lumem/worktrees/lorebase/teste-prd`.
3. Seleciona a worktree, ação "novo agente", escolhe `claude-code`.
4. Servidor lança o processo com `cwd` na worktree e devolve o stream.
5. Digita a tarefa, o agente começa a trabalhar.
6. **Fecha a aba do navegador.**
7. Reabre depois. Seleciona a sessão. O buffer volta e o agente está onde parou.

### Limpar

1. Seleciona a worktree, ação "remover".
2. Suja ou com sessão viva → recusa, dizendo qual dos dois é o motivo.
3. Encerra as sessões, confirma.
4. `git worktree remove` roda, registro sai, sidebar atualiza. A branch `teste-prd` continua existindo.

---

## 6. Modelo de dados

Campos de auditoria (`created_at`, `updated_at`) implícitos em todas as tabelas.

```
workspace
  id
  name          único

project
  id
  workspace_id  → workspace
  name          editável, único dentro do workspace
  path          raiz do repo, absoluto, único globalmente
  default_branch resolvida na adição

worktree
  id
  project_id    → project
  name          único dentro do projeto
  branch
  path          absoluto
  state         active | missing

agent_config
  id
  name          único
  command
  args          lista
  env           mapa

session
  id
  kind          shell | agent
  agent_config_id  null quando kind = shell
  scope_type    project | worktree
  scope_id
  cwd
  command       o que foi efetivamente lançado
  state         running | exited
  exit_code     null enquanto running
```

**Invariantes:**
- `project.path` é raiz de repositório git. Monorepo é um projeto só.
- `worktree.path` está fora de `project.path`.
- `session.kind = agent` exige `agent_config_id`. O escopo pode ser projeto ou worktree.
- Sem worktree órfã de projeto, sem sessão órfã de escopo.
- Remover projeto exige zero worktrees; remover worktree exige zero sessões rodando.

---

## 7. Arquitetura

Decisões desta versão. As marcadas *(em aberto)* estão no [open-questions.md](open-questions.md).

**Cliente-servidor, com o servidor como daemon permanente.** Sobe e fica de pé independente da UI. Fechar o cliente não encerra nada. É a premissa do projeto e é o que o critério de sucesso testa.

**O daemon sobe na mão nesta versão** — você roda num terminal e deixa lá. `launchd` ou gerenciador de processo entram quando isso virar uso diário em vez de desenvolvimento.

**O servidor é dono de todo estado e de todo efeito colateral.** O cliente não roda git, não abre processo, não escreve no disco. Toda operação é chamada ao servidor. É isso que permite, depois, o servidor estar em outra máquina — e é isso que permite um agente operar o Lumem pela mesma API que a UI usa.

**Paridade API ↔ cliente.** Nada que a UI faz pode ser exclusivo dela. Custa disciplina, é pré-requisito pra delegação real depois.

**Cliente web**, servido pelo servidor. O que ela não tem (notificação de SO, abrir no editor, deep link) passa a doer quando houver muitos agentes rodando sozinhos — e aí a casca vira Tauri sem o servidor nem a API mudarem.

**Servidor em TypeScript**, monorepo com servidor e cliente juntos e tipos compartilhados. Gerenciador de monorepo: **pnpm workspaces + Turborepo**.

**Protocolo: tRPC pro control plane, WebSocket cru pro PTY.** tRPC dá tipagem fim a fim sem codegen nem proxy, e é a melhor DX possível com TypeScript dos dois lados. O canal do terminal não passa por ele: keystroke por mutation seria absurdo, então o PTY tem WebSocket próprio.

O custo consciente dessa escolha: **o contrato fica amarrado ao TypeScript.** Se um dia entrar cliente Tauri em Rust, TUI em Go, ou um agente externo consumindo a API, não existe schema pra gerar cliente — é reescrever a camada de transporte. Aceitável agora porque cliente é web e servidor é TS; vira dívida no dia em que deixar de ser.

**Agente é PTY, não protocolo.** O servidor lança o CLI declarado na configuração e liga os bytes ao cliente. Não interpreta output, não sabe o que o agente está fazendo, não sabe quando terminou. É o modelo do Superset, e é o que mantém esta versão pequena — ao custo de o servidor ser cego sobre o que acontece lá dentro.

**PTY no servidor.** O processo é filho do daemon, não do cliente. É o que faz F5.6 e F7.2 funcionarem.

**Ring buffer de 10 mil linhas por sessão, em memória.** Reconectar repinta a partir dele. Sem persistência em disco, sem replay histórico, sem sobreviver a restart do servidor. O protocolo completo de attach/detach (epoch + seq + repaint nudge) fica pra quando doer.

**SQLite no servidor** pro estado.

**Git via CLI, não biblioteca.** São 5 comandos nesta versão (`rev-parse`, `worktree add`, `worktree list`, `worktree remove`, `status`). Biblioteca só se virar dor.

**Um cliente conectado por vez**, por simplicidade.

---

## 8. Erros e estados degradados

O que o sistema faz quando a realidade não coopera. Cada linha vai acontecer na primeira semana de uso.

| Situação | Comportamento |
|---|---|
| Caminho adicionado não é repo git | Recusa, diz o motivo, não registra nada. |
| Repo removido do disco depois de registrado | Projeto fica indisponível na sidebar, ações bloqueadas, registro permanece. |
| Worktree apagada por fora (`rm -rf`) | Vira `missing` na reconciliação de boot. Oferece remover o registro. |
| `git worktree add` falha | Nada é registrado. Erro do git aparece literal, sem tradução. |
| Branch já existe ao criar worktree | Recusa antes de tentar, pede outro nome. |
| Worktree suja na remoção | Bloqueia, diz quantos arquivos modificados, oferece forçar. |
| Sessão viva na worktree que vai ser removida | Bloqueia, diz quantas sessões. |
| Comando do agente não existe no `PATH` | Configuração aparece indisponível; lançamento recusado antes de tentar. |
| Agente morre sozinho (crash, quota, erro de auth) | Sessão vira `exited` com exit code; buffer legível até fechar. O servidor **não** relança. |
| Shell morre sozinho | Igual ao agente. |
| Daemon cai | Cliente mostra desconectado e tenta reconectar. Ao voltar, todas as sessões estão `exited`. |
| Cliente perde rede sem o daemon cair | Reconecta e repinta do ring buffer. As sessões nunca pararam. |

---

## 9. Critérios de aceite

A versão está pronta quando, numa máquina limpa:

- [ ] O daemon sobe e o cliente abre no navegador sem erro
- [ ] Crio um workspace e ele persiste depois de fechar tudo
- [ ] Adiciono o `lorebase` pelo caminho e ele aparece na sidebar
- [ ] Adicionar um diretório que não é repo git é recusado com mensagem clara
- [ ] Crio a worktree `teste-prd` e ela existe no disco, com a branch certa, no caminho certo
- [ ] `git worktree list` no repo original mostra a worktree criada
- [ ] A worktree aparece aninhada sob o projeto na sidebar
- [ ] Abro shell na worktree, rodo `git status`, vejo `On branch teste-prd`
- [ ] Abro um segundo shell no projeto e os dois funcionam ao mesmo tempo
- [ ] Subo um agente Claude Code na worktree e converso com ele normalmente
- [ ] O agente edita um arquivo e a mudança aparece no disco, dentro da worktree
- [ ] Subo um agente direto no projeto principal, sem criar worktree, e ele funciona
- [ ] Navego pra outro item e volto — a sessão continua viva, com conteúdo anterior visível
- [ ] **Fecho o navegador com o agente trabalhando, reabro, e ele continua de onde parou**
- [ ] Uma configuração de agente com comando inexistente aparece indisponível e não deixa lançar
- [ ] Remover worktree com sessão viva é bloqueado com o motivo certo
- [ ] Encerro as sessões, removo a worktree, e ela some do disco e da sidebar
- [ ] Apago uma worktree por fora com `rm -rf`, reinicio o daemon, e ela aparece ausente em vez de sumir calada

---

## 10. Riscos

**O PTY é a parte difícil, e agora é o dobro.** Resize, cores, controle de fluxo e reconexão já consumiam mais tempo que todo o resto somado. CLI de agente usa alt-screen, redesenha a tela inteira e é bem menos tolerante a buffer mal implementado que um shell. Se algo estourar prazo, é isso. Mitigação: biblioteca de PTY madura no servidor, `xterm.js` no cliente, zero emulador escrito à mão.

**O servidor é cego sobre o agente.** Como não há protocolo estruturado, o servidor não sabe se o agente está trabalhando, travado esperando você, ou morto há 40 minutos. Nesta versão isso é aceitável porque você está olhando. Deixa de ser no minuto em que existirem três agentes — e aí volta a Q069.

**A fronteira cliente-servidor cobra adiantado.** Cada feature vira contrato + servidor + tela. É três vezes o trabalho de um app monolítico. É consciente: é o que torna multi-host e delegação possíveis.

**Tentação de orquestrar.** Com agente rodando, a distância até "dispara três de uma vez e me avisa quando acabarem" vai parecer curta. Não é: precisa de sinal de conclusão, e não existe um bom. Subir N agentes na mão e olhar cada um é permitido e de graça — o que não entra é o sistema coordenar isso.

---

## 11. Depois desta versão

Sem compromisso de ordem, só registrando o que foi deliberadamente deixado de fora:

- Setup/teardown script por projeto — o que faz a worktree nascer utilizável
- Diff e status da worktree como UI, não só terminal
- Sessão sobrevivendo a restart do daemon
- Retomar sessão de agente (`--resume`) — feature isolada, exige guardar o ID de sessão do CLI
- Mais agentes de fábrica (Codex, Gemini, Aider) — uma linha de configuração cada
- Política de permissão do agente
- Daemon subindo sozinho via `launchd`
- Sinal de atenção: saber qual agente está esperando você
- Tarefas no workspace
- Memória
