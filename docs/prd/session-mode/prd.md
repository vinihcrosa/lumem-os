# PRD — O modo da conversa: sempre na tela, e com resposta do Lumem quando o agente não tem

> **Status:** **completa — 12 de 12 tasks.** Nasceu de uma anotação na
> barra do composer: *"falta um seletor de modo, para poder selecionar o modo automático, se tá
> liberado, se tem que perguntar tudo"*
> **Perguntas:** [open-questions.md](open-questions.md) — 6 de 6 fechadas
> **Tasks:** [tasks.md](tasks.md) — 12 entregues, em seis commits
> **Sucede:** [acp-sessions](../acp-sessions/prd.md), que trouxe os seletores (F2.6) e o pedido de
> permissão
> **Desenho:** feito no Open Design — `packages/web/prototype/lumem-session-mode.html`. Sete seções:
> a barra muda ao lado do que entra no lugar dela, o eixo de autoria, os três valores, o rastro do
> `automático`, o portão do `liberado`, as bordas, e o que isto cobra. Ele **desenha as propostas** da
> [Q2](open-questions.md) (glifo `◈` + rótulo em português), da [Q3](open-questions.md) (a regra na
> descrição do menu, sem lista de exceção), da [Q4](open-questions.md) (portão por sessão, sem "não
> perguntar de novo") e da [Q5](open-questions.md) (rodapé do menu com o padrão do workspace), e as
> quatro foram **fechadas nessas propostas**. A [Q6](open-questions.md) nasceu depois, lendo o
> `AcpManager`: o daemon não responde "sim" no abstrato, e um agente que não oferece opção de permitir
> faria o `automático` **negar em silêncio**.

---

## 1. O que existe, e por que a anotação está certa mesmo assim

O seletor de modo **existe**: o `ConfigPills` desenha uma pílula por opção que o agente relata, o
`mode` tem cor própria (`auto`, `plan`, `bypassPermissions`), o daemon absorve a irregularidade de o
modo ter um `session/set_mode` dedicado, e a troca é recusada no meio de um turno porque o protocolo
recusa.

O que não existe é a **garantia**. As pílulas são inteiramente derivadas do que o adaptador manda no
`session/new`:

```
configOptions vazio  →  nenhuma pílula  →  composer sem seletor nenhum
```

E não há nada na tela dizendo que isso aconteceu. Um agente que não relata `modes` produz exatamente
o mesmo pixel que um bug de transporte: **um composer mudo**. É essa a tela que a anotação viu.

**O buraco é maior que o de desenho.** O que o modo controla — *"se tá liberado, se tem que perguntar
tudo"* — é a política de permissão da sessão. Hoje ela é **inteiramente do agente**: o Lumem recebe o
pedido, desenha o `PermissionRequest` e espera. Se o agente não oferece modo, o Lumem não tem como
oferecer nada — nem "aprove leitura sozinho", nem "pergunte tudo".

**Critério de sucesso em uma frase:** toda conversa mostra em que modo está, o modo é trocável antes
do primeiro turno, e quando o agente não tem modos o Lumem responde com a política **dele** — em vez
de uma barra vazia.

## 2. Forma

```
┌──────────────────────────────────────────────────────────┐
│  … a conversa …                                          │
├──────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐ │
│ │ escreva aqui…                                        │ │
│ ├──────────────────────────────────────────────────────┤ │
│ │ [◈ Auto ▾][opus ▾][alto ▾]              [enviar ⏎]   │ │
│ └──────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘

  o agente relata modos   →  as pílulas de hoje, sem mudança
  o agente não relata     →  [◈ Perguntar tudo ▾] — o modo do Lumem, e a pílula diz de quem ele é
```

### 2.1 Os dois donos de um modo

| Dono | Quando | O que a troca faz |
|---|---|---|
| **o agente** | ele relatou `modes` ou uma `configOption` de id `mode` | `session/set_mode`, como hoje. O Lumem não interpreta o valor |
| **o Lumem** | ele não relatou nada | muda como o daemon responde a `session/request_permission` — sem tocar no agente |

**A pílula tem que dizer qual dos dois é**, porque as consequências são diferentes: o modo do agente
muda o que ele *tenta fazer*; o do Lumem muda o que *passa*. Ver [Q2](open-questions.md).

### 2.2 A política do Lumem, quando é dele

Três valores, que é o que a anotação pede:

| Valor | O que o daemon faz com um `request_permission` |
|---|---|
| **perguntar tudo** | desenha o pedido e espera. É o de hoje, e é o padrão |
| **automático** | responde sozinho ao que for **leitura** dentro do checkout; pergunta o resto |
| **liberado** | responde sozinho a tudo, e a pílula fica com o tom de alerta que o `bypassPermissions` já tem |

**`liberado` é a decisão perigosa da feature**, e é a única que precisa de portão: o que ele libera é
escrita e execução de comando dentro da worktree. Ver [Q3](open-questions.md) e
[Q4](open-questions.md).

## 3. Escopo

**F1.1** O composer mostra **sempre** uma pílula de modo, em toda conversa viva.
**F1.2** Quando o agente relata modos, ela é a de hoje — nada muda.
**F1.3** Quando não relata, ela é a do Lumem, com os três valores do §2.2, e é visualmente
distinguível de uma pílula do agente.
**F1.4** O valor do modo do Lumem é da **sessão**, gravado com ela, e sobrevive a fechar o Lumem —
como o resto da conversa em disco já sobrevive.
**F1.5** O padrão de uma sessão nova é **perguntar tudo**. Nenhuma sessão nasce liberada.
**F1.6** No modo `automático`, cada pedido respondido sozinho **aparece na conversa** como um evento
— não some. Sem isso o modo vira um agente fazendo coisas que ninguém viu.
**F1.7** A troca continua recusada no meio de um turno, pelo mesmo motivo de hoje.
**F1.8** Uma conversa em leitura (encerrada) mostra em que modo ela **esteve**, sem oferecer troca.

### Fora de escopo

- Regras por ferramenta ou por caminho ("pode escrever em `src/`, não em `.env`"). É outra feature, e
  vai para o [backlog](../../project/backlog.md).
- Política de workspace que se imponha a todas as sessões. A [Q5](open-questions.md) fechou em
  **padrão herdado**, que uma sessão pode contrariar — herdar sem poder divergir seria política
  global.
- Symlink dentro do checkout apontando para fora dele. O `inside()` compara caminho resolvido sem
  tocar no disco, e o lugar de uma política de symlink é a feature de regras por caminho.

## 4. Como se prova

- um agente falso que **não relata** `modes` produz uma conversa com pílula de modo do Lumem;
- um que relata produz a pílula de hoje, e nenhuma segunda pílula;
- em `automático`, um pedido de leitura é respondido sem interação **e aparece na transcrição**; um
  de escrita ainda para e pergunta;
- em `liberado`, o portão do §2.2 é atravessado explicitamente uma vez, e a pílula fica em alerta;
- fechar e reabrir o Lumem devolve a sessão no mesmo modo;
- trocar de modo no meio de um turno é recusado, com a mesma mensagem de hoje.
