import type { ReactNode } from "react";

import { Chip, Glyph } from "../ui/index.js";
import type { SessionTab as SessionTabModel } from "../hooks/useWorktreeTabs.js";
import { Conversation } from "./Conversation.js";
import { TabSplit } from "./TabSplit.js";
import { Terminal } from "./Terminal.js";

import "./terminal.css";

export interface SessionTabPanelProps {
  tab: SessionTabModel;
  cwd: string;
  /** False while another tab is open. The terminal stays mounted regardless. */
  active: boolean;
  /** A file or a patch being read beside this session, or null (D3.2). */
  viewer?: ReactNode | null;
}

/**
 * One session's terminal, inside its tab.
 *
 * Hidden rather than unmounted when another tab is open. Unmounting would close
 * the socket and dispose the renderer — the session would survive on the daemon,
 * but every switch would cost a reconnect and a full repaint, and the scrollback
 * the user had scrolled to would be gone. F5.6 and F5.7 asked for this between
 * screens; between tabs it is the same promise, made far more often.
 */
export function SessionTabPanel({
  tab,
  cwd,
  active,
  viewer = null,
}: SessionTabPanelProps) {
  const agent = tab.kind === "agent";
  const conversation = tab.transport === "acp";

  return (
    <div
      // `pane--conv` drops the padding: the conversation is a full-bleed surface
      // with its own head, foot and composer, not a card inside a padded pane.
      className={`pane ${conversation ? "pane--conv" : "pane--term"}`}
      role="tabpanel"
      hidden={!active}
      aria-label={`sessão ${tab.label}`}
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
            <span
              className="term-head__cmd"
              title={`${tab.command} · cwd ${cwd}`}
            >
              {tab.command} <span className="dim">· cwd {cwd}</span>
            </span>
            {tab.state === "running" ? (
              <Chip tone="running" dot>
                running
              </Chip>
            ) : (
              <Chip tone={tab.exitCode === 0 ? "exited" : "failed"} dot>
                exited ({tab.exitCode ?? "?"})
              </Chip>
            )}
          </div>
        )}

        {/*
          The one line that changes what the user sees. Keyed on the row's own
          transport, so a shell can never reach the conversation renderer and a
          PTY agent keeps exactly the terminal it had.
        */}
        {tab.transport === "acp" ? (
          <Conversation key={tab.sessionId} sessionId={tab.sessionId} />
        ) : (
          <Terminal key={tab.sessionId} sessionId={tab.sessionId} />
        )}
      </TabSplit>
    </div>
  );
}
