# PRD — Os scripts do projeto: setup, run e o rodapé que os mostra

> **Status:** v1.0 — escopo fechado, **11 perguntas respondidas**, desenho aprovado em 2026-08-30. Nasceu de uma imagem do Conductor e de
> uma frase: *"uma parte abaixo da árvore de arquivos com terminal, script de run e script de setup —
> e o script de setup na config do Lumem do projeto"*.
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md) — 14 tasks em 4 fases
> **Depende de:** o `PtyManager` (spawn, attach/detach, scrollback, sobrevive ao browser), a
> `session` como registro no banco, e o `<repo>/.lumem/project.toml` — que já existe, com o `id`
> dentro e um comentário no código dizendo que *"amanhã aquele arquivo carrega script de setup e de
> run"*. Amanhã é esta feature
> **Fecha do backlog:** [F — Configuração de projeto versionada no repo](../../project/backlog.md)
> **Desenho:** feito no Open Design, projeto `lumem-os` — `lumem-run-dock.html` + `.css`, **sete
> quadros**, **aprovado em 2026-08-30** e já no repositório por `design:sync`
> ([regra](../../project/design-source-of-truth.md)). O §9 lista o que ele deixou decidido

---

## 1. O problema, em uma frase

**O Lumem cria worktrees que não rodam.** Ele clona, cria branch, abre conversa com o agente e escreve
arquivo — e a worktree nova nasce sem `node_modules`, sem `.env`, sem build, e sem nenhum lugar no
produto onde subir a aplicação e olhar o resultado.

O que isso custa hoje, na ordem em que dói:

| O quê | Onde está hoje |
|---|---|
| Deixar uma worktree nova pronta para trabalhar | na sua mão, num terminal fora do Lumem — ou pedindo ao agente, que gasta token para rodar `pnpm install` |
| Subir a aplicação e ver a mudança de pé | fora do produto. O Lumem não tem botão nenhum que rode nada |
| Saber em que porta ela subiu | lendo o log, no terminal onde você rodou |
| Parar o que subiu | achando o terminal de novo |
| O que este repositório precisa para rodar | não está escrito em lugar nenhum que o Lumem leia. Está no README, no `.superset/config.json` e no `.conductor/settings.toml` — para os outros harnesses, não para este |

**A ironia é medível neste próprio repositório.** O `scripts/workspace/{setup,run,teardown}.sh` existe,
é bom, é idempotente, e é consumido pelo Superset e pelo Conductor. O Lumem — que é o produto — não lê
nenhum dos três.

## 2. Por que agora

Porque as duas metades já estão de pé e nunca se encontraram:

- **o daemon já executa processo com terminal.** O `PtyManager` faz spawn com `cwd` e `env`, mantém
  scrollback em `RingBuffer`, e desanexar o browser não mata o processo — a decisão de projeto está
  no comentário dele: *"closing the browser must not kill the shell"*. Um `run` não é primitiva nova;
- **o arquivo de configuração já existe, commitado, e já tem dono.** A [Q3.1 da
  workspace-memory](../workspace-memory/open-questions.md) pôs o `id` do projeto em
  `<repo>/.lumem/project.toml` e escreveu a regra que delimita o arquivo:

  > **O que é do repositório é do time; o que é da instância é do Lumem.**

  Script de setup e de run passa nessa regra por definição: quem clona o repositório precisa dos dois,
  seja com Lumem ou sem.

E porque o `project-identity.ts` **já preserva o resto do arquivo ao escrever** — ele nunca reescreve
o TOML inteiro, exatamente para que esta feature pudesse acontecer sem intrusão. A parte cara já foi
paga.

## 3. O que a coisa é

Duas coisas, e a segunda é a tela da primeira.

### 3.1 Uma tabela de scripts no `project.toml`

```toml
id = "prj_7f3a…"

[scripts]
setup = "./scripts/workspace/setup.sh"
run = "./scripts/workspace/run.sh"
teardown = "./scripts/workspace/teardown.sh"
```

Três comandos, um por linha, executados pelo shell de login no diretório do checkout. É deliberadamente
menor que o `.conductor/settings.toml` (que tem N scripts de run nomeados, ícone, `default`) e do
tamanho do `.superset/config.json` — o menor formato que resolve o caso de hoje, e que cabe dentro de
um arquivo que já é de outra coisa. Ver [S2](open-questions.md) e [S9](open-questions.md).

### 3.2 O rodapé de execução

**Uma faixa abaixo da árvore de arquivos, com três abas e um botão à direita.** É o que a imagem
mostra, e o que ela mostra é o modelo mental certo: *"o repositório está aqui em cima; o que ele faz
quando roda está aqui embaixo"*.

| Aba | O que é |
|---|---|
| `Setup` | a última execução do script de setup deste checkout — saída inteira, e um botão de rodar de novo |
| `Run` | o processo do script de run: `▶ Rodar` / `⏹ Parar`, a saída ao vivo, e `Abrir :PORTA` quando a porta foi descoberta |
| `Terminal` | shell no diretório do checkout. O `+` abre outra |

As três são a **mesma primitiva**: sessão PTY com scrollback, anexada por WebSocket. O que muda é
quem escolheu o comando — o `project.toml` nas duas primeiras, você na terceira.

O rodapé pertence ao **checkout**, como a árvore de arquivos: trocar de aba de sessão não muda o que
está rodando; trocar de worktree, muda.

## 4. O que a execução ganha do Lumem

Um script rodando dentro do harness sabe onde está. O contrato é de variáveis de ambiente, e é
copiado de propósito da forma que o Conductor e o Superset usam — porque é a forma que o
`scripts/workspace/env.sh` **deste repositório** já sabe ler:

| Variável | O quê |
|---|---|
| `LUMEM_PROJECT_ID`, `LUMEM_PROJECT_PATH` | o projeto e a raiz do repositório dele |
| `LUMEM_WORKTREE_ID`, `LUMEM_WORKTREE_NAME`, `LUMEM_WORKTREE_PATH` | o checkout — vazio no `local` |
| `LUMEM_WORKSPACE_ID` | o workspace |
| `LUMEM_RUN_PORT` | **uma porta reservada para este checkout**, estável entre execuções — ver [S5](open-questions.md) |

A porta reservada é o que faz duas worktrees do mesmo projeto rodarem ao mesmo tempo sem uma matar a
outra. É o problema que o `env.sh` deste repositório resolve na mão hoje, derivando um par de portas do
hash do caminho — e que qualquer outro projeto teria de resolver de novo.

## 5. Escopo

**Entra:**

- a tabela `[scripts]` no `<repo>/.lumem/project.toml`, lida pelo daemon, **preservando o resto do
  arquivo** ao escrever;
- o rodapé com as três abas, ancorado no checkout, com altura arrastável e lembrada;
- `setup` rodando **na criação da worktree** e sob demanda ([S3](open-questions.md));
- `run` iniciado e parado por gesto, com a saída ao vivo e a porta descoberta ([S6](open-questions.md));
- `teardown` na remoção da worktree ([S8](open-questions.md));
- as variáveis de ambiente do §4, e a reserva de porta por checkout;
- a tela que **falta o arquivo**: projeto sem `[scripts]` não é erro, é o estado normal — e o rodapé é
  o lugar onde se aprende que ele existe. O gesto ali é **pedir para o agente escrever**: um
  `run = "pnpm dev"` chutado pelo produto está errado na maioria dos repositórios, e quem consegue
  ler o `package.json` antes de responder é o agente.

**Não entra, e por quê:**

| Fora | Por quê |
|---|---|
| N scripts de run nomeados, com ícone e `default` | o Conductor tem, e é útil quando o projeto tem três formas de subir. Um resolve o caso de hoje; o formato do §3.1 aceita crescer sem migração ([S9](open-questions.md)) |
| Copiar arquivos para a worktree nova (`.env`, credenciais) | é o outro problema do onboarding de worktree, e é sobre **segredo** — merece decisão própria. Vai para o backlog |
| Detectar porta inspecionando os processos filhos | exige varrer `lsof`/`/proc` e uma árvore de processos que o PTY não entrega de graça. A descoberta é pela saída, e a reserva é pela variável ([S6](open-questions.md)) |
| Health check, restart automático, supervisor | `run` é um processo que você começa e para. Um supervisor é outra feature, com outro modelo de estado |
| Configuração de instância — script que só **você** roda | passa longe da regra do arquivo. Se aparecer, mora no banco, não no repositório ([S10](open-questions.md)) |
| Proxy/encaminhamento de porta | `Abrir :PORTA` abre `http://127.0.0.1:PORTA` no navegador. Tudo é local |

## 6. As decisões que já dá para tomar

**Uma sessão de script é uma sessão.** Não é um `child_process` paralelo com um caminho de log
próprio: é uma linha em `session`, com `kind` novo, e um PTY no `PtyManager`. Isso dá de graça o que
levaria uma feature inteira para refazer — scrollback, reanexar, sobreviver ao browser fechado,
aparecer na reconciliação de boot, morrer com o `SIGTERM` do daemon como as outras.

O preço é uma migração e um `CHECK` novo: hoje `session.kind IN ('shell','agent')`, e `kind = 'script'`
precisa de um subtipo (`setup` ou `run`) para o rodapé conseguir perguntar *"tem run vivo neste
checkout?"* sem procurar por string de comando.

**O run é único por checkout.** Dois `pnpm dev` na mesma worktree brigam pela mesma porta, e o segundo
morre com um erro que ninguém lê. Começar um run com outro vivo **para o anterior** — e a tela diz que
vai fazer isso antes.

**Setup e run não são a mesma coisa, e a diferença é o fim.** Setup **termina** — o que interessa dele
é o código de saída e a última saída, guardados. Run **não termina** — o que interessa é estar vivo e o
que ele está escrevendo agora. Por isso o setup tem histórico ("rodou às 14h02, saiu 0") e o run tem
estado ("rodando desde 14h05, porta 55061").

## 7. A parte nova de daemon

1. **Ler o `[scripts]`** do `project.toml` do checkout — do arquivo do **worktree**, que é o mesmo do
   repositório, e é por isso que a branch pode mudar o script ([S7](open-questions.md));
2. **`kind = 'script'`** em `session`, com subtipo e migração;
3. **Reserva de porta por checkout**, estável, gravada — não sorteada a cada run;
4. **Descoberta da porta na saída**, com o teto de bytes examinados e uma regra que não pode falar
   sobre a saída inteira: um log de 40 MB não pode virar 40 MB de regex;
5. **Ganchos de ciclo de vida** — criar worktree chama setup, remover worktree chama teardown — sem
   que a falha de um script deixe o registro e o disco em desacordo ([S4](open-questions.md));
6. **Executar string do repositório.** Este é o item que exige cuidado: o comando vem de um arquivo
   commitado, e clonar um repositório de terceiro passa a significar ter um comando dele disponível
   para execução. A [project-from-url](../project-from-url/prd.md) já pagou essa conversa uma vez, por
   outro motivo — ver §8.

## 8. Segurança

**O `[scripts]` é código de terceiro.** Depois da `project-from-url`, um projeto pode entrar no Lumem
a partir de uma URL colada, e nada garante que o repositório do outro lado seja seu. Um `[scripts]`
lido sem cerimônia transforma "clonei para dar uma olhada" em execução arbitrária na sua máquina.

Três coisas seguram isso, e a terceira é a que decide:

1. **Nada roda sozinho antes de você ver.** O setup automático da criação de worktree pressupõe um
   projeto que você já aceitou; para um projeto recém-clonado, o primeiro run é sempre um gesto
   ([S11](open-questions.md));
2. **O comando aparece antes de rodar.** O mesmo padrão do `worktree.plan`, que já mostra o comando de
   git que vai executar. Você lê a string do repositório antes que ela vire processo;
3. **Não há execução implícita ao abrir o projeto.** Ler o TOML é ler texto; nada no caminho de leitura
   pode virar spawn.

Isso é honesto sobre o que **não** protege: um script que você aprovou pode fazer qualquer coisa que
você faria. Sandbox de execução é outro problema, e o [backlog](../../project/backlog.md) é o lugar
dele.

## 9. O desenho

Está feito, no Open Design (`lumem-run-dock.html`), **sete quadros**, e é ele que dá o formato do que
está escrito acima. O que ele deixa decidido:

| Decisão | Onde ela aparece |
|---|---|
| três abas, **uma primitiva** — o que muda é quem escolheu o comando | quadro 1 |
| o estado vai **na aba** (um ponto), não dentro dela — "tem coisa de pé" e "o setup falhou" são as duas perguntas que trazem alguém ao rodapé | quadros 1 e 3 |
| `Setup` tem **histórico** (saiu 0, há 6 min); `Run` tem **estado** (rodando, 4 min, porta) | quadro 3 |
| o botão `Abrir :PORTA` **diz de onde tirou o número** — da variável ou da saída | quadros 1 e 2 |
| `parar` não é botão vermelho cheio: parar um run é rotina e reversível, e esse vocabulário é de remover worktree | quadros 1 e 6 |
| o vazio **ensina o arquivo** em vez de pedir desculpa — com o caminho onde ele mora, o exemplo para copiar, e o gesto principal sendo **pedir para o agente escrever** | quadro 5 |
| run de pé aparece **na sidebar**, com a porta, porque o rodapé pode estar fechado | quadro 6 |
| o comando de repositório clonado aparece **antes** de virar processo | quadro 7 |

E as quatro perguntas que a aprovação dele fechou:

1. **a [S1](open-questions.md)** — o rodapé fica na **coluna da direita**, e o teto de largura dela
   sobe enquanto ele está aberto. O quadro 2 fica no protótipo como registro do que foi recusado: o
   painel central cabe sem negociar pixel e paga com o significado;
2. **a [S3](open-questions.md)** — o setup **roda sozinho** quando a worktree nasce, e o quadro 3
   mostra o preço: o pior estado da feature é a worktree que existe com o setup quebrado, e ele tem
   tela em vez de silêncio;
3. **a [S9](open-questions.md)** — um `run` só, sem seletor;
4. **a [S11](open-questions.md)** — "confiar neste projeto" é escolha **por projeto**, e não uma
   confirmação a cada execução: perguntar sempre treina o clique automático.

## 10. Riscos

| Risco | Por quê | O que segura |
|---|---|---|
| **O rodapé não cabe** | o painel direito vai de 260 a 720 px, e um terminal de 80 colunas quer ~640. A imagem que originou a feature é de um app cujo painel é metade da janela | é a [S1](open-questions.md), e é a primeira pergunta por isso |
| **Virar supervisor de processo** | run que reinicia sozinho, health check, "está de pé?" — cada um parece uma linha e nenhum é | o §5 é a defesa, e ela só vale se for lida na hora de acrescentar |
| **A porta descoberta errada** | regex em saída de terminal acerta o Vite e erra o resto. `Abrir` que abre a porta errada é pior que não ter botão | a reserva por variável de ambiente é o caminho determinístico; a regex é o atalho para quem não a usa. As duas juntas, e a tela diz qual delas achou |
| **O arquivo do time vira o arquivo da instância** | a primeira necessidade de "só na minha máquina" vai pedir uma linha nesse TOML, e a regra morre em silêncio | [S10](open-questions.md) decide isso antes de a pressão existir |
| **Setup na criação da worktree deixa estado torto** | git criou, script falhou, e a UI tem de contar essa história sem mentir | a ordem já decidida no `worktree.create` — git primeiro, registro depois — vale aqui: setup é o **terceiro** passo, e falhar nele não desfaz nada, só aparece |
