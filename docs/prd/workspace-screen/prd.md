# PRD — A tela do workspace

> **Status:** v0.2 — **as seis perguntas respondidas**, escopo fechado. A [W4](open-questions.md)
> mudou o tamanho da feature: consumo por projeto entrou, e trouxe uma tabela nova com ele. Nasceu de uma pergunta de uso: *"eu tô vendo a
> memória no projeto, na aba da direita, mas tem uma memória do workspace? como eu acesso?"*
> **Perguntas:** [open-questions.md](open-questions.md)
> **Tasks:** [tasks.md](tasks.md)
> **Depende de:** o `workspace.rename`, o `workspace.remove` e o `memory.list` por workspace já
> existem. O **consumo não existe**: ele é evento de protocolo hoje, e virar número somável é a parte
> nova de daemon (§6)
> **Desenho:** no Open Design, projeto `lumem-os`. Nenhuma tela desta feature existe lá ainda —
> ver §7

---

## 1. O problema, em uma frase

**O workspace é o conceito central do produto e não tem tela.** Ele existe como um seletor no topo da
sidebar e como um `id` que atravessa o resto do sistema; tudo que se faz com ele se faz pela API.

O que isso custa, hoje, na ordem em que dói:

| O quê | Onde está hoje |
|---|---|
| Memória de **workspace** e **global** | só através de um projeto: a aba `Memória` do painel direito, que só existe com um checkout selecionado |
| Renomear o workspace | só `workspace.rename` pela API |
| Remover o workspace | só `workspace.remove` pela API |
| Ver o que o workspace **é** — projetos, quantos, o que cada um está fazendo | nada. A sidebar lista projetos; ninguém soma |
| Consumo por projeto e por worktree | nada. O `usage_update` chega, aparece na aba que o gastou, e some quando ela fecha |

**A porta que falta é literal.** O botão `▤ arquivos` da topbar — o único caminho para o painel
direito — só aparece quando existe um checkout selecionado (`App.tsx`, `filesPanel={selection === null
? undefined : rightPanel}`). Então:

- workspace sem nenhum projeto **não tem** onde mostrar memória nenhuma;
- memória `global` (você, atravessa workspace) só é editável se você tiver **algum** projeto aberto;
- e o lugar onde a pessoa está quando escolhe um workspace — o painel central, que hoje diz
  *"selecione uma worktree"* — é uma frase, não uma tela.

## 2. Por que agora

Porque a [workspace-memory](../workspace-memory/prd.md) ficou pronta. Enquanto a memória era uma
biblioteca, "só dá para ver por dentro de um projeto" era um detalhe de navegação. Agora ela **muda o
comportamento do agente** — o núcleo entra em toda sessão, o auto-learn escreve, a inbox pede revisão
—, e o escopo de workspace é justamente o que *"erra caro: contamina N projetos de uma vez"* (§1 do
PRD dela). A superfície de revisão do que erra caro não pode depender de haver um projeto aberto.

Isto também já estava registrado como buraco conhecido no Open Design, em `FEATURES.md`: *"Não existe
tela de workspace. Renomear e remover workspace só pela API."* A pergunta de uso só mostrou que ele
sangra por um lugar que ninguém tinha olhado.

## 3. O que a tela é

**O painel central quando nenhuma worktree está selecionada.** Não é uma tela nova de navegação, não é
modal (o projeto não usa modal), e não é uma quarta aba do painel direito — é o que preenche o espaço
que hoje tem uma frase.

Três coisas, na ordem em que uma pessoa precisa delas:

1. **O que este workspace é** — os projetos, o que cada um tem de worktree e de sessão viva, e o que
   ele custou. É a resposta para *"onde eu estou"*;
2. **A memória do workspace** — a mesma `MemoryPanel` que a aba do projeto usa, com o escopo do
   workspace: sem `projectId`, ela mostra o que o workspace e o global enxergam, e é a porta que hoje
   não existe;
3. **O que se faz com o workspace** — renomear, e remover quando estiver vazio.

## 4. Escopo

**Entra:**

- o painel do workspace no lugar de *"selecione uma worktree"*, sem abas ([W5](open-questions.md));
- a `MemoryPanel` no escopo do workspace — **componente reusado, não recriado**;
- renomear em linha, e remover só quando não sobrou nada dentro;
- os números de graça: projetos, worktrees, sessões vivas;
- **consumo de tokens e custo por projeto**, com janela de tempo — `1d`, `7d`, `1m`, `6m`, `1y`
  ([W4](open-questions.md));
- **consumo por worktree** na visão do projeto, com a mesma janela.

**Não entra, e por quê:**

| Fora | Por quê |
|---|---|
| Tela de **preferências** (configuração de agente) | `agent_config` é **global**, não do workspace — a A16 da `agent-login` já nomeia a mentira do rodapé. Misturar as duas aqui é repetir o erro em outra tela |
| Criar workspace | já existe, no [onboarding](../onboarding/prd.md) e no seletor |
| Mover projeto entre workspaces | ninguém pediu, e é a operação mais destrutiva que o modelo permite |
| Gráfico, série temporal, comparação entre janelas | o §6 é uma soma por escopo, não um dashboard. Ver [não-objetivos](#6-não-objetivos) |

## 5. Decisão de desenho que já dá para tomar

**A memória do workspace é o mesmo componente, com escopo diferente.** A `MemoryPanel` já recebe
`workspaceId` e `projectId` e resolve precedência sozinha: sem `projectId`, ela mostra `workspace` e
`global` e nada de projeto. Uma segunda tela de memória seria uma segunda semântica de precedência —
o defeito que a `workspace-memory` levou uma PR inteira para não ter.

**Consequência aceita:** a aba de memória vai aparecer em dois lugares, com conteúdos diferentes e o
mesmo nome. O que separa os dois é o cabeçalho de grupo que ela já desenha (`projeto`, `workspace`,
`você`), e a ausência do grupo `projeto` no painel do workspace é a diferença visível.

## 6. O consumo — a parte nova de daemon

O que a [W4](open-questions.md) pediu não é uma query nova: é **um dado que não é gravado**. O
`usage_update` do ACP chega como evento, é mostrado na aba que o gastou, e desaparece com ela. Não há
coluna, não há data, não há índice — então *"consumo por projeto nos últimos 7 dias"* não é difícil,
é impossível contra o que existe hoje.

E o dado tem uma armadilha que decide o desenho da tabela:

| Campo | O que é | Como agrega |
|---|---|---|
| `used` | **ocupação da janela**, acumulada na sessão | somar entre turnos conta o mesmo token N vezes. O que soma é a **variação** |
| `cost` | o que **aquele turno** custou | soma direto |

Então:

- a tabela guarda **delta de tokens** e **custo do turno**, com carimbo de tempo;
- **projeto e worktree são resolvidos na escrita.** Agregar depois exigiria join polimórfico em
  `session.scope_id`, que é a coluna sem chave estrangeira do schema — e o motivo dela não ter é o
  mesmo aqui;
- **quem escreve é o observador de eventos** que a `workspace-memory` já instalou
  (`AcpManager.watchEvents`), e não um caminho novo;
- **sessão retomada reinicia a janela**, então o primeiro delta dela é o valor inteiro: quem retoma
  paga o contexto recarregado, e é honesto que apareça.

A janela de tempo é resolvida **no daemon**, a partir de um enum (`1d`…`1y`). O relógio do cliente não
decide o que "últimos 7 dias" quer dizer — duas telas abertas dariam duas respostas.

## 7. Não-objetivos

- **Não** virar um dashboard. O que entra é o que responde "onde estou" e "o que o sistema aprendeu
  aqui" — não gráfico, não histórico longo, não série temporal;
- **Não** duplicar a sidebar. A lista de projetos ali continua sendo a navegação; aqui ela aparece
  como estado, com números.

## 8. O que precisa ser desenhado no Open Design

Nada disto existe lá, e **é lá que nasce** ([regra](../../project/design-source-of-truth.md)):

1. o painel do workspace — cabeçalho com nome, os projetos como estado **com o consumo**, o seletor
   de janela de tempo, e onde a memória entra;
2. o gesto de renomear em linha, e o de remover com a guarda de "só quando vazio";
3. o estado vazio: workspace sem projeto nenhum — que é hoje o caso em que **nada** é alcançável;
4. o consumo por worktree na visão do projeto — a mesma linguagem do consumo por projeto, um nível
   abaixo.

## 9. Risco

**O painel do workspace vira a tela de tudo.** Ele é o único espaço grande sem dono, então toda coisa
sem lugar vai querer morar aqui — preferências, consumo, permissão, telemetria. O §4 é a defesa, e ela
só vale se for lida na hora de acrescentar.
