# Worktree a partir de branch, PR ou issue — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 23 perguntas · **23 respondidas** · nenhuma aberta

As **respondidas pelo Vinicius** vieram em duas levas: quatro antes do desenho, porque mudavam o documento inteiro, e três depois dele. A [Q20](#q20--self-hosted-override-por-projeto-na-v1) da segunda leva derrubou desenho — matou uma coluna prevista e trocou a regra de detecção de provedor. As **fechadas no desenho** foram decididas pelo que o repositório já é.

---

## Respondidas pelo Vinicius

### Q1 — O que entra na v1: só branch, branch + PR, ou as três?

**As três — branch, PR e issue.**

É o escopo cheio da imagem de referência. O custo real não está em ter três abas: está em **falar com o provedor**, e esse custo é pago igual para PR e para issue. Uma vez que o adapter existe, a segunda aba é uma chamada de CLI a mais e uma coluna de origem a mais.

O que isso torna obrigatório é o §5 inteiro do PRD — detecção, disponibilidade, autenticação, três frases de recusa. Feature com dependência externa que não trata a ausência dela vira feature quebrada na máquina do próximo.

---

### Q2 — Como o daemon fala com GitHub e GitLab?

**`gh` e `glab`, os CLIs.**

Isto responde, na prática e por enquanto, a [Q022 do questions.md](../../project/questions.md) — abstração de git host. A resposta é a (c) dela em espírito: interface mínima agora, adapters depois.

O que o CLI compra: nenhum OAuth, nenhum token no SQLite, nenhuma tela de login, nenhum refresh de credencial — e funciona no primeiro dia, porque a máquina do usuário já tem os dois autenticados. É a mesma doutrina do §4.3 da [project-from-url](../project-from-url/prd.md): *"o Lumem não guarda credencial nenhuma; as credenciais são as da máquina"*.

O que ele custa: dependência de binário externo, saída JSON de ferramenta que pode mudar, e nenhum controle sobre rate limit. Os três estão no PRD com nome.

---

### Q3 — O que o prompt digitado faz quando a worktree nasce?

**Abre uma sessão de agente na worktree nova e injeta o texto, com Enter.**

É o comportamento da referência, e é o que faz a feature valer: o ganho não é "criar worktree mais rápido", é **não precisar contar de novo ao agente o que já estava escrito na issue**.

A alternativa — deixar digitado sem Enter — foi descartada porque protege contra um erro que o campo já protege: o texto é lido e editado antes de criar. Meio caminho seria a pessoa apertar Enter num terminal que ela não estava olhando.

O risco real não é o Enter, é o timing: TUI que ainda não subiu perde a entrada. Vira o §6.2 e a [P3](tasks.md).

---

### Q4 — Nome da worktree quando o usuário não digita nada?

**Sorteado.**

> *"o usuário pode digitar, mas se ele não digitar nada coloca um nome aleatório, eu aceito idéias, como nomes de cidades, ou nomes de grandes cientistas, ou coisa do tipo"*

Consequência de desenho: o sorteio precisa ser **visível antes de criar** (placeholder), **único** (contra branch e contra worktree) e **estável durante o diálogo** — sortear de novo a cada tecla faria o nome mudar debaixo do usuário.

Qual lista é a [Q19](#q19--qual-é-a-lista-de-nomes-sorteados), ainda aberta.

---

### Q19 — Qual é a lista de nomes sorteados?

**Sobrenomes de gente que estudou luz e matéria, 150 ou mais, difíceis inclusive.**

> *"eu gosto da idéia, sobre nomes dificeis eu acho que faz parte, mas não só nomes dificeis de gente bem conhecida, tipo shroedinger, que eu provavelmente escrevi errado, e o tamanho tem que ser 150+"*

Duas coisas que a resposta decide, e uma que ela obriga:

- **O tema abre.** Não é só óptica: `schrodinger` não estudou luz, e é exatamente o tipo de nome que a resposta pede. A lista é de física e de computação — quem fez a ciência de que este produto é feito.
- **150+ nomes.** Com dezenas de worktrees vivas, colisão vira acidente raro em vez de rotina, e o sufixo `-2` volta a ser exceção.
- **A transliteração vira regra, não improviso.** `schrödinger` → `schrodinger`, `röntgen` → `roentgen`, `poincaré` → `poincare`. Um nome com acento não é apenas feio como branch: é uma classe de bug de caminho que o `listChanges` já documenta. A lista é ascii minúscula, e um teste percorre **a lista inteira** provando isso — não uma amostra.

O "difícil faz parte" tem consequência de UI, não de dados: quem for digitar `fraunhofer` num `cd` vai errar, então o nome precisa ser **copiável** de onde aparece. O gesto já existe — é o `⧉` do destino de clone, da [project-from-url](../project-from-url/prd.md).

---

### Q20 — Self-hosted: override por projeto na v1?

**Não há override. Quem sabe qual host é seu é o CLI que você já configurou.**

> *"isso é um passo a mais pro usuário em cada repositório que ele mexer, por enquanto só o gh e glab se tiverem configurados na maquina, não deve ser nossa responsabilidade autenticar (...) as credenciais desse usuário devem estar na maquina configurada"*

Isto derrubou desenho em dois lugares:

1. **A coluna `forge_provider` morre antes de nascer.** Ela era o override, e override é o passo a mais que a resposta recusa. A [P4](tasks.md) deixa de ser "adiada" e passa a ser **decidida**.
2. **A detecção deixa de ser por hostname conhecido.** Ver a [Q23](#q23--como-se-descobre-o-provedor-sem-perguntar-nada-ao-usuário) — a resposta abriu uma saída melhor do que a que o PRD tinha.

E confirma, para o produto inteiro, a doutrina do §4.3 da [project-from-url](../project-from-url/prd.md): **o Lumem não autentica nada.** As credenciais são da máquina, porque o produto é de um usuário só, na máquina dele ou no servidor pessoal dele. Um dia isso muda — quando mudar, muda com a autenticação do daemon ([P1](tasks.md)), e não antes.

---

### Q21 — Prompt inicial vale para sessão de shell também?

**Não. O prompt vai direto para o agente, sempre — e é sempre texto.**

> *"o prompt só abre agente, ele vai direto pro agente, se o usuário escrever um comando isso deve ir como uma string para o prompt"*

A segunda metade da resposta é a mais importante, e vira regra: **o Lumem nunca olha para dentro do prompt.** `rm -rf /` digitado ali é uma string que o agente vai ler, não um comando que alguém vai executar. Sem detecção de comando, sem "isso parece um shell", sem caminho especial.

Isso torna o campo explicável em uma frase — *"o que você escrever aqui, o agente lê"* — e elimina a categoria inteira de bug em que o Lumem adivinha a intenção do texto e erra.

---

### Q22 — Branch local que já existe e divergiu do remoto?

**Recusa, dizendo quantos commits atrás a local está.**

Você escolhe `origin/feature/x`; existe uma `feature/x` local, velha, três commits atrás. As outras duas saídas perdem de jeitos diferentes: usar a local abre a worktree em código velho **sem ninguém perceber**, e criar `feature/x-2` deixa duas branches quase iguais no `git branch` para sempre.

A recusa custa um clique e não surpreende ninguém. O dado do atraso já existe — é o `getAheadBehind`, que a `right-panel` já usa — então a frase é *"a branch local `feature/x` está 3 commits atrás de `origin/feature/x`"*, e não "conflito".

O que a decisão protege: **resetar branch local é escrever por cima de trabalho**, e nada nesta feature deveria fazer isso sem pergunta. Quem quiser a atualização faz `atualizar` e depois cria — dois gestos que ele escolheu, em vez de um que aconteceu com ele.

---

## Fechadas no desenho

### Q5 — Abas de origem, ou um seletor "criar de"?

**Abas**, como na referência.

A origem não é um adjetivo da criação: ela muda o corpo do formulário — em `branch nova` não há lista nenhuma, nas outras três a lista é o conteúdo principal. Seletor faria o diálogo trocar de forma sem que a troca fosse a coisa em que o usuário clicou.

---

### Q6 — A aba de branches faz `fetch` sozinha?

**Não. Lista o disco, com um botão `atualizar`.**

O F4.3 do walking-skeleton já decidiu isso para a branch base: *"sem fetch: use o que está no disco"*. Uma lista não é motivo para reverter — `fetch` automático põe rede no caminho de abrir um diálogo, e num repositório grande com remoto lento isso é um diálogo que demora três segundos para aparecer, toda vez.

O fetch **alvejado** existe e roda em outro momento: na hora de cortar de uma branch remota, para a ref daquela branch só.

---

### Q7 — PR: buscar `refs/pull/<n>/head` na mão, ou deixar o `gh pr checkout` fazer?

**O `gh` faz, dentro da worktree recém-criada.**

Buscar a ref é fácil; o que é difícil é o resto. PR de fork vira branch local **sem upstream** — quem for empurrar a correção descobre no push, depois do trabalho feito. Configurar remote, refspec e rastreamento certo, por provedor, é uma matriz de casos que o `gh` e o `glab` já mantêm.

O custo: a worktree nasce `--detach` e só depois vira branch, e uma falha no meio exige rollback. É um rollback que o `worktree.create` já sabe fazer.

---

### Q8 — Branch já aberta em outra worktree: abre a existente, ou recusa?

**Recusa, dizendo qual worktree tem a branch.**

Abrir a existente é **navegação**, e navegação disfarçada de criação é o tipo de atalho que faz o usuário achar que criou uma coisa que não criou. A recusa nomeada resolve o problema real, que é o stderr do git mandar procurar um caminho absoluto no meio da mensagem.

Navegar até a worktree que já existe fica como [P7](tasks.md) — é bom, e é outra coisa.

---

### Q9 — A branch criada a partir de uma issue leva o número no nome?

**Não. O número vive em `source_ref`, não na string da branch.**

A [Q4](#q4--nome-da-worktree-quando-o-usuário-não-digita-nada) diz que o nome é digitado ou sorteado — não derivado. Embutir `123-` no nome contrariaria a resposta e criaria uma terceira regra de nomeação para manter.

E rastreabilidade em string é a pior forma de rastreabilidade: quebra quando alguém renomeia, não vira link, e não sobrevive a um `git branch -m`. A coluna vira link clicável e não quebra.

---

### Q10 — O corpo da issue entra no prompt?

**Não. Entra a referência: número, título e URL.**

Esta é a única mitigação de prompt injection da v1 (§9.3 do PRD), e ela é de fronteira: o corpo de uma issue é texto escrito por um estranho, e o prompt é a instrução de um processo que executa comandos.

Não é censura de contexto — é ordem de chegada. Se o agente quiser o corpo, ele pede: tem `gh` e tem terminal, e aí o texto chega como **resultado de ferramenta**, que é exatamente o lugar onde um agente já sabe desconfiar. Pré-carregar seria o mesmo texto chegando como **instrução do usuário**, que é o lugar onde ele não desconfia.

---

### Q11 — Onde a origem da worktree é guardada?

**Quatro colunas em `worktree`: `source_kind`, `source_ref`, `source_url`, `source_title`.**

Coluna e não dedução, pelo mesmo motivo do `managed` da [project-from-url](../project-from-url/prd.md): dedução ("tem número no nome, então é issue") erra em silêncio na primeira vez que alguém renomear alguma coisa.

`source_title` é cache deliberado — a aba precisa dizer *"#418 worktree não some da sidebar"* sem chamar a rede toda vez que a sidebar renderiza.

---

### Q12 — Como o provedor é detectado? ~~pelo host~~

**Superada pela [Q23](#q23--como-se-descobre-o-provedor-sem-perguntar-nada-ao-usuário), depois da resposta da [Q20](#q20--self-hosted-override-por-projeto-na-v1).**

A resposta original era uma tabela de hostname: `github.com` → `gh`, `gitlab.com` → `glab`, resto → nenhum, e nada de adivinhar self-hosted. O raciocínio continua válido — chutar provedor pela URL entrega um erro de CLI que não explica nada — mas a conclusão estava errada por falta de uma opção: **dá para não chutar e não perguntar, bastando consultar o CLI**.

Fica registrada porque é o segundo caso desta feature em que o desenho fechou cedo demais uma pergunta que o usuário reabriu.

---

### Q13 — Como o prompt chega ao agente?

**Pelo transporte que a configuração do agente declara** — `arg` ou `type`, coluna nova em `agent_config`.

Adivinhar não funciona: um CLI que aceita o prompt no argv e um TUI que só lê do terminal não têm nada em comum a inspecionar. É a mesma escolha que o Superset fez com `prompt_transport`, e é a parte do desenho dele que envelheceu bem — catorze agentes, zero código por agente.

`arg` é preferido quando existe: atômico, sem timing, sem interpretação de terminal.

---

### Q14 — Agente que não sobe desfaz a worktree?

**Não.**

O checkout é o trabalho; a sessão é conveniência. Apagar um `git worktree add` bem-sucedido porque um binário não estava no PATH é apagar o que deu certo por causa do que não era essencial.

O que acontece: a worktree fica, o prompt fica em `initial_prompt`, o erro aparece na aba, e abrir o agente de novo é um clique.

---

### Q15 — O prompt fica guardado?

**Sim, em `worktree.initial_prompt`.**

Três usos, e nenhum deles é decoração: reenviar depois de uma falha ([Q14](#q14--agente-que-não-sobe-desfaz-a-worktree)), mostrar na aba com o que aquela worktree foi aberta, e ser o começo do que a [Q016 do questions.md](../../project/questions.md) vai querer aprender.

O que ele **não** é: histórico. Uma linha, a inicial, sobrescrita nunca.

---

### Q16 — A busca é no servidor ou no cliente?

**Servidor para PR e issue; cliente para branch.**

Não é simetria quebrada, é onde o dado está. PR e issue vivem no provedor e quem busca é o `gh` — filtrar no cliente exigiria baixar tudo. Branch já veio inteira do disco em uma chamada: mandar o filtro de volta ao servidor a cada tecla seria latência comprada sem nada em troca.

---

### Q17 — Um diálogo, ou escolher a origem e depois abrir o formulário?

**Um.**

Dois passos existiriam para tornar o primeiro reversível — e ele já é: as abas ficam na tela e trocar de aba não perde o nome nem o prompt digitados.

---

### Q18 — `worktree.create` ganha união discriminada, ou nascem quatro procedures?

**União discriminada, um `create` só.**

É o D5 da [project-from-url](../project-from-url/tasks.md) outra vez: dois caminhos de criação seriam duas definições de worktree válida, e a segunda ficaria para trás na primeira vez que a primeira mudasse. O que muda por origem é **como a branch aparece**; validação, cálculo de caminho, registro, rollback e evento são os mesmos.

---

### Q23 — Como se descobre o provedor sem perguntar nada ao usuário?

**Perguntando ao próprio CLI se ele conhece aquele host.**

Saída aberta pela [Q20](#q20--self-hosted-override-por-projeto-na-v1). O PRD tinha uma tabela de hostname — `github.com` → `gh`, `gitlab.com` → `glab`, resto → nada — e ela deixava de fora justamente o caso da resposta: uma máquina com `gh` autenticado num GitHub Enterprise, ou `glab` num GitLab interno, **já configurados**, e ainda assim sem abas de forge.

O teste certo não é o nome do host, é quem responde por ele:

```
gh   auth status --hostname <host>     → sai 0: o gh conhece este host
glab auth status --hostname <host>     → sai 0: o glab conhece este host
```

Isso funde duas checagens que o desenho tinha separadas (provedor e autenticação) numa só, e é mais fiel: *"está configurado nesta máquina"* é exatamente o que a Q20 pediu. Um host que ninguém reivindica não é mais "desconhecido" — é **não configurado**, e a frase muda junto.

Fallback pelo hostname continua, mas só para escolher **em que ordem perguntar** — `github.com` pergunta ao `gh` primeiro. Não é ele que decide.
