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
  // bg/active por cima. Ver `docs/prd/session-mode/prd.md`.
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
];

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
