import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { CLAUDE_VIEW_WITH_COMMANDS, CODEX_VIEW } from "../../test/adapter-catalog-fixtures.js";
import type { AgentModelChoice } from "../conversation/index.js";
import { NewWorktreeComposer, type ComposerOrigin } from "./NewWorktreeComposer.js";

/**
 * O compositor de nova worktree (`033` F4.1), no `Modal size="wide"` da T13.
 *
 * O seletor de origem é um botão que ainda não abre nada: o `OriginPicker` que
 * ele vai abrir é extraído do `CreateWorktreeDialog` na T19. Aqui a origem
 * chega pronta, que é o que o cabeçalho e o nome derivado precisam para ser
 * desenhados.
 */

const PROJECTS = [
  { id: "p1", name: "lumem-os" },
  { id: "p2", name: "lorebase" },
];

const CATALOG = [CLAUDE_VIEW_WITH_COMMANDS, CODEX_VIEW];

function Stage({
  origin,
  initialPrompt = "",
  heldBy = null,
}: {
  origin: ComposerOrigin;
  initialPrompt?: string;
  heldBy?: string | null;
}) {
  const [projectId, setProjectId] = useState("p1");
  const [prompt, setPrompt] = useState(initialPrompt);
  const [name, setName] = useState("");
  const [choice, setChoice] = useState<AgentModelChoice>({ adapterId: "claude", config: {} });
  return (
    <NewWorktreeComposer
      open
      onClose={() => undefined}
      projects={PROJECTS}
      projectId={projectId}
      onProjectChange={setProjectId}
      origin={origin}
      onOriginClick={() => undefined}
      prompt={prompt}
      onPromptChange={setPrompt}
      name={name}
      onNameChange={setName}
      catalog={CATALOG}
      choice={choice}
      onChoiceChange={setChoice}
      heldBy={heldBy}
      onCreate={() => undefined}
    />
  );
}

const meta: Meta<typeof NewWorktreeComposer> = {
  title: "Workspace/NewWorktreeComposer",
  component: NewWorktreeComposer,
};

export default meta;

type Story = StoryObj<typeof NewWorktreeComposer>;

/** Aberto pelo `+` da linha do projeto: nada escrito, `Create` desligado. */
export const Vazio: Story = {
  name: "Vazio",
  render: () => <Stage origin={{ kind: "default", branch: "main" }} />,
};

/** Origem = issue: o nome sai da issue (`branchNameForIssue`), não do prompt (F4.2). */
export const OrigemIssue: Story = {
  name: "Origem = issue",
  render: () => (
    <Stage
      origin={{ kind: "issue", number: 142, title: "O login quebra no Safari quando a sessão expira" }}
      initialPrompt={
        "Resolva a issue #142. Reproduza primeiro com o cookie de sessão encurtado, e escreva o teste que " +
        "falha antes de mexer no middleware."
      }
    />
  ),
};

/**
 * A branch escolhida já tem worktree (F4.7): `Create` vira `abrir`, e o texto
 * vai para uma aba rascunho de lá, sem enviar.
 */
export const BranchEmCheckout: Story = {
  name: "Branch já em checkout",
  render: () => (
    <Stage
      origin={{ kind: "branch", ref: "feat/login-safari" }}
      heldBy="login-safari"
      initialPrompt="Continue de onde parou: falta o teste do redirect com o next."
    />
  ),
};
