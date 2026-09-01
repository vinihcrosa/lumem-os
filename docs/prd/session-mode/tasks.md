# O modo da conversa — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md) — 6 de 6 fechadas
**Protótipo:** `packages/web/prototype/lumem-session-mode.html` — desenho fechado e verificado
renderizando; as tasks de cliente **portam** o que está lá, não redesenham
**Sucede:** [acp-sessions](../acp-sessions/tasks.md), que trouxe os seletores (F2.6) e o pedido de
permissão
**Status:** 12 tasks, 4 fases

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
- [ ] `lumemModeSchema = z.enum(["ask", "auto", "free"])`, exportado com o tipo
- [ ] `acpClientMessageSchema` ganha `{ type: "set_lumem_mode", mode }`
- [ ] `permission_resolved` ganha `by: "user" | "lumem"` (default `"user"`) e `reason: string | null`
- [ ] O evento `config` passa a carregar `lumemMode` e `lumemModeOwned` — o segundo é a A1 em campo,
      e não dedução do cliente
- [ ] Mensagem antiga sem os campos novos **continua decodificando** — `default` e não `optional`,
      senão uma conversa gravada antes desta feature deixa de abrir
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(shared): o modo do Lumem no contrato da conversa`

---

#### T2: A pílula que nunca falta

**What**: O composer passa a ter pílula de modo em toda conversa viva. Quando o agente relata modos, é
a de hoje; quando não, é a do Lumem.
**Where**: `packages/web/src/components/LumemModePill.tsx`, `Conversation.tsx`, `conversation.css` +
testes

**Done when**:
- [ ] `configOptions` sem `mode` → a pílula do Lumem aparece, com glifo `◈` e rótulo em português
- [ ] `configOptions` **com** `mode` → nada muda: uma pílula só, a do agente, sem `◈` (F1.2)
- [ ] Nunca as duas ao mesmo tempo — teste explícito, porque é a A1 na tela
- [ ] Tom por valor: `ask` neutro, `auto` em `pill--auto`, `free` em `pill--bypass` (§3 do desenho)
- [ ] `title` diz de quem é a regra
- [ ] O audit de CSS (`conversation-css.test.ts`) passa — classes novas em `conversation.css` e em
      `INTERPOLATED`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a pílula de modo que nunca falta do composer`

---

#### T3: O menu dos três valores

**What**: O menu do Lumem — cabeçalho de autoria, três opções com descrição em português, rodapé com o
padrão do workspace.
**Where**: `LumemModePill.tsx`, `conversation.css` + teste

**Done when**:
- [ ] Cabeçalho diz **de quem é a regra e por quê**, sem o qual o glifo é charada (§2 do desenho)
- [ ] Três opções, com a descrição que o desenho escreveu — a do `automático` **diz** que leitura
      passa sozinha e aparece na conversa
- [ ] `role="menu"` + `menuitemradio` com `aria-checked`, como o `ConfigPills` já faz
- [ ] Rodapé mostra o padrão do workspace (Q5)
- [ ] Escolher `free` **não** troca o modo: abre o portão da T10
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o menu do modo do Lumem, com a autoria escrita`

---

## Fase 2 — o valor persiste

#### T4: As duas colunas

**What**: Migração 0012: `session.lumem_mode` e `workspace.default_lumem_mode`.
**Where**: `packages/server/src/db/schema.ts`, `drizzle/0012_*.sql` + teste de migração

**Done when**:
- [ ] `session.lumem_mode` `NOT NULL DEFAULT 'ask'`, com `CHECK` em `('ask','auto','free')`
- [ ] `workspace.default_lumem_mode` `NOT NULL DEFAULT 'ask'`, com `CHECK` em `('ask','auto')` — a A5
      recusa `free` **na escrita**, e não silencia na leitura
- [ ] Toda sessão existente vira `'ask'` — nenhuma conversa gravada acorda liberada
- [ ] O teste de migração lê a coluna num banco criado pela migração anterior, como o `0001` já faz
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o modo do Lumem como coluna, e o padrão do workspace`

---

#### T5: O modo entra e sai da sessão

**What**: `set_lumem_mode` no websocket, recusado no meio do turno, gravado na sessão, herdado do
workspace ao nascer.
**Where**: `packages/server/src/acp/AcpManager.ts`, `acp/websocket.ts` + testes

**Done when**:
- [ ] Sessão nova nasce com o padrão do workspace, e **nunca** com `free` (A5)
- [ ] `set_lumem_mode` no meio de um turno → recusado com a **mesma mensagem** da troca de modo do
      agente (F1.7)
- [ ] Recusado quando o agente relata modos (A1) — não é "ignorado", é erro nomeado
- [ ] O valor sobrevive a fechar o Lumem: um `session/load` devolve a conversa no mesmo modo (F1.4)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): trocar e guardar o modo do Lumem na sessão`

---

## Fase 3 — a política decide

#### T6: O classificador

**What**: Um módulo puro que responde "esta chamada é leitura dentro do checkout?".
**Where**: `packages/server/src/acp/permission-policy.ts` + teste

**Done when**:
- [ ] `kind === "read"` + `locations` não vazio + **todos** os caminhos dentro do `cwd` → aprova
- [ ] `kind === "execute"` que só lê (`git log`) → **não** aprova (A2, e está escrito na Q3)
- [ ] `locations` vazio → não aprova. Silêncio não vira "sim"
- [ ] Um caminho fora do `cwd` derruba o pedido inteiro, mesmo com nove dentro
- [ ] Caminho relativo, `..`, e link simbólico resolvidos **antes** de comparar — `cwd + "/../.."`
      não passa por estar prefixado pelo `cwd` como string
- [ ] `.env` dentro do checkout **aprova**, e o teste diz que é de propósito (Q3)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): o classificador de leitura dentro do checkout`

---

#### T7: O portão no pedido de permissão

**What**: O `request_permission` passa pela política antes de virar pergunta.
**Where**: `packages/server/src/acp/AcpManager.ts` + testes

**Done when**:
- [ ] `ask` → sobe para a pessoa, exatamente como hoje. Nenhum comportamento novo
- [ ] `auto` + leitura dentro do checkout → respondido com a opção de `kind: "allow_once"`
- [ ] `auto` + escrita → sobe, com o `reason` dizendo que a regra só cobre leitura
- [ ] `free` → respondido com `allow_once` para qualquer chamada
- [ ] **Sem opção `allow_once` → sobe, com o motivo dito. Nunca nega** (A3) — teste próprio, porque é
      o caminho que faria o `automático` falhar em silêncio
- [ ] Um agente que relata modos **não** passa pela política, em nenhum valor (A1)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(server): a política do Lumem responde ao pedido de permissão`

---

#### T8: O rastro

**What**: O que passa sozinho aparece na conversa, assinado.
**Where**: `AcpManager.ts`, `packages/web/src/lib/conversation-model.ts`, `ToolCard.tsx`,
`conversation.css` + testes

**Done when**:
- [ ] Aprovação automática emite `permission_request` **e** `permission_resolved` com `by: "lumem"` —
      o pedido nunca some do registro (F1.6)
- [ ] O cartão mostra `◈ o Lumem aprovou` em `verdict--lumem`, e a linha do porquê
- [ ] O veredito humano continua `✓ você permitiu` — ler a transcrição depois **separa os dois**
- [ ] Uma conversa recarregada do disco mostra o mesmo, porque sai dos mesmos eventos
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat: o que o Lumem aprova sozinho aparece na conversa, assinado`

---

#### T9: A linha de fecho do turno

**What**: Quantos pedidos passaram sozinhos, e quantos subiram.
**Where**: `conversation-model.ts`, `Conversation.tsx` + teste

**Done when**:
- [ ] Ao fim do turno, uma linha `.meta` conta as duas coisas (§4 do desenho)
- [ ] Zero aprovações automáticas → **nenhuma linha**. Contador zerado é ruído
- [ ] Some no turno seguinte, porque é fecho de turno e não histórico
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o fecho de turno diz quanto passou sozinho`

---

## Fase 4 — as bordas

#### T10: O portão do `liberado`

**What**: A confirmação por sessão, com o escopo dito por extenso.
**Where**: `packages/web/src/components/FreeModeGate.tsx`, `conversation.css` + testes

**Done when**:
- [ ] Escolher `Liberado` abre o portão; o modo **só muda** depois de confirmar
- [ ] O escopo aparece como **caminho em disco**, não como "a worktree" (Q4)
- [ ] Foco nasce em `cancelar`; o confirmar é `btn--danger`
- [ ] `esc` cancela
- [ ] **Não existe caixinha de lembrar** — teste que falha se alguém adicionar uma
- [ ] Sessão nova volta a perguntar tudo, mesmo depois de um `liberado` confirmado ontem
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): o portão do modo liberado, por sessão e sem memória`

---

#### T11: As bordas da pílula

**What**: Meio de turno, conversa encerrada, daemon fora.
**Where**: `LumemModePill.tsx`, `Conversation.tsx` + testes

**Done when**:
- [ ] Meio de turno → `disabled`, com a mensagem de hoje (F1.7)
- [ ] Conversa encerrada → mostra o modo em que **esteve**, sem `▾` e sem `disabled`: é fato
      registrado, não controle desligado (F1.8)
- [ ] Daemon fora → a pílula **fica**, porque é estado local da sessão
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): as bordas da pílula de modo`

---

#### T12: A autoridade que aparece no meio

**What**: O caso que a A1 promete impedir e ninguém tinha decidido: um adaptador que passa a relatar
`modes` com a sessão viva.
**Where**: `AcpManager.ts` + teste

**Done when**:
- [ ] `config_option_update` trazendo `mode` numa sessão que estava na política do Lumem → a
      autoridade passa para o agente, e o modo do Lumem **para de valer na mesma hora**
- [ ] O valor guardado na coluna **não** é apagado: se o agente sumir com os modos de novo, ele volta
- [ ] O cliente recebe `lumemModeOwned: false` e troca a pílula sem recarregar
- [ ] Gate: `pnpm gate:full`

**Commit**: `fix(server): a autoridade do modo troca quando o agente passa a relatar modos`

---

## O que a execução achou

_(preenchido durante a implementação)_
