/**
 * O que o CLI e o app de desktop dividem (`038` Parte 4): quais plataformas o app
 * existe, como os pacotes se chamam e o arquivo que o CLI deixa para o app ler.
 *
 * Mora aqui pelo mesmo motivo de o `update.ts` morar: o CLI, o app e o script de
 * empacotamento são pacotes que não se importam, e duas cópias do nome
 * `@vinihcrosa/lumem-desktop-<plataforma>` seriam duas portas de mão única
 * (porta 5) que podem discordar. Sem `node:` de propósito: o `shared` também vai
 * para o bundle da web.
 */

/** As quatro plataformas do app, na forma `<process.platform>-<process.arch>`. */
export const DESKTOP_PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-x64", "linux-arm64"] as const;
export type DesktopPlatform = (typeof DESKTOP_PLATFORMS)[number];

/** O nome do app, que também é o nome da pasta de dados dele. */
export const DESKTOP_APP_NAME = "Lumem";

/** O arquivo que `lumem menubar install` escreve na pasta de dados do app (porta 9). */
export const DESKTOP_CONFIG_FILE = "lumem-desktop.json";

/** `null` quando a máquina não é uma das quatro. */
export function desktopPlatformOf(platform: string, arch: string): DesktopPlatform | null {
  const key = `${platform}-${arch}`;
  return DESKTOP_PLATFORMS.find((known) => known === key) ?? null;
}

/** Porta 5: `@vinihcrosa/lumem-desktop-darwin-arm64` e as outras três. */
export function desktopPackageName(platform: DesktopPlatform): string {
  return `@vinihcrosa/lumem-desktop-${platform}`;
}

/**
 * O que o app precisa saber e não consegue descobrir sozinho (porta 9).
 *
 * `node` e `lumem` são absolutos porque um app aberto pelo Finder ou pelo autostart
 * não herda o `PATH` do terminal — o mesmo motivo de o `PATH` estar gravado no plist.
 */
export interface DesktopConfig {
  node: string;
  lumem: string;
  stateDir: string;
  origin: string;
  /**
   * O `PATH` de quem rodou `lumem menubar install`. O `Iniciar` do app roda `lumem start`,
   * que grava o `PATH` **de quem chamou** no arquivo de serviço — e o de um app aberto pelo
   * Finder é `/usr/bin:/bin`, com o qual o daemon não acharia `claude` nem `git`.
   */
  path?: string;
}

/** `null` quando o que veio não é o arquivo que o CLI escreve. */
export function parseDesktopConfig(raw: unknown): DesktopConfig | null {
  if (typeof raw !== "object" || raw === null) return null;
  const { node, lumem, stateDir, origin, path } = raw as Record<string, unknown>;
  for (const field of [node, lumem, stateDir, origin]) {
    if (typeof field !== "string" || field === "") return null;
  }
  const config = { node, lumem, stateDir, origin } as DesktopConfig;
  // Opcional: um arquivo de antes do campo continua valendo.
  return typeof path === "string" && path !== "" ? { ...config, path } : config;
}

/**
 * A pasta de dados do app: onde mora o `lumem-desktop.json`, e onde o Electron
 * guarda o que é dele.
 *
 * Calculada aqui, e não pedida ao `app.getPath("userData")`, porque quem escreve o
 * arquivo é o CLI, que não tem Electron — e duas contas para o mesmo caminho é como
 * um instala e o outro lê em outro lugar. O app faz `setPath("userData", …)` com o
 * resultado desta função.
 */
export function desktopDataDir({
  platform,
  home,
  env,
}: {
  platform: string;
  home: string;
  env: { XDG_CONFIG_HOME?: string | undefined };
}): string {
  if (platform === "darwin") return `${home}/Library/Application Support/${DESKTOP_APP_NAME}`;
  const config = env.XDG_CONFIG_HOME;
  return `${config !== undefined && config !== "" ? config : `${home}/.config`}/${DESKTOP_APP_NAME}`;
}
