import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { indentUnit } from "@codemirror/language";
import { highlightSelectionMatches, search, searchKeymap } from "@codemirror/search";
import {
  Annotation,
  Compartment,
  EditorState,
  type Extension,
  type Transaction,
} from "@codemirror/state";
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

/*
 * ---------------------------------------------------------------------------
 * O FIM DE LINHA, QUE O CODEMIRROR NÃO GUARDA E A A7/Q6 EXIGE
 *
 * `EditorState.create` quebra o texto em `/\r\n?|\n/` e junta de volta com
 * `state.lineBreak`, que é `"\n"`. Ou seja: um arquivo CRLF entra e o
 * `doc.toString()` deixa de ser o que o `files.read` respondeu — o editor
 * normaliza e não conta a ninguém.
 *
 * A Q6 decidiu que os bytes são preservados e nomeou **o editor** como o lugar
 * da conversão simétrica: converte na entrada, reconverte na saída, guardando
 * qual era o original. Aqui é a saída. Sem isto a E9 gravaria um arquivo CRLF
 * inteiro em LF na primeira parada de digitação — "todas as linhas mudaram"
 * num diff de uma linha —, e hoje, sem autosave nenhum, a guarda do `setDoc`
 * nunca casa num arquivo CRLF: cada releitura troca o documento inteiro, leva
 * o cursor para 0 e entra no histórico de undo.
 *
 * Arquivo com fim de linha **misto** sai inteiro no que aparecia mais nele, e
 * portanto suas quebras minoritárias mudam. Manter cada quebra onde estava
 * exigiria carregá-la junto da linha por edições que dividem, juntam e movem
 * linhas, o que um documento de texto puro não faz; a maioria limita o estrago
 * a menos da metade das quebras, e arquivo misto já era ruído de diff antes de
 * nós. Empate vai para LF.
 * ---------------------------------------------------------------------------
 */
type LineEnding = "\n" | "\r\n" | "\r";

function detectLineEnding(text: string): LineEnding {
  const crlf = occurrences(text, "\r\n");
  // The lone ones: every CR that is not the head of a CRLF, and every LF that
  // is not its tail.
  const cr = occurrences(text, "\r") - crlf;
  const lf = occurrences(text, "\n") - crlf;
  if (crlf > lf && crlf >= cr) return "\r\n";
  if (cr > lf && cr > crlf) return "\r";
  return "\n";
}

function occurrences(text: string, needle: string): number {
  let total = 0;
  for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + needle.length)) {
    total++;
  }
  return total;
}

/** What CodeMirror is going to do anyway, done here so `setDoc` can compare against it. */
function toLf(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

function fromLf(text: string, ending: LineEnding): string {
  if (ending === "\n") return text;
  return text.replace(/\n/g, ending);
}

/**
 * Marks the transactions that carry the disk, so they never read as typing.
 *
 * D4: a clean buffer adopting what the daemon re-read is not the buffer moving.
 * Without the mark the autosave would hear its own reload and write back what
 * it has just read, for ever.
 */
const fromDisk = Annotation.define<boolean>();

function carriesDisk(transaction: Transaction): boolean {
  return transaction.annotation(fromDisk) === true;
}

export interface EditorOptions {
  doc: string;
  /** One of the five refusals (F1.4): shown, navigable, and not writable. */
  readOnly: boolean;
  wrap: boolean;
}

export interface EditorHandle {
  /** Replaces the whole document, for a refetch of the file already open. */
  setDoc(text: string): void;
  /**
   * The buffer as the daemon should receive it, with the file's own line
   * ending put back (A7/Q6) — this is the string the E9 hands to `files.write`.
   */
  getDoc(): string;
  setWrap(wrap: boolean): void;
  /** Null until the grammar has loaded, and forever for a file that has none. */
  setHighlight(config: ShikiConfig | null): void;
  /**
   * Called after a change **someone typed**, never for `setDoc`. `null` takes
   * the listener off; there is one, and setting it replaces it.
   */
  onChange(listener: (() => void) | null): void;
  /** For tests and for the odd assertion; nothing in the app should reach past it. */
  readonly view: EditorView;
  destroy(): void;
}

export function mountEditor(parent: HTMLElement, options: EditorOptions): EditorHandle {
  const wrapping = new Compartment();
  const highlighting = new Compartment();
  let ending = detectLineEnding(options.doc);
  let changed: (() => void) | null = null;

  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc: toLf(options.doc),
      extensions: [
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          if (update.transactions.some(carriesDisk)) return;
          changed?.();
        }),
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
    getDoc(): string {
      return fromLf(view.state.doc.toString(), ending);
    },
    setDoc(text: string): void {
      // The file the daemon read again brings its own ending with it, and it
      // is the one that goes back on the next write.
      ending = detectLineEnding(text);
      const normalized = toLf(text);
      if (normalized === view.state.doc.toString()) return;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: normalized },
        annotations: fromDisk.of(true),
      });
    },
    onChange(listener: (() => void) | null): void {
      changed = listener;
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
