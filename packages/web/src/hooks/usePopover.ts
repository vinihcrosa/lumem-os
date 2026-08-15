import { useCallback, useEffect, useRef, useState } from "react";

export interface Popover {
  open: boolean;
  toggle(): void;
  close(): void;
  /** Goes on the trigger, so focus has somewhere to return to. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  /** Goes on the panel, so a click inside it is not a click outside. */
  panelRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Open, closed, and the two ways out every dropdown owes the user.
 *
 * `Escape` because a menu that can only be dismissed with the mouse traps
 * anyone on a keyboard, and a click outside because that is what everything
 * else on the platform does. Focus goes back to the trigger on close: leaving
 * it on a button that no longer exists sends the next Tab to the top of the
 * document.
 */
export function usePopover(): Popover {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setOpen((wasOpen) => {
      if (wasOpen) triggerRef.current?.focus();
      return false;
    });
  }, []);

  const toggle = useCallback(() => setOpen((current) => !current), []);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      // The trigger closes through its own click handler; treating it as
      // "outside" here would close and reopen in the same gesture.
      if (panelRef.current?.contains(target) === true) return;
      if (triggerRef.current?.contains(target) === true) return;
      setOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, close]);

  return { open, toggle, close, triggerRef, panelRef };
}
