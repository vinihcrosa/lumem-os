import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, type ReactNode } from "react";

import { useOpenFiles, tabKey } from "../hooks/useOpenFiles.js";
import { useWorktreeTabs } from "../hooks/useWorktreeTabs.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { relativeAge } from "../lib/relative-time.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Glyph, Item, SectionHead, Tab, TabStrip } from "../ui/index.js";
import { FileViewer } from "./FileViewer.js";
import { NewSessionMenu } from "./NewSessionMenu.js";
import { PatchViewer } from "./PatchViewer.js";
import { SessionTabPanel } from "./SessionTab.js";
import { TabSplit } from "./TabSplit.js";

import "./detail.css";

export interface ScopePanelProps {
  scope: Scope;
  /** Breadcrumb, title, chips and the scope's own destructive action. */
  header: ReactNode;
  /** What the context tab shows: metadata, actions, lists. */
  context: ReactNode;
  /** Where a session launched here will run. */
  cwd: string;
}

/**
 * A worktree — or the project's own checkout — and everything open inside it.
 *
 * The header sits above the strip because it is the context of every tab: a new
 * session does not change the branch, the path, or whether the tree is dirty.
 * Switching tabs must not make that information move.
 */
export function ScopePanel({ scope, header, context, cwd }: ScopePanelProps) {
  const queryClient = useQueryClient();
  const { tabs, activeId, select, close, reopen, sessions } = useWorktreeTabs(scope);
  const openFiles = useOpenFiles();

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
      <FileViewer scope={scope} path={open.path} onClose={() => openFiles.close(key)} />
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
      <div className="scope__head">{header}</div>

      <TabStrip
        label={`sessões de ${cwd}`}
        lead={
          <Tab label="contexto" active={activeId === null} onSelect={() => select(null)} />
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
              tab.state === "running" ? "running" : tab.exitCode === 0 ? "exited" : "failed"
            }
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
        aria-label="contexto"
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
                  name={session.agentName ?? "shell"}
                  glyph={
                    <Glyph tone={session.kind === "agent" ? "agent" : "shell"}>
                      {session.kind === "agent" ? "◆" : "●"}
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
                      <Button size="sm" variant="ghost" onClick={() => reopen(session.id)}>
                        reabrir
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
          cwd={cwd}
          active={activeId === tab.sessionId}
          viewer={viewerFor(tab.sessionId)}
        />
      ))}
    </section>
  );
}
