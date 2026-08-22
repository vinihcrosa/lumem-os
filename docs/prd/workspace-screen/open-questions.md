# A tela do workspace — perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica
aqui, com o motivo.

**Como usar:** responda embaixo, no `**R:**`. Quando responder, mude para `[x]` e escreva a linha
**Decisão:**. Cada pergunta traz uma **proposta pra reagir** — discordar dela é mais rápido que
escrever do zero.

**Estado:** 7 perguntas · **7 respondidas**. A W4 mudou o escopo da feature: consumo por projeto
entrou, e trouxe trabalho de daemon com ela.

---

### [x] W1 — A memória do workspace fica no painel central ou continua no painel direito?

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

**R:** Painel central, como proposto.

**Decisão: painel central.** O workspace ganha um lugar, e a memória é uma parte dele — não a feature
inteira. Isso mantém a feature do tamanho de uma tela em vez de duas linhas, e resolve junto o caso
que não tem porta nenhuma: workspace sem projeto.

---

### [x] W2 — Remover workspace exige zero projetos, ou remove em cascata?

O PRD do [walking-skeleton](../walking-skeleton/prd.md) proíbe deleção em cascata, e o schema impõe
`ON DELETE RESTRICT` em toda chave estrangeira. Então tecnicamente a resposta já existe: remover
workspace com projeto dentro **falha no banco**.

A pergunta é de tela: o botão fica **desabilitado** com o motivo ao lado, ou fica ativo e a recusa
chega como erro?

**Proposta pra reagir:** desabilitado, com o motivo escrito — é o que o `remover projeto` do
`LocalPanel` já faz, e repetir o padrão é mais valioso que qualquer variação.

**R:** Segue o proposto.

**Decisão: desabilitado, com o motivo ao lado.** O mesmo padrão do `remover projeto` do `LocalPanel`.
O banco já recusa por `ON DELETE RESTRICT`; o que a tela acrescenta é a pessoa saber **antes** de
clicar, e repetir o padrão que já existe vale mais que qualquer variação.

---

### [x] W3 — E a memória `global`? Ela não é do workspace.

A memória de escopo `global` é *você*, e atravessa workspace. No painel do workspace ela aparece —
`resolveVisible` sem `projectId` devolve `workspace` **e** `global`, e é o que a aba do projeto já
mostra hoje.

Isso é certo ou é confusão? Um `global` que aparece em todo workspace pode dar a impressão de que ele
**pertence** àquele workspace, e editá-lo dali muda o comportamento em todos os outros.

**Proposta pra reagir:** aparece, e o grupo já diz `você · atravessa workspace` — que é literalmente o
aviso. O que **não** pode é o gesto de apagar não dizer que o efeito é global.

**R:** faz o proposto.

**Decisão: aparece, e o grupo é o aviso.** `você · atravessa workspace` é literalmente o que o
cabeçalho diz. O que **não** pode é o gesto de apagar não dizer que o efeito é global — apagar uma
memória `global` daqui muda o comportamento em todos os outros workspaces, e a confirmação tem que
falar isso.

---

### [x] W4 — Os números do workspace são quais, exatamente?

O daemon responde de graça: quantos projetos, quantas worktrees, quantas sessões vivas. Consumo por
projeto **não** — o dado existe por turno e agregar é trabalho novo (§4 do PRD tira isso de escopo).

**Proposta pra reagir:** só os três de graça, e nenhum número que precise de query nova. Se um número
exige trabalho de daemon, ele não é desta feature.

**R:** faça as querys novas, quero consumo de tokens por projeto, com filtro por tempo (1d, 7d, 1m, 6m, 1y), e na visão do projeto tem que ter o consumo de tokens por worktree.

**Decisão: consumo entra, e ele exige uma tabela nova.** A proposta era recusar todo número que
custasse query nova; foi recusada, e o escopo do PRD (§4) mudou junto. O que isso implica, e que a
pergunta não tinha:

**Hoje o consumo não existe em lugar nenhum que se possa somar.** O `usage_update` do ACP chega como
evento, vive na transcrição daquela sessão e some da vista quando a aba fecha. Não há coluna, não há
índice, não há data — então "consumo por projeto nos últimos 7 dias" não é uma query difícil, é uma
query **impossível** contra o que está gravado.

E há uma armadilha no próprio dado, que decide o desenho da tabela:

| Campo do `usage_update` | O que ele é | Como se agrega |
|---|---|---|
| `used` | **ocupação da janela de contexto**, acumulada na sessão | somar entre turnos conta o mesmo token N vezes. O que se soma é a **variação** |
| `cost` | o que **aquele turno** custou | soma direto |

Então a tabela guarda **delta de tokens** e **custo do turno**, com carimbo de tempo e com o projeto e
a worktree já resolvidos na escrita — agregar por escopo depois viraria join polimórfico, que é o
mesmo motivo pelo qual `session.scope_id` não tem chave estrangeira.

Sessão retomada reinicia a contagem da janela, então o delta da primeira medição dela é o próprio
valor: quem retoma paga o contexto recarregado, e é honesto que apareça.

---

### [x] W5 — O painel do workspace tem abas?

O painel direito tem (`Arquivos`, `Mudanças`, `Memória`). Se o painel central também tiver, o produto
passa a ter dois conjuntos de abas na mesma tela, e a pessoa tem que aprender qual barra é qual.

**Proposta pra reagir:** sem abas. Uma coluna: cabeçalho, projetos, memória. Se um dia não couber, a
memória volta a ser aba — e aí é decisão com sintoma, não com palpite.

**R:** concordo com o proposto

**Decisão: sem abas.** Uma coluna: cabeçalho, projetos com consumo, memória. Dois conjuntos de abas na
mesma tela obrigariam a pessoa a aprender qual barra é qual. Se um dia não couber, a memória volta a
ser aba — e aí é decisão com sintoma, não com palpite.

---

### [x] W7 — Como se volta para a tela do workspace? `[lm]`

Levantada pelo uso, depois da feature entregue: *"quando eu entro em um projeto, eu não tenho como
voltar a ver as informações do workspace"*. E é literal — o painel do workspace só aparece quando
`selection === null`, e **nada** desfaz a seleção. A única saída hoje é trocar de workspace e voltar,
porque trocar limpa a seleção.

Três formas, e elas custam coisas diferentes:

- **botão na topbar** — um controle novo, ao lado do seletor de workspace que já está ali. Duas coisas
  competindo pela mesma pergunta ("qual workspace?" e "me leve ao workspace");
- **linha na sidebar**, acima da árvore — o lugar da navegação. Mas o elemento do workspace na sidebar
  é um `<select>` nativo, e escolher o valor que já está escolhido não dispara evento nenhum;
- **o breadcrumb** — que já existe em **toda** tela de detalhe, já está escrito com o nome do
  workspace, e é **texto morto** desde sempre.

**R (decisão):** o breadcrumb. E **todo segmento menos o último** navega, não só o workspace.

Duas razões. A primeira é não inventar chrome: o nome do workspace já está na tela, no lugar certo,
dizendo exatamente para onde leva. A segunda é que resolver só o workspace deixaria o mesmo beco um
nível abaixo — de dentro de uma worktree não há como voltar ao **projeto** dela tampouco.

Desenhado no Open Design: `lumem-workspace.html`, tela 4, com o `.crumb__up` na camada de componentes
(`lumem-ds.css`) — porque o breadcrumb é de toda tela de detalhe, não desta.

---

### [x] W6 — Renomear workspace mexe em disco?

Não: o nome do workspace é uma coluna, e a memória dele mora em `workspaces/<id>/`, por **id**. Então
renomear é uma linha no banco e nada mais.

Vale confirmar aqui porque o oposto valeria para o **projeto**: o `id` do projeto é o que está no
`.lumem` do repositório, e o caminho da memória usa ele.

**Proposta pra reagir:** confirmar por teste — renomear workspace, e a memória continuar sendo achada.

**R:** Concordo.

**Decisão: não mexe, e um teste prova.** O nome do workspace é uma coluna; a memória dele mora em
`workspaces/<id>/`, por **id**. O oposto valeria para o projeto — o `id` dele está no `.lumem` do
repositório e o caminho da memória usa ele —, e é por isso que a confirmação vira teste em vez de
comentário.