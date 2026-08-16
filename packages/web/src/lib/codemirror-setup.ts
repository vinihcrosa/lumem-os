import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";

import { color, size, space } from "../styles/tokens.js";
import { shikiConfig, shikiHighlighting, type ShikiConfig } from "./shiki-codemirror.js";

/*
 * O editor do split, montado a dedo.
 *
 * Este módulo é carregado por `import()` dinâmico e nada mais o importa de
 * forma estática: é ele que carrega os ~137 KB gzip do CodeMirror, e o bundle
 * inicial não paga por quem nunca abre um arquivo. Mesmo precedente do shiki
 * nesta base, e o mesmo motivo — o daemon serve isto sem CDN.
 *
 * Sem o meta-pacote `codemirror` (`basicSetup`) de propósito: ele traz
 * `@codemirror/autocomplete` e `@codemirror/lint` a +29 KB gzip, e os dois são
 * não-objetivos declarados no §6 do PRD. O conjunto abaixo é escolhido a dedo.
 */

/**
 * The editor's palette, built from the same tokens as everything else.
 *
 * Same argument as `xterm-theme` and `shiki.ts`: CodeMirror injects its own
 * stylesheet from a JS object, so this is a place where a colour is handed
 * over as a value instead of read from a custom property — and therefore a
 * place where the palette can silently drift. `codemirror-setup.test.ts` pins
 * every one of these to a token name; a literal here would fail it.
 */
export const EDITOR_THEME_SPEC = {
  "&": {
    height: "100%",
    color: color["text/code"],
    backgroundColor: color["bg/inset"],
  },
  // The frame already draws a border; a second one inside it reads as a
  // field in a form rather than as the file taking the whole panel.
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { font: "var(--text-mono-md)" },
  /*
   * The hanging indent the prototype asked for: `lineWrapping` puts the
   * continuation of a wrapped line at column 0, where it reads as a line of
   * its own. Negative `text-indent` against a matching `padding-left` pulls
   * the first line back out, so only the continuation is indented — same
   * trick, same numbers, as the `.code .t` this replaces.
   */
  ".cm-line": {
    padding: `0 ${space[12]}px`,
    textIndent: `-${space[12]}px`,
  },
  ".cm-content": { caretColor: color["editor/cursor"] },
  /*
   * P8: the gutter used to be `text/disabled`, which is 2,96:1 over the well
   * — under even the minimum for a graphical object. A line number is the
   * address you read out loud and the one the failing test points at.
   */
  ".cm-gutters": {
    minWidth: `${size["gutter/line"]}px`,
    padding: `0 ${space[10]}px 0 0`,
    color: color["editor/line-number"],
    backgroundColor: color["bg/inset"],
    border: "none",
    userSelect: "none",
  },
  ".cm-lineNumbers .cm-gutterElement": { padding: `0 0 0 ${space[8]}px` },
  ".cm-activeLine": { backgroundColor: color["editor/active-line"] },
  ".cm-activeLineGutter": {
    backgroundColor: color["editor/active-line"],
    color: color["editor/line-number-active"],
  },
  // 2px, not 1: over the darkest well in the app a 1px hair disappears on
  // the first line that has a lit background behind it.
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: color["editor/cursor"],
    borderLeftWidth: `${space[2]}px`,
  },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection": {
    backgroundColor: color["editor/selection"],
  },
  ".cm-selectionMatch": { backgroundColor: color["bg/active"] },
  ".cm-panels": {
    backgroundColor: color["bg/surface"],
    color: color["text/primary"],
    borderColor: color["border/subtle"],
  },
  ".cm-searchMatch": { backgroundColor: color["bg/brand-muted"] },
  ".cm-searchMatch.cm-searchMatch-selected": { backgroundColor: color["bg/brand-subtle"] },
};

export const lumemEditorTheme = EditorView.theme(EDITOR_THEME_SPEC, { dark: true });

export interface EditorOptions {
  doc: string;
  /** One of the five refusals (F1.4): shown, navigable, and not writable. */
  readOnly: boolean;
  wrap: boolean;
}

export interface EditorHandle {
  /** Replaces the whole document, for a refetch of the file already open. */
  setDoc(text: string): void;
  setWrap(wrap: boolean): void;
  /** Null until the grammar has loaded, and forever for a file that has none. */
  setHighlight(config: ShikiConfig | null): void;
  /** For tests and for the odd assertion; nothing in the app should reach past it. */
  readonly view: EditorView;
  destroy(): void;
}

export function mountEditor(parent: HTMLElement, options: EditorOptions): EditorHandle {
  const wrapping = new Compartment();
  const highlighting = new Compartment();

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: options.doc,
      extensions: [
        lineNumbers(),
        highlightSpecialChars(),
        drawSelection(),
        rectangularSelection(),
        history(),
        search({ top: true }),
        highlightSelectionMatches(),
        indentUnit.of("  "),
        EditorState.allowMultipleSelections.of(true),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
        wrapping.of(options.wrap ? EditorView.lineWrapping : []),
        highlighting.of(shikiConfig.of(null)),
        lumemEditorTheme,
        shikiHighlighting(),
        ...readOnlyExtensions(options.readOnly),
      ],
    }),
  });

  return {
    view,
    setDoc(text: string): void {
      if (text === view.state.doc.toString()) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    setWrap(wrap: boolean): void {
      view.dispatch({
        effects: wrapping.reconfigure(wrap ? EditorView.lineWrapping : []),
      });
    },
    setHighlight(config: ShikiConfig | null): void {
      view.dispatch({ effects: highlighting.reconfigure(shikiConfig.of(config)) });
    },
    destroy(): void {
      view.destroy();
    },
  };
}

/**
 * What a read-only file loses, and what it keeps.
 *
 * `editable: false` on top of `readOnly` is deliberate: a caret blinking in a
 * file the daemon will refuse to write is a promise about the next keystroke
 * that nothing behind it can keep. Selecting, copying, scrolling and searching
 * all still work — the file is readable, and only the writing is gone (F1.4).
 *
 * The active line goes with the caret for the same reason: without one, the
 * highlight would just be marking line 1 forever.
 */
function readOnlyExtensions(readOnly: boolean): Extension[] {
  if (readOnly) return [EditorState.readOnly.of(true), EditorView.editable.of(false)];
  return [dropCursor(), highlightActiveLine(), highlightActiveLineGutter()];
}
