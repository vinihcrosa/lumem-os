import { useState } from "react";

import { usePopover } from "../hooks/usePopover.js";
import { useErrorLog } from "../hooks/useErrorLog.js";
import {
  clearErrors,
  dismissError,
  formatError,
  formatErrorLog,
  kindLabel,
  type ErrorEntry,
} from "../lib/errorLog.js";
import { Button, Chip } from "../ui/index.js";

import "./error-log.css";

/**
 * Everything that went wrong, kept where it can be read and copied (F: the log).
 *
 * Lives in the topbar because the topbar is the one strip that renders no matter
 * what else broke — an error log that vanished with the screen that failed would
 * be the exact opposite of the point. It shows nothing until there is something
 * to show: no errors, no clutter.
 */
export function ErrorLog() {
  const entries = useErrorLog();
  const popover = usePopover();

  if (entries.length === 0) return null;

  return (
    <div className="errlog">
      <button
        type="button"
        ref={popover.triggerRef}
        className="errlog__trigger"
        aria-haspopup="dialog"
        aria-expanded={popover.open}
        aria-label={`registro de erros (${entries.length})`}
        onClick={popover.toggle}
      >
        <span aria-hidden="true">⚠</span> erros
        <span className="errlog__count">{entries.length}</span>
      </button>

      {popover.open && (
        <div className="errlog__panel" ref={popover.panelRef} role="dialog" aria-label="registro de erros">
          <div className="errlog__head">
            <span className="errlog__title">Erros ({entries.length})</span>
            <span className="errlog__spacer" />
            <CopyButton text={formatErrorLog([...entries])} label="copiar tudo" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                clearErrors();
                popover.close();
              }}
            >
              limpar
            </Button>
          </div>

          <ul className="errlog__list">
            {entries.map((entry) => (
              <ErrorRow key={entry.id} entry={entry} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ErrorRow({ entry }: { entry: ErrorEntry }) {
  return (
    <li className="errlog__item">
      <div className="errlog__meta">
        <Chip tone="failed">{kindLabel(entry.kind)}</Chip>
        <code className="errlog__label">{entry.label}</code>
        {entry.count > 1 && <span className="errlog__times">×{entry.count}</span>}
        <span className="errlog__spacer" />
        <time className="errlog__at">{new Date(entry.at).toLocaleTimeString()}</time>
      </div>
      <p className="errlog__msg">{entry.message}</p>
      {entry.detail !== null && <pre className="errlog__detail">{entry.detail}</pre>}
      <div className="errlog__actions">
        <CopyButton text={formatError(entry)} label="copiar" />
        <Button size="sm" variant="ghost" onClick={() => dismissError(entry.id)}>
          descartar
        </Button>
      </div>
    </li>
  );
}

/**
 * Copies text to the clipboard and says it did — the whole reason the log exists
 * is to get an error out of the browser and into a bug report.
 */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const clipboard = navigator.clipboard;
  if (clipboard === undefined) return null;

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        void clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false),
        );
      }}
    >
      {copied ? "copiado" : label}
    </Button>
  );
}
