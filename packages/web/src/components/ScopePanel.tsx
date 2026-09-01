import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, type ReactNode } from "react";

import { useAwaitingPermission } from "../hooks/useAwaitingPermission.js";
import { useOpenFiles, tabKey } from "../hooks/useOpenFiles.js";
import { useWorktreeTabs } from "../hooks/useWorktreeTabs.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { relativeAge } from "../lib/relative-time.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import {
  Banner,
  Button,
  Glyph,
  Item,
  SectionHead,
  Tab,
  TabStrip,
  type TabState,
} from "../ui/index.js";
import { FileViewer } from "./FileViewer.js";
import { NewSessionMenu } from "./NewSessionMenu.js";
import { PatchViewer } from "./PatchViewer.js";
import { SessionTabPanel } from "./SessionTab.js";
import { TabSplit } from "./TabSplit.js";

import "./detail.css";

export interface ScopePanelProps {
  scope: Scope;
  /**
   * The path, and nothing else.
   *
   * Navigation is chrome; the state of the checkout is content, and content
   * lives in a tab. Everything that used to sit here beside the crumb — title,
   * branch, dirtiness, the destructive action — is now what `context` renders.
   */
  crumb: ReactNode;
  /** How the checkout's own tab names and reports itself in the strip. */
  checkout: {
    name: string;
    glyph: ReactNode;
    /** The dot. Absent while nothing is known — a dot that guesses is worse. */
    state?: TabState;
    /** What the dot means, spelled out: a colour has no name. */
    stateLabel?: string;
  };
  /** What the checkout's own tab shows: metadata, actions, lists. */
  context: ReactNode;
  /** Where a session launched here will run. */
  cwd: string;
  /**
   * A session to bring to the front, once, when it shows up.
   *
   * The first-access flow promises "criar e abrir a conversa", and landing on the
   * context tab would break that promise on the one screen where it was made.
   * One-shot on purpose: after that first arrival, which tab is in front is the
   * user's business.
   */
  openSessionId?: string | undefined;
  /**
   * O pedido que abriu uma conversa, e para qual sessão ele é.
   *
   * Vem de fora porque quem cria a sessão é outra parte da tela — hoje o rodapé de
   * execução, quando o projeto não declara `[scripts]`. Amarrado ao `sessionId` de
   * propósito: uma pergunta destinada a uma conversa não pode cair na conversa que
   * estiver aberta.
   */
  initialPrompt?: { sessionId: string; text: string } | undefined;
}

/**
 * A worktree — or the project's own checkout — and everything open inside it.
 *
 * The column is path → tabs → content, and the checkout is the FIRST TAB.
 *
 * It used to be a fixed header above the strip, with a reason written here: a
 * new session does not change the branch, the path, or whether the tree is
 * dirty, so switching tabs must not make that information move. That reason was
 * true and it was not free — the header spent height in EVERY tab to say
 * something that interests one, and the thing it squeezed hardest was the disk
 * path, which is exactly the piece nobody can retype from memory.
 *
 * So the trade was taken, and this is what it costs: with a session tab in
 * front, the branch and the dirtiness are no longer on screen. Two signals pay
 * for it and they do not depend on which tab is open — the dot on the checkout
 * tab (the tree is dirty) and the crumb above the strip (where you are). The
 * rest is one click away, in a tab that cannot be closed.
 */
export function ScopePanel({
  scope,
  crumb,
  checkout,
  context,
  cwd,
  openSessionId,
  initialPrompt,
}: ScopePanelProps) {
  const queryClient = useQueryClient();
  const { tabs, activeId, select, close, reopen, resume, resuming, sessions } =
    useWorktreeTabs(scope);
  const awaiting = useAwaitingPermission();
  const openFiles = useOpenFiles();

  // Once, and only when the tab exists: the session is created a round trip
  // before the list that turns it into a tab arrives.
  const opened = useRef(false);
  useEffect(() => {
    if (openSessionId === undefined || opened.current) return;
    if (!tabs.some((tab) => tab.sessionId === openSessionId)) return;
    opened.current = true;
    select(openSessionId);
  }, [openSessionId, tabs, select]);

  // The column opens files into whichever tab is in front, so the tab has to
  // say which one that is. Nothing else in the shell knows.
  const active = tabKey(scope.scopeType, scope.scopeId, activeId);
  useEffect(() => {
    openFiles.setActiveTab(active);
  }, [active, openFiles.setActiveTab]);

  /** What this tab is reading beside its session, if anything. */
  function viewerFor(sessionId: string | null): ReactNode | null {
    const key = tabKey(scope.scopeType, scope.scopeId, sessionId);
    const open = openFiles.fileFor(key);
    if (open === null) return null;

    return open.view === "patch" ? (
      <PatchViewer
        scope={scope}
        path={open.path}
        changeRef={open.ref ?? "worktree"}
        onClose={() => openFiles.close(key)}
      />
    ) : (
      // Whether this tab is in front is something only this component knows —
      // every session tab stays mounted, so a tab going behind another one is
      // this prop and nothing else. It is what flushes the buffer on the way
      // out (F2.2), and the reason `active` is required rather than defaulted.
      <FileViewer
        scope={scope}
        path={open.path}
        active={sessionId === activeId}
        onClose={() => openFiles.close(key)}
      />
    );
  }

  const end = useMutation({
    mutationFn: (sessionId: string) => trpc.session.close.mutate({ id: sessionId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sessionsKey(scope.scopeType, scope.scopeId) }),
  });

  const all = sessions.data ?? [];
  const openIds = new Set(tabs.map((tab) => tab.sessionId));

  return (
    <section className="scope">
      <div className="scope__crumb">{crumb}</div>

      <TabStrip
        label={`sessões de ${cwd}`}
        lead={
          // First, fixed, and no `✕`: closing the worktree from inside the
          // worktree does not mean anything. It is also where the selection
          // returns to when the last session tab goes away.
          <Tab
            label={checkout.name}
            glyph={checkout.glyph}
            active={activeId === null}
            onSelect={() => select(null)}
            {...(checkout.state !== undefined ? { state: checkout.state } : {})}
            {...(checkout.stateLabel !== undefined ? { stateLabel: checkout.stateLabel } : {})}
          />
        }
        action={
          <NewSessionMenu
            scopeType={scope.scopeType}
            scopeId={scope.scopeId}
            onCreated={(sessionId) => select(sessionId)}
          />
        }
      >
        {tabs.map((tab) => (
          <Tab
            key={tab.sessionId}
            label={tab.label}
            ordinal={tab.ordinal}
            glyph={
              <Glyph tone={tab.kind === "agent" ? "agent" : "shell"}>
                {tab.kind === "agent" ? "◆" : "●"}
              </Glyph>
            }
            state={
              // Waiting on a person outranks being busy: a tab shows one dot,
              // and "answer me" is the state that will not resolve itself.
              awaiting.isWaiting(tab.sessionId)
                ? "asking"
                : tab.state === "running"
                  ? "running"
                  : tab.exitCode === 0
                    ? "exited"
                    : "failed"
            }
            // The dot alone said "exited", which a session that has just died
            // also says. This says what the tab *is*: something to read (D5).
            note={tab.state === "running" ? undefined : "registro"}
            active={activeId === tab.sessionId}
            onSelect={() => select(tab.sessionId)}
            onClose={() => {
              // A live session's tab goes away by the session ending. The hook
              // refuses to hide it, so this is the only path — and the tab
              // disappearing is the proof the process actually stopped.
              if (tab.state === "running") end.mutate(tab.sessionId);
              else close(tab.sessionId);
            }}
          />
        ))}
      </TabStrip>

      {/* Every tab stays mounted; only the open one is shown. Unmounting would
          reconnect and repaint the terminal on every switch. */}
      <div
        className="pane"
        role="tabpanel"
        hidden={activeId !== null}
        aria-label={checkout.name}
      >
        <TabSplit viewer={viewerFor(null)}>
        {end.isError && (
          <div className="detail__banner">
            <Banner tone="danger">{end.error.message}</Banner>
          </div>
        )}

        {context}

        <section className="section">
          <SectionHead
            title="Sessões"
            count={
              all.length === 0
                ? 0
                : `${all.length} · ${all.filter((s) => s.state === "running").length} rodando`
            }
          />
          {all.length === 0 ? (
            <p className="detail__hint">nenhuma sessão aberta aqui</p>
          ) : (
            all.map((session) => {
              const running = session.state === "running";
              const listed = openIds.has(session.id);

              return (
                <Item
                  key={session.id}
                  // Uma sessão de script não é uma shell, e chamá-la assim é a
                  // mesma mentira que o `command` guardava até a project-scripts:
                  // ela descreve o mecanismo em vez do que está acontecendo.
                  name={session.agentName ?? session.scriptName ?? "shell"}
                  glyph={
                    <Glyph tone={session.kind === "agent" ? "agent" : "shell"}>
                      {session.kind === "agent" ? "◆" : session.kind === "script" ? "▶" : "●"}
                    </Glyph>
                  }
                  detail={session.command}
                  state={
                    running
                      ? { label: "running", tone: "running" }
                      : {
                          label: `exited (${session.exitCode ?? "?"})`,
                          tone: session.exitCode === 0 ? "exited" : "failed",
                        }
                  }
                  age={relativeAge(session.createdAt)}
                  onSelect={listed ? () => select(session.id) : undefined}
                  action={
                    listed ? undefined : (
                      // The record outlives the tab, and so does the daemon's
                      // ring buffer — this is how the output of something that
                      // crashed gets read after its tab went away.
                      //
                      // Only an exited session ever lands here — a running one
                      // cannot lose its tab. The verb has to be honest about
                      // what comes back: a PTY tab is a frozen buffer, so "ver
                      // registro" (issue #14); an ACP conversation reopens
                      // readable and can still be continued, so "reabrir" (D13).
                      <Button size="sm" variant="ghost" onClick={() => reopen(session.id)}>
                        {session.transport === "acp" ? "reabrir" : "ver registro"}
                      </Button>
                    )
                  }
                />
              );
            })
          )}
        </section>
        </TabSplit>
      </div>

      {tabs.map((tab) => (
        <SessionTabPanel
          key={tab.sessionId}
          tab={tab}
          scope={scope}
          cwd={cwd}
          onStarted={select}
          active={activeId === tab.sessionId}
          viewer={viewerFor(tab.sessionId)}
          // Only a conversation can be resumed; a PTY tab gets no button, because
          // `session/load` is something only an ACP adapter has (D1).
          {...(tab.transport === "acp" ? { onResume: () => resume(tab.sessionId) } : {})}
          resuming={resuming === tab.sessionId}
          initialPrompt={
            initialPrompt?.sessionId === tab.sessionId ? initialPrompt.text : undefined
          }
        />
      ))}
    </section>
  );
}
