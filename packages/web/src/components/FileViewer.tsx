import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import { fileReadKey } from "../lib/queryKeys.js";
import { highlight, languageOf } from "../lib/shiki.js";
import { trpc } from "../lib/trpc.js";
import { formatSize } from "./FileTree.js";
import { ViewerFrame } from "./ViewerFrame.js";

export interface FileViewerProps {
  scope: Scope;
  path: string;
  onClose(): void;
}

/**
 * One file, read-only, inside the tab's split (D3.2).
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
  const text = content.data?.kind === "text" ? content.data.text : null;
  const [painted, setPainted] = useState<string[] | null>(null);

  useEffect(() => {
    setPainted(null);
    if (text === null || language === null) return;

    let live = true;
    // The grammar arrives after the text does, so the file is readable as plain
    // mono first and gains colour a tick later — never the other way round.
    void highlight(text, language).then((lines) => {
      if (live) setPainted(lines);
    });
    return () => {
      live = false;
    };
  }, [text, language]);

  return (
    <ViewerFrame
      path={path}
      onClose={onClose}
      wrap={wrap}
      onToggleWrap={() => setWrap((current) => !current)}
      footLeft={
        content.data?.kind === "text"
          ? `${formatSize(content.data.bytes)} · ${content.data.lines} linhas`
          : undefined
      }
      footRight={`${language ?? "texto"} · somente leitura`}
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
            tem bytes nulos nos primeiros KiB — o split não tenta desenhá-lo como texto.
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
            o daemon não leu o arquivo — abrir isto no navegador travaria a aba, e o terminal ao
            lado abre em um comando.
          </span>
          <span className="refuse__why">
            <code>{path}</code>
          </span>
        </div>
      );
    }

    const lines = content.data.text.split("\n");
    // A trailing newline ends the last line; it is not an empty one after it.
    if (lines.at(-1) === "") lines.pop();

    return (
      <div className={`code${wrap ? "" : " code--nowrap"}`}>
        {lines.map((line, index) => (
          <div className="l" key={index}>
            <span className="n">{index + 1}</span>
            {painted === null ? (
              <span className="t">{line}</span>
            ) : (
              <span
                className="t"
                // Shiki's own output: markup this client generated from the
                // file's text, never the file's text taken as markup.
                dangerouslySetInnerHTML={{ __html: painted[index] ?? "" }}
              />
            )}
          </div>
        ))}
      </div>
    );
  }
}
