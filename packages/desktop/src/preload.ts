import { contextBridge, ipcRenderer } from "electron";

/**
 * O único ponto de contato entre uma página e o processo principal.
 *
 * `contextIsolation` e `sandbox` ligados quer dizer que a página não vê `require`,
 * `process` nem o `ipcRenderer`: só o que está exposto aqui — e o processo principal
 * ainda confere **de onde** vem o pedido, porque este preload vai em toda janela.
 */
contextBridge.exposeInMainWorld("lumemDesktop", {
  /** `Iniciar` da página `Lumem parado`. @returns se o daemon subiu. */
  start: (): Promise<boolean> => ipcRenderer.invoke("lumem:start") as Promise<boolean>,
});
