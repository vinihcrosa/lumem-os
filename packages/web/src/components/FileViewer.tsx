import { useEffect, useRef, useState, type ReactNode } from "react";

import { useFileBuffer, type SaveState } from "../hooks/useFileBuffer.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import type { EditorHandle } from "../lib/codemirror-setup.js";
import { languageOf, loadHighlighter, SHIKI_THEME } from "../lib/shiki.js";
import type { ShikiConfig } from "../lib/shiki-codemirror.js";
import { formatSize } from "./FileTree.js";
import { ViewerFrame } from "./ViewerFrame.js";

export interface FileViewerProps {
  scope: Scope;
  path: string;
  /**
   * Whether this tab is the one in front. Required rather than defaulted: every
   * session tab stays mounted, so a viewer that is never told it went behind
   * would keep a buffer nobody can see — and the compiler saying so at the call
   * site is cheaper than finding out by losing text.
   */
  active: boolean;
  onClose(): void;
}

/**
 * Why a file that reads fine opens without a caret, said in the file's own words.
 *
 * Three of the five refusals of F1.4; the other two — binary and too large —
 * have no text to show at all and get the `.refuse` panel instead. All five end
 * up saying the same thing in the footer, because they are the same state:
 * readable, not writable.
 *
 * Typed by the reasons the daemon actually sends, so a sixth one added to
 * `ReadOnlyReason` on the server fails this lookup at build time rather than
 * opening a file with an empty explanation.
 */
type ReadOnlyReason = "inside-git" | "not-writable" | "not-utf8";

const READ_ONLY: Record<ReadOnlyReason, { chip: string; why: ReactNode }> = {
  "inside-git": {
    chip: "dentro de .git",
    why: (
      <>
        está dentro de <code>.git</code>: reescrever aqui destrói a worktree e o que ainda não foi
        commitado.
      </>
    ),
  },
  "not-writable": {
    chip: "sem permissão de escrita",
    why: (
      <>
        o daemon não consegue gravar neste arquivo, e a gravação atômica não serve de atalho para o
        modo que alguém deixou aqui.
      </>
    ),
  },
  "not-utf8": {
    chip: "não é UTF-8",
    why: (
      <>
        os bytes deste arquivo não voltam iguais depois de uma ida e volta em UTF-8, e gravar
        trocaria o que não for representável por outra coisa.
      </>
    ),
  },
};

/**
 * One file in the tab's split, now in a real editor (F1.1, D1).
 *
 * Wrapping is on by default (D3.1): in a 360px column a line of 80 columns
 * simply ends in the void, with not even a scrollbar to say so. Reading half a
 * line is worse than reading a wrapped one.
 */
export function FileViewer({ scope, path, active, onClose }: FileViewerProps) {
  const [wrap, setWrap] = useState(true);
  const buffer = useFileBuffer({ scope, path, active });
  const content = buffer.content;

  const language = languageOf(path);
  const data = content.data;
  const refusal =
    data === undefined
      ? null
      : data.kind === "binary"
        ? "binário"
        : data.kind === "too-large"
          ? "acima do teto"
          : data.readOnly === null
            ? null
            : READ_ONLY[data.readOnly].chip;

  // A reason from the daemon is long and it takes the width the byte count was
  // using: on a failure, how many KB the file has is the least useful thing on
  // the screen.
  const wide =
    refusal === null && (buffer.state.kind === "failed" || buffer.state.kind === "stale");

  return (
    <ViewerFrame
      path={path}
      onClose={onClose}
      wrap={wrap}
      onToggleWrap={() => setWrap((current) => !current)}
      footLeft={
        refusal === null ? (
          <SaveFoot state={buffer.state} onRetry={buffer.retry} />
        ) : (
          <span className="save save--readonly">
            {/* A text glyph, never an emoji: a 🔒 ignores `color` and comes
                back in the system font's own, the one element on the screen
                that would not obey the tokens. */}
            <span className="save__mark" aria-hidden="true">
              ⊘
            </span>
            somente leitura · {refusal}
          </span>
        )
      }
      footRight={
        wide || data === undefined
          ? undefined
          : data.kind === "text"
            ? `${formatSize(data.bytes)} · ${data.lines} linhas · ${language ?? "texto"}`
            : formatSize(data.bytes)
      }
    >
      {renderBody()}
    </ViewerFrame>
  );

  function renderBody() {
    if (content.isPending) return <div className="code">carregando…</div>;
    if (content.isError) {
      return (
        <div className="refuse" role="alert">
          <span className="refuse__glyph" aria-hidden="true">
            ⚠
          </span>
          <span className="refuse__title">não deu para abrir</span>
          <span className="refuse__why">{content.error.message}</span>
        </div>
      );
    }

    if (content.data.kind === "binary") {
      return (
        <div className="refuse">
          <span className="refuse__glyph" aria-hidden="true">
            ▦
          </span>
          <span className="refuse__title">arquivo binário</span>
          <span className="refuse__why">
            tem bytes nulos nos primeiros KiB — o split não tenta desenhá-lo como texto, e não há
            buffer para editar.
          </span>
          <span className="refuse__why">
            <code>{path}</code>
          </span>
        </div>
      );
    }

    if (content.data.kind === "too-large") {
      return (
        <div className="refuse">
          <span className="refuse__glyph" aria-hidden="true">
            ▤
          </span>
          <span className="refuse__title">
            {formatSize(content.data.bytes)} passa do teto de {formatSize(content.data.limit)}
          </span>
          <span className="refuse__why">
            o daemon não leu o arquivo — sem leitura não há revisão, e sem revisão não haveria
            contra o que gravar.
          </span>
          <span className="refuse__why">
            <code>{path}</code>
          </span>
        </div>
      );
    }

    const readOnly = content.data.readOnly;

    return (
      <>
        {readOnly !== null && (
          <div className="robar">
            <span className="robar__glyph" aria-hidden="true">
              ⊘
            </span>
            <span>{READ_ONLY[readOnly].why}</span>
          </div>
        )}
        <Editor
          path={path}
          text={content.data.text}
          language={language}
          readOnly={readOnly !== null}
          wrap={wrap}
          onReady={buffer.attach}
        />
      </>
    );
  }
}

/**
 * The four states of autosave, in the corner of the file they belong to.
 *
 * With no save button and no dirty state that outlives the debounce, this row
 * is everything the autosave says about itself. There is deliberately no
 * "unsaved": that state lasts 800 ms and then stops being true.
 */
function SaveFoot({ state, onRetry }: { state: SaveState; onRetry(): void }) {
  if (state.kind === "clean") return null;
  if (state.kind === "saving") return <Mark tone="saving">salvando…</Mark>;
  if (state.kind === "saved") return <SavedAgo at={state.at} />;

  if (state.kind === "failed") {
    return (
      <>
        <Mark tone="failed">não deu para salvar</Mark>
        {/* Verbatim, as PRD §8 requires of anything a tool said. */}
        <span className="save__why" title={state.why}>
          {state.why}
        </span>
        <button type="button" className="save__act" onClick={onRetry}>
          tentar de novo
        </button>
      </>
    );
  }

  return (
    <>
      <Mark tone="stale">mudou no disco</Mark>
      <span className="save__why">o autosave parou até você escolher</span>
    </>
  );
}

function Mark({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={`save save--${tone}`}>
      <span className="save__dot" aria-hidden="true" />
      {children}
    </span>
  );
}

/**
 * "salvo há Ns", and it counts.
 *
 * The number is the whole point of the state — it is what tells written from
 * being written — so it cannot be frozen at the instant the write landed. One
 * timer per open file, alive only while this state is on screen.
 */
function SavedAgo({ at }: { at: number }) {
  const [now, setNow] = useState(at);

  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [at]);

  const seconds = Math.max(0, Math.round((now - at) / 1_000));
  return <Mark tone="saved">salvo há {seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min`}</Mark>;
}

interface EditorProps {
  path: string;
  text: string;
  language: string | null;
  readOnly: boolean;
  wrap: boolean;
  /** The buffer takes it from here — and gets it back as null before it goes. */
  onReady(handle: EditorHandle | null): void;
}

/**
 * The CodeMirror instance, and the only thing in the client that loads it.
 *
 * The import is dynamic so the ~137 KB gzip of the editor never reach whoever
 * does not open a file — same treatment shiki already gets here, and the same
 * reason: the daemon serves this bundle itself, with no CDN in front.
 *
 * What is *in* the document is not decided here any more: `useFileBuffer` owns
 * that, because whether the disk may land on screen depends on whether there is
 * typing to lose (D4), and this component has no way to know.
 */
function Editor({ path, text, language, readOnly, wrap, onReady }: EditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<EditorHandle | null>(null);
  const highlight = useRef<ShikiConfig | null>(null);
  // The editor is built asynchronously, so the document and the wrap flag are
  // read from here rather than from the closure the mount effect captured.
  const latest = useRef({ text, wrap });

  // Kept for the next mount, and only for it: pushing it into a live editor is
  // the buffer's call, never this one's.
  useEffect(() => {
    latest.current.text = text;
  }, [text]);

  useEffect(() => {
    latest.current.wrap = wrap;
    handle.current?.setWrap(wrap);
  }, [wrap]);

  useEffect(() => {
    const parent = host.current;
    if (parent === null) return;

    let live = true;
    void import("../lib/codemirror-setup.js").then(({ mountEditor }) => {
      if (!live) return;
      handle.current = mountEditor(parent, {
        doc: latest.current.text,
        wrap: latest.current.wrap,
        readOnly,
      });
      // The grammar may well have arrived first: whoever loses the race is the
      // one that applies the result.
      handle.current.setHighlight(highlight.current);
      onReady(handle.current);
    });

    return () => {
      live = false;
      // Handed back *before* the view is destroyed: this is where the buffer
      // gets its last read of what was typed, and a destroyed editor is not a
      // place to be reading anything from.
      onReady(null);
      handle.current?.destroy();
      handle.current = null;
    };
    // A different file is a different editor: the undo history of the last one
    // must not reach across, and read-only is fixed for as long as one is open.
  }, [path, readOnly, onReady]);

  useEffect(() => {
    highlight.current = null;
    handle.current?.setHighlight(null);
    if (language === null) return;

    let live = true;
    // The file is readable as plain mono first and gains colour a tick later —
    // never the other way round.
    void loadHighlighter(language).then((highlighter) => {
      if (!live || highlighter === null) return;
      highlight.current = { highlighter, language, theme: SHIKI_THEME };
      handle.current?.setHighlight(highlight.current);
    });

    return () => {
      live = false;
    };
  }, [language]);

  return <div className="cmhost" ref={host} data-testid="editor" />;
}
