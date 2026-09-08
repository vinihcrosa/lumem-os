# De quem é o adaptador — Perguntas

**PRD:** [prd.md](prd.md) · **Tasks:** [tasks.md](tasks.md)

Cinco perguntas, **todas respondidas em 2026-09-08**. Duas foram respondidas por medição e não por
argumento, e uma delas — a Q1 — foi respondida **contra o pedido**, com o número na mão.

---

## Q1 — "Embutido" quer dizer dependência do pacote publicado?

**Pedido, textual:** *"ele deve ter o próprio, deve estar imbutido nele, isso é uma coisa critica do
sistema, não deve ficar na mão do PATH"*.

Há duas leituras, e elas não custam o mesmo:

1. **O daemon é dono da cópia** — instala no `pinnedVersion` dentro de `<stateDir>/adapters/<id>` e
   nunca consulta o PATH para escolher qual lançar.
2. **O adaptador vem dentro do pacote** — `dependencies` do `lumem`, resolvido por
   `createRequire(import.meta.url).resolve(...)`. Sem npm em tempo de execução, sem rede no primeiro
   boot.

**Resposta: (1), e (2) fica no backlog com o número que a recusou.**

O `claude-agent-acp@0.75.1` instala **243 MB**; o `codex-acp@1.10.0`, **301 MB**. Como dependência,
um `npm i -g @vinihcrosa/lumem-os` passa de ~550 MB e cobra os dois de quem usa um. E o
[daemon é um bundle ESM com só o par nativo por fora](../../adr/2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md):
dois CLIs de terceiro entram como *externals*, e o `smoke:install` — que existe exatamente para pegar
`require` dinâmico e arquivo fora do pacote — passaria a baixar meio giga por execução.

A propriedade crítica que o pedido nomeia é *"não deve ficar na mão do PATH"*, e **(1) entrega ela
inteira**. O que (2) acrescenta é pré-pagar o download. Gatilho de volta: primeiro boot sem rede virar
reclamação real, ou um adaptador encolher para dezenas de MB.

## Q2 — O `setup.agents` para de olhar o PATH?

**Não.** Ele **relata**, e relatar o que existe na máquina é informação — inclusive a informação que
diagnosticou este defeito. O `BinaryReport.managed` já distingue a cópia do daemon da do PATH.

O que muda é a fronteira: **nenhum caminho de execução consulta o relatório.** Quem lança pergunta à
spec. A confusão entre "reportar" e "lançar" é literalmente a LUM-54, consertada num lado e não no
outro.

## Q3 — O processo filho herda o PATH?

**Sim, e isto não é o mesmo assunto.**

Medido: com `PATH` contendo só `node`, o `0.75.1` completa `initialize` e `session/new` e lista os
cinco modelos — e `session/prompt` responde `Authentication required`. Acrescentando
`/usr/bin/security` — o keychain do macOS —, o mesmo turno fecha em `end_turn` com `size: 1000000`.

O adaptador precisa de um PATH utilizável. Ele não precisa que o PATH diga **quem ele é**. A decisão
proíbe a segunda coisa e deixa a primeira em paz — um PATH costurado à mão aqui trocaria um defeito
diagnosticável por um turno que morre dizendo "autenticação".

## Q4 — Uma máquina sem instalação gerenciada, mas com a cópia global **no pino**: passa?

**Não passa.** A regra é proveniência, não coincidência de versão.

O argumento contra é honesto — a versão é a mesma, então o comportamento é o mesmo. A resposta é que
"a mesma versão" é uma leitura de `package.json` de um diretório que o daemon não escreveu, e a
próxima subida de pino recria exatamente o defeito que esta feature existe para fechar. Um caso que
passa por coincidência é um caso que ninguém testa.

Custo aceito, nomeado: quem já tem a cópia global baixa 243 MB de novo. É o [critério de
aceite](prd.md#5-como-se-sabe-que-funcionou) que cobra isso, de propósito.

## Q4a — E um adaptador que não está no catálogo?

Aberta pela implementação, e respondida **contra a primeira versão do código**: ela recusava toda
linha ACP cujo nome não fosse id de catálogo, e 25 specs de e2e ficaram vermelhas — todas as que
dirigem um adaptador falso chamado `acp-falso`.

**Resposta: um caminho absoluto passa; um nome nu não.**

O erro foi colapsar dois casos. Apontar o daemon para **um arquivo** — um adaptador compilado à mão,
um agente ainda não catalogado, o falso do e2e — nomeia exatamente um binário e não tem deriva: não
existe "a versão que o PATH resolveu hoje". Um **nome nu** é o PATH escolhendo, que é literalmente o
que a decisão proíbe, então ele é recusado com a frase que diz por quê.

A [Q4](#q4--uma-máquina-sem-instalação-gerenciada-mas-com-a-cópia-global-no-pino-passa) continua
valendo palavra por palavra para o caso que ela responde: um **id de catálogo** não tem outra resposta
possível além da cópia gerenciada, e o `command` gravado na linha é **ignorado** — não "preferido".
É por isso que a linha obsoleta desta máquina não desalojava nada.

## Q5 — As `configOptions` novas do `0.75.1` entram?

**Não.** O `0.75.1` expõe `effort` (`category: thought_level`, com `default/low/medium/high/xhigh/max`)
e `agent` (persona de thread principal, populada com as personas da máquina). Nenhuma das duas
existe no composer.

São **feature**, não conserto: pedem pílula, persistência e uma decisão sobre herança por
workspace — o mesmo tamanho que a [016-session-mode](../016-session-mode/prd.md) teve. Vão para o
[backlog](../../project/backlog.md).

O `rateLimit` ([F4](prd.md#f4--o-ratelimit-volta-a-acender)) entra, e a diferença é a que separa as
duas categorias: ele já tem contrato (`AcpRateLimit`), já tem lugar na tela, e está **apagado** por
uma leitura errada de um campo que o adaptador manda. Isso é conserto.
