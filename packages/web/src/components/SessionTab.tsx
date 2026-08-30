import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";

import type { Scope } from "../hooks/useSessionsByScope.js";
import type { SessionTab as SessionTabModel } from "../hooks/useWorktreeTabs.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Chip, Glyph } from "../ui/index.js";
import { Conversation } from "./Conversation.js";
import { TabSplit } from "./TabSplit.js";
import { Terminal } from "./Terminal.js";

import "./terminal.css";

export interface SessionTabPanelProps {
  tab: SessionTabModel;
  /** Where a session started from here would run. */
  scope: Scope;
  cwd: string;
  /** False while another tab is open. The terminal stays mounted regardless. */
  active: boolean;
  /** A file or a patch being read beside this session, or null (D3.2). */
  viewer?: ReactNode | null;
  /**
   * Offers to continue a finished conversation (F5.2).
   *
   * Passed down rather than called here: resuming creates a *new* session, and the tab
   * strip is what can switch to it.
   */
  onResume?: () => void;
  /** True while this session's resume is in flight. */
  resuming?: boolean;
  /** A fresh session was started from this record — open its tab. */
  onStarted: (sessionId: string) => void;
  /** O pedido que abriu esta conversa, quando ela nasceu de um gesto do produto. */
  initialPrompt?: string | undefined;
}

/**
 * One session's terminal, inside its tab.
 *
 * Hidden rather than unmounted when another tab is open. Unmounting would close
 * the socket and dispose the renderer — the session would survive on the daemon,
 * but every switch would cost a reconnect and a full repaint, and the scrollback
 * the user had scrolled to would be gone. F5.6 and F5.7 asked for this between
 * screens; between tabs it is the same promise, made far more often.
 *
 * A PTY tab whose session has exited is not a terminal at all: it is the record
 * of one, and D5 says it has to look like it. A conversation carries its own
 * finished state and its own way back (resume), so the record treatment is a
 * PTY concern only.
 */
export function SessionTabPanel({
  tab,
  scope,
  cwd,
  active,
  viewer = null,
  onResume,
  resuming = false,
  onStarted,
  initialPrompt,
}: SessionTabPanelProps) {
  const agent = tab.kind === "agent";
  const conversation = tab.transport === "acp";
  const record = !conversation && tab.state !== "running";

  return (
    <div
      // `pane--conv` drops the padding: the conversation is a full-bleed surface
      // with its own head, foot and composer, not a card inside a padded pane.
      className={`pane ${conversation ? "pane--conv" : "pane--term"}`}
      role="tabpanel"
      hidden={!active}
      aria-label={record ? `registro de ${tab.label}` : `sessão ${tab.label}`}
    >
      <TabSplit viewer={viewer}>
        {/*
          The conversation carries its own head — agent, session, model, mode and
          the interrupt button — so the terminal's would be a second header saying
          less. A PTY tab keeps the one it had.
        */}
        {!conversation && (
          <div className="term-head">
            <Glyph tone={agent ? "agent" : "shell"}>{agent ? "◆" : "●"}</Glyph>
            <span className="term-head__cmd" title={`${tab.command} · cwd ${cwd}`}>
              {tab.command} <span className="dim">· cwd {cwd}</span>
            </span>
            {record ? (
              <>
                <Chip tone="neutral">registro</Chip>
                <Chip tone={tab.exitCode === 0 ? "exited" : "failed"} dot>
                  exited ({tab.exitCode ?? "?"})
                </Chip>
              </>
            ) : (
              <Chip tone="running" dot>
                running
              </Chip>
            )}
          </div>
        )}

        {record && <RecordNotice tab={tab} scope={scope} onStarted={onStarted} />}

        {/*
          The one line that changes what the user sees. Keyed on the row's own
          transport, so a shell can never reach the conversation renderer and a
          PTY agent keeps exactly the terminal it had.
        */}
        {conversation ? (
          <Conversation
            key={tab.sessionId}
            sessionId={tab.sessionId}
            // A finished conversation opens in read mode: the transcript comes off the
            // daemon's disk and no adapter is launched (D13).
            live={tab.state === "running"}
            {...(onResume ? { onResume } : {})}
            resuming={resuming}
            initialPrompt={initialPrompt}
          />
        ) : (
          <Terminal key={tab.sessionId} sessionId={tab.sessionId} readOnly={record} />
        )}
      </TabSplit>
    </div>
  );
}

interface RecordNoticeProps {
  tab: SessionTabModel;
  scope: Scope;
  onStarted: (sessionId: string) => void;
}

/**
 * What the buffer of a dead session is, said out loud — issue #14.
 *
 * The chip alone was not enough: the tab looked like every other one, the
 * cursor blinked, and typing failed in silence. This is the sentence that was
 * missing, and beside it the only way forward the daemon actually has — a new
 * session with the same command, in the same place. Resuming the dead process
 * is not on offer, so it is not implied.
 */
function RecordNotice({ tab, scope, onStarted }: RecordNoticeProps) {
  const queryClient = useQueryClient();

  const start = useMutation({
    mutationFn: () =>
      tab.agentConfigId === null
        ? trpc.session.createShell.mutate(scope)
        : trpc.session.createAgent.mutate({ ...scope, agentConfigId: tab.agentConfigId }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({
        queryKey: sessionsKey(scope.scopeType, scope.scopeId),
      });
      onStarted(created.id);
    },
  });

  return (
    <div className="term-note">
      <Banner
        tone="info"
        actions={
          <Button
            size="sm"
            variant="default"
            disabled={start.isPending}
            onClick={() => start.mutate()}
          >
            nova sessão igual
          </Button>
        }
      >
        Esta sessão encerrou. O que está abaixo é o registro do que ela imprimiu,
        somente leitura — o processo não existe mais e não há o que digitar.
      </Banner>

      {start.isError && <Banner tone="danger">{start.error.message}</Banner>}
    </div>
  );
}
