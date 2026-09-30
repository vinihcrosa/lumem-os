import { describe, expect, it } from "vitest";

import { DESKTOP_PLATFORMS, LUMEM_VERSION } from "@lumem/shared";

// `import` e não `readFileSync`: o vitest só rastreia o que é importado, e um arquivo lido por
// caminho fica invisível ao `--changed` (a armadilha do `constants.test.ts`).
import manifest from "../package.json" with { type: "json" };

import { isDesktopPlatform, platformManifest, tarballName } from "./packaging.js";

describe("o pacote npm de cada plataforma", () => {
  it("names the four packages, restricts each to its machine and pins the version", () => {
    const manifests = DESKTOP_PLATFORMS.map((platform) => platformManifest({ platform, version: "0.7.0" }));

    expect(manifests.map((m) => m["name"])).toEqual([
      "@vinihcrosa/lumem-desktop-darwin-arm64",
      "@vinihcrosa/lumem-desktop-darwin-x64",
      "@vinihcrosa/lumem-desktop-linux-x64",
      "@vinihcrosa/lumem-desktop-linux-arm64",
    ]);
    expect(manifests.map((m) => [m["os"], m["cpu"]])).toEqual([
      [["darwin"], ["arm64"]],
      [["darwin"], ["x64"]],
      [["linux"], ["x64"]],
      [["linux"], ["arm64"]],
    ]);
    expect(new Set(manifests.map((m) => m["version"]))).toEqual(new Set(["0.7.0"]));
    // Nenhum tem dependência: é o app pronto.
    for (const manifest of manifests) expect(manifest["dependencies"]).toBeUndefined();
  });

  it("carries what a scoped, provenance-signed publish needs", () => {
    // `--provenance` confere o `repository` contra o repositório que publica, um pacote com escopo
    // só é público com `publishConfig.access`, e o npm pede licença e página.
    for (const platform of DESKTOP_PLATFORMS) {
      const manifest = platformManifest({ platform, version: "0.7.0" });

      expect(manifest["license"], platform).toBe("MIT");
      expect(manifest["repository"], platform).toEqual({ type: "git", url: "git+https://github.com/vinihcrosa/lumem-os.git" });
      expect(manifest["homepage"], platform).toBe("https://github.com/vinihcrosa/lumem-os");
      expect(manifest["publishConfig"], platform).toEqual({ access: "public" });
      expect(manifest["description"], platform).toBe(
        `O app de barra do Lumem para ${platform}. Instale com \`lumem menubar install\`.`,
      );
    }
  });

  it("carries the .app as a zip on macOS, because npm drops symlinks, and the folder on Linux", () => {
    expect(platformManifest({ platform: "darwin-arm64", version: "0.7.0" })["files"]).toEqual(["Lumem.zip"]);
    expect(platformManifest({ platform: "linux-x64", version: "0.7.0" })["files"]).toEqual(["app", "icon.png"]);
  });

  it("knows the tarball npm writes, and rejects a platform that is not one of the four", () => {
    expect(tarballName("linux-arm64", "0.7.0")).toBe("vinihcrosa-lumem-desktop-linux-arm64-0.7.0.tgz");
    expect(isDesktopPlatform("darwin-x64")).toBe(true);
    expect(isDesktopPlatform("win32-x64")).toBe(false);
  });

  it("takes its version from the daemon's, which is what `version:set` keeps true", () => {
    // Os quatro pacotes saem na versão deste arquivo, e o CLI instala `<pacote>@<LUMEM_VERSION>`:
    // se os dois números divergissem, `lumem menubar install` pediria uma versão que não existe.
    expect(manifest.version).toBe(LUMEM_VERSION);
  });
});
