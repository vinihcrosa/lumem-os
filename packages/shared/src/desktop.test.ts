import { describe, expect, it } from "vitest";

import {
  DESKTOP_PLATFORMS,
  desktopDataDir,
  desktopPackageName,
  desktopPlatformOf,
  parseDesktopConfig,
} from "./desktop.js";

describe("as plataformas do app de desktop", () => {
  it("são as quatro que a porta 5 nomeia, e nada mais", () => {
    expect(DESKTOP_PLATFORMS.map(desktopPackageName)).toEqual([
      "@vinihcrosa/lumem-desktop-darwin-arm64",
      "@vinihcrosa/lumem-desktop-darwin-x64",
      "@vinihcrosa/lumem-desktop-linux-x64",
      "@vinihcrosa/lumem-desktop-linux-arm64",
    ]);
    expect(desktopPlatformOf("darwin", "arm64")).toBe("darwin-arm64");
    expect(desktopPlatformOf("linux", "arm64")).toBe("linux-arm64");
    expect(desktopPlatformOf("win32", "x64")).toBeNull();
    expect(desktopPlatformOf("linux", "ia32")).toBeNull();
  });
});

describe("desktopDataDir", () => {
  it("segue o `Application Support` no macOS e o `XDG_CONFIG_HOME` no Linux", () => {
    expect(desktopDataDir({ platform: "darwin", home: "/Users/a", env: {} })).toBe(
      "/Users/a/Library/Application Support/Lumem",
    );
    expect(desktopDataDir({ platform: "linux", home: "/home/a", env: {} })).toBe("/home/a/.config/Lumem");
    expect(desktopDataDir({ platform: "linux", home: "/home/a", env: { XDG_CONFIG_HOME: "/x" } })).toBe(
      "/x/Lumem",
    );
    // Variável vazia é variável ausente, como o resto do XDG trata.
    expect(desktopDataDir({ platform: "linux", home: "/home/a", env: { XDG_CONFIG_HOME: "" } })).toBe(
      "/home/a/.config/Lumem",
    );
  });
});

describe("parseDesktopConfig", () => {
  const good = { node: "/n", lumem: "/l", stateDir: "/s", origin: "http://127.0.0.1:4317" };

  it("aceita os quatro campos e descarta o que sobra", () => {
    expect(parseDesktopConfig({ ...good, extra: 1 })).toEqual(good);
  });

  it("guarda o `PATH` quando vem, e vale sem ele", () => {
    expect(parseDesktopConfig({ ...good, path: "/usr/bin" })).toEqual({ ...good, path: "/usr/bin" });
    expect(parseDesktopConfig({ ...good, path: "" })).toEqual(good);
  });

  it("recusa o que não é o arquivo do CLI", () => {
    expect(parseDesktopConfig(null)).toBeNull();
    expect(parseDesktopConfig("x")).toBeNull();
    expect(parseDesktopConfig({ ...good, node: "" })).toBeNull();
    expect(parseDesktopConfig({ ...good, origin: 4317 })).toBeNull();
    const { lumem: _dropped, ...withoutLumem } = good;
    expect(parseDesktopConfig(withoutLumem)).toBeNull();
  });
});
