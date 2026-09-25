import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import { arrive } from "../../lib/navigation.js";
import { useSessionMutations, type Scope } from "../checkout/index.js";
import { Banner, Button, Glyph } from "../../ui/index.js";
import type { AgentModelChoice } from "./agent-model.js";
import { AgentModelPill, useAgentModelChoice } from "./AgentModelPill.js";
import { TurnFrame } from "./Message.js";
import { SlashMenu, slashQuery } from "./SlashMenu.js";

/**
 * A aba rascunho (`033` F5): *"Nova conversa em `/<worktree>`"*, o compositor e
 * a pílula — e **nenhum processo vivo** (Q4). A sessão nasce no primeiro envio.
 *
 * Presentacional: o texto, a escolha e o estado do envio chegam por prop. Quem
 * chama o `createAgent` e troca o rascunho pela sessão é a T18; quem extrai a
 * caixa do `Composer` para as duas usarem é a T15 — até lá esta desenha a caixa
 * com as mesmas classes, para as duas não divergirem no pixel.
 */

export interface DraftTabProps {
  /** O nome da worktree, dito no estado vazio. */
  worktreeName: string;
  catalog: readonly AdapterCatalogView[];
  choice: AgentModelChoice;
  onChoiceChange(next: AgentModelChoice): void;
  draft: string;
  onDraftChange(text: string): void;
  onSend(): void;
  /** O `createAgent` em voo: *"abrindo <agente>…"* no lugar do turno (F5.3). */
  opening?: boolean;
  /** A frase do daemon quando criar falhou (F5.4). O texto fica. */
  error?: string | null;
  onLogin?(adapterId: string): void;
}

export function DraftTab({
  worktreeName,
  catalog,
  choice,
  onChoiceChange,
  draft,
  onDraftChange,
  onSend,
  opening = false,
  error = null,
  onLogin,
}: DraftTabProps) {
  const view = catalog.find((entry) => entry.adapterId === choice.adapterId) ?? null;
  const label = view?.label ?? choice.adapterId;
  // Os comandos do catálogo para este projeto e este ACP (F5.2) — o `view` já
  // chega filtrado pelo projeto.
  const commands = view?.commands ?? [];
  const query = opening ? null : slashQuery(draft);
  const canSend = !opening && draft.trim() !== "";

  return (
    <div className="conv">
      <div className="conv__head">
        <span className="conv__who">
          <Glyph tone="agent">◆</Glyph>
          {label}
        </span>
        <span className="conv__adapter">rascunho · nada aberto ainda</span>
      </div>

      <div className="conv__scroll">
        {/*
          No topo, e não no pé da conversa: a pílula reabre com o erro (F5.4), e
          o menu dela abre para cima — no pé, ele cobriria a frase que diz por
          que ela reabriu.
        */}
        {error !== null && <Banner tone="danger">{error}</Banner>}
        {opening ? (
          /*
           * O texto já é um turno seu — ele vai sair, só falta onde. Sem esta
           * linha o primeiro envio do Claude parece travado: abrir custa 2,5 a
           * 4,4 s nele, contra 0,2 a 0,5 s no Codex (M3).
           */
          <>
            <TurnFrame role="user">
              <div className="msg msg--queued">{draft}</div>
            </TurnFrame>
            <p className="draft__opening" role="status">
              <span className="draft__pulse" aria-hidden="true" />
              abrindo {label}…
            </p>
          </>
        ) : (
          <div className="empty empty--conversation">
            <span className="empty__glyph" aria-hidden="true">
              ◆
            </span>
            <span className="empty__title">
              Nova conversa em <code className="draft__where">/{worktreeName}</code>
            </span>
            <span className="empty__sub">
              {commands.length > 0
                ? `Nada sobe até você mandar. / abre os ${String(commands.length)} comandos deste projeto.`
                : "Nada sobe até você mandar. Os comandos / deste projeto aparecem depois da primeira mensagem."}
            </span>
          </div>
        )}
      </div>

      <div className="composer">
        <div className="composer__box">
          {query !== null && (
            <SlashMenu commands={commands} query={query} onChoose={onDraftChange} onDismiss={() => onDraftChange("")} />
          )}
          <textarea
            className={`composer__in${draft === "" ? " composer__in--empty" : ""}`}
            value={draft}
            disabled={opening}
            placeholder={opening ? `abrindo ${label}…` : "escreva, ou / para comandos"}
            aria-label="mensagem para o agente"
            onChange={(event) => onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              // As mesmas teclas do compositor da sessão: Enter manda, ⇧⏎ quebra
              // linha, e o Enter de um IME aceita o candidato em vez de mandar.
              if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
              event.preventDefault();
              if (canSend) onSend();
            }}
          />
          <div className="composer__bar">
            {/*
              `key` pelo erro: um erro novo remonta a pílula aberta (F5.4), e o
              mesmo erro não a reabre a cada repintura.
            */}
            <AgentModelPill
              key={error ?? "ok"}
              catalog={catalog}
              value={choice}
              onChange={onChoiceChange}
              disabled={opening}
              defaultOpen={error !== null}
              onLogin={onLogin}
            />
            <span className="spacer" />
            <Button variant="primary" size="sm" disabled={!canSend} onClick={onSend}>
              {opening ? "abrindo…" : "enviar"} <span className="kbd">⏎</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface DraftAgentTabProps {
  scope: Scope;
  /** `null` para um checkout cujo projeto o `useNavigation` ainda não resolveu. */
  projectId: string | null;
  worktreeName: string;
  active: boolean;
  /**
   * O texto com que o composer nasce (`033` T20) — vazio no `＋ novo agente`,
   * pré-preenchido quando a colisão de branch traz de volta o que já estava
   * digitado no modal de nova worktree. Só semeia o `useState` inicial: depois
   * de montado, digitar aqui não tem mais nada a ver com quem chamou.
   */
  initialText?: string;
  /** A sessão nasceu — quem chama troca o rascunho pela aba dela (`033` T18). */
  onCreated(sessionId: string): void;
}

/**
 * O rascunho ligado ao daemon (`033` T18): quem escolhe o catálogo, guarda o
 * texto e cria a sessão no primeiro envio.
 *
 * `createAgent` primeiro, `arrive` depois — nesta ordem, e só no `onSuccess`:
 * mandar a chegada antes de a sessão existir não teria para quem chegar, e
 * mandá-la otimista faria o primeiro turno apontar para um id que o daemon
 * pode recusar (F5.4). O texto só é descartado por quem chama, ao trocar o
 * rascunho pela aba nascida — um erro aqui deixa o texto exatamente como
 * estava, para tentar de novo sem reescrever nada.
 */
export function DraftAgentTab({
  scope,
  projectId,
  worktreeName,
  active,
  initialText = "",
  onCreated,
}: DraftAgentTabProps) {
  const { catalog, choice, choose } = useAgentModelChoice(projectId);
  const [draft, setDraft] = useState(initialText);
  const { createAgent } = useSessionMutations(scope);

  function send(): void {
    const text = draft;
    if (text.trim() === "" || createAgent.isPending) return;
    createAgent.mutate(
      { adapterId: choice.adapterId, config: { ...choice.config } },
      {
        onSuccess: (created) => {
          arrive({ sessionId: created.id, text, send: true });
          onCreated(created.id);
        },
      },
    );
  }

  return (
    <div className="pane pane--conv" role="tabpanel" hidden={!active} aria-label="rascunho">
      <DraftTab
        worktreeName={worktreeName}
        catalog={catalog}
        choice={choice}
        onChoiceChange={choose}
        draft={draft}
        onDraftChange={setDraft}
        onSend={send}
        opening={createAgent.isPending}
        error={createAgent.error?.message ?? null}
      />
    </div>
  );
}
