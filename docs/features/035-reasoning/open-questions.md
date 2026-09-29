# O pensamento volta a chegar — perguntas

**PRD:** [prd.md](prd.md)

**Estado:** 2 perguntas · **2 respondidas** em 2026-09-29, as duas pela recomendação.

O que a issue deixava para decidir e o código respondeu não virou pergunta: o **Codex** já pede o
resumo sozinho (`codex-acp@1.10.0`, `sendPrompt` manda `summary: "auto"`, exceto em conta de API key e
em modelo sem raciocínio), e o **custo** do lado da cobrança está na documentação da Anthropic —
`summarized` e `omitted` cobram os mesmos tokens de entrada e de saída. A medição do AC 5 confere num
turno real.

---

- [x] **Q1 — A pasta é uma por issue, ou uma para o projeto *Conversa* inteiro?**

  As quatro issues do projeto (LUM-64 imagem, LUM-65 plano, LUM-66 reasoning, LUM-67 sinal de vida)
  apontam para a mesma pasta, `033-conversation-essentials/` — e o `033` já é da `acp-only-agents`.

  **Recomendação: uma por issue — esta é `035-reasoning/`.** Os checks de uma feature são
  **congelados** quando aprovados ([ADR de 2026-09-28](../../adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md)):
  uma pasta para as quatro obrigaria a planejar as quatro agora, ou a reabrir checks aprovados a cada
  issue. E quatro worktrees editando o mesmo `prd.md` em paralelo é conflito de merge garantido. O
  preço é quatro linhas na tabela do `CLAUDE.md` em vez de uma.

  **O que a resposta muda:** o nome da pasta, o `Status:` (uma pasta do projeto só fecha com as quatro)
  e o `Out of scope` do plano.

  **R:** uma por issue (2026-09-29). Esta é `035-reasoning/`; LUM-64, LUM-65 e LUM-67 abrem as suas.

- [x] **Q2 — O pensamento resumido fica sempre ligado, ou vira interruptor em `/settings`?**

  A issue perguntava se ele vira um interruptor como os três que gastam token da `007`.

  **Recomendação: sempre ligado, sem interruptor.** A documentação da Anthropic diz que a cobrança é
  idêntica — *"For both 'summarized' and 'omitted' settings, input tokens and billed output tokens
  (the full thinking tokens generated internally) are identical"* —, então não há gasto a controlar. Os
  interruptores da `007` existem porque aquelas funções **gastam** token a mais; esta não gasta. A
  medição do AC 5 grava os tokens de um turno com e sem o pedido, e um número diferente reabre esta
  pergunta.

  **O que a resposta muda:** com interruptor, a `030-settings` ganha uma linha, o `AcpManager` passa a
  ler a preferência antes de montar o `_meta`, e o AC 1 ganha a condição.

  **R:** sempre ligado (2026-09-29). Uma diferença de tokens na medição do AC 5 reabre.

  **Medido no mesmo dia, e não reabre.** Seis turnos no modelo padrão (`opus[1m]`, effort `xhigh`),
  alternando sem e com o pedido, contando o `usage` da resposta do `session/prompt` — o mesmo que o
  `pnpm measure:thinking` passou a imprimir depois da primeira verificação:

  | Pedido | Tokens de saída | Escrita de cache | Custo (US$) |
  |---|---|---|---|
  | sem | 157 · 134 · 186 | 24 975 · 24 302 · 0 | 0,259 · 0,253 · 0,023 |
  | com | 155 · 136 · 128 | 23 796 · 24 302 · 24 302 | 0,249 · 0,253 · 0,253 |

  A saída é a mesma, como a documentação diz. O custo varia com a **escrita de cache**, que oscila de
  sessão para sessão nos dois lados — o turno de 0,023 é o único que achou o cache inteiro. A primeira
  corrida do `pnpm measure:thinking` tinha dado 0,380 contra 0,023, e era isso: o turno com pedido veio
  primeiro e pagou a escrita.
