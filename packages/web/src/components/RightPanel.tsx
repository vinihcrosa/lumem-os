import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { clampWidth } from "../hooks/useRightPanel.js";

import "./right-panel.css";

/**
 * A terceira aba entrou com a memória.
 *
 * Ela pertence ao **checkout** como as outras duas — o que o workspace sabe não
 * muda ao trocar de aba de sessão —, e por isso mora aqui e não na aba.
 */
export type RightPanelTab = "files" | "changes" | "memory" | "pr";

export interface RightPanelProps {
  tab: RightPanelTab;
  onSelectTab(tab: RightPanelTab): void;
  /** Propostas pendentes; null enquanto ainda não se sabe. */
  proposalCount?: number | null;
  /**
   * A barra da pull request, **acima** da faixa de abas.
   *
   * Mais um slot do quadro que já existe: os outros três andares — abas,
   * conteúdo e rodapé de execução — não mudam de dono nem de altura (F1.1).
   * `undefined` quando não há o que dizer, e aí a faixa de abas volta a ser o
   * topo da coluna. Nada de esqueleto piscando enquanto não se sabe.
   */
  prBar?: ReactNode;
  /**
   * O distintivo da quarta aba, ou `null` quando ela não deve existir.
   *
   * A aba `PR` **só existe quando existe PR** (F2.1): aba permanente que passa
   * a vida vazia ensina o olho a pular a faixa inteira.
   */
  prBadge?: { text: string; tone: string } | null;
  /** Shown on the `Mudanças` tab; null while it is still unknown. */
  changeCount: number | null;
  /**
   * What the tab in front puts in the bar, before the two icons that are always
   * there. A slot and not a prop per action: the column owns no data, and which
   * gestures exist is the current tab's question, not this frame's.
   */
  actions?: ReactNode;
  onReload(): void;
  onClose(): void;
  onResize(width: number): void;
  /**
   * O rodapé de execução (project-scripts), ancorado abaixo de tudo.
   *
   * Irmão do que rola, e não filho: a árvore rola por cima dele, e ele fica onde
   * está. Fosse filho do scroll, rolar a árvore levaria o terminal junto para fora
   * da tela.
   */
  dock?: ReactNode;
  /** What the bottom strip says on the left — usually how fresh the read is. */
  footLeft?: ReactNode;
  footRight?: ReactNode;
  children: ReactNode;
}

/**
 * The column itself: two tabs, a body, and a strip that says how fresh it is.
 *
 * It owns no data. Which files exist and what changed are two different
 * questions with two different queries, and both answer inside `children` —
 * this is the frame they share, and the place the drag lives.
 */
export function RightPanel({
  proposalCount = null,
  prBar,
  prBadge = null,
  tab,
  onSelectTab,
  changeCount,
  actions,
  onReload,
  onClose,
  onResize,
  dock,
  footLeft,
  footRight,
  children,
}: RightPanelProps) {
  const dragging = useRef(false);
  const panelRef = useRef<HTMLElement>(null);
  const [grabbed, setGrabbed] = useState(false);

  const measure = useCallback(
    (clientX: number) => {
      const right = panelRef.current?.getBoundingClientRect().right;
      if (right === undefined || !Number.isFinite(clientX)) return;
      // Measured from the right edge of the window, not from the pointer's
      // delta: a drag that outruns a frame would otherwise drift.
      onResize(clampWidth(right - clientX));
    },
    [onResize],
  );

  useEffect(() => {
    if (!grabbed) return;

    const onMove = (event: PointerEvent): void => {
      if (!dragging.current) return;
      event.preventDefault();
      measure(event.clientX);
    };
    const onUp = (): void => {
      dragging.current = false;
      setGrabbed(false);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    // Listeners on the window, not the handle: the pointer leaves a 4px target
    // on the first fast drag, and the resize has to keep following it.
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [grabbed, measure]);

  return (
    <aside className="rp" aria-label="arquivos do checkout" ref={panelRef}>
      <span
        className="rp__grip"
        role="separator"
        aria-orientation="vertical"
        aria-label="largura da coluna"
        onPointerDown={(event) => {
          event.preventDefault();
          dragging.current = true;
          setGrabbed(true);
        }}
      />

      {prBar}

      <div className="rp__bar" role="tablist" aria-label="conteúdo da coluna">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "files"}
          className={`rtab${tab === "files" ? " rtab--active" : ""}`}
          onClick={() => onSelectTab("files")}
        >
          Arquivos
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "changes"}
          className={`rtab${tab === "changes" ? " rtab--active" : ""}`}
          onClick={() => onSelectTab("changes")}
        >
          Mudanças
          {/* The count lives on the tab because it is what decides whether the
              tab is worth opening. Inside it, it would only be readable to
              someone who already opened it. */}
          {changeCount !== null && changeCount > 0 && (
            <span className="rtab__count">{changeCount}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "memory"}
          className={`rtab${tab === "memory" ? " rtab--active" : ""}`}
          onClick={() => onSelectTab("memory")}
        >
          Memória
          {/* Pelo mesmo motivo da contagem de mudanças: o número de propostas
              pendentes é o que decide se vale abrir a aba. */}
          {proposalCount !== null && proposalCount > 0 && (
            <span className="rtab__count">{proposalCount}</span>
          )}
        </button>
        {prBadge !== null && (
          <button
            type="button"
            role="tab"
            aria-selected={tab === "pr"}
            className={`rtab${tab === "pr" ? " rtab--active" : ""}`}
            onClick={() => onSelectTab("pr")}
          >
            PR
            {/* O nome saiu da régua, e não do gosto: com `Verificações` as
                quatro abas não cabiam em 360px e a quarta ficava atrás de uma
                barra de rolagem — o pior lugar possível para o único aviso de
                que algo quebrou. Ver Q10. */}
            <span className={`rtab__count rtab__count--${prBadge.tone}`}>{prBadge.text}</span>
          </button>
        )}
        <span className="rp__spacer" />
        {actions}
        <button type="button" className="rp__icon" onClick={onReload} title="recarregar">
          ⟳<span className="sr-only">recarregar</span>
        </button>
        <button type="button" className="rp__icon" onClick={onClose} title="fechar a coluna">
          ›<span className="sr-only">fechar a coluna</span>
        </button>
      </div>

      <div className="rp__body">
        {children}
        <div className="rp__foot">
          <span>{footLeft}</span>
          <span className="rp__spacer" />
          <span>{footRight}</span>
        </div>
        {dock}
      </div>
    </aside>
  );
}
