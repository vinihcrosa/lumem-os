import { useEffect, useRef, type ReactNode } from "react";

export interface ModalProps {
  open: boolean;
  /** Names the dialog, and is what `aria-labelledby` points at. */
  title: string;
  /**
   * Where the action came from — `em ■ lumem-os`, `no workspace ◈ pessoal`.
   *
   * In the header rather than as a field, because it is not a choice: the
   * dialog opened from a row of the tree and it repeats which one. A selector
   * inside would be asking again for something already answered by the gesture.
   */
  where?: ReactNode;
  onClose: () => void;
  /**
   * Whether the three ways out are open, Q5a.
   *
   * False while a clone this dialog started is still running: with the footer
   * host gone, closing would be the only way to lose the progress from sight.
   * The `✕` stays on screen and goes grey — a button that disappears is a
   * button that gets looked for — and `reason` says why, in place of the
   * keyboard promise the footer makes the rest of the time.
   */
  dismissible?: boolean;
  /** Why it will not close. Required in spirit whenever `dismissible` is false. */
  reason?: string;
  /** The buttons. Laid out by the modal so every dialog puts them in one order. */
  footer?: ReactNode;
  children: ReactNode;
}

/** What `Tab` can land on. Ordered as the DOM orders it. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A dialog in the middle of the screen, over a veil.
 *
 * The design system had no such thing: both dialogs of the day are a `Card` in
 * the flow, expanding in place. That works when the trigger is a full-width
 * button in a panel; it does not when the trigger is a 24px `+` on a tree row,
 * because expanding in place would squeeze a form with a URL field, an echoed
 * plan and a progress bar into a 264px column.
 *
 * It renders inline rather than through a portal. Nothing above it in the app
 * clips or stacks — `position: fixed` and one `z-index` are enough, and a
 * portal would cost the tests a container they have to go find.
 */
export function Modal({
  open,
  title,
  where,
  onClose,
  dismissible = true,
  reason,
  footer,
  children,
}: ModalProps) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  /**
   * Who to give focus back to.
   *
   * Read from the document instead of taken as a prop: the caller would have to
   * thread a ref through the tree to the `+` that opened it, and there is one
   * per project row. What opened the dialog is whatever had focus when it
   * opened, which is the same answer with nobody to forget it.
   */
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    opener.current = document.activeElement as HTMLElement | null;
    /*
     * O campo, pronto para digitar. `autoFocus` no input competiria com isto e
     * ganharia ou perderia conforme a ordem de render.
     *
     * `[data-modal-focus]` primeiro, e o primeiro focável depois. O corpo de um
     * diálogo não é mais só um formulário: desde a
     * [`026-worktree-from`](../../../../docs/features/026-worktree-from/prd.md) o
     * de criar worktree começa por um trilho de origem, e "o primeiro focável"
     * passou a ser um botão de aba. O foco tem que cair onde a pessoa vai
     * digitar — a origem é opcional, o nome não —, e foi o e2e da
     * `sidebar-actions` que cobrou isso, não uma revisão.
     */
    const card = cardRef.current;
    const preferred = card?.querySelector<HTMLElement>("[data-modal-focus]");
    (preferred ?? card?.querySelector<HTMLElement>(FOCUSABLE))?.focus();

    return () => {
      opener.current?.focus();
      opener.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        if (!dismissible) return;
        event.preventDefault();
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      // The trap. Without it `Tab` walks out of the dialog into a sidebar the
      // veil says is not there, and the next `Enter` presses something behind
      // the screen.
      const focusable = [...(cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      const active = document.activeElement;

      if (event.shiftKey && (active === first || !cardRef.current?.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, dismissible, onClose]);

  if (!open) return null;

  const titleId = `modal-title-${title.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <div className="modal">
      {/*
        Sibling of the card, not its parent: clicking the veil closes, and a
        card nested inside it would inherit that click target — every press on
        a field would be a press on "dismiss".
      */}
      <div
        className="modal__scrim"
        aria-hidden="true"
        onClick={dismissible ? onClose : undefined}
      />
      <div
        className="modal__card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="modal__head">
          <div className="modal__head-b">
            <h3 className="modal__t" id={titleId}>
              {title}
            </h3>
            {where !== undefined && <p className="modal__where">{where}</p>}
          </div>
        </div>

        <div className="modal__body">{children}</div>

        <div className="modal__foot">
          {footer}
          {/*
            The keyboard promise, and the one moment it is withdrawn.

            Saying `Esc fecha` while `Esc` does nothing is worse than saying
            nothing: whoever presses it and sees no result presses it again,
            harder.
          */}
          <span className={dismissible ? "modal__esc" : "modal__esc modal__esc--held"}>
            {dismissible ? (
              <>
                <span className="kbd">Esc</span> fecha
              </>
            ) : (
              <>
                <span className="kbd">Esc</span> {reason ?? "não fecha agora"}
              </>
            )}
          </span>
        </div>

        {/*
          Desenhado no cabeçalho, escrito por último.

          A ordem do `Tab` é a ordem do DOM, e o contrato da seção 8 do
          protótipo põe o `✕` no fim do anel: campo → confirmar → cancelar →
          `✕`. Escrito no cabeçalho ele seria o PRIMEIRO, e o foco de abertura
          cairia nele em vez de no campo — o modal abriria com o cursor em
          "fechar".
        */}
        <button
          type="button"
          className="modal__close"
          aria-label="fechar"
          disabled={!dismissible}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
