import { Facet, type Extension, type Range, type Text } from "@codemirror/state";
import {
  Decoration,
  ViewPlugin,
  type DecorationSet,
  type EditorView,
  type PluginValue,
  type ViewUpdate,
} from "@codemirror/view";
import type { GrammarState, HighlighterCore, ThemedToken } from "shiki";

/*
 * ---------------------------------------------------------------------------
 * Vendorizado de `codemirror-shiki`, versão 0.3.0, em 2026-08-16.
 * https://www.npmjs.com/package/codemirror-shiki
 *
 * The MIT License (MIT)
 *
 * Copyright © 2025-present fengzilong
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE
 * ---------------------------------------------------------------------------
 *
 * POR QUE ISTO É CÓDIGO NOSSO E NÃO UMA DEPENDÊNCIA
 *
 * `@shikijs/codemirror` NÃO EXISTE. A única integração de editor que o time do
 * Shiki mantém é a do Monaco (`@shikijs/monaco`), e Monaco é exatamente o motor
 * que a Q1 descartou por bundle. Quem vier aqui querendo "trocar isto por um
 * pacote" já procurou o mesmo que eu: não há.
 *
 * O que havia era `codemirror-shiki`, de terceiro: MIT, zero dependências de
 * runtime, ~200 linhas, sem repositório público, um mantenedor, parado desde
 * 2025-07 e publicado antes de o shiki 4 existir. Ruim como dependência — não
 * dá para auditar nem forkar, e o update automático que ela oferece é
 * justamente o que não se quer de um pacote sem manutenção. Ótimo como código
 * nosso: a arquitetura (Facet + ViewPlugin + `Decoration.mark` por cor de
 * token + `grammarState` encadeado) é dele, e é a mesma que escreveríamos do
 * zero. A alternativa real era reescrever isto, não instalar outra coisa.
 *
 * O QUE MUDOU EM RELAÇÃO AO ORIGINAL, E POR QUÊ
 *
 * O original re-tokeniza **da linha 1 até o fim do viewport a cada mudança**,
 * cedendo a thread entre linhas para não travar. Medido nesta base, com o
 * shiki 4.4.3 e o motor de regex em JS: 0,269 ms por linha. Num arquivo
 * rolado até a linha 3000 isso é ~800 ms de trabalho por tecla — não bloqueante,
 * mas jogado fora e refeito na tecla seguinte.
 *
 * Aqui o estado do grammar é guardado **por linha** (`LineTokenCache`), então
 * uma edição invalida da linha alterada para baixo e nada acima dela. Editar a
 * última linha custa uma chamada, num arquivo de 60 ou de 3000 linhas — que é
 * a propriedade que `shiki-codemirror.test.ts` fixa. Com isso caem, por não
 * serem mais necessários, o `AbortController`, o `scheduler.yield`, os dois
 * `StateEffect` de agendamento, o `queueMicrotask` e a classe `Fragments` que
 * remapeava posições: as decorações são reconstruídas do cache a cada update,
 * o que é O(tokens visíveis) e não custa tokenização nenhuma.
 */

/**
 * The highlighter, the grammar and the theme this editor paints with.
 *
 * Null while the grammar is still loading, and for a file whose extension has
 * no grammar at all — both open as plain mono text, which is an answer and not
 * an error (F3.3 da right-panel).
 */
export interface ShikiConfig {
  /** Already created, with `language` and `theme` already loaded into it. */
  highlighter: HighlighterCore;
  language: string;
  theme: string;
}

export const shikiConfig = Facet.define<ShikiConfig | null, ShikiConfig | null>({
  combine: (values) => values[0] ?? null,
});

/**
 * One line's tokens, plus the grammar state that produced them.
 *
 * The state entering line N is what makes tokenizing line N correct — it is
 * how `*/` on line 40 knows it is closing the `/*` from line 12. Keeping it
 * per line is the whole reason an edit costs the lines below it instead of the
 * document: everything above the change keeps its state, so it keeps its
 * tokens.
 */
export class LineTokenCache {
  /** `entering[n]` is the grammar state at the start of line n; line 1 has none. */
  private readonly entering: (GrammarState | undefined)[] = [];
  private readonly tokens: ThemedToken[][] = [];
  private highest = 0;

  constructor(private readonly config: ShikiConfig) {}

  /** The last line whose tokens are known good. */
  get tokenizedThrough(): number {
    return this.highest;
  }

  /**
   * Forgets line `line` and everything after it.
   *
   * The state *entering* the changed line survives, because nothing above it
   * moved — that is the line the next `ensure` starts from.
   */
  invalidateFrom(line: number): void {
    const keep = Math.max(0, line - 1);
    if (keep >= this.highest) return;
    this.highest = keep;
    this.tokens.length = keep + 1;
    this.entering.length = keep + 2;
  }

  /**
   * Tokenizes forward until `throughLine`, doing nothing for lines already known.
   *
   * What this costs, said plainly: the state entering a line can only be known
   * by having read every line above it, so reaching line N for the first time
   * costs N lines. In practice a file opens at the top and the viewport is a
   * hundred lines, so opening costs a hundred; scrolling extends from where it
   * stopped. The one expensive gesture is jumping to the end of a large file,
   * which pays the document once and is bounded by `MAX_FILE_BYTES`. Editing —
   * the thing done over and over — costs the lines below the change and no more.
   */
  ensure(doc: Text, throughLine: number): void {
    const last = Math.min(throughLine, doc.lines);
    for (let n = this.highest + 1; n <= last; n++) {
      const line = doc.line(n);
      // An empty line has no tokens and leaves the grammar's stack exactly as
      // it found it, so it costs no call into shiki.
      if (line.length === 0) {
        this.tokens[n] = [];
        this.entering[n + 1] = this.entering[n];
        this.highest = n;
        continue;
      }

      /*
       * `shiki.ts` wraps every call into shiki and calls a failure "plain
       * text", because a file that renders uncoloured is an answer and a
       * column that breaks is not (F3.3). Here the call is inside a
       * `ViewPlugin`, and CodeMirror answers an exception in a plugin by
       * disabling the plugin — so a raw call would not degrade to plain text,
       * it would open the file with no colour at all for as long as it stayed
       * open. A line that fails is a line with no tokens, and the state after
       * it is unknown rather than wrong: the next line starts fresh.
       */
      let result: ReturnType<HighlighterCore["codeToTokens"]> | null = null;
      try {
        result = this.config.highlighter.codeToTokens(line.text, {
          lang: this.config.language,
          theme: this.config.theme,
          grammarState: this.entering[n],
        });
      } catch {
        result = null;
      }
      this.tokens[n] = result?.tokens[0] ?? [];
      this.entering[n + 1] = result?.grammarState;
      this.highest = n;
    }
  }

  lineTokens(line: number): readonly ThemedToken[] | undefined {
    return this.tokens[line];
  }
}

/**
 * One `Decoration` per colour, reused.
 *
 * A file of 600 lines is a few thousand tokens over a handful of distinct
 * colours — the palette has seven `syntax/*` tokens. Building a decoration per
 * token instead would allocate thousands of identical objects per keystroke.
 */
const marks = new Map<string, Decoration>();

function markFor(color: string): Decoration {
  const existing = marks.get(color);
  if (existing !== undefined) return existing;
  const mark = Decoration.mark({ attributes: { style: `color: ${color}` } });
  marks.set(color, mark);
  return mark;
}

function paint(cache: LineTokenCache, doc: Text, from: number, to: number): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const firstLine = doc.lineAt(from).number;
  const lastLine = doc.lineAt(to).number;

  for (let n = firstLine; n <= lastLine; n++) {
    const tokens = cache.lineTokens(n);
    if (tokens === undefined) break;
    const line = doc.line(n);
    for (const token of tokens) {
      if (token.color === undefined) continue;
      const start = line.from + token.offset;
      const end = start + token.content.length;
      // A mark decoration may not be empty, and may not run past its line —
      // the second guard matters because the tokens were produced for the text
      // as it was, and this runs against the text as it is.
      if (end <= start || end > line.to) continue;
      ranges.push(markFor(token.color).range(start, end));
    }
  }

  return Decoration.set(ranges, true);
}

/** The first line the change touched, in the document the change produced. */
function firstChangedLine(update: ViewUpdate): number {
  let first = Number.MAX_SAFE_INTEGER;
  update.changes.iterChangedRanges((_fromA, _toA, fromB) => {
    if (fromB < first) first = fromB;
  });
  if (first === Number.MAX_SAFE_INTEGER) return update.state.doc.lines + 1;
  return update.state.doc.lineAt(first).number;
}

class ShikiHighlighter implements PluginValue {
  decorations: DecorationSet = Decoration.none;
  private cache: LineTokenCache | null = null;
  private config: ShikiConfig | null = null;

  constructor(view: EditorView) {
    this.refresh(view, true);
  }

  update(update: ViewUpdate): void {
    if (update.docChanged) this.cache?.invalidateFrom(firstChangedLine(update));
    this.refresh(update.view, update.docChanged || update.viewportChanged);
  }

  private refresh(view: EditorView, stale: boolean): void {
    const config = view.state.facet(shikiConfig);
    if (config !== this.config) {
      this.config = config;
      this.cache = config === null ? null : new LineTokenCache(config);
      stale = true;
    }

    if (this.cache === null) {
      this.decorations = Decoration.none;
      return;
    }
    if (!stale) return;

    const doc = view.state.doc;
    this.cache.ensure(doc, doc.lineAt(view.viewport.to).number);
    this.decorations = paint(this.cache, doc, view.viewport.from, view.viewport.to);
  }
}

/**
 * Paints the editor with the Shiki highlighter the rest of the app already
 * uses — one palette, one set of grammars, one bundle (D1).
 */
export function shikiHighlighting(): Extension {
  return ViewPlugin.fromClass(ShikiHighlighter, {
    decorations: (plugin) => plugin.decorations,
  });
}
