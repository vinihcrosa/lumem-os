# O rodapé aberto por padrão — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 6 perguntas · **5 respondidas em 2026-09-01**. A Q6 nasceu ao escrever as tasks e é a
única aberta — e ela não trava a T1. Todas foram desenhadas antes de
respondidas — `packages/web/prototype/lumem-run-dock-open.html` —, e três respostas **mataram** o que
o desenho propunha. O protótipo guarda as duas colunas: o que foi decidido, e o que foi recusado.

---

### [x] Q1 — Com que altura ele nasce?

Hoje o padrão é **metade da janela** — escolhido para quem **abriu** o rodapé de propósito, para ler
a saída de um `pnpm dev`. Nascer assim é outra coisa: a árvore de arquivos apareceria pela metade
para quem nunca pediu o rodapé.

Três leituras: metade (o de hoje); uma **altura de leitura** fixa (~200px: cabeçalho, estado, porta e
as últimas linhas); ou **duas alturas** — nasce baixo, e a primeira vez que alguma coisa roda ele
sobe para a metade.

**Proposta pra reagir:** **altura de leitura**, e a pessoa arrasta. A terceira opção é um rodapé que
se mexe sozinho, e coisa que se mexe sozinha na tela é o que se aprende a não olhar.

**Desenhado:** o **quadro 3** põe as três alturas lado a lado, na mesma coluna de 360px, com o
número de arquivos que sobra embaixo de cada uma: **12** recolhido, **10** na altura de leitura,
**2** com metade. O número proposto é **192px** — `calc(var(--space-64) * 3)`, ou faixa (32) +
estado (32) + seis linhas de mono. E ele é **fixo** de propósito: fração é o padrão de quem *abriu* o
rodapé, e no monitor grande ela dá 500px de terminal a quem só queria saber a porta. Fixo, ele fica
proporcionalmente **menor** quanto maior a janela — a direção certa, porque o que ele mostra não
cresce com a tela.

A terceira leitura — nasce baixo e sobe quando algo roda — **não foi desenhada de propósito**: é a
árvore que você estava lendo encolhendo porque um processo subiu em outro canto.

**O que falta decidir:** 192px, ou 160 (sem a linha de estado) / 224 (mais duas linhas de saída)?

**Custo de esperar:** trava a feature — é a decisão inteira.

**R:** **Metade da janela, como é hoje.** Nenhum número novo entra no produto.

O que fechou: com a mesma lista de 16 arquivos nas três colunas, a árvore mostra **16** linhas
recolhido, **14** com 192px e **11** com metade. A altura de leitura comprava **três linhas** de
árvore e custava um segundo número de altura — um para quem chega, outro para quem abre, e a pergunta
*"por que ele mudou de tamanho?"* para sempre. `defaultHeight`, `clampHeight`, `maxHeight` e o piso
não mudam: a feature mexe no `open`, não na altura.

---

### [x] Q2 — A coluna direita salta para 640px no primeiro contato?

A `RUN_DOCK_PANEL_WIDTH = 640` existe porque um terminal de 80 colunas não cabe em 360. Se o rodapé
nasce aberto, ou a coluna nasce com 640 (e come o painel central para todo mundo), ou o terminal
nasce estreito.

**Proposta pra reagir:** o piso de 640 só se aplica quando a pessoa **abre** o rodapé ou quando algo
começa a **rodar** nele. Aberto por padrão, com altura de leitura e sem terminal anexado, não precisa
de 80 colunas — precisa mostrar estado e porta.

**Desenhado:** o **quadro 4** põe as duas larguras lado a lado com a mesma saída dentro, e escreve
a regra em três linhas: **sobe para 640** com gesto (clicar `Terminal`, abrir o rodapé, mandar rodar,
arrastar a alça); **não sobe** ao entrar na worktree, ao daemon reconciliar um `run` que já estava de
pé, ou ao trocar de worktree com o rodapé aberto; **nunca desce** sozinha — coluna alargada é
preferência lembrada, como já é hoje.

O custo, dito por inteiro: quem chega numa worktree com um `webpack` falando em tabelas de 100
colunas vê texto dobrado até o primeiro clique. A troca é *saída dobrada para todos na chegada*
contra *280px do painel central para todos na chegada* — e dobrar é reversível com um clique, o
painel central comido não avisa que foi comido.

**Custo de esperar:** trava a feature junto com a Q1: as duas são a mesma conta de espaço.

**R:** **Fica em 360, e pronto.** Nada alarga a coluna sozinho; o piso de 640 continua só no
`toggle`, onde já está (`App.tsx:283`).

A pergunta estava mal feita da minha parte — falava em pixel, e a unidade é **coluna de terminal**. A
saída do rodapé é `xterm` com `FitAddon` e o daemon redimensiona o PTY para as colunas do painel
(`Terminal.tsx:124`): 360px são **~45 colunas**, e é isso que os processos são informados que têm. O
preço aceito, com o nome certo: `turbo` gasta 18 colunas no prefixo `@lumem/web:dev:` e sobram 27, e
`vitest` desenha em 80 uma tabela que tem 45. Vale menos que os 280px do painel central que o piso
cobraria de todo mundo, toda vez.

**Consequência boa:** esta resposta não custa **nenhuma linha de código**. O piso já sobe só no
`toggle`; nascer aberto significa que o primeiro `toggle` não acontece.

---

### [x] Q3 — Aberto por padrão vale para o checkout que não declara `[scripts]`?

Um projeto sem `[scripts]` no `project.toml` não tem `setup` nem `run` — o rodapé aberto ali mostra
um vazio com um convite (*"peça ao agente para escrever"*).

**Proposta pra reagir:** **sim, vale.** É onde a promessa da feature mais aparece: é o único lugar do
produto que diz que este repositório não sabe se levantar, e escondê-lo atrás de um clique é como
não tê-lo.

**Desenhado:** o **quadro 5** desenha os dois blocos lado a lado. A resposta do desenho é **sim** —
e o que muda é o bloco: em 192px não cabem as oito linhas de TOML *e* a frase que explica. Entra a
frase, o caminho do arquivo e dois botões (`pedir ao agente`, `ver o exemplo`); o exemplo original
fica intacto atrás do segundo.

**Custo de esperar:** baixo.

**R:** **Sim, vale.** E com metade da coluna o bloco não precisa de versão compacta: as oito linhas
de TOML e os botões cabem como já são. O `noscripts` fica intacto — um estado a menos para manter.

---

### [x] Q4 — A saída dobrada vale para a aba `Terminal` também?

Nasceu do desenho (F1.7). Dobrar a saída do `run` custa pouco: ela é lida como log, e uma linha em
duas continua sendo uma linha. Um shell é outra coisa — `top`, `vitest --reporter=verbose` e qualquer
coisa que desenhe caixa dependem de coluna, e dobrar transforma o desenho em lixo.

**Proposta pra reagir:** no `Terminal`, em vez de dobrar, um **convite a alargar** — a aba mostra o
terminal com as colunas que tem e uma linha dizendo que ele está estreito, com o gesto ao lado.
Clicar `Terminal` já é um dos gestos que sobem o piso para 640, então este caso é raro: sobra quem
estreitou a coluna à mão depois.

**Custo de esperar:** baixo — dá para nascer dobrando e consertar depois de ver doer.

**R:** **A pergunta se dissolveu.** Ela supunha que a dobra era uma escolha nossa de CSS; não é. Todo
corpo de aba do rodapé — `Run` incluído — é `xterm` com `FitAddon` (`RunDock.tsx:339` e `:563`), e ele
reflui sozinho para as colunas que tem, com o PTY redimensionado junto. Não há `Terminal` especial a
tratar, nem convite a alargar a escrever: a resposta da Q2 aceitou **~45 colunas na chegada** para
todas as abas. Se doer, o conserto é a Q2 de novo, e não uma regra por aba.

---

### [x] Q5 — "Mandar rodar" alarga a coluna na hora?

Também do desenho. `mandar rodar` está na lista dos gestos que sobem o piso para 640 — mas ele é o
gesto mais provável na chegada, e alargar a coluna **no mesmo instante** em que o processo sobe é
exatamente o salto de largura que a PRD queria evitar, só um clique depois.

**Proposta pra reagir:** alarga, e alarga **no clique** — antes de a primeira linha de saída chegar,
para que o movimento seja lido como consequência do clique e não como o processo mexendo na tela
sozinho.

**Custo de esperar:** baixo, mas ela decide uma linha do código.

**R:** **Não. Mandar rodar roda, e não mexe na tela.** Nenhum gatilho novo de largura entra — nem no
clique, nem quando a primeira linha de saída chega. Coerente com a Q2: a coluna só muda quando a
pessoa muda, pelo chevron ou pela alça.


---

### [ ] Q6 — Os dois botões descem **sempre**, ou só quando a coluna é estreita?

Nasceu da T2. A faixa completa mede 494px e a coluna tem 360, então `Abrir :porta` e `parar` têm que
sair de lá — isso está decidido. O que não está: o que acontece quando a coluna **é** larga.

Duas leituras. **Sempre**: um layout só, os botões vivem na linha de estado em qualquer largura. Ou
**por largura**: uma `@container` devolve os botões à faixa a partir de 640px, e a tela de quem abre
o rodapé continua exatamente como é hoje.

**Proposta pra reagir:** **sempre**. É o mesmo argumento que ganhou a Q1 — um segundo layout é um
segundo número: dois lugares onde `parar` pode estar, e a pergunta *"por que ele mudou de lugar?"*.
E a linha de estado é discutivelmente a casa melhor: `parar` lido junto de `rodando · 4 min` explica
o que ele para.

**O que ela custa:** quem abre o rodapé em 640px hoje vê os botões na faixa, e passaria a vê-los uma
linha abaixo. É mudança visível numa tela que ninguém reclamou.

**Custo de esperar:** baixo, e localizado. A T1 (a feature) não depende dela; só a T2.

**R:**
