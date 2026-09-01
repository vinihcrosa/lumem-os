export interface TopbarProps {
  /** Null while the first health check is still in flight. */
  version: string | null;
  unreachable: boolean;
}

/**
 * The one strip that renders no matter what else went wrong.
 *
 * That is why the daemon's state lives here and nowhere else: every other part
 * of the screen is downstream of a working connection, so a failure has to
 * surface in the one place that survives it.
 *
 * And it is why nothing scoped lives here: a control for something that only
 * exists inside a checkout says, by being here, that it belongs to the product.
 */
export function Topbar({ version, unreachable }: TopbarProps) {
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
      {/* The files toggle used to live here, and it was the one control in this
          strip that did not apply to the whole screen: the column belongs to a
          checkout, and the button vanished when no checkout was selected, which
          was the tell. It moved to the checkout's own tab strip. */}
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
