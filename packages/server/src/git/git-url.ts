/**
 * Turning a pasted string into a git address the daemon is willing to run.
 *
 * This module executes nothing and touches no disk. That is deliberate: §4.1 of
 * the PRD makes refusing `ext::` the one part of the feature that, if it comes
 * out wrong, comes out as arbitrary command execution. It is written alone and
 * tested alone, before anything exists to call it.
 *
 * The list is an **allowlist**. `git` accepts `<transport>::<address>` as a
 * remote helper — `ext::sh -c id` runs a shell — so a blocklist would be wrong
 * by omission, and omission here is the whole vulnerability.
 */

/** The transports the daemon is willing to speak, D1. */
export type GitUrlScheme = "https" | "http" | "ssh" | "file";

const ALLOWED = new Set<GitUrlScheme>(["https", "http", "ssh", "file"]);

export interface GitUrl {
  scheme: GitUrlScheme;
  /** Without credentials. Safe to store, to log and to show. */
  href: string;
  /** Empty for `file`. */
  host: string;
  /** The repository's path, without a leading slash. */
  path: string;
  /** No TLS: the UI has to say so out loud ([Q10](open-questions)). */
  insecure: boolean;
  /** The `user@host:path` shorthand, which is ssh spelled without a scheme. */
  scp: boolean;
}

/** Which of the rules in §4.1 refused, so the message can name it (F6.2). */
export type GitUrlRule = "empty" | "scheme" | "control-chars" | "leading-dash" | "host" | "path";

export type ParsedGitUrl =
  | {
      ok: true;
      url: GitUrl;
      /**
       * What to hand `git clone` — credentials intact, if the user pasted any.
       *
       * Never stored, never logged, never shown. `url.href` is the one that
       * travels; this one only reaches the argv of a single process.
       */
      raw: string;
    }
  | { ok: false; rule: GitUrlRule; message: string };

/** `<transport>::<address>`, which is how a remote helper is invoked. */
const HELPER = /^([A-Za-z][A-Za-z0-9+.-]*)::/;
const SCHEME = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//;
/** NUL through US, plus DEL. Written as escapes so nobody has to trust bytes. */
const CONTROL = /[\u0000-\u001f\u007f]/;

function refuse(rule: GitUrlRule, message: string): ParsedGitUrl {
  return { ok: false, rule, message };
}

/**
 * The message for a scheme that is not on the list.
 *
 * `git://` gets its own sentence because it is the only refusal a user could
 * reasonably have expected to work — the others are either typos or attacks.
 */
function refuseScheme(scheme: string): ParsedGitUrl {
  if (scheme === "git") {
    return refuse(
      "scheme",
      "o transporte git:// não é aceito: ele não autentica nem verifica integridade — use a URL https ou ssh do mesmo repositório",
    );
  }
  return refuse(
    "scheme",
    `o transporte "${scheme}" não está na lista de transportes aceitos (https, http, ssh, file)`,
  );
}

export function parseGitUrl(input: string): ParsedGitUrl {
  const raw = input.trim();
  if (raw === "") return refuse("empty", "informe a URL do repositório");

  // Before anything reads it as an address: a newline splits an argument in
  // half for anything that ever writes this to a file or a config.
  if (CONTROL.test(raw)) {
    return refuse("control-chars", "a URL tem caracteres de controle");
  }
  // `--upload-pack=<cmd>` is command execution too, and it starts with a dash.
  // The `--` in the argv (§4.1) says the same thing a second time on purpose.
  if (raw.startsWith("-")) {
    return refuse("leading-dash", "a URL não pode começar com '-'");
  }

  const helper = HELPER.exec(raw);
  if (helper) return refuseScheme(helper[1]!.toLowerCase());

  const scheme = SCHEME.exec(raw);
  if (scheme) return parseWithScheme(raw, scheme[1]!.toLowerCase());
  if (isScp(raw)) return parseScp(raw);

  return refuse(
    "scheme",
    "não reconheci isto como URL git: use https://, ssh://, file:// ou a forma git@host:org/repo.git",
  );
}

/**
 * Where the host ends and the repository path begins, in the scp shorthand.
 *
 * The colon that matters is the one **after** the `@`, not the first one in the
 * string: `git:senha@host:org/repo.git` would otherwise split at `git:` and
 * carry the password along inside what it thinks is the path — which is how a
 * secret survives a redactor that looks correct.
 */
function scpColon(raw: string): number {
  const at = raw.indexOf("@");
  return raw.indexOf(":", at === -1 ? 0 : at + 1);
}

/**
 * `user@host:path`, the shorthand git reads as ssh.
 *
 * The rule is git's own: a colon before the first slash. `./a:b` is a path and
 * `https://…` was already consumed by the caller.
 */
function isScp(raw: string): boolean {
  const colon = scpColon(raw);
  if (colon <= 0) return false;
  const slash = raw.indexOf("/");
  return slash === -1 || colon < slash;
}

function parseWithScheme(raw: string, scheme: string): ParsedGitUrl {
  if (!ALLOWED.has(scheme as GitUrlScheme)) return refuseScheme(scheme);

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return refuse("host", `não consegui ler ${raw} como URL`);
  }

  // `file:///caminho` is the one form whose authority is legitimately empty.
  if (scheme === "file") return parseFile(raw, parsed);

  // On the spelling, not on `parsed`, because the WHATWG parser does not agree
  // with git here: given `https:///org/repo.git` it collapses the empty
  // authority and reads `org` as the host, while git reads no host at all and
  // fails. U3 exists to close exactly this kind of divergence.
  if (parsed.hostname === "" || raw.slice(scheme.length + "://".length).startsWith("/")) {
    return refuse("host", "a URL não tem host");
  }
  const path = parsed.pathname.replace(/^\/+/, "");
  if (path === "") {
    return refuse("path", "a URL não diz qual repositório");
  }

  const sanitized = new URL(raw);
  sanitized.username = "";
  sanitized.password = "";

  return {
    ok: true,
    raw,
    url: {
      scheme: scheme as GitUrlScheme,
      href: sanitized.href,
      host: parsed.host,
      path,
      insecure: scheme === "http",
      scp: false,
    },
  };
}

/**
 * `file:///caminho`.
 *
 * The host has to be empty: `file://servidor/x` means something different on
 * every platform, and `git` would read what is left as a relative path — which
 * is exactly the ambiguity U3 exists to close.
 */
function parseFile(raw: string, parsed: URL): ParsedGitUrl {
  if (parsed.hostname !== "" && parsed.hostname !== "localhost") {
    return refuse("host", "file:// com host não é aceito; use file:///caminho/absoluto");
  }
  const path = decodeURIComponent(parsed.pathname);
  if (!path.startsWith("/")) {
    return refuse("path", "o caminho de um file:// precisa ser absoluto");
  }
  return {
    ok: true,
    raw,
    url: { scheme: "file", href: `file://${parsed.pathname}`, host: "", path, insecure: false, scp: false },
  };
}

function parseScp(raw: string): ParsedGitUrl {
  const colon = scpColon(raw);
  const authority = raw.slice(0, colon);
  const path = raw.slice(colon + 1);

  const at = authority.lastIndexOf("@");
  const user = at === -1 ? "" : authority.slice(0, at);
  const host = authority.slice(at + 1);

  if (host === "") return refuse("host", "a URL não tem host");
  if (path === "") return refuse("path", "a URL não diz qual repositório");

  // A password in the scp form is not something git supports, but it is
  // something a person can type. Drop it the same way it is dropped elsewhere:
  // the username survives because `git@` is part of the address, not a secret.
  const cleanUser = user.includes(":") ? user.slice(0, user.indexOf(":")) : user;
  const prefix = cleanUser === "" ? "" : `${cleanUser}@`;

  return {
    ok: true,
    raw,
    url: {
      scheme: "ssh",
      href: `${prefix}${host}:${path}`,
      host,
      path: path.replace(/^\/+/, ""),
      insecure: false,
      scp: true,
    },
  };
}

/**
 * The same address with any credential removed.
 *
 * Idempotent, because it runs on the boundary of three different things — what
 * is stored, what is logged, what is shown — and one of them will eventually
 * hand it something that already went through here.
 *
 * A string this cannot parse comes back unchanged: this is a redactor, not a
 * validator, and refusing here would tempt a caller to skip it.
 */
export function sanitizeGitUrl(input: string): string {
  const parsed = parseGitUrl(input);
  return parsed.ok ? parsed.url.href : stripUserinfo(input);
}

/** Last resort for a string `parseGitUrl` refused: cut anything before an `@`. */
function stripUserinfo(input: string): string {
  return input.replace(/^([A-Za-z][A-Za-z0-9+.-]*:\/\/)[^/@]*@/, "$1");
}

/**
 * The ssh spelling of an https address, F6.10.
 *
 * This is the way out the daemon offers when authentication fails: the person
 * almost certainly has a key in their agent, and retyping the URL by hand is
 * the friction that sends them to the terminal.
 *
 * Null when there is nothing to offer — an address that is already ssh, or a
 * `file://` that has no ssh form at all.
 */
export function toSshForm(url: GitUrl): string | null {
  if (url.scheme !== "https" && url.scheme !== "http") return null;

  const [host, port] = splitPort(url.host);
  // The scp shorthand cannot carry a port, so a non-default one has to be
  // spelled the long way instead of being silently dropped.
  if (port !== null) return `ssh://git@${host}:${port}/${url.path}`;
  return `git@${host}:${url.path}`;
}

function splitPort(host: string): [string, string | null] {
  const colon = host.lastIndexOf(":");
  if (colon === -1) return [host, null];
  return [host.slice(0, colon), host.slice(colon + 1)];
}

/**
 * What the repository calls itself: the last segment, without `.git`.
 *
 * Only the trailing one is stripped — `github.com/org/dot.git.io` is a real
 * name, and a global replace would rename it.
 */
export function repoNameOf(url: GitUrl): string {
  const segments = url.path.split("/").filter((segment) => segment !== "");
  const last = segments.at(-1) ?? "";
  return last.endsWith(".git") ? last.slice(0, -".git".length) : last;
}
