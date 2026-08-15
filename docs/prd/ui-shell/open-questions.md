# Interface — perguntas

Registro de por que cada decisão de desenho foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 12 perguntas · 10 respondidas · 2 abertas

---

## Respondidas

### Q1 — Matiz da marca?

**Violeta 292° com acento lima 118°.**

Escolhido pelo Vinicius entre âmbar-quente, violeta-lima e ciano-frio.

Os dois números saíram diferentes do default do gerador, e por motivo medido, não estético. `brand` a 272° renderiza índigo — a amostra prometia violeta. E `accent` a 72° é o mesmo âmbar que `warning` a 78°: duas rampas a menos de ~30° são a mesma cor na tela, e essas duas aparecem **na mesma linha** do detalhe da worktree (`branch` ao lado de `suja`).

Regra que fica: matiz nova entra a pelo menos 30° de todas as existentes.

---

### Q2 — Escuro ou claro?

**Escuro, e só escuro nesta versão.**

O produto é um harness de terminal. A camada semântica de tokens torna o tema claro uma troca de rampa depois, não uma reescrita — que é exatamente o motivo de ela existir.

---

### Q3 — Qual a âncora de densidade?

**Linha de lista de 28px.**

Todo o resto deriva: `control/md` = 28, `topbar/height` = 40 (a linha mais folga), `row/cozy` = 32. Ferramenta densa se calibra pela linha; app de conteúdo se calibraria pelo corpo de texto.

---

### Q4 — Quem tem cor na sidebar?

**Só o que está vivo ou quebrado.**

A primeira renderização pintava projeto (ciano), worktree (lima), shell (ciano) e agente (violeta). Quatro matizes competindo, e o ponto verde de "rodando" — que é *o* sinal do produto — enterrado no meio.

Estrutura virou cinza. `scope/project` é `neutral/400`. Sobrou cor para sessão, estado de git e problema.

Efeito colateral bom: projeto e shell eram ambos azuis e não têm relação nenhuma. Sumiu a confusão.

---

### Q5 — Sessão com escopo no projeto aparece onde na sidebar?

**Filha direta do projeto, acima das worktrees.**

O F3.4 do walking-skeleton só descreve worktree expandindo em sessões, mas o F5.2 permite agente no projeto principal — e uma sessão que existe e não aparece na árvore é uma sessão que o usuário perde.

---

### Q6 — Projeto cujo repo sumiu do disco: como aparece?

**Linha apagada, com `sem disco` à direita, ações bloqueadas.**

O §8 já decidiu que o registro permanece. O que faltava era a aparência: apagar sem sumir. Mesmo tratamento para worktree `missing`, com um `⚠` no lugar do ícone, porque ali existe uma ação de recuperação — remover o registro.

---

### Q7 — Contagem de sessões rodando e o pip verde em nó colapsado exigem campo novo no servidor?

**Não. Sem tocar no servidor.**

A leitura inicial dizia que sim. Reler o código desmentiu: `SessionList` já monta para toda worktree hoje, então as queries por escopo já acontecem — o dado está no cache, só não está sendo lido no lugar certo.

A query sobe para um hook `useSessionsByScope`. Mesma query key, um fetch só, lido em dois lugares: o pip da linha da árvore e a lista do detalhe. Colapsar esconde as linhas filhas; não desmonta a query do pai.

Se um dia virar gargalo, aí sim entra agregação no servidor — em feature própria.

---

### Q8 — `WorkspaceSelector`: `<select>` nativo ou menu construído?

**`<select>` nativo, com `appearance: none` e glifo próprio.**

Fica um pouco fora do protótipo. Em troca vem teclado, leitor de tela e comportamento de plataforma de graça, e some a necessidade de clique-fora, `Esc` e gestão de foco.

Menu construído entra se e quando o seletor precisar de algo que `<option>` não faz — ícone por item, ação de criar embutida, agrupamento.

---

### Q9 — O que fazer com os elementos do protótipo que não têm dado no servidor?

**Cortados desta rodada:** `buffer 1 284 / 10 000 linhas` no cabeçalho do terminal, `pid 48213` e `158×42` nos chips da sessão.

Nenhum tem endpoint. Inventei os três desenhando, e são exatamente o tipo de coisa que fica bonita no protótipo e vira campo novo no contrato quando alguém tenta implementar.

**Fica:** a idade da sessão (`12 min`), que sai de `session.createdAt` — já existe.

---

### Q10 — `Ver no Finder` na worktree ausente entra?

**Não.** É integração com o SO, que o walking-skeleton listou como fora de escopo. O protótipo mostra o botão porque o desenho pedia uma ação secundária ali; a implementação não o coloca.

---

## Abertas

### Q11 — A `/styleguide` fica no bundle de produção?

Hoje o app não tem rota nenhuma — `App.tsx` decide tudo por estado. Adicionar `/styleguide` implica escolher entre:

- **condicional em `import.meta.env.DEV`** — some do bundle, mas não dá pra conferir o build real
- **rota sempre presente** — bundle carrega uma página que o usuário nunca abre
- **entry point separado no Vite** — mais config, e o styleguide vira um segundo app

**Resolvida na prática pela T2:** condicional em `import.meta.env.DEV`, com `import()` dinâmico. O build de produção sai com um chunk só e zero ocorrência do styleguide — o bundler descarta o módulo inteiro porque a condição é estática. Fica aberta só a parte que não dá pra medir assim: conferir o styleguide contra o *build* real, e não contra o dev server.

---

### Q12 — Glifo de prompt que nenhuma fonte de texto tem

**Aberta.** Prompt de zsh com tema (powerline, ícone de branch, separadores) usa a faixa privada do Unicode, que só existe em fonte *patched* — Nerd Font e parecidas. A JetBrains Mono não tem, e o macOS não traz nenhuma: o resultado é ▯ onde o terminal nativo do usuário mostra ícone.

A T9 fez o possível sem escolher por ninguém: a pilha de fonte do terminal nomeia as patched mais comuns **antes** da JetBrains Mono. Quem já tem uma instalada vê o prompt igual ao do terminal nativo; quem não tem cai na fonte desenhada e vê as caixas.

O que sobra pra decidir, quando doer:

- **empacotar uma fonte patched** — resolve pra todo mundo, custa alguns MB e uma licença pra revisar
- **deixar o usuário apontar a fonte** — precisa de tela de preferências, que não existe
- **aceitar as caixas** — é o estado atual

Nada disso é urgente enquanto o usuário for um só e a fonte estiver na máquina dele.
