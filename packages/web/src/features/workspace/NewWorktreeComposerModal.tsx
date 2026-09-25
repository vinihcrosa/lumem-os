import { useMemo, useState } from "react";

import { arrive, select as selectScope } from "../../lib/navigation.js";
import { useAgentModelChoice } from "../conversation/index.js";
import { draftFor, setDraftFor } from "./composer-drafts.js";
import { NewWorktreeComposer, type ComposerOrigin, type ComposerProject } from "./NewWorktreeComposer.js";
import { OriginPicker } from "./OriginPicker.js";
import { fromOf, useOriginChoice, type OriginChoice } from "./useOriginChoice.js";
import { useProjects } from "./useProjects.js";
import { useWorktreeMutations } from "./useWorktrees.js";

/**
 * Liga o `NewWorktreeComposer` ao daemon (`033` T20): o catálogo de agente e
 * modelo, o trilho de origem, o rascunho por projeto (`composer-drafts.ts`,
 * Q1) e a mutação `worktree.start`.
 */

export interface NewWorktreeComposerModalProps {
  workspaceId: string;
  /** O projeto da linha cujo `+` abriu o modal — o seletor começa nele (F4.1). */
  projectId: string;
  onClose(): void;
  onCreated(worktreeId: string): void;
  /** Q5 da `026`: a branch escolhida já tem worktree — o destino é o mesmo. */
  onOpenExisting(worktreeId: string): void;
}

/**
 * O seletor de projeto do cabeçalho troca de **projeto**, não só de valor —
 * `key={projectId}` remonta o corpo a cada troca, e é a remontagem que garante
 * que o rascunho, o nome digitado e o trilho de origem (estado interno do
 * `useOriginChoice`) nunca vazam de um projeto para o seguinte: sem ela, o
 * rascunho seguinte nasceria lendo o texto certo mas o trilho de origem
 * continuaria mostrando a issue do projeto anterior.
 */
export function NewWorktreeComposerModal({
  workspaceId,
  projectId: initialProjectId,
  onClose,
  onCreated,
  onOpenExisting,
}: NewWorktreeComposerModalProps) {
  const projects = useProjects(workspaceId);
  const [projectId, setProjectId] = useState(initialProjectId);

  const summaries = useMemo<ComposerProject[]>(
    () => (projects.data ?? []).map((entry) => ({ id: entry.id, name: entry.name })),
    [projects.data],
  );
  const current = projects.data?.find((entry) => entry.id === projectId) ?? null;

  return (
    <NewWorktreeComposerBody
      key={projectId}
      projectId={projectId}
      defaultBranch={current?.defaultBranch ?? "main"}
      hasCommits={current?.hasCommits ?? null}
      projects={summaries}
      onProjectChange={setProjectId}
      onClose={onClose}
      onCreated={onCreated}
      onOpenExisting={onOpenExisting}
    />
  );
}

interface NewWorktreeComposerBodyProps {
  projectId: string;
  defaultBranch: string;
  hasCommits: boolean | null;
  projects: readonly ComposerProject[];
  onProjectChange(projectId: string): void;
  onClose(): void;
  onCreated(worktreeId: string): void;
  onOpenExisting(worktreeId: string): void;
}

function NewWorktreeComposerBody({
  projectId,
  defaultBranch,
  hasCommits,
  projects,
  onProjectChange,
  onClose,
  onCreated,
  onOpenExisting,
}: NewWorktreeComposerBodyProps) {
  const [prompt, setPrompt] = useState(() => draftFor(projectId));
  const [name, setName] = useState("");
  const [originOpen, setOriginOpen] = useState(false);
  const [heldBranch, setHeldBranch] = useState<HeldBranch | null>(null);

  const originChoice = useOriginChoice(projectId, { open: true, onSuggestName: setName });
  const { catalog, choice, choose } = useAgentModelChoice(projectId);
  const { start } = useWorktreeMutations(projectId);

  function changePrompt(text: string): void {
    setPrompt(text);
    setDraftFor(projectId, text);
  }

  // A branch escolhida no trilho vence o que quer que o trilho ainda ache que
  // está ativo: uma branch já ocupada nunca chega a virar `origin.pick` (o
  // `OriginPicker` navega direto), então sem isto o cabeçalho continuaria
  // mostrando `default`.
  const origin: ComposerOrigin =
    heldBranch !== null
      ? { kind: "branch", ref: heldBranch.ref }
      : composerOriginOf(originChoice, defaultBranch);

  // F6.13 (`001`): um repositório sem commit não tem de onde cortar. O daemon
  // recusa do mesmo jeito; isto só evita a viagem.
  const unbornMessage =
    hasCommits === false
      ? "este repositório ainda não tem nenhum commit — faça o primeiro para poder cortar worktrees"
      : null;

  function create(): void {
    if (prompt.trim() === "" || unbornMessage !== null) return;

    if (heldBranch !== null) {
      // F4.7: a worktree já existe — nada para criar, só para onde ir.
      //
      // SPEC_DEVIATION: o texto digitado some daqui em vez de abrir como aba
      // rascunho na worktree existente. A Q1 só prometeu memória de rascunho
      // para o modal; carregar o texto para dentro da aba de outro escopo
      // exigiria tocar `useWorktreeTabs.ts`/`ScopePanel.tsx`/`DraftTab.tsx`, e
      // os três estão fora do `Where` desta task. Registrado no relatório da
      // T20 como achado para um follow-up.
      setDraftFor(projectId, "");
      selectScope({ projectId, scope: { scopeType: "worktree", scopeId: heldBranch.worktreeId } });
      onOpenExisting(heldBranch.worktreeId);
      onClose();
      return;
    }

    start.mutate(
      {
        prompt,
        adapterId: choice.adapterId,
        config: { ...choice.config },
        name: name.trim() === "" ? undefined : name.trim(),
        from: fromOf(originChoice.active, originChoice.pick),
      },
      {
        onSuccess: ({ worktreeId, sessionId }) => {
          setDraftFor(projectId, "");
          // "mutate → onSuccess → arrive/select" — a mesma ordem da T18: só
          // depois de a sessão existir de verdade é que a chegada e a seleção
          // fazem sentido.
          selectScope({ projectId, scope: { scopeType: "worktree", scopeId: worktreeId } });
          arrive({ sessionId, send: false });
          onCreated(worktreeId);
          onClose();
        },
      },
    );
  }

  // Trocar de aba ou escolher outra coisa no trilho invalida a branch
  // ocupada: sem isto, escolher `issue` depois de ter clicado numa branch
  // ocupada deixaria `Create` preso em "abrir <nome>".
  const wrappedOrigin: OriginChoice = {
    ...originChoice,
    select: (kind) => {
      setHeldBranch(null);
      originChoice.select(kind);
    },
    choose: (pick, suggested) => {
      setHeldBranch(null);
      originChoice.choose(pick, suggested);
    },
  };

  return (
    <NewWorktreeComposer
      open
      onClose={onClose}
      projects={projects}
      projectId={projectId}
      onProjectChange={onProjectChange}
      origin={origin}
      onOriginClick={() => setOriginOpen((was) => !was)}
      originOpen={originOpen}
      originPanel={
        <OriginPicker
          origin={wrappedOrigin}
          onOpenExisting={(worktreeId) => {
            const entry = originChoice.branches.data?.find((branch) => branch.worktreeId === worktreeId);
            setHeldBranch({
              ref: entry?.name ?? worktreeId,
              worktreeId,
              worktreeName: entry?.worktreeName ?? entry?.name ?? worktreeId,
            });
            setOriginOpen(false);
          }}
          // O checkout principal (`worktreeId === null`) não navega — o
          // `OriginPicker` já só chama isto quando há para onde ir.
          onCreated={() => undefined}
          close={() => setOriginOpen(false)}
        />
      }
      prompt={prompt}
      onPromptChange={changePrompt}
      name={name}
      onNameChange={setName}
      catalog={catalog}
      choice={choice}
      onChoiceChange={choose}
      heldBy={heldBranch?.worktreeName ?? null}
      creating={start.isPending}
      error={start.error?.message ?? unbornMessage}
      blocked={unbornMessage !== null}
      onCreate={create}
    />
  );
}

interface HeldBranch {
  ref: string;
  worktreeId: string;
  worktreeName: string;
}

/**
 * O que o trilho de origem está mostrando, traduzido para `ComposerOrigin`.
 *
 * Nada escolhido ainda (aba trocada, lista ainda não clicada) cai em
 * `default`: o mesmo fallback que `fromOf` já assume do lado do pedido — os
 * dois têm que concordar, senão o cabeçalho diria uma origem e o daemon
 * cortaria de outra.
 */
function composerOriginOf(origin: OriginChoice, defaultBranch: string): ComposerOrigin {
  const chosen = origin.chosen;
  if (origin.active === "default" || chosen === null) return { kind: "default", branch: defaultBranch };
  if (chosen.kind === "branch") return { kind: "branch", ref: chosen.ref };
  if (chosen.kind === "issue") {
    const title =
      origin.host.data?.issues.items.find((issue) => issue.number === chosen.number)?.title ??
      `issue #${String(chosen.number)}`;
    return { kind: "issue", number: chosen.number, title };
  }
  const pull = origin.host.data?.pulls.items.find((item) => item.number === chosen.number);
  return {
    kind: "pr",
    number: chosen.number,
    title: pull?.title ?? `PR #${String(chosen.number)}`,
    headRefName: pull?.headRefName ?? "",
  };
}
