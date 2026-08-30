# Projeto por URL git — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 22 perguntas · **22 respondidas** · nenhuma aberta

As **fechadas no desenho** foram decididas pelo que o repositório já é — havia uma resposta que não briga com o código existente e uma que briga. As **respondidas pelo Vinicius** vieram depois, e quatro delas derrubaram desenho: a Q14 substituiu a Q9, a Q15 reverteu um requisito do walking-skeleton, a Q17 apagou uma fila inteira, e a Q20 reorganizou o diretório de estado inteiro — inclusive a parte que não é desta feature.

---

## Fechadas no desenho

### Q1 — Um campo que aceita as duas coisas, ou dois modos?

**Um campo, com a linha `↳` dizendo o que foi entendido.**

`pathSchema` já exige caminho absoluto. Então a detecção não é heurística: começa com `/` ou `~` é caminho, o resto é URL. Não há entrada ambígua a desempatar.

Dois modos custariam um clique em toda adição de projeto para resolver uma ambiguidade que não existe. O que a detecção automática realmente arrisca é o usuário não perceber o que vai acontecer — e é a linha `↳`, não o alternador, que resolve isso.

---

### Q2 — O clone é uma mutation que espera, ou um job?

**Um job.**

`DEFAULT_GIT_TIMEOUT_MS` é 30 s. Um clone real passa disso com frequência, e subir o timeout só empurraria o problema: não haveria progresso, e um F5 no meio perderia o acompanhamento de algo que continua rodando.

O custo é uma máquina de estados nova. O que ela compra: cancelar, progresso, e sobreviver a recarregar a página.

---

### Q3 — O progresso vai pelo `events.onChange` ou por um fluxo próprio?

**Fluxo próprio, `project.cloneProgress`.**

O `events.ts` tem doutrina escrita — *"o evento diz qual lista está velha, não qual é o novo conteúdo"*. Progresso não tem lista para invalidar; é dado, dez vezes por segundo. Pelo canal comum, cada tique viraria um refetch em **todo** cliente conectado por causa de um clone que só um deles pediu.

O estado terminal emite, sim, um `project.changed` no canal comum: aí há uma lista velha, e é exatamente a que a sidebar já sabe recarregar.

---

### Q4 — O job vive no SQLite ou em memória?

**Memória.**

O job descreve um processo filho. O processo não sobrevive a um restart do daemon, então uma linha persistida diria "clonando" sobre coisa nenhuma — a mesma mentira que `project.ts` evita ao recalcular `available` a cada requisição em vez de guardá-lo.

O que precisa sobreviver ao restart é o **lixo no disco**, e disso cuida a varredura de boot, que não precisa do job para nada: reconhece o temporário pelo nome.

---

### Q5 — Registrar por caminho e clonar são dois caminhos de registro?

**Não. O clone termina chamando o mesmo registro do `project.add`.**

Duas rotinas de registro seriam duas definições de "projeto válido", e a segunda ficaria para trás na primeira vez que a primeira mudasse. Com uma só, um clone que termine num diretório que não é raiz de repositório é recusado igual a um caminho digitado — o clone não ganha desconto por ter dado trabalho.

---

### Q6 — Colisão de nome depois de quatro minutos clonando: falhar ou ajustar?

**Ajustar com sufixo, e dizer por extenso.**

O caso comum é resolvido antes de começar, com a checagem prévia. O que sobra é a corrida — alguém registrou aquele nome enquanto o clone rodava.

Aí falhar significa apagar 4 GiB por causa de uma string. Renomear é reversível com um clique; o download, não. O que torna isso aceitável é o job dizer *"o nome api já existia; registrado como api-2"* — ajuste silencioso seria outra coisa.

Com a [Q14](#q14--o-destino-é-escolhido-pelo-usuário) respondida, o sufixo passou a ter uma segunda consequência: o nome **é** o diretório. Ver a Q21.

---

### Q7 — Timeout total ou de silêncio?

**De silêncio, 120 s.**

Timeout total pune quem tem repositório grande ou rede ruim, que é o usuário que mais precisa que funcione. Silêncio pega o que realmente está travado: DNS pendurado, TCP que não fecha, servidor que aceitou e sumiu.

---

### Q8 — Guardar a URL de origem?

**Sim, `project.remote_url`, anulável e sanitizada.**

Nulo significa "registrado por caminho". Não é decoração: é o primeiro dado que a [Q291 do questions.md](../../project/questions.md) — identidade estável de projeto — precisa ter para ser discutida, e é o que qualquer `fetch` futuro vai ler.

Sanitizada porque a alternativa é guardar token em texto puro no SQLite.

---

### ~~Q9 — Onde o clone cai por padrão?~~ — substituída pela [Q14](#q14--o-destino-é-escolhido-pelo-usuário)

O desenho propunha `~/.lumem/repos/<slug>` **editável**, com o argumento de que um repositório clonado é um repositório de verdade e a pessoa vai querer abri-lo em outra ferramenta.

A Q14 respondeu o contrário, e o argumento dela é melhor: o que o Lumem gerencia tem lugar fixo e ciclo de vida definido. Fica registrada riscada, e não apagada, porque a Q15 depende de a resposta ter sido esta — se o destino fosse editável, apagar no `remove` seria indefensável.

O caminho final não é o desta pergunta nem o literal da Q14: a [Q20](#q20--as-worktrees-também-se-mudam-para-a-nova-árvore) o levou para `~/.lumem/workspaces/<workspace>/<projeto>/repo`.

---

## Respondidas pelo Vinicius

### Q10 — `http://` sem TLS: permitir?

**Permitir agora, e virar configuração depois.**

> *"permite por hora, mas no futuro deve ter uma configuração de permitir ou não."*

Git server self-hosted em rede interna, com cert que ninguém emitiu, é o caso normal — e é justamente o público que esta feature existe para atender.

O "depois" não é vago: vira a **[Q22](#q22--a-lista-de-transportes-permitidos-vira-configuração-quando)**, com a Q12 junto. A v1 permite `http` e o `↳` diz **"sem TLS"** em texto na tela, porque a credencial vai em claro se a pessoa usar um helper sobre ele.

---

### Q11 — `git://` entra na lista de permissão?

**Não.**

> *"faz sentido, concordo em não permitir."*

Sem autenticação e sem integridade. Quem tem um servidor assim quase sempre tem https ou ssh no mesmo repositório. Ficar de fora é reversível em uma linha; entrar e depois sair, não.

---

### Q12 — `file://` entra?

**Entra, com desconforto registrado.**

> *"podemos deixar, mas eu acho que não é o ideal."*

Fica porque espelho em NFS e bare local são legítimos, e porque é o transporte das fixtures de teste — tirá-lo significaria exercitar `file://` num caminho de código que o produto não usa, que é a pior forma de teste que existe.

O desconforto é justo e não some: num daemon sem autenticação, `file://` deixa qualquer repositório legível pelo usuário a uma chamada de distância. Então ele é o **primeiro candidato a ser desligado** quando a [Q22](#q22--a-lista-de-transportes-permitidos-vira-configuração-quando) existir, e é isso que a torna uma pergunta com prazo, e não uma boa intenção.

---

### Q13 — Campo de token na v1?

**Não. As credenciais são as da máquina, e a falha de autenticação ganha fluxo próprio.**

> *"o daemon deve usar as credenciais que estão na máquina, se der erro de autenticação deve falhar o processo. Deve haver um fluxo para a falha nesse caso."*

As duas metades importam, e a segunda é a que virou requisito novo (**F6.10**):

| Metade | O que é |
|---|---|
| "usar as credenciais da máquina" | `ssh-agent` e `credential.helper`, herdados porque o daemon roda como o usuário. Nenhum segredo entra no Lumem |
| "deve haver um fluxo para a falha" | Falha de autenticação **não** é uma falha genérica com o stderr do git repassado. É um estado próprio, que nomeia as duas saídas e — para URL `https` — oferece a conversão para a forma `ssh` do mesmo repositório, em um clique |

Sem a segunda metade, a decisão "não guardamos token" viraria um beco sem saída para quem clona repositório privado por https.

---

### Q14 — O destino é escolhido pelo usuário?

**Não. Lugar fixo, dentro do estado do Lumem.**

> *"não, o lugar é o mesmo, `~/.lumem/workspaces/<project>`"*

Esta substitui a [Q9](#q9--onde-o-clone-cai-por-padrão--substituída-pela-q14) e é a resposta com mais consequência de todas. Três, em ordem de tamanho:

**1. O campo "Destino" deixa de existir.** O diálogo tem um campo (o que foi colado) e um nome. O caminho é mostrado, e é copiável — mas não é digitável.

**2. A superfície de segurança encolhe.** No desenho anterior, o destino vinha do cliente, e as seis regras do §4.4 do PRD existiam para conter uma string hostil. Agora o destino é **calculado pelo servidor a partir de dados que ele já tem** — nome do workspace, nome do projeto. Deixa de ser validação de entrada e vira invariante interna: o guarda continua existindo, mas o que ele defende é erro do próprio daemon, não ataque.

**3. A Q15 passa a ser defensável.** Só se pode apagar no `remove` porque o Lumem sabe, sem depender de heurística, que aqueles bytes são dele.

**Uma correção ao caminho literal:** o segmento do workspace é obrigatório. `project_name_per_workspace` é um índice único **por workspace**, não global — dois workspaces podem ter, legitimamente, um projeto chamado `api`, e `~/.lumem/workspaces/api` os faria colidir no disco. O caminho implementado é:

```
~/.lumem/workspaces/<workspace>/<project>
```

**E um segmento a mais, vindo da [Q20](#q20--as-worktrees-também-se-mudam-para-a-nova-árvore):** o repositório fica em `repo/`, não na raiz da pasta do projeto, porque `worktrees/` passa a ser seu irmão. O caminho final é:

```
~/.lumem/workspaces/<workspace>/<projeto>/repo
```

---

### Q15 — Remover um projeto clonado deveria apagar o clone?

**Sim. O que o Lumem gerencia tem ciclo de vida definido.**

> *"Se é um repos advindo do git, sim ele deve apagar o repositório, o que é gerenciado pelo Lumem deve ter ciclo de vida bem definido."*

**Isto reverte o F2.5 do [walking-skeleton](../walking-skeleton/prd.md)**, que diz que remover um projeto nunca toca no disco. A reversão é deliberada e limitada, e o §2.1 do [PRD](prd.md) a documenta — não-objetivo revertido sem registro é dívida de documentação, e a file-editor já estabeleceu o precedente de como fazer isso.

O limite é a palavra **gerenciado**, e ela precisa ser um dado, não uma dedução:

| Projeto | `remove` faz |
|---|---|
| Registrado por caminho, apontando para um repositório do usuário | remove o registro. **O disco não é tocado**, como sempre foi |
| Clonado pelo Lumem, dentro da árvore do Lumem | remove o registro **e apaga o diretório**, depois de uma confirmação que diz o caminho |

Por isso a coluna `managed` existe, e é gravada no momento do clone, em vez de ser inferida de `remote_url != null` ou de o caminho começar com o diretório de estado. Inferência erra em silêncio na primeira vez que alguém mover algo, e o erro aqui é apagar o repositório de outra pessoa.

O que **não** muda: worktrees continuam bloqueando a remoção por `ON DELETE RESTRICT`. Apagar o clone com worktrees penduradas nele não chega a ser uma decisão — é uma impossibilidade, e já era.

---

### Q16 — Submódulos: quando?

**Não na v1, e a decisão é de segurança.**

> *"parece ok."*

A URL do submódulo vem do `.gitmodules` do repositório remoto — de quem controla o repositório, não de quem colou. Habilitar recursão é reabrir o §4.1 do PRD com outro dono. Quando vier, vem com a mesma lista de permissão aplicada a cada URL de submódulo, o que é trabalho de verdade.

---

### Q17 — Quantos clones simultâneos?

**Um. E o segundo pedido é recusado, não enfileirado.**

> *"é uma por vez, o usuário vai adicionar um projeto por vez, não vai adicionar vários."*

A recomendação era teto de 2 com fila. A resposta é melhor: fila é estado a mais, uma tela a mais ("aguardando") e uma ordem a mais para explicar — tudo isso para um caso que não acontece.

Um clone por daemon, e `project.clone` responde `BLOCKED` nomeando o clone em andamento enquanto houver um. A pendência P4 (teto e fila) morre aqui, e não vira dívida.

---

### Q18 — `~` é expandido em qual máquina?

**No servidor.**

> *"parece ok."*

O daemon pode estar em outra máquina — a [Q580 do questions.md](../../project/questions.md) trata disso. O disco que importa é o dele.

Com a Q14, isto encolheu: o único `~` que sobra é o do caminho **local** digitado no campo, porque o destino do clone deixou de ser digitável. O `↳` continua mostrando o caminho já expandido, que é o que impede o mal-entendido.

---

### Q19 — Um repositório remoto **vazio** deve poder ser clonado?

**Sim.**

> *"não vejo motivo algum para um repo vazio não ser clonado, o cliente pode querer clonar um vazio para trabalhar no Lumem desde o dia 0."*

O caso é legítimo e é o que a v1 faz. O que a resposta expõe, e o desenho não tinha visto, é o que acontece **depois** do clone: um repositório sem nenhum commit não tem de onde cortar worktree — `git worktree add` falha em referência inválida, porque a branch existe como nome e não como commit.

Ou seja, o projeto do dia 0 nasce válido e com uma coisa a menos, até o primeiro commit. Isso não é motivo para recusar o clone; é motivo para a tela dizer. Vira a **[Q21](#q21--o-projeto-do-dia-0-não-corta-worktree-o-que-a-tela-diz)**.

---

## Respondidas pelo Vinicius — segunda rodada

### Q20 — As worktrees também se mudam para a nova árvore?

**Sim. Opção A: uma árvore só.**

> *"pode fazer a A, o projeto não está em produção, isso não vai quebrar nada."*

A recomendação era adiar, com o argumento de que mover worktrees é migração de dados em uso. O argumento caiu porque a premissa era falsa: não há uso a preservar. Então o layout passa a ser um só, e é este:

```
~/.lumem/workspaces/<workspace>/<projeto>/
                                 ├── repo/                ← o clone (só em projeto gerenciado)
                                 └── worktrees/<nome>/     ← toda worktree, gerenciada ou não
```

Quatro consequências, e a terceira quase passou despercebida:

**1. `worktreesDir` deixa de existir.** `config.ts` troca `~/.lumem/worktrees` por `~/.lumem/workspaces`, e o caminho de uma worktree deixa de ser `join(worktreesDir, projeto, nome)`.

**2. O caminho da worktree passa a precisar do workspace.** Hoje `worktreePath` recebe só nome de projeto e de worktree. Agora precisa do workspace, que o router alcança pelo `project.workspaceId`. É uma consulta a mais no `create`, e é o preço de a hierarquia do disco finalmente descrever a hierarquia do produto.

**3. Projeto não gerenciado também ganha pasta na árvore.** Ele não tem `repo/` — o repositório dele mora onde o usuário o deixou — mas tem `worktrees/`. Isso precisa ser dito em voz alta: `projectHome` é função de `(workspace, projeto)`, e não consequência de ter sido clonado. Se dependesse de `managed`, haveria dois cálculos de caminho, e o §4.4 do PRD valeria só para metade dos projetos.

**4. Mover worktree existente exige `git worktree repair`.** Uma worktree guarda caminhos **absolutos** em dois lugares: o arquivo `.git` dentro dela, e o `gitdir` em `<repo>/.git/worktrees/<nome>/`. Um `mv` sozinho a quebra em silêncio — ela continua parecendo diretório de trabalho e para de ser um. O `git worktree repair`, rodado a partir do repositório principal, é exatamente a ferramenta para isso, e é o único detalhe desta pergunta que, esquecido, corrompe dado.

A migração de boot é única, roda uma vez, e é simples justamente porque não há uso a preservar. A alternativa que a resposta autoriza — apagar `~/.lumem/worktrees` à mão e começar limpo — continua válida e é mais rápida. A migração existe para quem não fizer isso, e porque um daemon que encontra estado antigo e não sabe o que fazer com ele é pior que um que o conserta.

---

### Q21 — O projeto do dia 0 não corta worktree. O que a tela diz?

**A tela diz, no lugar onde a worktree seria criada.**

> *"faz sentido."*

`CreateWorktreeDialog` reconhece o projeto sem nenhum commit e explica, em vez de deixar o git responder "invalid reference".

O que a resposta obriga, e não estava na recomendação: o servidor precisa **contar** essa verdade. Hoje ninguém pergunta se um projeto tem commits. Então `hasCommits` entra na visão do projeto, calculado por requisição — como `available` já é, e pelo mesmo motivo: o primeiro commit pode acontecer no terminal ao lado, e um valor guardado seria uma mentira que sobrevive ao fato.

As duas recusas continuam: nada de commit inicial automático (escrever história que o usuário não pediu, num repositório que ele vai empurrar), nada de recusar o clone (foi o que a Q19 rejeitou).

---

### Q22 — A lista de transportes permitidos vira configuração quando?

**Quando o daemon tiver autenticação, e não antes.**

> *"ta ok."*

Vem da [Q10](#q10--http-sem-tls-permitir) e da [Q12](#q12--file-entra). Enquanto não existe, o que segura é a lista de permissão no código, que é uma linha para editar — e é por isso que cada teste de recusa cita a pergunta que a decidiu.

O motivo do "não antes" fica registrado porque é desconfortável: configuração de segurança num daemon **sem autenticação** é configuração que quem alcança a porta pode mudar. Protege contra engano, não contra ataque, e apresentá-la como proteção seria pior do que não tê-la.

Três perguntas que ela vai ter que responder quando vier: onde mora, qual o padrão para instalação nova, e o que acontece com um projeto já registrado cujo transporte foi desligado depois.

---

## O que esta feature devolve para o projeto

| Para onde | O quê |
|---|---|
| [F2.5 do walking-skeleton](../walking-skeleton/prd.md) — "remover projeto nunca toca no disco" | **revertido para projeto gerenciado**, pela [Q15](#q15--remover-um-projeto-clonado-deveria-apagar-o-clone). Documentado no §2.1 do [PRD](prd.md), e o PRD do walking-skeleton é corrigido apontando para cá quando a feature fechar |
| [P2 da file-editor](../file-editor/tasks.md) — daemon sem autenticação | **amplificada duas vezes**: uma procedure que faz rede a partir de uma string, e um `remove` que agora apaga diretório. A dívida não é paga aqui, e é ela que segura a [Q22](#q22--a-lista-de-transportes-permitidos-vira-configuração-quando) |
| [Q291 do questions.md](../../project/questions.md) — identidade estável de projeto | **destravada em parte**: `remote_url` passa a existir, que é um dos três candidatos que a pergunta lista |
| [Q580 do questions.md](../../project/questions.md) — daemon remoto | **pressionada**: `~` de quem, disco de quem, e um clone que baixa gigabytes na máquina errada |
| Layout do diretório de estado | **reorganizado** pela [Q20](#q20--as-worktrees-também-se-mudam-para-a-nova-árvore): `~/.lumem/worktrees` deixa de existir, e a árvore passa a descrever `workspace > projeto > worktree`. Esta feature sai maior do que entrou |
| `worktree.create` e `CreateWorktreeDialog` | **tocados por uma feature de clone**, pela [Q20](#q20--as-worktrees-também-se-mudam-para-a-nova-árvore) (o caminho) e pela [Q21](#q21--o-projeto-do-dia-0-não-corta-worktree-o-que-a-tela-diz) (projeto sem commit). Dito aqui porque escopo que vaza sem registro é como uma feature vira duas |
