import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface ModalProps {
  open: boolean;
  /** `Esc`, o véu e o `✕` chamam este mesmo caminho. */
  onClose: () => void;
  title: string;
  /**
   * De onde a ação veio — `em ■ lumem-os`.
   *
   * O diálogo abriu de uma linha da árvore, e repetir a linha aqui é o que
   * dispensa um seletor lá dentro: a escolha já foi feita no gesto.
   */
  where?: ReactNode;
  /** O corpo e o rodapé — normalmente um `form` com `.modal__body` e `.modal__foot`. */
  children: ReactNode;
}

/** Tudo que recebe foco por `Tab`, na ordem em que o documento os apresenta. */
const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * O diálogo centrado, sobre um véu.
 *
 * `createPortal` e não `<dialog>` nativo: o `jsdom` deste repositório não
 * implementa `showModal`, então o caminho nativo trocaria um trap de foco que a
 * suíte confere por um que só existe no navegador — e o trap é justamente a
 * parte que ninguém percebe estar quebrada olhando a tela.
 *
 * O portal, esse é necessário: a sidebar tem 264px e `overflow: auto`, e um
 * diálogo renderizado lá dentro seria recortado pela coluna que o abriu.
 */
export function Modal({ open, onClose, title, where, children }: ModalProps) {
  const card = useRef<HTMLDivElement>(null);
  /**
   * Quem tinha o foco antes de abrir.
   *
   * Guardado num ref e não em estado: mudar estado aqui redesenharia o diálogo
   * no meio da abertura, e o que se quer guardar é justamente o que estava
   * fora dele.
   */
  const opener = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    opener.current = document.activeElement as HTMLElement | null;

    // O primeiro campo, e não o primeiro focável: o `✕` vem antes no documento,
    // e abrir um formulário com o foco no botão de fechar é abrir um formulário
    // pedindo para ser fechado.
    const first =
      card.current?.querySelector<HTMLElement>("input, textarea, select") ??
      card.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    return () => {
      // Devolve o foco a quem abriu — o `+` da linha, o `+` do cabeçalho.
      // Sem isto, fechar com `Esc` deixa o foco no `body` e quem navega por
      // teclado recomeça do topo da página.
      opener.current?.focus();
    };
  }, [open]);

  if (!open) return null;

  const focusables = (): HTMLElement[] =>
    Array.from(card.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    // O trap: sem ele o `Tab` sai do diálogo e vai visitar a árvore que o véu
    // cobre — alcançável por teclado, invisível para quem enxerga.
    const items = focusables();
    if (items.length === 0) return;

    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;

    if (event.shiftKey && (active === first || !card.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return createPortal(
    <div className="modal" onKeyDown={onKeyDown}>
      {/*
        O véu é irmão do cartão, e não pai dele: como pai, todo clique dentro do
        formulário subiria até aqui e fecharia o diálogo que a pessoa está
        preenchendo.
      */}
      <div className="modal__scrim" aria-hidden="true" onClick={onClose} />
      <div
        className="modal__card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        ref={card}
      >
        <div className="modal__head">
          <div className="modal__head-b">
            <h2 className="modal__title" id={titleId}>
              {title}
            </h2>
            {where !== undefined && <p className="modal__where">{where}</p>}
          </div>
          <button type="button" className="modal__close" aria-label="fechar" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A promessa de que `Esc` fecha, escrita no rodapé do diálogo.
 *
 * Uma promessa escrita é mais barata que uma descoberta: quem não sabe que a
 * tecla existe fecha no `✕` para sempre.
 */
export function ModalEsc() {
  return (
    <span className="modal__esc">
      <kbd className="kbd">Esc</kbd> fecha
    </span>
  );
}
