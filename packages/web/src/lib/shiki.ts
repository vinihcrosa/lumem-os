import type { ThemeRegistration } from "shiki";

import { color } from "../styles/tokens.js";

/**
 * The name the theme below is registered under.
 *
 * Exported because the CodeMirror bridge asks for a theme by name too, and two
 * places spelling a registry key by hand is one rename away from a file that
 * silently loses every colour.
 */
export const SHIKI_THEME = "lumem";

/**
 * The highlighter's palette, built from the same tokens as everything else.
 *
 * Same argument as `xterm-theme`: a highlighter with a palette of its own
 * fights the screen it sits in. Shiki wants a TextMate theme, so the domain
 * tokens are mapped onto scopes here — and the seven `syntax/*` tokens are all
 * this file is allowed to use.
 */
export const lumemShikiTheme: ThemeRegistration = {
  name: SHIKI_THEME,
  type: "dark",
  colors: {
    "editor.background": color["bg/inset"],
    "editor.foreground": color["text/code"],
  },
  settings: [
    { settings: { background: color["bg/inset"], foreground: color["text/code"] } },
    {
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: { foreground: color["syntax/comment"] },
    },
    {
      scope: ["string", "string.quoted", "constant.other.symbol", "meta.embedded.line"],
      settings: { foreground: color["syntax/string"] },
    },
    {
      scope: ["constant.numeric", "constant.language", "constant.character", "keyword.other.unit"],
      settings: { foreground: color["syntax/number"] },
    },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "keyword.control"],
      settings: { foreground: color["syntax/keyword"] },
    },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call", "variable.function"],
      settings: { foreground: color["syntax/function"] },
    },
    {
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class", "entity.other.inherited-class"],
      settings: { foreground: color["syntax/type"] },
    },
    {
      scope: ["punctuation", "meta.brace", "keyword.operator"],
      settings: { foreground: color["syntax/punctuation"] },
    },
    // Markdown and diff output travel through the same viewer.
    { scope: ["markup.heading", "entity.name.section"], settings: { foreground: color["syntax/keyword"] } },
    { scope: ["markup.inserted"], settings: { foreground: color["git/added"] } },
    { scope: ["markup.deleted"], settings: { foreground: color["git/removed"] } },
  ],
};

/**
 * Extension to grammar, for the languages a dev repository is actually made of.
 *
 * Deliberately short: every entry here is a grammar that can end up in the
 * bundle. Anything not on the list renders as plain text, which is a fine
 * answer and not an error (F3.3).
 */
const BY_EXTENSION: Readonly<Record<string, string>> = {
  ts: "typescript",
  tsx: "tsx",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  md: "markdown",
  css: "css",
  html: "html",
  yml: "yaml",
  yaml: "yaml",
  sh: "shellscript",
  bash: "shellscript",
  zsh: "shellscript",
  py: "python",
  sql: "sql",
  toml: "toml",
  diff: "diff",
  patch: "diff",
};

/**
 * The grammars this app can load, each behind its own dynamic import.
 *
 * Not `import("shiki/langs")`: that pulls the whole registry, and the build
 * turns it into 9 MB of chunks the daemon would have to serve. This list is
 * the bundle's real cost, so it is short on purpose — and adding to it is a
 * decision someone makes, not something a file extension does by itself.
 */
const GRAMMARS: Readonly<Record<string, () => Promise<unknown>>> = {
  typescript: () => import("shiki/langs/typescript.mjs"),
  tsx: () => import("shiki/langs/tsx.mjs"),
  javascript: () => import("shiki/langs/javascript.mjs"),
  jsx: () => import("shiki/langs/jsx.mjs"),
  json: () => import("shiki/langs/json.mjs"),
  markdown: () => import("shiki/langs/markdown.mjs"),
  css: () => import("shiki/langs/css.mjs"),
  html: () => import("shiki/langs/html.mjs"),
  yaml: () => import("shiki/langs/yaml.mjs"),
  shellscript: () => import("shiki/langs/shellscript.mjs"),
  python: () => import("shiki/langs/python.mjs"),
  sql: () => import("shiki/langs/sql.mjs"),
  toml: () => import("shiki/langs/toml.mjs"),
  diff: () => import("shiki/langs/diff.mjs"),
  docker: () => import("shiki/langs/docker.mjs"),
  make: () => import("shiki/langs/make.mjs"),
};

/** Files with no extension that are still worth colouring. */
const BY_NAME: Readonly<Record<string, string>> = {
  dockerfile: "docker",
  makefile: "make",
};

export function languageOf(path: string): string | null {
  const name = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
  if (name in BY_NAME) return BY_NAME[name]!;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return null;
  return BY_EXTENSION[name.slice(dot + 1)] ?? null;
}

type Highlighter = Awaited<ReturnType<typeof import("shiki").createHighlighterCore>>;

let highlighter: Highlighter | null = null;
const loaded = new Set<string>();

/**
 * Loads shiki and one grammar, on demand.
 *
 * `createHighlighterCore` with explicit imports, not `getSingletonHighlighter`:
 * the latter reaches for every grammar there is, which is megabytes of bundle
 * for a column that shows one file at a time.
 *
 * Returns the highlighter itself, because the editor's bridge needs to ask it
 * for tokens rather than for HTML (D1). Null means "render as plain text": no
 * grammar for this language, or shiki failed to load — neither is a column
 * that breaks.
 */
export async function loadHighlighter(language: string): Promise<Highlighter | null> {
  try {
    if (highlighter === null) {
      const [{ createHighlighterCore }, { createJavaScriptRegexEngine }] = await Promise.all([
        import("shiki/core"),
        import("shiki/engine/javascript"),
      ]);
      highlighter = await createHighlighterCore({
        themes: [lumemShikiTheme],
        langs: [],
        engine: createJavaScriptRegexEngine(),
      });
    }

    if (!loaded.has(language)) {
      const load = GRAMMARS[language];
      if (load === undefined) return null;
      const grammar = (await load()) as { default: Parameters<Highlighter["loadLanguage"]>[0] };
      await highlighter.loadLanguage(grammar.default);
      loaded.add(language);
    }

    return highlighter;
  } catch {
    return null;
  }
}

/** The patch viewer's path: whole snippet in, one string of markup per line out. */
export async function highlight(code: string, language: string): Promise<string[] | null> {
  const ready = await loadHighlighter(language);
  if (ready === null) return null;
  try {
    return splitLines(ready.codeToHtml(code, { lang: language, theme: SHIKI_THEME }));
  } catch {
    // A grammar that fails is a file rendered as plain text, not a column that
    // breaks. The viewer already has that path.
    return null;
  }
}

/**
 * Shiki returns one `<pre><code>` with a `<span class="line">` per line; the
 * viewer needs the lines apart so each can sit next to its number in the
 * gutter and wrap on its own.
 */
export function splitLines(html: string): string[] {
  const body = html.slice(html.indexOf("<code"), html.lastIndexOf("</code>"));
  const lines = body.split('<span class="line">').slice(1);
  return lines.map((line) => line.slice(0, line.lastIndexOf("</span>")));
}
