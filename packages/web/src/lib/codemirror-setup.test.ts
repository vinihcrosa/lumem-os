import { undo } from "@codemirror/commands";
import { afterEach, describe, expect, it, vi } from "vitest";

import { color, primitives } from "../styles/tokens.js";
import { EDITOR_THEME_SPEC, mountEditor, type EditorHandle } from "./codemirror-setup.js";

/**
 * The editor is the third place in the client where a colour is handed over as
 * a value instead of read from a custom property — `xterm` was the first,
 * shiki's theme the second. CodeMirror builds its stylesheet from a JS object,
 * so a `.cm-*` rule written in CSS loses to it on specificity, silently.
 *
 * That makes this the third place where the palette can drift on its own.
 * These pin the wiring, not the shades, exactly as `xterm-theme.test.ts` does:
 * change a ramp in `generate-tokens.py` and they still pass; rename a token and
 * `tokens.ts` stops having the key, which fails the build instead of painting
 * `undefined`; write a hex here and the last one fails.
 */
describe("editor theme", () => {
  it("takes the caret, the selection and the active line from the editor tokens", () => {
    expect(EDITOR_THEME_SPEC[".cm-cursor, .cm-dropCursor"].borderLeftColor).toBe(
      color["editor/cursor"],
    );
    expect(EDITOR_THEME_SPEC[".cm-content"].caretColor).toBe(color["editor/cursor"]);
    expect(
      EDITOR_THEME_SPEC[
        "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection"
      ].backgroundColor,
    ).toBe(color["editor/selection"]);
    expect(EDITOR_THEME_SPEC[".cm-activeLine"].backgroundColor).toBe(color["editor/active-line"]);
    expect(EDITOR_THEME_SPEC[".cm-activeLineGutter"].backgroundColor).toBe(
      color["editor/active-line"],
    );
    expect(EDITOR_THEME_SPEC[".cm-activeLineGutter"].color).toBe(
      color["editor/line-number-active"],
    );
  });

  it("gives the gutter a legible colour, which is what P8 was about", () => {
    // The viewer's gutter was `text/disabled` — 2,96:1 over the well, under
    // even the minimum for a graphical object. A line number is the address
    // read out loud and the one a failing test points at, and squinting at it
    // is not a thing anyone should do.
    expect(EDITOR_THEME_SPEC[".cm-gutters"].color).toBe(color["editor/line-number"]);
    expect(EDITOR_THEME_SPEC[".cm-gutters"].color).not.toBe(color["text/disabled"]);
  });

  it("paints the code over the same well as the terminal", () => {
    expect(EDITOR_THEME_SPEC["&"].backgroundColor).toBe(color["bg/inset"]);
    expect(EDITOR_THEME_SPEC["&"].color).toBe(color["text/code"]);
    expect(EDITOR_THEME_SPEC[".cm-gutters"].backgroundColor).toBe(color["bg/inset"]);
  });

  it("hangs the continuation of a wrapped line under the code it continues", () => {
    // D3.1 leaves wrapping on, and CodeMirror puts the continuation at column
    // 0, where it reads as a line of its own. The negative indent has to match
    // the padding or the first line moves instead of the continuation.
    const line = EDITOR_THEME_SPEC[".cm-line"];
    expect(line.padding).toBe("0 12px");
    expect(line.textIndent).toBe("-12px");
  });

  it("declares no colour of its own", () => {
    // Every colour has to be traceable to a generated token. A literal here is
    // a colour that stops moving when the brand does.
    const fromTokens = new Set<string>([
      ...Object.values(color),
      ...Object.values(primitives).flatMap((ramp) => Object.values(ramp)),
    ]);

    const literals = JSON.stringify(EDITOR_THEME_SPEC).match(/#[0-9a-fA-F]{3,8}/g) ?? [];

    expect(literals.length).toBeGreaterThan(0);
    for (const literal of literals) expect(fromTokens).toContain(literal);
  });
});

let handles: EditorHandle[] = [];

afterEach(() => {
  for (const handle of handles) handle.destroy();
  handles = [];
});

function mount(doc: string): EditorHandle {
  const parent = document.createElement("div");
  document.body.append(parent);
  const handle = mountEditor(parent, { doc, readOnly: false, wrap: true });
  handles.push(handle);
  return handle;
}

/**
 * A7/Q6: the bytes that came in are the bytes that go out.
 *
 * `EditorState.create` splits on `/\r\n?|\n/` and joins on `state.lineBreak`,
 * which is `"\n"`, so a CRLF file loses its CRs on the way in and `doc.toString()`
 * stops being what `files.read` answered. Q6 names the editor as the place that
 * converts on the way in and converts back on the way out, and this is the way
 * out — the string the E9 hands to `files.write`.
 */
describe("os bytes que entraram são os bytes que saem", () => {
  it("gives a CRLF file back with its CRLF", () => {
    expect(mount("um\r\ndois\r\n").getDoc()).toBe("um\r\ndois\r\n");
  });

  it("never hands a CR to a file that had none", () => {
    expect(mount("um\ndois\n").getDoc()).toBe("um\ndois\n");
  });

  it("leaves a file with no final break without one", () => {
    // The other half of Q6: a file that gains a trailing "\n" is the same trap,
    // one line smaller.
    expect(mount("um\r\ndois").getDoc()).toBe("um\r\ndois");
    expect(mount("um\ndois").getDoc()).toBe("um\ndois");
  });

  it("keeps the CRLF of the lines nobody touched when one line is typed", () => {
    const handle = mount("um\r\ndois\r\ntres\r\n");

    handle.view.dispatch({ changes: { from: handle.view.state.doc.line(2).to, insert: "!" } });

    // Without the conversion this would come back all-LF: the first save would
    // rewrite every line of the file, which is the noisy diff Q6 refuses.
    expect(handle.getDoc()).toBe("um\r\ndois!\r\ntres\r\n");
  });

  it("sends a mixed file out whole in the ending most of it had", () => {
    // The decision, said out loud: a file with mixed endings leaves in the
    // majority one, so its minority breaks *do* change. Keeping each break
    // where it was would mean carrying it through edits that split, join and
    // move lines, which the document model does not do. Ties go to LF.
    expect(mount("a\r\nb\r\nc\nd\r\n").getDoc()).toBe("a\r\nb\r\nc\r\nd\r\n");
    expect(mount("a\nb\nc\r\nd\n").getDoc()).toBe("a\nb\nc\nd\n");
    expect(mount("a\r\nb\n").getDoc()).toBe("a\nb\n");
  });

  it("leaves the caret alone when the disk comes back byte for byte", () => {
    // The guard in `setDoc` compares against `doc.toString()`, which for a CRLF
    // file never matched: every re-read replaced the whole document — caret
    // back to 0, and a step in the undo history for a file that did not change.
    const handle = mount("um\r\ndois\r\n");
    handle.view.dispatch({ selection: { anchor: 4 } });

    handle.setDoc("um\r\ndois\r\n");

    expect(handle.view.state.selection.main.anchor).toBe(4);
  });

  it("adopts the ending of the file the disk came back with", () => {
    const handle = mount("um\ndois\n");

    handle.setDoc("um\r\ndois\r\ntres\r\n");

    expect(handle.getDoc()).toBe("um\r\ndois\r\ntres\r\n");
  });
});

/**
 * What the E9 hangs off this handle.
 *
 * Autosave lives on two things — knowing the document moved, and reading the
 * buffer — and both existed only through `handle.view`, which this file's own
 * docstring calls the thing nothing in the app should reach past.
 */
describe("o que o autosave vai pendurar aqui", () => {
  it("says when someone typed, with the buffer already readable", () => {
    const handle = mount("um\r\n");
    const changed = vi.fn();
    handle.onChange(changed);

    handle.view.dispatch({ changes: { from: 2, insert: "!" } });

    expect(changed).toHaveBeenCalledTimes(1);
    expect(handle.getDoc()).toBe("um!\r\n");
  });

  it("stays quiet when the disk arrives, because that is not the buffer moving", () => {
    // D4: a clean buffer adopting the disk must not look like typing, or the
    // autosave would write back what it has just read, for ever.
    const handle = mount("um\n");
    const changed = vi.fn();
    handle.onChange(changed);

    handle.setDoc("outro\n");

    expect(handle.view.state.doc.toString()).toBe("outro\n");
    expect(changed).not.toHaveBeenCalled();
  });

  it("never lets undo bring back the file the disk replaced", () => {
    /*
     * P17, and it is the autosave that makes it dangerous.
     *
     * `setDoc` used to be an undoable step, so after "recarregar do disco" a
     * `Cmd+Z` put the *pre-disk* document back — and the autosave then wrote
     * it, undoing the agent's work without anyone asking for that. Undo is for
     * edits someone made here; what an agent wrote is not one of them.
     */
    const handle = mount("um\n");
    handle.view.dispatch({ changes: { from: 2, insert: "!" } });
    expect(handle.view.state.doc.toString()).toBe("um!\n");

    handle.setDoc("do agente\n");
    undo(handle.view);

    expect(handle.view.state.doc.toString()).not.toBe("um!\n");
    expect(handle.getDoc()).toContain("agente");
  });

  it("stops calling a listener that was taken off", () => {
    const handle = mount("um\n");
    const changed = vi.fn();
    handle.onChange(changed);
    handle.onChange(null);

    handle.view.dispatch({ changes: { from: 2, insert: "!" } });

    expect(changed).not.toHaveBeenCalled();
  });
});
