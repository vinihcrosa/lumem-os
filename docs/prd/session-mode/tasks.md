# O modo da conversa — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 6 de 6 fechadas
**Protótipo:** `packages/web/prototype/lumem-session-mode.html` — desenho fechado e verificado
renderizando; as tasks de cliente **portam** o que está lá, não redesenham
**Sucede:** [acp-sessions](../acp-sessions/tasks.md), que trouxe os seletores (F2.6) e o pedido de
permissão
**Status:** **12 de 12 entregues**, em seis commits. A ordem foi a das fases, com duas fusões que a execução cobrou e estão explicadas no fim.

---

## Antes de começar

**O que não trava:** o `AcpManager` com `session/request_permission` já ligado
(`AcpManager.ts:948`), o `permission_request`/`permission_resolved` já no contrato, o redutor do
cliente que transforma pedido respondido em veredito no cartão
(`conversation-model.ts:257`), a coluna `session.mode` para o modo **do protocolo**, e os 8 pares de
contraste do menu já no `contrast.ts`.

**Premissas travadas** — divergir de qualquer uma é mudar a resposta em
[open-questions.md](open-questions.md), não aqui:

- **A1** — o modo do Lumem só existe quando o agente **não** relata modos. As duas autoridades nunca
  coexistem, e isso é imposto pelo daemon (Q1).
- **A2** — `automático` aprova `kind === "read"` com `locations` não vazio e **todos** os caminhos
  dentro do `cwd`. Nada mais (Q3).
- **A3** — **nenhum caminho desta feature nega sozinho.** Sem opção `allow_once`, o pedido sobe com o
  motivo dito (Q6).
- **A4** — o portão do `liberado` é **por sessão** e não guarda decisão (Q4).
- **A5** — o padrão do workspace aceita `ask | auto`. Sessão nova nunca nasce liberada (Q5).
- **A6** — `session.mode` é do protocolo e **não** se reaproveita. O modo do Lumem tem coluna própria.

---

## Fase 1 — o contrato, e a barra deixa de ser muda

#### T1: `LumemMode` no contrato

**What**: O enum, a mensagem que o troca, e os dois campos que fazem o veredito dizer quem assinou.
**Where**: `packages/shared/src/acp-protocol.ts` + teste

**Done when**:
- [x] `lumemModeSchema = z.enum(["ask", "auto", "free"])`, exportado com o tipo
- [x] `acpClientMessageSchema` ganha `{ type: "set_lumem_mode", mode }`
- [x] `permission_resolved` ganha `by: "user" | "lumem"` (default `"user"`) e `reason: string | null`
- [x] O evento `config` passa a carregar `lumemMode` e `lumemModeOwned` — o segundo é a A1 em campo,
      e não dedução do cliente
- [x] Mensagem antiga sem os campos novos **continua decodificando** — `default` e não `optional`,
      senão uma conversa gravada antes desta feature deixa de abrir
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(shared): o modo do Lumem no contrato da conversa`

---

#### T2: A pílula que nunca falta

**What**: O composer passa a ter pílula de modo em toda conversa viva. Quando o agente relata modos, é
a de hoje; quando não, é a do Lumem.
**Where**: `packages/web/src/components/LumemModePill.tsx`, `Conversation.tsx`, `conversation.css` +
testes

**Done when**:
- [x] `configOptions` sem `mode` → a pílula do Lumem aparece, com glifo `◈` e rótulo em português
- [x] `configOptions` **com** `mode` → nada muda: uma pílula só, a do agente, sem `◈` (F1.2)
- [x] Nunca as duas ao mesmo tempo — teste explícito, porque é a A1 na tela
- [x] Tom por valor: `ask` neutro, `auto` em `pill--auto`, `free` em `pill--bypass` (§3 do desenho)
- [x] `title` diz de quem é a regra
- [x] O audit de CSS (`conversation-css.test.ts`) passa — classes novas em `conversation.css` e em
      `INTERPOLATED`
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a pílula de modo que nunca falta do composer`

---

#### T3: O menu dos três valores

**What**: O menu do Lumem — cabeçalho de autoria, três opções com descrição em português, rodapé com o
padrão do workspace.
**Where**: `LumemModePill.tsx`, `conversation.css` + teste

**Done when**:
- [x] Cabeçalho diz **de quem é a regra e por quê**, sem o qual o glifo é charada (§2 do desenho)
- [x] Três opções, com a descrição que o desenho escreveu — a do `automático` **diz** que leitura
      passa sozinha e aparece na conversa
- [x] `role="menu"` + `menuitemradio` com `aria-checked`, como o `ConfigPills` já faz
- [x] Rodapé mostra o padrão do workspace (Q5)
- [x] Escolher `free` **não** troca o modo: abre o portão da T10
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o menu do modo do Lumem, com a autoria escrita`

---

## Fase 2 — o valor persiste

#### T4: As duas colunas

**What**: Migração 0012: `session.lumem_mode` e `workspace.default_lumem_mode`.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/0012_*.sql` + teste de migração

**Done when**:
- [x] `session.lumem_mode` `NOT NULL DEFAULT 'ask'`, com `CHECK` em `('ask','auto','free')`
- [x] `workspace.default_lumem_mode` `NOT NULL DEFAULT 'ask'`, com `CHECK` em `('ask','auto')` — a A5
      recusa `free` **na escrita**, e não silencia na leitura
- [x] Toda sessão existente vira `'ask'` — nenhuma conversa gravada acorda liberada
- [x] O teste de migração lê a coluna num banco criado pela migração anterior, como o `0001` já faz
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o modo do Lumem como coluna, e o padrão do workspace`

---

#### T5: O modo entra e sai da sessão

**What**: `set_lumem_mode` no websocket, recusado no meio do turno, gravado na sessão, herdado do
workspace ao nascer.
**Where**: `packages/server/src/acp/AcpManager.ts`, `acp/websocket.ts` + testes

**Done when**:
- [x] Sessão nova nasce com o padrão do workspace, e **nunca** com `free` (A5)
- [x] `set_lumem_mode` no meio de um turno → recusado com a **mesma mensagem** da troca de modo do
      agente (F1.7)
- [x] Recusado quando o agente relata modos (A1) — não é "ignorado", é erro nomeado
- [x] O valor sobrevive a fechar o Lumem: um `session/load` devolve a conversa no mesmo modo (F1.4)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): trocar e guardar o modo do Lumem na sessão`

---

## Fase 3 — a política decide

#### T6: O classificador

**What**: Um módulo puro que responde "esta chamada é leitura dentro do checkout?".
**Where**: `packages/server/src/acp/permission-policy.ts` + teste

**Done when**:
- [x] `kind === "read"` + `locations` não vazio + **todos** os caminhos dentro do `cwd` → aprova
- [x] `kind === "execute"` que só lê (`git log`) → **não** aprova (A2, e está escrito na Q3)
- [x] `locations` vazio → não aprova. Silêncio não vira "sim"
- [x] Um caminho fora do `cwd` derruba o pedido inteiro, mesmo com nove dentro
- [x] Caminho relativo, `..`, e link simbólico resolvidos **antes** de comparar — `cwd + "/../.."`
      não passa por estar prefixado pelo `cwd` como string
- [x] `.env` dentro do checkout **aprova**, e o teste diz que é de propósito (Q3)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o classificador de leitura dentro do checkout`

---

#### T7: O portão no pedido de permissão

**What**: O `request_permission` passa pela política antes de virar pergunta.
**Where**: `packages/server/src/acp/AcpManager.ts` + testes

**Done when**:
- [x] `ask` → sobe para a pessoa, exatamente como hoje. Nenhum comportamento novo
- [x] `auto` + leitura dentro do checkout → respondido com a opção de `kind: "allow_once"`
- [x] `auto` + escrita → sobe, com o `reason` dizendo que a regra só cobre leitura
- [x] `free` → respondido com `allow_once` para qualquer chamada
- [x] **Sem opção `allow_once` → sobe, com o motivo dito. Nunca nega** (A3) — teste próprio, porque é
      o caminho que faria o `automático` falhar em silêncio
- [x] Um agente que relata modos **não** passa pela política, em nenhum valor (A1)
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(server): a política do Lumem responde ao pedido de permissão`

---

#### T8: O rastro

**What**: O que passa sozinho aparece na conversa, assinado.
**Where**: `AcpManager.ts`, `packages/web/src/lib/conversation-model.ts`, `ToolCard.tsx`,
`conversation.css` + testes

**Done when**:
- [x] Aprovação automática emite `permission_request` **e** `permission_resolved` com `by: "lumem"` —
      o pedido nunca some do registro (F1.6)
- [x] O cartão mostra `◈ o Lumem aprovou` em `verdict--lumem`, e a linha do porquê
- [x] O veredito humano continua `✓ você permitiu` — ler a transcrição depois **separa os dois**
- [x] Uma conversa recarregada do disco mostra o mesmo, porque sai dos mesmos eventos
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat: o que o Lumem aprova sozinho aparece na conversa, assinado`

---

#### T9: A linha de fecho do turno

**What**: Quantos pedidos passaram sozinhos, e quantos subiram.
**Where**: `conversation-model.ts`, `Conversation.tsx` + teste

**Done when**:
- [x] Ao fim do turno, uma linha `.meta` conta as duas coisas (§4 do desenho)
- [x] Zero aprovações automáticas → **nenhuma linha**. Contador zerado é ruído
- [x] Some no turno seguinte, porque é fecho de turno e não histórico
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o fecho de turno diz quanto passou sozinho`

---

## Fase 4 — as bordas

#### T10: O portão do `liberado`

**What**: A confirmação por sessão, com o escopo dito por extenso.
**Where**: `packages/web/src/components/FreeModeGate.tsx`, `conversation.css` + testes

**Done when**:
- [x] Escolher `Liberado` abre o portão; o modo **só muda** depois de confirmar
- [x] O escopo aparece como **caminho em disco**, não como "a worktree" (Q4)
- [x] Foco nasce em `cancelar`; o confirmar é `btn--danger`
- [x] `esc` cancela
- [x] **Não existe caixinha de lembrar** — teste que falha se alguém adicionar uma
- [x] Sessão nova volta a perguntar tudo, mesmo depois de um `liberado` confirmado ontem
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o portão do modo liberado, por sessão e sem memória`

---

#### T11: As bordas da pílula

**What**: Meio de turno, conversa encerrada, daemon fora.
**Where**: `LumemModePill.tsx`, `Conversation.tsx` + testes

**Done when**:
- [x] Meio de turno → `disabled`, com a mensagem de hoje (F1.7)
- [x] Conversa encerrada → mostra o modo em que **esteve**, sem `▾` e sem `disabled`: é fato
      registrado, não controle desligado (F1.8)
- [x] Daemon fora → a pílula **fica**, porque é estado local da sessão
- [x] Gate: `pnpm gate:quick`

**Commit**: `feat(web): as bordas da pílula de modo`

---

#### T12: A autoridade que aparece no meio

**What**: O caso que a A1 promete impedir e ninguém tinha decidido: um adaptador que passa a relatar
`modes` com a sessão viva.
**Where**: `AcpManager.ts` + teste

**Done when**:
- [x] `config_option_update` trazendo `mode` numa sessão que estava na política do Lumem → a
      autoridade passa para o agente, e o modo do Lumem **para de valer na mesma hora**
- [x] O valor guardado na coluna **não** é apagado: se o agente sumir com os modos de novo, ele volta
- [x] O cliente recebe `lumemModeOwned: false` e troca a pílula sem recarregar
- [x] Gate: `pnpm gate:full`

**Commit**: `fix(server): a autoridade do modo troca quando o agente passa a relatar modos`

---

## O que a execução achou

### Duas fusões de task, e por quê

**A T10 subiu para a fase 1, junto com a T2 e a T3.** O `Liberado` não pode ser
selecionável sem o portão — item de menu que não faz nada é a barra muda de volta, com outra
roupa. As três saíram no mesmo commit.

**O `setLumemMode` saiu na T1, e não na T5.** A T1 pôs uma mensagem nova na união do cliente,
e mensagem que o servidor recebe e descarta em silêncio é pior que mensagem que não existe.
A T5 ficou sendo só persistência e herança, que é o que ela de fato acrescenta.

### Três coisas que os testes acharam antes da tela

**`current_mode_update` deixava as duas autoridades vivas.** A derivação de `modeOwner` olhava
só a lista de opções, e essa notificação **não põe opção nenhuma nela** — um adaptador que
anuncia o modo corrente por ali ficava com o agente escolhendo o que tentar e o Lumem decidindo
o que passa, sob um modo que nenhum dos dois combinou. A `modeOwnerOf` passou a olhar
`info.mode` também, e tem teste que falha na versão antiga.

**O `drizzle-kit` gerou a migração lendo a coluna que ela cria.** O `INSERT ... SELECT` que copia
a tabela velha para a nova listava `lumem_mode` e `default_lumem_mode` no `SELECT`, e as duas só
passam a existir naquela migração. Os dois viraram o literal `'ask'`.

**O audit de CSS pegou `.vh`.** O protótipo chama a classe de texto-só-para-leitor-de-tela de
`.vh`; o app chama de `.sr-only`, e é o `.sr-only` que existe no `base.css`. Portar copiando o
nome do protótipo teria deixado *"regra do Lumem:"* **visível** na barra do composer. O audit
agora cobre os dois componentes novos.

### O que ficou de fora, e onde está anotado

**Symlink dentro do checkout apontando para fora.** O `inside()` compara com `relative` depois de
`resolve`, e não chama `realpath` — que toca o disco, e um arquivo que o agente está *a ponto* de
ler pode não existir ainda. É um buraco real e menor que tornar a política assíncrona; o lugar
dele é a feature de regras por caminho.

**Contraste:** oito pares novos entraram no `contrast.ts` — o menu pinta sobre `bg/raised`, um
degrau mais claro que `bg/surface`, e os pares de modo existentes não cobriam.
