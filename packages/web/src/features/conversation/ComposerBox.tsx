import type { ReactNode } from "react";

import type { AcpCommand } from "@lumem/shared";

import { SlashMenu, slashQuery } from "./SlashMenu.js";

/**
 * A caixa do compositor (`033` T15): o textarea, as teclas, o menu de `/` e a
 * faixa de baixo. Quem a usa é dono do texto e decide o que um envio faz — a
 * conversa manda um turno, o rascunho abre a sessão, o modal cria a worktree.
 *
 * Uma caixa só, e não três cópias com as mesmas classes: as teclas e o menu são
 * o que a pessoa aprende numa e espera na outra, e cópia é o que diverge sem
 * ninguém ver.
 */

export interface ComposerBoxProps {
  value: string;
  onChange(text: string): void;
  /**
   * Enter sem ⇧ e fora de um IME. A caixa não julga se dá para mandar — cada
   * dono tem a própria regra, e duas cópias dela discordariam.
   */
  onSubmit(): void;
  /** Os comandos do agente. Sem nenhum, o menu de `/` não aparece. */
  commands: readonly AcpCommand[];
  placeholder: string;
  disabled?: boolean;
  /** O nome do campo para leitor de tela. */
  label?: string;
  /** Classe a mais na caixa, para quem a põe fora da conversa. */
  className?: string;
  /** Classe a mais no textarea. */
  inputClassName?: string;
  /** Marca o textarea como o foco inicial de um `Modal` (`data-modal-focus`). */
  modalFocus?: boolean;
  /** O slot da faixa, à esquerda: as pílulas. */
  children?: ReactNode;
  /** À direita da faixa, depois do espaçador: o botão de enviar. */
  action?: ReactNode;
}

export function ComposerBox({
  value,
  onChange,
  onSubmit,
  commands,
  placeholder,
  disabled = false,
  label = "mensagem para o agente",
  className,
  inputClassName,
  modalFocus = false,
  children,
  action,
}: ComposerBoxProps) {
  // Null unless the draft is a lone `/word` at the very start: a `/` inside a
  // sentence is a path, and offering a command menu over `src/lore` would be the
  // interface arguing with what is being typed.
  const query = slashQuery(value);

  return (
    <div className={`composer__box${className === undefined ? "" : ` ${className}`}`}>
      {/*
        Above the box, anchored to it. The list is the agent's own (F2.8), and
        choosing inserts rather than sends: a command may take an argument, and
        firing on selection would send `/compact` when the user meant
        `/compact até o último commit`.
      */}
      {query !== null && (
        <SlashMenu commands={commands} query={query} onChoose={onChange} onDismiss={() => onChange("")} />
      )}
      <textarea
        className={`composer__in${inputClassName === undefined ? "" : ` ${inputClassName}`}${value === "" ? " composer__in--empty" : ""}`}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={label}
        data-modal-focus={modalFocus ? "" : undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;

          /*
           * Enter sends. ⇧⏎ makes a newline.
           *
           * This reverses the earlier rule — ⌘⏎ to send, Enter for a newline —
           * which was chosen because a prompt is often several lines. It is a
           * product decision, and it was made again the other way: Enter is
           * what everyone's fingers already do in a chat box, and the cost is
           * that a multi-line prompt needs a modifier instead of not needing
           * one. ⌘⏎ keeps working, so nothing anyone learned stopped working.
           *
           * The slash menu never gets here: it listens on the window in the
           * capture phase and stops the event, so Enter with the menu open
           * chooses a command instead of sending.
           */
          if (event.shiftKey) return;

          // An IME uses Enter to accept a candidate. Sending there would cut
          // the word being typed in half and fire the turn.
          if (event.nativeEvent.isComposing) return;

          event.preventDefault();
          onSubmit();
        }}
      />
      <div className="composer__bar">
        {children}
        {action !== undefined && (
          <>
            <span className="spacer" />
            {action}
          </>
        )}
      </div>
    </div>
  );
}
