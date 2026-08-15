export interface TopbarProps {
  /** Null while the first health check is still in flight. */
  version: string | null;
  unreachable: boolean;
  /** Absent before a checkout is selected, when there is nothing to show. */
  filesPanel?: { open: boolean; toggle(): void };
}

/**
 * The one strip that renders no matter what else went wrong.
 *
 * That is why the daemon's state lives here and nowhere else: every other part
 * of the screen is downstream of a working connection, so a failure has to
 * surface in the one place that survives it.
 */
export function Topbar({ version, unreachable, filesPanel }: TopbarProps) {
  return (
    <header className="topbar">
      {/* The `h1` is the product, not the current selection: the selection has
          its own heading in the detail pane, and two `h1`s would leave a
          screen reader without an outline. */}
      <h1 className="wordmark">
        <span className="wordmark__dot" aria-hidden="true" />
        Lumem-OS
      </h1>
      <span className="topbar__spacer" />
      {/* The toggle lives here rather than in the panel because when the panel
          is closed there is nothing left on screen to hang it on. */}
      {filesPanel !== undefined && (
        <button
          type="button"
          className={`rp-toggle${filesPanel.open ? " rp-toggle--on" : ""}`}
          aria-pressed={filesPanel.open}
          onClick={filesPanel.toggle}
        >
          <span aria-hidden="true">▤</span> arquivos
        </button>
      )}
      {unreachable ? (
        <span className="daemon daemon--off" role="alert">
          <span className="daemon__dot" aria-hidden="true" />
          daemon inacessível
        </span>
      ) : (
        version !== null && (
          <span className="daemon">
            <span className="daemon__dot" aria-hidden="true" />
            daemon v{version}
          </span>
        )
      )}
    </header>
  );
}
