import { PHASE_LABEL, type CloneJobView } from "../hooks/useCloneJob.js";
import { Button, Glyph } from "../ui/index.js";

export interface CloneProgressProps {
  job: CloneJobView;
}

/**
 * A clone in flight, drawn where the dialog that started it can hold it.
 *
 * It used to live in the sidebar footer, and it used to fetch: it opened the
 * stream, owned the cancel mutation and decided when to disappear. Q5 moved the
 * host into `AddProjectDialog` — the modal no longer closes when the clone
 * starts — and this became what it should have been all along: two pieces that
 * draw a job somebody else is holding.
 *
 * What Q5 costs is written where it was decided, and it is real: the screen is
 * held for minutes. What it buys is one host. The progress, the cancelling and
 * both ways of ending are in the same place the person pressed `clonar`.
 */
export function CloneProgress({ job }: CloneProgressProps) {
  const percent = job.percent;
  const phase = job.phase === null ? null : (PHASE_LABEL[job.phase] ?? job.phase);

  return (
    <div className="modal__work" data-state={job.state} aria-label={`clonando ${job.name}`}>
      <div className="modal__work-top">
        <Glyph tone="project">■</Glyph>
        <span className="modal__work-name">{job.name}</span>
        {percent !== null && <span className="modal__work-pct">{percent}%</span>}
      </div>

      <div className={percent === null ? "bar bar--unknown" : "bar"}>
        <div className="bar__fill" style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>

      {/* The phase in git's own words. It is what says the thing is still alive
          when the percentage does not move — a large repository spends minutes
          in `resolvendo deltas` with the bar standing still. */}
      <p className="modal__work-phase">
        {job.state === "registering" ? "registrando" : (phase ?? "conectando")}
      </p>
    </div>
  );
}

/**
 * How it ended, and what to do about it.
 *
 * It stays until it is dismissed. Disappearing on its own is the same thing as
 * not having happened, and the two endings a person most needs to read are the
 * two they are least likely to be watching for.
 *
 * Since Q5 it is drawn in the body of the dialog rather than in the sidebar,
 * which is why the failure does not close it: the way back — `tentar por ssh` —
 * is one click from where the person is already looking, with the URL still in
 * the field behind it.
 */
/**
 * Whether the ending is worth stopping for.
 *
 * A clone that simply worked says so by the project appearing; only a decision
 * taken on the user's behalf — F6.4 suffixing a name that was already taken —
 * needs a word. Exported because `AddProjectDialog` has to know the same thing
 * *before* rendering: since Q5 it closes on success, and closing over an
 * unread sentence is the same as never having written it.
 */
export function outcomeSpeaks(job: CloneJobView): boolean {
  if (job.state === "cancelled") return false;
  if (job.state !== "done") return true;
  return job.message !== null && job.message.includes("registrado como");
}

export function CloneOutcome({
  job,
  onDismiss,
  onRetry,
}: {
  job: CloneJobView;
  onDismiss: () => void;
  onRetry?: (source: string) => void;
}) {
  if (job.state === "done") {
    // Only worth a word when something was decided on the user's behalf — the
    // suffix of F6.4. Otherwise the project simply appears, which says it.
    if (job.message === null || !job.message.includes("registrado como")) return null;
    return (
      <div className="clone-outcome clone-outcome--done" role="status">
        <p className="clone-outcome__body">{job.message}</p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          entendi
        </Button>
      </div>
    );
  }

  const ssh = job.failure === "auth" ? sshFormOf(job.url) : null;

  return (
    <div className="clone-outcome clone-outcome--failed" role="alert">
      <p className="clone-outcome__title">
        {job.failure === "auth" ? `não consegui autenticar em ${hostOf(job.url)}` : `não deu para clonar ${job.name}`}
      </p>

      {job.failure === "auth" && (
        // F6.10. Not a generic failure with git's stderr passed through: the
        // decision not to store a token would be a dead end for anyone cloning
        // a private repository over https without this.
        <>
          <p className="clone-outcome__body">
            O Lumem usa as credenciais que já estão na sua máquina — ele não guarda token nenhum.
            Duas saídas:
          </p>
          <ul className="clone-outcome__ways">
            <li>usar a URL ssh do mesmo repositório, com a chave no ssh-agent;</li>
            <li>configurar um credential.helper para https.</li>
          </ul>
        </>
      )}

      {job.message !== null && (
        // Text the remote server chose. Rendered as text, never as markup.
        <code className="clone-outcome__git">{job.message}</code>
      )}

      <div className="clone-outcome__actions">
        {ssh !== null && onRetry !== undefined && (
          <Button variant="primary" size="sm" onClick={() => onRetry(ssh)}>
            tentar por ssh
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          dispensar
        </Button>
      </div>

      {ssh !== null && <p className="clone-outcome__path">{ssh}</p>}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * The ssh spelling of an https address, mirrored from the server's `toSshForm`.
 *
 * Duplicated deliberately and narrowly: the button has to be drawn before any
 * request is made, and asking the daemon for a string it already sent would be
 * a round trip to render a label. The server still refuses anything this gets
 * wrong, so the worst case is a suggestion that does not parse.
 */
function sshFormOf(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const path = parsed.pathname.replace(/^\/+/, "");
  if (path === "") return null;
  // The scp shorthand cannot carry a port, so a non-default one is spelled long.
  if (parsed.port !== "") return `ssh://git@${parsed.hostname}:${parsed.port}/${path}`;
  return `git@${parsed.hostname}:${path}`;
}
