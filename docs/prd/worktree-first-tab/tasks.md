# A worktree como primeira aba — Tasks

**PRD:** [prd.md](prd.md) · **Perguntas:** [open-questions.md](open-questions.md)
**Status:** **9 tasks em 4 fases, nenhuma iniciada.** O desenho está fechado no Open Design
(`lumem-worktree-tab.html`), renderizado e verificado: dez telas, zero token novo, um componente
novo. Extraídas da Fase 1 da [pull-request-status](../pull-request-status/tasks.md) — as E1, E2 e E3
de lá viram as T2, T3 e T4 daqui, e ganham as tasks que faltavam em volta.

Esta feature **não tem daemon**. Nada aqui muda contrato, tRPC ou disco: o daemon já responde tudo
que a aba mostra. É uma feature de tela inteira, e o risco dela é de **regressão**, não de novidade.

---

## Antes de começar

**O que trava:** a **[Q1](open-questions.md)** — ela decide se a coluna tem dois andares acima do
conteúdo ou três, e é a T4 inteira. A **[Q5](open-questions.md)** decide se a T6 existe. As **Q2**,
**Q3** e **Q4** têm proposta desenhada e nenhuma delas muda a ordem das fases.

**O que não trava:** o desenho (feito, sincronizado, renderizado), o `Tab` (já aceita não ter
`onClose`, já tem glifo e ponto), o `TabStrip` (já tem `lead` fixo com separador — é onde a aba
`contexto` mora hoje), o `useRightPanel` (não muda de dono, ver Q4) e o `terminal-refit.test.tsx`,
que já é o molde da prova da T5.

**A ordem é a do risco, e o risco aqui é apagar prova.** A T1 mexe no design system antes de
qualquer tela usá-lo; a T2 move a estrutura; a T3 preenche; a T4 é a pergunta travada, sozinha, para
poder ser revertida sem desfazer o resto.

**Testes que se movem, e não se apagam** — a PRD §5 é explícita, e estes são os arquivos:

| Arquivo | O que ele prova hoje |
|---|---|
| `components/worktree-ui.test.tsx` | branch, caminho, limpeza, distância da base, contagem de sujos, remoção, confirmação explícita, worktree ausente |
| `components/right-panel.test.tsx` | a coluna abre e fecha pelo interruptor, e lembra a escolha |
| `components/terminal-refit.test.tsx` | o terminal refita quando a caixa muda de tamanho |

---

## Fase 1 — o design system, antes das telas

#### T1: A faixa de abas ganha o segundo slot e o ponto de sujeira

**What**: As duas peças que o desenho pede e o `ui/` não tem, entregues antes de qualquer tela
depender delas.
**Where**: `packages/web/src/ui/Tab.tsx`, `packages/web/src/ui/ui.css`,
`packages/web/src/ui/Styleguide.tsx`, `packages/web/src/ui/ui.test.tsx`

**Done when**:
- [ ] `TabStrip` aceita **dois** slots fixos à direita, com separador entre eles; quem passa só um
      continua funcionando sem mudar nada
- [ ] `TabState` ganha `dirty`, com `--color-worktree-dirty` — e o `running` continua verde. Um teste
      falha se os dois pontos ficarem da mesma cor
- [ ] O botão de interruptor da faixa (`.tabs__files` no protótipo) existe como componente: alvo de
      24×24, `aria-pressed`, nome acessível que diz **abrir** ou **fechar**, e só o glifo na tela
- [ ] O Styleguide mostra os dois estados do interruptor e os cinco pontos, lado a lado
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(ui): a faixa de abas ganha um segundo slot e o ponto de sujeira`

---

## Fase 2 — a estrutura

#### T2: O cabeçalho vira aba

**What**: `ScopePanel` deixa de receber um `header` com título e chips; a coluna do meio passa a ser
caminho → abas → conteúdo.
**Where**: `packages/web/src/components/ScopePanel.tsx`, `WorktreePanel.tsx`, `LocalPanel.tsx`,
`detail.css` + testes

**Done when**:
- [ ] Acima da faixa de abas fica **só o caminho**, com os dois primeiros segmentos navegando como já
      navegam
- [ ] A primeira aba é a do checkout: **primeira, fixa, sem `✕`**, rotulada com o nome e o glifo do
      escopo — e nenhum atalho a fecha
- [ ] Ela é a aba padrão ao entrar, e é para onde a seleção volta quando a última aba de sessão fecha
- [ ] O comentário do `ScopePanel` que justifica o cabeçalho acima da faixa é **reescrito**, não
      apagado: passa a dizer o que mudou e o que a mudança cobra
- [ ] Os testes que provavam branch, caminho e sujeira **no cabeçalho** continuam existindo e passam
      a apontar para a aba
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): a worktree deixa de ser cabeçalho e vira a primeira aba`

---

#### T3: O que não cabia no cabeçalho

**What**: A aba do checkout ganha o que o daemon já sabe e a tela não mostrava.
**Where**: `packages/web/src/components/WorktreePanel.tsx` + testes

**Done when**:
- [ ] Caminho em disco **inteiro**, sem truncar, com botão de copiar que tem nome acessível
- [ ] Base com `↑/↓`, estado da árvore com a contagem de arquivos, e quando a worktree foi criada
- [ ] Ações do escopo na aba; a destrutiva **fora** da fila das outras, e a recusa da remoção continua
      sendo mostrada onde ela é acionada — com o comentário que justificava o lugar antigo reescrito
- [ ] Nada que já existe em outra tela é duplicado aqui: consumo, memória e diff continuam onde estão
      (F1.10)
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree mostra o que o cabeçalho não cabia`

---

#### T4: O que sobrevive com outra aba na frente

**What**: O ponto de sujeira na aba, e o que a **Q1** decidir sobre a branch.
**Where**: `packages/web/src/components/ScopePanel.tsx`, `WorktreePanel.tsx` + testes

> **Travada na [Q1](open-questions.md).** O ponto é o piso e não depende dela; o que depende é se o
> caminho passa a escrever a branch quando ela diverge do nome (a leitura B′). Task separada de
> propósito: é a única que pode ser revertida sem desfazer a estrutura.

**Done when**:
- [ ] Árvore suja põe um ponto na aba do checkout, com a contagem no nome acessível
- [ ] Árvore limpa **não** põe nada — ponto que está sempre lá não é sinal
- [ ] O ponto usa `worktree/dirty`, o mesmo token da sidebar, e não o verde de sessão rodando
- [ ] O que a Q1 responder está implementado **e** o motivo está no comentário, não só no commit
- [ ] Gate: `pnpm gate:quick`

**Commit**: `feat(web): a aba da worktree diz que a árvore está suja`

---

## Fase 3 — o interruptor muda de lugar

#### T5: O `▤ arquivos` sai da topbar

**What**: O interruptor da coluna de arquivos passa da `Topbar` para a faixa de abas do checkout.
**Where**: `packages/web/src/layout/Topbar.tsx`, `App.tsx`,
`packages/web/src/components/ScopePanel.tsx`, `right-panel.test.tsx`, `terminal-refit.test.tsx`

**Done when**:
- [ ] A `Topbar` não tem mais `filesPanel`; o que sobra nela vale para a tela toda
- [ ] O interruptor está na ponta direita da faixa, depois do `＋` e de um separador
- [ ] O estado continua sendo o mesmo `useRightPanel` — o botão muda de lugar, não de dono (Q4)
- [ ] Com a coluna **fechada**, o botão continua alcançável: é o único jeito de reabri-la
- [ ] Abrir e fechar com uma sessão de PTY viva **remede o terminal** — o `terminal-refit.test.tsx` é
      o molde, e ganha o caso do botão novo
- [ ] Os nomes dos testes de `right-panel.test.tsx` deixam de dizer `topbar`
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): o interruptor de arquivos mora no escopo a que a coluna pertence`

---

## Fase 4 — o resto do produto

#### T6: O `local` recebe o mesmo tratamento

**What**: O checkout do projeto passa pela mesma mudança, com as diferenças que são de verdade.
**Where**: `packages/web/src/components/LocalPanel.tsx` + testes

> **Travada na [Q5](open-questions.md).** Se a resposta for "não", esta task não existe — e a
> inconsistência de duas gramáticas na mesma coluna entra no [backlog](../../project/backlog.md) com
> o motivo escrito.

**Done when**:
- [ ] Aba `▭ local`, primeira, fixa, sem `✕`
- [ ] Sem base, sem distância e sem ação destrutiva: remover o local seria remover o projeto, e isso é
      outra tela
- [ ] Os testes de `LocalPanel` apontam para a aba, e nenhum deles é apagado
- [ ] Gate: `pnpm gate:quick`

**Commit**: `refactor(web): o checkout local ganha a mesma primeira aba`

---

#### T7: Os dois estados que a aba herda

**What**: A worktree ausente e o detalhe em voo, dentro da aba (F1.9).
**Where**: `packages/web/src/components/WorktreePanel.tsx` + testes

**Done when**:
- [ ] Worktree ausente: glifo `⚠` na aba e no título, o aviso do diretório sumido, e **nenhum ponto**
      de sujeira — não há árvore para estar suja
- [ ] Ausente mostra o que ainda é verdade (branch, caminho) e some com o que não é (base, distância,
      sessões); a ação que resta é limpar o registro
- [ ] `getDetail` em voo: título escrito — nome e glifo vêm da sidebar e já são conhecidos — e o resto
      em esqueleto, **sem ponto**: ponto ausente já quer dizer "limpa"
- [ ] Nos dois, a aba continua existindo: a única que não fecha não pode sumir
- [ ] Gate: `pnpm gate:quick`

**Commit**: `fix(web): a aba do checkout herda a worktree ausente e o detalhe em voo`

---

#### T8: O caminho inteiro, de ponta a ponta

**What**: Um e2e que atravessa a mudança.
**Where**: `e2e/worktree-first-tab.spec.ts` — o `e2e/right-panel.spec.ts` é o vizinho mais próximo

**Done when**:
- [ ] Entrar num checkout cai na aba dele, e a informação que era do cabeçalho está lá
- [ ] Abrir uma sessão, voltar para a aba do checkout, fechar a sessão, e a seleção volta sozinha
- [ ] Abrir e fechar a coluna de arquivos pelo botão novo, com a sessão viva
- [ ] Gate: `pnpm gate:full`

**Commit**: `test(e2e): do caminho à aba do checkout, com a coluna abrindo e fechando`

---

#### T9: A documentação alcança o código

**What**: Índice, PRDs vizinhas e perguntas batendo com o que foi construído.
**Where**: `docs/README.md`, `CLAUDE.md`, `docs/prd/pull-request-status/tasks.md`,
`docs/prd/worktree-tabs/prd.md`, `docs/project/backlog.md`

**Done when**:
- [ ] O índice descreve a feature pelo que ela **faz**, não pelo que ela pretendia
- [ ] A Fase 1 da [pull-request-status](../pull-request-status/tasks.md) diz que a estrutura foi
      entregue aqui, e o que ela pode passar a pressupor
- [ ] O PRD da [worktree-tabs](../worktree-tabs/prd.md) ganha a nota de que o cabeçalho fixo dela
      virou aba, e por quê — decisão revertida sem registro é decisão que volta sozinha
- [ ] As perguntas respondidas têm `R:` preenchido, com o motivo
- [ ] O que ficou de fora entra no backlog com o gatilho de volta
- [ ] Gate: `pnpm gate:build`

**Commit**: `docs(worktree-first-tab): a estrutura nova no índice e nas PRDs vizinhas`
