import { DESKTOP_PLATFORMS, desktopPackageName, type DesktopPlatform } from "@lumem/shared";

/**
 * O `package.json` do pacote npm de uma plataforma (`038`, porta 5).
 *
 * O pacote é o app **pronto**, sem dependência nenhuma: `os` e `cpu` fazem o npm recusar
 * instalá-lo na máquina errada, e `files` diz o que viaja. No macOS é um zip, e não o
 * `.app`: o npm descarta symlink, e um `.app` vive de symlinks (`Electron Framework`,
 * `Versions/Current`) — sem eles a assinatura não confere e o app não abre.
 */
export function platformManifest({
  platform,
  version,
}: {
  platform: DesktopPlatform;
  version: string;
}): Record<string, unknown> {
  const [os, cpu] = platform.split("-") as [string, string];
  return {
    name: desktopPackageName(platform),
    version,
    description: `O app de barra do Lumem para ${platform}. Instale com \`lumem menubar install\`.`,
    license: "MIT",
    repository: { type: "git", url: "git+https://github.com/vinihcrosa/lumem-os.git" },
    homepage: "https://github.com/vinihcrosa/lumem-os",
    os: [os],
    cpu: [cpu],
    files: os === "darwin" ? ["Lumem.zip"] : ["app", "icon.png"],
    publishConfig: { access: "public" },
  };
}

export function isDesktopPlatform(value: string): value is DesktopPlatform {
  return DESKTOP_PLATFORMS.some((known) => known === value);
}

/** O nome do arquivo que `npm pack` escreve para o pacote de uma plataforma. */
export function tarballName(platform: DesktopPlatform, version: string): string {
  return `vinihcrosa-lumem-desktop-${platform}-${version}.tgz`;
}
