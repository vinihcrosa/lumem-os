import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import type { EditorHandle } from "../lib/codemirror-setup.js";
import { fileReadKey } from "../lib/queryKeys.js";
import { languageOf, loadHighlighter, SHIKI_THEME } from "../lib/shiki.js";
import type { ShikiConfig } from "../lib/shiki-codemirror.js";
import { trpc } from "../lib/trpc.js";
import { formatSize } from "./FileTree.js";
import { ViewerFrame } from "./ViewerFrame.js";

export interface FileViewerProps {
  scope: Scope;
  path: string;
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
export function FileViewer({ scope, path, onClose }: FileViewerProps) {
  const [wrap, setWrap] = useState(true);
  const content = useQuery({
    queryKey: fileReadKey(scope.scopeType, scope.scopeId, path),
    queryFn: () =>
      trpc.files.read.query({ scopeType: scope.scopeType, scopeId: scope.scopeId, path }),
    refetchOnWindowFocus: true,
  });

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

  return (
    <ViewerFrame
      path={path}
      onClose={onClose}
      wrap={wrap}
      onToggleWrap={() => setWrap((current) => !current)}
      footLeft={
        refusal === null ? undefined : (
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
        data?.kind === "text"
          ? `${formatSize(data.bytes)} · ${data.lines} linhas · ${language ?? "texto"}`
          : data === undefined
            ? undefined
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
        />
      </>
    );
  }
}

interface EditorProps {
  path: string;
  text: string;
  language: string | null;
  readOnly: boolean;
  wrap: boolean;
}

/**
 * The CodeMirror instance, and the only thing in the client that loads it.
 *
 * The import is dynamic so the ~137 KB gzip of the editor never reach whoever
 * does not open a file — same treatment shiki already gets here, and the same
 * reason: the daemon serves this bundle itself, with no CDN in front.
 */
function Editor({ path, text, language, readOnly, wrap }: EditorProps) {
  const host = useRef<HTMLDivElement | null>(null);
  const handle = useRef<EditorHandle | null>(null);
  const highlight = useRef<ShikiConfig | null>(null);
  // The editor is built asynchronously, so the document and the wrap flag are
  // read from here rather than from the closure the mount effect captured.
  const latest = useRef({ text, wrap });

  // Two effects and not one: they change for different reasons. Together, a
  // re-read of the file reconfigured wrapping and a click on `⇄` re-dispatched
  // the document — and re-dispatching the document is the expensive one, since
  // it is a whole-buffer replace that lands in the undo history.
  useEffect(() => {
    latest.current.text = text;
    handle.current?.setDoc(text);
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
    });

    return () => {
      live = false;
      handle.current?.destroy();
      handle.current = null;
    };
    // A different file is a different editor: the undo history of the last one
    // must not reach across, and read-only is fixed for as long as one is open.
  }, [path, readOnly]);

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
