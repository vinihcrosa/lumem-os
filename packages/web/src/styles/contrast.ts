import { color, primitives } from "./tokens.js";

/**
 * Os pares de contraste da interface, e a conta que os julga.
 *
 * Isto morava dentro do `generate-tokens.py`, junto com a geração da paleta. O gerador
 * saiu — o design passou a ser feito inteiramente no Open Design, e `tokens.css` é
 * agora um arquivo **sincronizado**, não gerado. A verificação ficou, e ficou porque
 * ela vale mais depois da mudança do que valia antes: um token editado à mão numa
 * ferramenta de design é exatamente o caso que precisa de alguém conferindo o
 * contraste. O gerador conferia na geração; a suíte confere no gate.
 *
 * Cada par é **uso real** na interface, não combinação teórica. Ao introduzir uma
 * combinação nova na tela, o par entra aqui — e é isso que faz o número crescer em vez
 * de a lista envelhecer.
 */

export interface ContrastPair {
  /** Em português, porque é o que aparece quando falha. */
  label: string;
  /** Nome semântico, como em `tokens.ts`: `text/primary`. */
  fg: string;
  bg: string;
  /** 4.5 para texto normal, 3.0 para texto grande e para elemento gráfico. */
  min: number;
}

export const CONTRAST_PAIRS: readonly ContrastPair[] = [
  { label: "texto primario / superficie", fg: "text/primary", bg: "bg/surface", min: 4.5 },
  { label: "texto secundario / superficie", fg: "text/secondary", bg: "bg/surface", min: 4.5 },
  { label: "texto terciario / superficie", fg: "text/tertiary", bg: "bg/surface", min: 3.0 },
  { label: "texto primario / fundo", fg: "text/primary", bg: "bg/base", min: 4.5 },
  { label: "texto secundario / fundo", fg: "text/secondary", bg: "bg/base", min: 4.5 },
  { label: "label do botao / botao", fg: "text/on-brand", bg: "bg/brand", min: 4.5 },
  { label: "link / fundo", fg: "text/link", bg: "bg/base", min: 4.5 },
  { label: "texto de codigo / inset", fg: "text/code", bg: "bg/inset", min: 4.5 },
  { label: "erro / superficie", fg: "text/danger", bg: "bg/surface", min: 4.5 },
  { label: "sucesso / superficie", fg: "text/success", bg: "bg/surface", min: 4.5 },
  { label: "alerta / superficie", fg: "text/warning", bg: "bg/surface", min: 4.5 },
  { label: "info / superficie", fg: "text/info", bg: "bg/surface", min: 4.5 },
  /*
   * O rodapé de agentes pinta os tres estados sobre bg/panel (`second-agent`, T12).
   *
   * Nenhum dos tres estava declarado — nem o verde, que ja era pintado ali desde a
   * `agent-login`. O desenho do segundo agente deu cor de estado ao ponto da linha,
   * e ai a combinacao passou a existir duas vezes na mesma linha: no texto e no
   * ponto. Medidos em 9,85, 9,10 e 8,76:1.
   */
  { label: "agente conectado / painel", fg: "daemon/online", bg: "bg/panel", min: 4.5 },
  { label: "agente sem credencial / painel", fg: "text/warning", bg: "bg/panel", min: 4.5 },
  { label: "agente falhou / painel", fg: "text/danger", bg: "bg/panel", min: 4.5 },
  // dominio: a sidebar pinta sobre bg/panel, o detalhe sobre bg/surface.
  { label: "sessao rodando / painel", fg: "session/running", bg: "bg/panel", min: 4.5 },
  { label: "sessao encerrada / painel", fg: "session/exited", bg: "bg/panel", min: 3.0 },
  { label: "sessao falhou / painel", fg: "session/failed", bg: "bg/panel", min: 4.5 },
  { label: "icone de shell / painel", fg: "session/shell", bg: "bg/panel", min: 4.5 },
  { label: "icone de agente / painel", fg: "session/agent", bg: "bg/panel", min: 4.5 },
  { label: "worktree limpa / superficie", fg: "worktree/clean", bg: "bg/surface", min: 4.5 },
  { label: "worktree suja / superficie", fg: "worktree/dirty", bg: "bg/surface", min: 4.5 },
  { label: "worktree ausente / superficie", fg: "worktree/missing", bg: "bg/surface", min: 4.5 },
  { label: "branch / painel", fg: "git/branch", bg: "bg/panel", min: 4.5 },
  { label: "branch / superficie", fg: "git/branch", bg: "bg/surface", min: 4.5 },
  { label: "commits a frente / superficie", fg: "git/ahead", bg: "bg/surface", min: 4.5 },
  { label: "commits atras / superficie", fg: "git/behind", bg: "bg/surface", min: 4.5 },
  { label: "escopo projeto / painel", fg: "scope/project", bg: "bg/panel", min: 4.5 },
  { label: "escopo worktree / painel", fg: "scope/worktree", bg: "bg/panel", min: 4.5 },
  { label: "daemon offline / fundo", fg: "daemon/offline", bg: "bg/base", min: 4.5 },
  { label: "daemon online / fundo", fg: "daemon/online", bg: "bg/base", min: 4.5 },
  // a linha selecionada da sidebar tem fundo proprio: o texto precisa aguentar.
  { label: "texto primario / selecionado", fg: "text/primary", bg: "bg/selected", min: 4.5 },
  { label: "texto secundario / selecionado", fg: "text/secondary", bg: "bg/selected", min: 4.5 },
  // terminal: mono claro sobre o fundo mais escuro que existe.
  { label: "mono / terminal", fg: "text/primary", bg: "bg/inset", min: 4.5 },
  // codigo: o realce pinta sobre o mesmo poco do terminal.
  { label: "keyword / codigo", fg: "syntax/keyword", bg: "bg/inset", min: 4.5 },
  { label: "string / codigo", fg: "syntax/string", bg: "bg/inset", min: 4.5 },
  { label: "numero / codigo", fg: "syntax/number", bg: "bg/inset", min: 4.5 },
  { label: "comentario / codigo", fg: "syntax/comment", bg: "bg/inset", min: 3.0 },
  { label: "funcao / codigo", fg: "syntax/function", bg: "bg/inset", min: 4.5 },
  { label: "tipo / codigo", fg: "syntax/type", bg: "bg/inset", min: 4.5 },
  { label: "pontuacao / codigo", fg: "syntax/punctuation", bg: "bg/inset", min: 4.5 },
  // diff: o texto e o sinal precisam aguentar a faixa de fundo da linha.
  { label: "codigo / linha adicionada", fg: "text/code", bg: "git/added-subtle", min: 4.5 },
  { label: "codigo / linha removida", fg: "text/code", bg: "git/removed-subtle", min: 4.5 },
  { label: "sinal + / linha adicionada", fg: "git/added", bg: "git/added-subtle", min: 3.0 },
  { label: "sinal - / linha removida", fg: "git/removed", bg: "git/removed-subtle", min: 3.0 },
  // O diff do cartao de ferramenta mostra codigo REALCADO sobre a faixa da
  // linha. Antes so `text/code` estava conferido ali, e realce sobre fundo
  // colorido e exatamente onde contraste chutado reprova.
  { label: "keyword / linha adicionada", fg: "syntax/keyword", bg: "git/added-subtle", min: 4.5 },
  { label: "keyword / linha removida", fg: "syntax/keyword", bg: "git/removed-subtle", min: 4.5 },
  { label: "string / linha adicionada", fg: "syntax/string", bg: "git/added-subtle", min: 4.5 },
  { label: "string / linha removida", fg: "syntax/string", bg: "git/removed-subtle", min: 4.5 },
  { label: "function / linha adicionada", fg: "syntax/function", bg: "git/added-subtle", min: 4.5 },
  { label: "function / linha removida", fg: "syntax/function", bg: "git/removed-subtle", min: 4.5 },
  { label: "type / linha adicionada", fg: "syntax/type", bg: "git/added-subtle", min: 4.5 },
  { label: "type / linha removida", fg: "syntax/type", bg: "git/removed-subtle", min: 4.5 },
  { label: "number / linha adicionada", fg: "syntax/number", bg: "git/added-subtle", min: 4.5 },
  { label: "number / linha removida", fg: "syntax/number", bg: "git/removed-subtle", min: 4.5 },
  { label: "punctuation / linha adicionada", fg: "syntax/punctuation", bg: "git/added-subtle", min: 4.5 },
  { label: "punctuation / linha removida", fg: "syntax/punctuation", bg: "git/removed-subtle", min: 4.5 },
  { label: "comment / linha adicionada", fg: "syntax/comment-diff", bg: "git/added-subtle", min: 4.5 },
  { label: "comment / linha removida", fg: "syntax/comment-diff", bg: "git/removed-subtle", min: 4.5 },
  // marcador de status na arvore de arquivos, que pinta sobre bg/panel.
  { label: "arquivo novo / painel", fg: "git/added", bg: "bg/panel", min: 4.5 },
  { label: "arquivo modificado / painel", fg: "git/modified", bg: "bg/panel", min: 4.5 },
  { label: "arquivo apagado / painel", fg: "git/removed", bg: "bg/panel", min: 4.5 },
  { label: "nao rastreado / painel", fg: "git/untracked", bg: "bg/panel", min: 4.5 },
  // editor: cursor e selecao pintam no mesmo poco do codigo. O cursor e
  // objeto grafico (WCAG 1.4.11, 3:1); o resto e texto e vale 4,5.
  { label: "cursor / codigo", fg: "editor/cursor", bg: "bg/inset", min: 3.0 },
  { label: "codigo / selecao", fg: "text/code", bg: "editor/selection", min: 4.5 },
  { label: "codigo / linha ativa", fg: "text/code", bg: "editor/active-line", min: 4.5 },
  { label: "numero de linha / codigo", fg: "editor/line-number", bg: "bg/inset", min: 4.5 },
  { label: "numero da linha ativa / ativa", fg: "editor/line-number-active", bg: "editor/active-line", min: 4.5 },
  // rodape do visualizador: os quatro estados do autosave, mais o modo
  // somente leitura. Todos sobre bg/surface, em texto de 11px.
  { label: "somente leitura / rodape", fg: "editor/readonly", bg: "bg/surface", min: 4.5 },
  { label: "salvando / rodape", fg: "save/saving", bg: "bg/surface", min: 4.5 },
  { label: "salvo / rodape", fg: "save/saved", bg: "bg/surface", min: 4.5 },
  { label: "falha ao salvar / rodape", fg: "save/failed", bg: "bg/surface", min: 4.5 },
  { label: "mudou no disco / rodape", fg: "save/stale", bg: "bg/surface", min: 4.5 },
  // conflito: banner de aviso com as duas saidas, e o botao destrutivo do
  // dialogo de apagar. Os dois fundos sao subtle, e o texto vive neles.
  { label: "conflito / aviso", fg: "save/stale", bg: "bg/warning-subtle", min: 4.5 },
  { label: "texto primario / aviso", fg: "text/primary", bg: "bg/warning-subtle", min: 4.5 },
  { label: "apagar / fundo destrutivo", fg: "text/danger", bg: "bg/danger-subtle", min: 4.5 },
  // conversa: quem fala. O turno do agente le sobre o fundo da conversa
  // (bg/base); o do usuario sobre o bloco levantado que o separa.
  { label: "agente / conversa", fg: "turn/agent", bg: "bg/base", min: 4.5 },
  { label: "usuario / bloco do usuario", fg: "turn/user", bg: "bg/raised", min: 4.5 },
  { label: "raciocinio / conversa", fg: "turn/thought", bg: "bg/base", min: 4.5 },
  { label: "caret do agente / conversa", fg: "turn/caret", bg: "bg/base", min: 3.0 },
  // ferramenta: os quatro estados vivem no cabecalho do cartao, que pinta
  // sobre bg/surface, em label de 11px — texto, entao 4,5.
  { label: "ferramenta pendente / cartao", fg: "tool/pending", bg: "bg/surface", min: 4.5 },
  { label: "ferramenta rodando / cartao", fg: "tool/running", bg: "bg/surface", min: 4.5 },
  { label: "ferramenta ok / cartao", fg: "tool/ok", bg: "bg/surface", min: 4.5 },
  { label: "ferramenta falhou / cartao", fg: "tool/failed", bg: "bg/surface", min: 4.5 },
  { label: "ferramenta interrompida / cartao", fg: "tool/cancelled", bg: "bg/surface", min: 4.5 },
  // a saida da ferramenta cai no mesmo poco do terminal, e o estado aparece
  // de novo la dentro (sinal de saida, linha de erro).
  { label: "ferramenta falhou / poco", fg: "tool/failed", bg: "bg/inset", min: 4.5 },
  { label: "ferramenta ok / poco", fg: "tool/ok", bg: "bg/inset", min: 4.5 },
  // permissao: o pedido pinta sobre o proprio fundo de aviso, e o veredito
  // depois fica no cartao ja resolvido.
  { label: "pedido / fundo de aviso", fg: "permission/pending", bg: "bg/warning-subtle", min: 4.5 },
  { label: "permitido / cartao", fg: "permission/allowed", bg: "bg/surface", min: 4.5 },
  { label: "negado / cartao", fg: "permission/denied", bg: "bg/surface", min: 4.5 },
  // plano: tres estados numa lista sobre bg/surface.
  { label: "passo pendente / plano", fg: "plan/pending", bg: "bg/surface", min: 4.5 },
  { label: "passo corrente / plano", fg: "plan/active", bg: "bg/surface", min: 4.5 },
  { label: "passo feito / plano", fg: "plan/done", bg: "bg/surface", min: 4.5 },
  // uso: o medidor e o rodape da conversa, sobre bg/panel. A barra em si e
  // objeto grafico (3:1); o numero ao lado dela e texto (4,5).
  { label: "medidor quieto / rodape", fg: "usage/quiet", bg: "bg/panel", min: 3.0 },
  { label: "uso quieto / rodape", fg: "usage/quiet", bg: "bg/panel", min: 4.5 },
  { label: "uso no limiar / rodape", fg: "usage/warn", bg: "bg/panel", min: 4.5 },
  { label: "uso em overage / rodape", fg: "usage/over", bg: "bg/panel", min: 4.5 },
  { label: "custo / rodape", fg: "usage/cost", bg: "bg/panel", min: 4.5 },
  { label: "uso em overage / aviso", fg: "usage/over", bg: "bg/danger-subtle", min: 4.5 },
  // modo: o seletor vive na topbar da conversa, sobre bg/surface.
  { label: "modo plano / seletor", fg: "mode/plan", bg: "bg/surface", min: 4.5 },
  { label: "modo auto / seletor", fg: "mode/auto", bg: "bg/surface", min: 4.5 },
  { label: "modo bypass / seletor", fg: "mode/bypass", bg: "bg/surface", min: 4.5 },
  // modo do Lumem: quando o agente nao relata `modes`, quem oferece modo e o
  // daemon, e o menu dele pinta sobre bg/raised — um degrau MAIS CLARO que a
  // superficie, entao os pares acima nao cobrem. A opcao escolhida ainda ganha
  // bg/active por cima. Ver `docs/features/016-session-mode/prd.md`.
  { label: "titulo de opcao / menu de modo", fg: "text/primary", bg: "bg/raised", min: 4.5 },
  { label: "descricao de opcao / menu de modo", fg: "text/secondary", bg: "bg/raised", min: 4.5 },
  { label: "de quem e a regra / menu de modo", fg: "text/tertiary", bg: "bg/raised", min: 3.0 },
  { label: "modo auto / menu de modo", fg: "mode/auto", bg: "bg/raised", min: 4.5 },
  { label: "modo bypass / menu de modo", fg: "mode/bypass", bg: "bg/raised", min: 4.5 },
  { label: "titulo de opcao / opcao escolhida", fg: "text/primary", bg: "bg/active", min: 4.5 },
  { label: "descricao de opcao / opcao escolhida", fg: "text/secondary", bg: "bg/active", min: 4.5 },
  // o portao do modo `liberado` lista o que passa a acontecer dentro de um poco
  // destrutivo — texto normal sobre bg/danger-subtle, que so tinha o par do
  // texto em vermelho.
  { label: "o que passa a acontecer / portao", fg: "text/primary", bg: "bg/danger-subtle", min: 4.5 },
  // a barra da pull request: cada veredito pinta texto sobre a rampa `subtle`
  // da propria cor. Zero token novo — o que a feature acrescenta sao PARES, que
  // e o que faz esta lista crescer em vez de envelhecer.
  { label: "pronta / barra da PR", fg: "text/success", bg: "bg/success-subtle", min: 4.5 },
  { label: "bloqueada / barra da PR", fg: "text/danger", bg: "bg/danger-subtle", min: 4.5 },
  { label: "verificando / barra da PR", fg: "text/warning", bg: "bg/warning-subtle", min: 4.5 },
  { label: "mesclada / barra da PR", fg: "text/brand", bg: "bg/brand-subtle", min: 4.5 },
  { label: "sem PR / barra da PR", fg: "text/secondary", bg: "bg/neutral-subtle", min: 4.5 },
  // o motivo e a idade ficam em texto secundario e terciario SOBRE a faixa
  // colorida — e nao sobre a superficie, que e onde os pares antigos mediram.
  { label: "motivo / barra da PR pronta", fg: "text/secondary", bg: "bg/success-subtle", min: 4.5 },
  { label: "motivo / barra da PR bloqueada", fg: "text/secondary", bg: "bg/danger-subtle", min: 4.5 },
  { label: "motivo / barra da PR verificando", fg: "text/secondary", bg: "bg/warning-subtle", min: 4.5 },
  { label: "motivo / barra da PR mesclada", fg: "text/secondary", bg: "bg/brand-subtle", min: 4.5 },
  { label: "idade / barra da PR", fg: "text/tertiary", bg: "bg/neutral-subtle", min: 3.0 },
  { label: "idade velha / barra da PR", fg: "text/warning", bg: "bg/neutral-subtle", min: 4.5 },
  { label: "nome de check / barra da PR", fg: "text/primary", bg: "bg/danger-subtle", min: 4.5 },
];

/**
 * Os conjuntos de distinção, e a conta que os julga.
 *
 * `CONTRAST_PAIRS` responde **"dá pra ler?"** — cor contra o fundo. Esta lista responde
 * a outra pergunta, que o repositório não tinha gate nenhum para: **"dá pra
 * diferenciar?"** — cor contra a cor ao lado.
 *
 * Ela existe porque a suíte ficou **verde** enquanto o quadro pintava
 * `● implementando` e `● bloqueada` quase na mesma cor. Os dois passavam no contraste
 * folgado, cada um contra o seu fundo, e significavam coisas opostas na mesma tela. Foi
 * preciso abrir o navegador para ver — que é exatamente o trabalho que um gate existe
 * para não cobrar de ninguém.
 *
 * Como em `CONTRAST_PAIRS`, cada conjunto é **adjacência real** na interface — tokens
 * que aparecem lado a lado, ou um sob o outro, significando coisas diferentes. Não é
 * "todo token contra todo token": dois tokens que nunca dividem tela podem ter o mesmo
 * matiz sem prejudicar ninguém.
 *
 * **Token acromático fica de fora da conta, e isso não é folga.** Matiz de um cinza é
 * um número sem significado — dois cinzas se distinguem por claridade, e é
 * `CONTRAST_PAIRS` quem governa isso. Por isso `tool/pending` e `session/exited` são
 * listados: entram no conjunto, são reconhecidos como acromáticos e saem da comparação
 * de matiz de propósito, em vez de serem esquecidos em silêncio.
 */

/** Croma OKLCH abaixo disto é cinza: o matiz deixa de ter significado. */
const CHROMA_FLOOR = 0.03;

/**
 * Separação mínima de matiz, em graus OKLCH.
 *
 * O número vem de duas medições, não de gosto. **26°** foi a separação entre
 * `session/agent` e `text/danger` no dia em que as duas ficaram indistinguíveis no
 * quadro — o defeito que esta lista existe para pegar. **46°** é o conjunto mais
 * apertado que o produto tem hoje, `syntax/string` contra `syntax/type`, e ele está
 * certo. O limiar tem de reprovar o primeiro e aprovar o segundo; 40° fica entre os
 * dois, mais perto da realidade medida que do defeito.
 */
const MIN_HUE_SEPARATION = 40;

export interface DistinctionSet {
  /** Em português, porque é o que aparece quando falha. */
  label: string;
  /** Nomes semânticos, como em `tokens.ts`. Acromático entra e é ignorado na conta. */
  tokens: readonly string[];
}

export const DISTINCTION_SETS: readonly DistinctionSet[] = [
  // O conjunto que deu origem à lista. `.tcard--work|blocked|wait|paused|manual`,
  // em board.css, pintam a borda esquerda e o ponto do selo — cartões vizinhos.
  {
    label: "selos do cartao, lado a lado no quadro",
    tokens: ["session/agent", "text/danger", "tool/pending", "text/tertiary", "border/subtle"],
  },
  // O menu de modo lista os tres um sob o outro, com o ponto colorido à esquerda.
  { label: "modos, um sob o outro no seletor", tokens: ["mode/plan", "mode/auto", "mode/bypass"] },
  // Cartões de ferramenta consecutivos no transcript.
  {
    label: "estados de ferramenta, cartoes consecutivos",
    tokens: ["tool/pending", "tool/running", "tool/ok", "tool/failed", "tool/cancelled"],
  },
  // O trecho de código é onde mais tokens dividem a MESMA linha.
  {
    label: "sintaxe, no mesmo trecho de codigo",
    tokens: [
      "syntax/keyword", "syntax/string", "syntax/number", "syntax/comment",
      "syntax/function", "syntax/type", "syntax/punctuation",
    ],
  },
  { label: "estado da worktree, na linha da sidebar", tokens: ["worktree/clean", "worktree/dirty", "worktree/missing"] },
  {
    label: "escopo, na arvore da sidebar",
    tokens: ["scope/global", "scope/workspace", "scope/project", "scope/worktree"],
  },
  {
    label: "sessao, no rodape e na aba",
    tokens: ["session/running", "session/exited", "session/failed", "session/shell", "session/agent"],
  },
  { label: "passos do plano", tokens: ["plan/pending", "plan/active", "plan/done"] },
  { label: "medidor de uso, na mesma linha", tokens: ["usage/quiet", "usage/warn", "usage/over", "usage/cost"] },
];

/** Croma e matiz OKLCH de um hexadecimal sRGB. */
function oklch(hex: string): { chroma: number; hue: number } {
  const linear = (n: number): number => {
    const c = n / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const value = Number.parseInt(hex.slice(1), 16);
  const r = linear((value >> 16) & 0xff);
  const g = linear((value >> 8) & 0xff);
  const b = linear(value & 0xff);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const a = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  const hue = (Math.atan2(bb, a) * 180) / Math.PI;
  return { chroma: Math.hypot(a, bb), hue: hue < 0 ? hue + 360 : hue };
}

/** A menor distância entre dois matizes num círculo de 360°. */
function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Devolve os problemas, vazio quando está de pé.
 *
 * A mensagem é o teste: "um conjunto reprovou" não diz quais duas cores encostaram.
 */
export function checkDistinction(
  sets: readonly DistinctionSet[] = DISTINCTION_SETS,
  minSeparation: number = MIN_HUE_SEPARATION,
): string[] {
  const problems: string[] = [];
  const palette = color as Record<string, string | undefined>;

  for (const set of sets) {
    const chromatic: { token: string; hue: number }[] = [];
    for (const token of set.tokens) {
      const hex = palette[token];
      if (hex === undefined) {
        problems.push(`${set.label}: ${token} não existe em tokens.ts`);
        continue;
      }
      const { chroma, hue } = oklch(hex);
      if (chroma >= CHROMA_FLOOR) chromatic.push({ token, hue });
    }

    for (let i = 0; i < chromatic.length; i += 1) {
      for (let j = i + 1; j < chromatic.length; j += 1) {
        const one = chromatic[i]!;
        const other = chromatic[j]!;
        const distance = hueDistance(one.hue, other.hue);
        if (distance < minSeparation) {
          problems.push(
            `${set.label}: ${one.token} e ${other.token} ficam a ${distance.toFixed(0)}° ` +
              `de matiz, e o mínimo é ${minSeparation}°`,
          );
        }
      }
    }
  }
  return problems;
}

/** Luminância relativa, WCAG 2.1. */
function relativeLuminance(hex: string): number {
  const channel = (n: number): number => {
    const c = n / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const value = Number.parseInt(hex.slice(1), 16);
  const r = channel((value >> 16) & 0xff);
  const g = channel((value >> 8) & 0xff);
  const b = channel(value & 0xff);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A razão de contraste entre duas cores hexadecimais. Sempre >= 1. */
export function contrastRatio(fg: string, bg: string): number {
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

export interface ContrastResult extends ContrastPair {
  ratio: number;
  ok: boolean;
  /** O que o par alcança, não o que ele precisava. */
  grade: "AAA" | "AA" | "AA-large" | "reprovado";
}

/**
 * Julga a lista inteira.
 *
 * Um token que não existe é **reprovado**, não ignorado: par apontando para nome que
 * não existe mais é a lista envelhecendo em silêncio, que é o modo de falha que essa
 * verificação existe para não ter.
 */
export function checkContrast(): ContrastResult[] {
  const palette = color as Record<string, string | undefined>;

  return CONTRAST_PAIRS.map((pair) => {
    const fg = palette[pair.fg];
    const bg = palette[pair.bg];
    if (fg === undefined || bg === undefined) {
      return { ...pair, ratio: 0, ok: false, grade: "reprovado" as const };
    }
    const ratio = contrastRatio(fg, bg);
    return {
      ...pair,
      ratio,
      ok: ratio >= pair.min,
      grade:
        ratio >= 7 ? ("AAA" as const)
        : ratio >= 4.5 ? ("AA" as const)
        : ratio >= 3 ? ("AA-large" as const)
        : ("reprovado" as const),
    };
  });
}

/**
 * A escada de cinzas: número maior é sempre mais escuro.
 *
 * Quebrar a monotonia envenena tudo o que está acima, porque cada superfície e cada
 * borda escolhe um degrau confiando nessa ordem. Devolve os problemas, vazio quando
 * está de pé.
 */
export function checkNeutralLadder(): string[] {
  const steps = Object.keys(primitives.neutral)
    .map(Number)
    .sort((a, b) => a - b);

  const problems: string[] = [];
  let previous: number | null = null;
  for (const step of steps) {
    const hex = (primitives.neutral as Record<string, string>)[String(step)]!;
    const luminance = relativeLuminance(hex);
    if (previous !== null && luminance >= previous) {
      problems.push(`neutral/${step} não é mais escuro que o degrau anterior`);
    }
    previous = luminance;
  }
  return problems;
}
