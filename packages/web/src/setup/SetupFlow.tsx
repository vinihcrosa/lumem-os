import { useCallback, useEffect, useMemo, useState } from "react";

import { Steps } from "../ui/index.js";
import { AgentStep } from "./AgentStep.js";
import { Done } from "./Done.js";
import { HandshakeStep } from "./HandshakeStep.js";
import { MachineStep } from "./MachineStep.js";
import { ProjectStep } from "./ProjectStep.js";
import { STEP_LABELS, stepOf, type Position } from "./steps.js";
import { TaskStep } from "./TaskStep.js";
import { Welcome } from "./Welcome.js";
import { WorkspaceStep } from "./WorkspaceStep.js";

import "./setup.css";

/**
 * What the flow produced, handed to the app so it can open it.
 *
 * Every field is optional because every step but the workspace can be skipped,
 * and the receipt has to be able to say "pulado" instead of inventing a value.
 */
export interface SetupResult {
  workspaceId?: string;
  projectId?: string;
  worktreeId?: string;
  /** The ACP configuration the handshake pinned. */
  agentConfigId?: string;
  agentName?: string;
  adapterVersion?: string;
  workspaceName?: string;
  projectPath?: string;
  worktreeName?: string;
  sessionOpened?: boolean;
  /** The session the task step opened, so the app can bring its tab to the front. */
  sessionId?: string;
}

export interface SetupFlowProps {
  /** Version and address of the daemon, for the welcome screen. */
  daemonVersion: string | null;
  daemonUnreachable: boolean;
  /** Leave the flow and open what it created. */
  onFinish: (result: SetupResult) => void;
}

const ORDER: readonly Position[] = [
  "welcome",
  "machine",
  "agent",
  "handshake",
  "workspace",
  "project",
  "task",
  "done",
];

/**
 * Primeiro acesso: nine positions, five steps, no state of its own on disk.
 *
 * The flow writes nothing that is only about the flow — no `onboarded` flag, no
 * `settings` row (D2). Everything it produces is daemon data: a workspace, an
 * agent configuration, a project, a worktree, a session. "Has this machine been
 * set up?" is answered by those existing, which is also the only answer that
 * cannot go stale.
 */
export function SetupFlow({ daemonVersion, daemonUnreachable, onFinish }: SetupFlowProps) {
  const [position, setPosition] = useState<Position>("welcome");
  const [result, setResult] = useState<SetupResult>({});
  const [skipped, setSkipped] = useState<readonly Position[]>([]);

  const index = ORDER.indexOf(position);

  const go = useCallback((next: Position) => {
    setPosition(next);
    // The card can be taller than the viewport; arriving at a new step scrolled
    // to the middle of it reads as a broken screen.
    window.scrollTo(0, 0);
  }, []);

  const advance = useCallback(
    (patch?: Partial<SetupResult>) => {
      if (patch !== undefined) setResult((current) => ({ ...current, ...patch }));
      const next = ORDER[index + 1];
      if (next !== undefined) go(next);
    },
    [go, index],
  );

  const back = useCallback(() => {
    const previous = ORDER[index - 1];
    if (previous !== undefined) go(previous);
  }, [go, index]);

  const skip = useCallback(() => {
    setSkipped((current) => (current.includes(position) ? current : [...current, position]));

    /*
     * Skipping the agent skips its proof too.
     *
     * `handshake` is not a step of its own — it is step 2 still happening. Landing
     * on it after "pular este passo" would spawn an adapter to prove a connection
     * the person just said they did not want.
     */
    if (position === "agent") {
      setSkipped((current) => (current.includes("handshake") ? current : [...current, "handshake"]));
      go("workspace");
      return;
    }

    advance();
  }, [advance, go, position]);

  /*
   * `esc` goes back, and it is the only key this component listens for.
   *
   * `⏎` is a form submit inside each step — see `StepShell` for why a listener
   * would be the wrong tool for it. `esc` has no such native meaning here, and
   * nothing else in the flow is dismissable, so one listener cannot collide.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [back]);

  const step = stepOf(position);
  const rail = useMemo(
    () => (step === null ? null : <Steps steps={STEP_LABELS} current={step} />),
    [step],
  );

  return (
    <div className="flow">
      <div className="wizard">
        {rail}
        {renderPosition()}
      </div>
    </div>
  );

  function renderPosition() {
    switch (position) {
      case "welcome":
        return (
          <Welcome
            daemonVersion={daemonVersion}
            daemonUnreachable={daemonUnreachable}
            onStart={() => advance()}
          />
        );
      case "machine":
        return <MachineStep onNext={() => advance()} onBack={back} onSkip={skip} />;
      case "agent":
        return <AgentStep onNext={() => advance()} onBack={back} onSkip={skip} />;
      case "handshake":
        return (
          <HandshakeStep
            onNext={(patch) => advance(patch)}
            onBack={back}
            onSkip={skip}
          />
        );
      case "workspace":
        // No `onSkip`: without a workspace there is no app (F1.4).
        return <WorkspaceStep onNext={(patch) => advance(patch)} onBack={back} />;
      case "project":
        return (
          <ProjectStep
            workspaceId={result.workspaceId}
            onNext={(patch) => advance(patch)}
            onBack={back}
            onSkip={skip}
          />
        );
      case "task":
        return (
          <TaskStep
            projectId={result.projectId}
            agentConfigId={result.agentConfigId}
            onNext={(patch) => advance(patch)}
            onBack={back}
            onSkip={skip}
          />
        );
      case "done":
        return (
          <Done
            result={result}
            skipped={skipped}
            onOpen={() => onFinish(result)}
            onReview={() => go("welcome")}
          />
        );
    }
  }
}
