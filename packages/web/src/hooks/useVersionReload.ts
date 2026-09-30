import { LUMEM_VERSION } from "@lumem/shared";
import { useCallback, useEffect, useState } from "react";

/**
 * A guarda de *"já recarreguei"*, por **aba**: `sessionStorage` não é compartilhado
 * entre abas, e é isso que se quer — cada aba tem o próprio bundle velho na memória.
 */
export const RELOADED_FOR_KEY = "lumem:reloaded-for";

export interface VersionReloadOptions {
  /** A versão que o daemon responde no `health`; `undefined` até ele responder. */
  served: string | undefined;
  /** A versão com que **esta página** foi construída. Só um teste muda. */
  bundled?: string;
  reload?: () => void;
}

/**
 * Recarrega a página uma vez quando o daemon trocou de versão debaixo dela (`038`,
 * Parte 2; AC 34 e 35), e diz a que versão ela chegou.
 *
 * Instalar e reiniciar são um gesto só, e é isto que fecha o gesto do lado da
 * página: o daemon novo serve o `index.html` novo e os assets novos, e a aba, que
 * ainda roda o JS velho, precisa trocá-lo. **Uma vez**: se depois do recarregamento
 * as versões ainda diferem (um cache que devolveu o bundle velho), recarregar de
 * novo é um laço sem saída, e a aba fica piscando.
 */
export function useVersionReload({
  served,
  bundled = LUMEM_VERSION,
  reload = () => {
    window.location.reload();
  },
}: VersionReloadOptions): { updatedTo: string | null; dismiss: () => void } {
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);

  useEffect(() => {
    if (served === undefined) return;
    const marker = readMarker();

    if (served === bundled) {
      // O recarregamento deu certo — ou nunca foi preciso. Só o primeiro caso tem o
      // que dizer, e é ele que limpa a guarda: a próxima atualização desta aba pode
      // recarregar de novo.
      if (marker === undefined || marker === null) return;
      writeMarker(null);
      setUpdatedTo(served);
      return;
    }

    // Diferem. Com a marca já posta, o recarregamento anterior não resolveu.
    if (marker !== null) return;
    // Sem onde lembrar, não há como não fazer um laço: a marca é gravada **antes** do
    // reload e, se não deu para gravar, não se recarrega.
    if (!writeMarker(served)) return;
    reload();
  }, [served, bundled, reload]);

  const dismiss = useCallback(() => {
    setUpdatedTo(null);
  }, []);

  return { updatedTo, dismiss };
}

/** `null` é *sem marca*; `undefined` é *não consegui ler* — e as duas não são a mesma coisa. */
function readMarker(): string | null | undefined {
  try {
    return window.sessionStorage.getItem(RELOADED_FOR_KEY);
  } catch {
    return undefined;
  }
}

/** `false` quando o armazenamento recusou. */
function writeMarker(value: string | null): boolean {
  try {
    if (value === null) window.sessionStorage.removeItem(RELOADED_FOR_KEY);
    else window.sessionStorage.setItem(RELOADED_FOR_KEY, value);
    return true;
  } catch {
    return false;
  }
}
