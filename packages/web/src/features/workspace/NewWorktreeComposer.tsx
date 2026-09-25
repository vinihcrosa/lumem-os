import { useState } from "react";

import { worktreeNameFromPrompt, type AdapterCatalogView } from "@lumem/shared";

import { AgentModelPill, SlashMenu, slashQuery, type AgentModelChoice } from "../conversation/index.js";
import { Banner, Button, Field, Glyph, Input, Menu, MenuItem, Modal } from "../../ui/index.js";
import { branchNameForIssue } from "./CreateWorktreeDialog.js";

/**
 * Criar worktree é compor o primeiro prompt (`033` F4).
 *
 * O modal largo: seletor de projeto, `…` (o nome), a origem à direita, o campo
 * *"No que você quer trabalhar?"*, a pílula e `Create ↵` (F4.1). A worktree só
 * nasce no `Create` (F4.3).
 *
 * Presentacional: projeto, origem, texto, nome e escolha chegam por prop. O
 * seletor de origem é um botão que chama `onOriginClick` — o `OriginPicker` que
 * ele abre é extraído do `CreateWorktreeDialog` na T19, e quem liga
 * `worktree.start`, o rascunho por projeto e a troca do diálogo antigo é a T20.
 */

/** De onde cortar — as quatro origens da `026`, com o que o botão precisa dizer. */
export type ComposerOrigin =
  | { kind: "default"; branch: string }
  | { kind: "branch"; ref: string }
  | { kind: "issue"; number: number; title: string }
  | { kind: "pr"; number: number; title: string; headRefName: string };

export interface ComposerProject {
  id: string;
  name: string;
}

export interface NewWorktreeComposerProps {
  open: boolean;
  onClose(): void;
  projects: readonly ComposerProject[];
  projectId: string;
  onProjectChange(projectId: string): void;
  origin: ComposerOrigin;
  /** Abre o seletor de origem (T19). */
  onOriginClick?(): void;
  prompt: string;
  onPromptChange(text: string): void;
  /** O nome escrito à mão no `…`. Vazio quer dizer *derivado* (F4.2). */
  name: string;
  onNameChange(name: string): void;
  catalog: readonly AdapterCatalogView[];
  choice: AgentModelChoice;
  onChoiceChange(next: AgentModelChoice): void;
  onLogin?(adapterId: string): void;
  /**
   * A worktree que já tem a branch da origem (F4.7). Então `Create` não cria:
   * abre a existente, com uma aba rascunho contendo o texto, sem enviar.
   */
  heldBy?: string | null;
  creating?: boolean;
  /** A frase do daemon quando `worktree.start` recusou. */
  error?: string | null;
  onCreate(): void;
}

export function NewWorktreeComposer({
  open,
  onClose,
  projects,
  projectId,
  onProjectChange,
  origin,
  onOriginClick,
  prompt,
  onPromptChange,
  name,
  onNameChange,
  catalog,
  choice,
  onChoiceChange,
  onLogin,
  heldBy = null,
  creating = false,
  error = null,
  onCreate,
}: NewWorktreeComposerProps) {
  const [projectMenu, setProjectMenu] = useState(false);
  const [nameOpen, setNameOpen] = useState(false);

  const project = projects.find((entry) => entry.id === projectId) ?? null;
  const derived = derivedName(origin, prompt);
  const finalName = name.trim() === "" ? derived : name.trim();
  const commands = catalog.find((entry) => entry.adapterId === choice.adapterId)?.commands ?? [];
  const query = creating ? null : slashQuery(prompt);
  const canCreate = !creating && prompt.trim() !== "";

  return (
    <Modal
      open={open}
      size="wide"
      title="Nova worktree"
      onClose={onClose}
      header={
        <div className="wtc__head">
          <span className="wtc__pick">
            <Button
              size="sm"
              aria-haspopup="menu"
              aria-expanded={projectMenu}
              aria-label={`projeto: ${project?.name ?? "nenhum"}`}
              onClick={() => setProjectMenu(!projectMenu)}
            >
              <Glyph tone="project">■</Glyph>
              {project?.name ?? "projeto"} ▾
            </Button>
            {projectMenu && (
              <Menu label="projetos">
                {projects.map((entry) => (
                  <MenuItem
                    key={entry.id}
                    glyph={<Glyph tone="project">■</Glyph>}
                    onSelect={() => {
                      setProjectMenu(false);
                      onProjectChange(entry.id);
                    }}
                  >
                    {entry.name}
                  </MenuItem>
                ))}
              </Menu>
            )}
          </span>
          <Button
            size="sm"
            aria-expanded={nameOpen}
            aria-label="nome da worktree"
            title={`nome: ${finalName}`}
            onClick={() => setNameOpen(!nameOpen)}
          >
            …
          </Button>
          <span className="wtc__push" />
          <Button size="sm" aria-label={`origem: ${originLabel(origin)}`} onClick={onOriginClick}>
            <OriginGlyph origin={origin} />
            <span className="wtc__origin">{originLabel(origin)}</span> ▾
          </Button>
        </div>
      }
      footer={
        <>
          <Button variant="primary" disabled={!canCreate} onClick={onCreate}>
            {creating ? "criando…" : heldBy === null ? "Create" : `abrir ${heldBy}`}{" "}
            <span className="kbd">↵</span>
          </Button>
          <span className="wtc__sum">
            {heldBy === null ? (
              <>
                cria <code>{finalName}</code> {originEcho(origin)}
              </>
            ) : (
              <>
                abre <code>{heldBy}</code> com o texto num rascunho, sem enviar
              </>
            )}
          </span>
        </>
      }
    >
      {nameOpen && (
        <Field id="wtc-name" label="Nome da worktree">
          <Input
            id="wtc-name"
            value={name}
            placeholder={derived}
            onChange={(event) => onNameChange(event.target.value)}
          />
        </Field>
      )}

      {heldBy !== null && (
        <Banner tone="info">
          a branch <code>{originRef(origin)}</code> já está em checkout em <b>{heldBy}</b> — o Lumem abre lá em vez de
          criar outra
        </Banner>
      )}
      {error !== null && <Banner tone="danger">{error}</Banner>}

      <div className="composer__box wtc__box">
        {query !== null && (
          <SlashMenu commands={commands} query={query} onChoose={onPromptChange} onDismiss={() => onPromptChange("")} />
        )}
        <textarea
          className={`composer__in wtc__in${prompt === "" ? " composer__in--empty" : ""}`}
          value={prompt}
          disabled={creating}
          placeholder="No que você quer trabalhar?"
          aria-label="No que você quer trabalhar?"
          data-modal-focus=""
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            // `Create ↵` é literal: Enter cria, ⇧⏎ quebra linha, e o Enter de
            // um IME aceita o candidato — as teclas do compositor da conversa.
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (canCreate) onCreate();
          }}
        />
        <div className="composer__bar">
          <AgentModelPill
            catalog={catalog}
            value={choice}
            onChange={onChoiceChange}
            disabled={creating}
            onLogin={onLogin}
          />
        </div>
      </div>
    </Modal>
  );
}

/**
 * O nome que a worktree ganha sem ninguém escrever (F4.2).
 *
 * `default` tira do prompt, pela mesma função que o daemon usa; as outras
 * origens montam o nome como o diálogo antigo montava — a issue pelo título, a
 * PR pela head, a branch por ela mesma.
 */
function derivedName(origin: ComposerOrigin, prompt: string): string {
  switch (origin.kind) {
    case "default":
      return worktreeNameFromPrompt(prompt);
    case "branch":
      return origin.ref;
    case "issue":
      return branchNameForIssue(origin.number, origin.title);
    case "pr":
      return origin.headRefName;
  }
}

function originLabel(origin: ComposerOrigin): string {
  switch (origin.kind) {
    case "default":
      return `de ${origin.branch}`;
    case "branch":
      return origin.ref;
    case "issue":
      return `#${String(origin.number)} ${origin.title}`;
    case "pr":
      return `PR #${String(origin.number)}`;
  }
}

/** O que o rodapé diz sobre de onde corta, depois do nome. */
function originEcho(origin: ComposerOrigin): string {
  switch (origin.kind) {
    case "default":
      return `a partir de ${origin.branch}`;
    case "branch":
      return `na branch ${origin.ref}`;
    case "issue":
      return `da issue #${String(origin.number)}, a partir da default`;
    case "pr":
      return `da head da PR #${String(origin.number)}`;
  }
}

/** A branch que a origem aponta, para dizer qual está ocupada. */
function originRef(origin: ComposerOrigin): string {
  switch (origin.kind) {
    case "default":
      return origin.branch;
    case "branch":
      return origin.ref;
    case "issue":
      return branchNameForIssue(origin.number, origin.title);
    case "pr":
      return origin.headRefName;
  }
}

function OriginGlyph({ origin }: { origin: ComposerOrigin }) {
  if (origin.kind === "branch") return <span className="wtc__g wtc__g--branch">⑂</span>;
  if (origin.kind === "default") return <Glyph tone="worktree">◇</Glyph>;
  return <span className="wtc__g">◈</span>;
}
