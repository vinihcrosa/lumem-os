import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  PHASE_LABEL,
  isTerminal,
  useCloneStream,
  type CloneJobView,
} from "../hooks/useCloneJob.js";
import { cloneJobsKey, projectsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, Glyph } from "../ui/index.js";

export interface CloneStatusProps {
  workspaceId: string;
  /** Prefills the dialog again — the way out of an authentication failure. */
  onRetry?: (source: string) => void;
}

/**
 * O clone, onde o projeto vai nascer.
 *
 * Dentro da **árvore** e não num modal: um clone leva minutos, e um modal
 * seguraria a tela inteira por eles. O diálogo fecha assim que o clone começa;
 * fechar não cancela nada, e recarregar a página não perde nada.
 *
 * A linha em andamento tem a geometria de uma linha de projeto — mesmo glifo,
 * mesma indentação, mesmo slot de 24px à direita — porque é um projeto
 * chegando. O que muda é que o slot carrega `✕`: enquanto clona, a ação que a
 * linha oferece é cancelar, não acrescentar.
 */
export function CloneStatus({ workspaceId, onRetry }: CloneStatusProps) {
  const queryClient = useQueryClient();
  const job = useCloneStream(workspaceId);
  const [dismissed, setDismissed] = useState<string | null>(null);

  const cancel = useMutation({
    mutationFn: (jobId: string) => trpc.project.cloneCancel.mutate({ jobId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: cloneJobsKey(workspaceId) }),
  });

  if (job === null || job.id === dismissed) return null;

  if (job.state === "cancelled") return null;

  if (isTerminal(job.state)) {
    return (
      <Outcome
        job={job}
        onDismiss={async () => {
          setDismissed(job.id);
          await queryClient.invalidateQueries({ queryKey: projectsKey(workspaceId) });
        }}
        {...(onRetry === undefined ? {} : { onRetry })}
      />
    );
  }

  const percent = job.percent;
  const phase = job.phase === null ? null : (PHASE_LABEL[job.phase] ?? job.phase);

  return (
    <div className="clone-row" data-state={job.state} aria-label={`clonando ${job.name}`}>
      <div className="clone-row__top">
        {/* O lugar da seta de expandir, vazio: é o que alinha esta linha com as
            linhas de projeto que ela vai virar. */}
        <span className="clone-row__twist" aria-hidden="true" />
        <Glyph tone="project">■</Glyph>
        <span className="clone-row__name">{job.name}</span>
        {percent !== null && <span className="clone-row__pct">{percent}%</span>}
        {/* F6.6: só enquanto ainda está baixando. Depois disso o repositório
            está no disco e o que falta é uma linha no SQLite, então o botão sai
            em vez de mentir — e o espaço dele fica, como em qualquer linha. */}
        {job.state === "cloning" ? (
          <button
            type="button"
            className="clone-row__cancel"
            aria-label={`cancelar o clone de ${job.name}`}
            onClick={() => cancel.mutate(job.id)}
          >
            <span aria-hidden="true">✕</span>
          </button>
        ) : (
          <span className="row__slot" aria-hidden="true" />
        )}
      </div>

      <div className={percent === null ? "bar bar--unknown" : "bar"}>
        <div className="bar__fill" style={percent === null ? undefined : { width: `${percent}%` }} />
      </div>

      <p className="clone-row__phase">
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
 */
function Outcome({
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
