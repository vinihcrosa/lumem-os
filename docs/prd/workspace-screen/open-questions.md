# A tela do workspace — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 6 perguntas · **0 respondidas**.

---

### [ ] W1 — A memória do workspace fica no painel central ou continua no painel direito?

O PRD (§3) diz painel central, no lugar de *"selecione uma worktree"*. A alternativa é manter a
memória sempre no painel direito e só **fazer o botão `▤ arquivos` aparecer** sem checkout — o que é
uma mudança de duas linhas e resolve a pergunta que originou a feature.

As duas leituras:

- **painel central**: o workspace ganha um lugar, e a memória é uma parte dele. Custa uma tela nova;
- **painel direito sempre disponível**: barato, imediato, e deixa o workspace continuar sem tela — a
  aba se chamaria `Memória` mostrando conteúdo diferente dependendo de haver ou não checkout, sem nada
  na tela dizendo qual dos dois você está vendo.

**Proposta pra reagir:** painel central. O motivo não é a memória — é que *"selecione uma worktree"* é
o único lugar do produto onde a resposta a "onde eu estou" é uma instrução em vez de uma tela.

**Custo de esperar:** a memória de workspace segue alcançável só por projeto, e um workspace vazio
segue sem porta nenhuma.

---

### [ ] W2 — Remover workspace exige zero projetos, ou remove em cascata?

O PRD do [walking-skeleton](../walking-skeleton/prd.md) proíbe deleção em cascata, e o schema impõe
`ON DELETE RESTRICT` em toda chave estrangeira. Então tecnicamente a resposta já existe: remover
workspace com projeto dentro **falha no banco**.

A pergunta é de tela: o botão fica **desabilitado** com o motivo ao lado, ou fica ativo e a recusa
chega como erro?

**Proposta pra reagir:** desabilitado, com o motivo escrito — é o que o `remover projeto` do
`LocalPanel` já faz, e repetir o padrão é mais valioso que qualquer variação.

---

### [ ] W3 — E a memória `global`? Ela não é do workspace.

A memória de escopo `global` é *você*, e atravessa workspace. No painel do workspace ela aparece —
`resolveVisible` sem `projectId` devolve `workspace` **e** `global`, e é o que a aba do projeto já
mostra hoje.

Isso é certo ou é confusão? Um `global` que aparece em todo workspace pode dar a impressão de que ele
**pertence** àquele workspace, e editá-lo dali muda o comportamento em todos os outros.

**Proposta pra reagir:** aparece, e o grupo já diz `você · atravessa workspace` — que é literalmente o
aviso. O que **não** pode é o gesto de apagar não dizer que o efeito é global.

---

### [ ] W4 — Os números do workspace são quais, exatamente?

O daemon responde de graça: quantos projetos, quantas worktrees, quantas sessões vivas. Consumo por
projeto **não** — o dado existe por turno e agregar é trabalho novo (§4 do PRD tira isso de escopo).

**Proposta pra reagir:** só os três de graça, e nenhum número que precise de query nova. Se um número
exige trabalho de daemon, ele não é desta feature.

---

### [ ] W5 — O painel do workspace tem abas?

O painel direito tem (`Arquivos`, `Mudanças`, `Memória`). Se o painel central também tiver, o produto
passa a ter dois conjuntos de abas na mesma tela, e a pessoa tem que aprender qual barra é qual.

**Proposta pra reagir:** sem abas. Uma coluna: cabeçalho, projetos, memória. Se um dia não couber, a
memória volta a ser aba — e aí é decisão com sintoma, não com palpite.

---

### [ ] W6 — Renomear workspace mexe em disco?

Não: o nome do workspace é uma coluna, e a memória dele mora em `workspaces/<id>/`, por **id**. Então
renomear é uma linha no banco e nada mais.

Vale confirmar aqui porque o oposto valeria para o **projeto**: o `id` do projeto é o que está no
`.lumem` do repositório, e o caminho da memória usa ele.

**Proposta pra reagir:** confirmar por teste — renomear workspace, e a memória continuar sendo achada.
