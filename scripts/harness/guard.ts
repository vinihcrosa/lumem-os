/**
 * The guard: one `PreToolUse` hook that reads the whole command before it runs
 * (T18 of docs/features/024-dev-harness/tasks.md).
 *
 * The `deny` floor in `.claude/settings.json` matches text, and text has many
 * spellings: `git push origin +main` forces without matching
 * `Bash(git push --force *)`, and `HUSKY=0 git commit` disables every git hook
 * without any `--no-verify` to match. This file parses the command instead.
 * [Q11](../../docs/features/024-dev-harness/open-questions.md) made the floor and
 * the guard two layers on purpose: the floor still holds on the day this script
 * breaks, and on that day the guard **refuses** rather than letting everything
 * through.
 *
 * Run by `node --experimental-strip-types`, not `tsx`: it fires on every Bash and
 * every file write, and the two cost 84 ms and 576 ms per call on the machine
 * where this was measured. That is why it imports nothing but `node:` — native
 * type stripping resolves only erasable syntax and explicit extensions.
 *
 * Measured on 2026-09-28 (T0, `docs/project/harness-audit.md` §11): a project
 * `PreToolUse` fires in `bypassPermissions`, on Claude Code and on the
 * `claude-agent-acp` the conveyor starts, and it fires even for a call the
 * `deny` floor then refuses.
 */
import { execFileSync } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

export interface HookInput {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

export type Verdict = { allow: true } | { allow: false; reason: string };

/** What the guard needs to know about the world, injectable for the tests. */
export interface GuardContext {
  /** The checkout the session belongs to. Writes outside it are refused. */
  projectDir: string;
  home: string;
  /** Directories any write may go to besides the checkout. */
  writableRoots: readonly string[];
  currentBranch: (cwd: string) => string | null;
  hasUncommittedChanges: (cwd: string) => boolean;
}

const PROTECTED_BRANCHES = new Set(["main", "master"]);

const ALLOW: Verdict = { allow: true };

function refuse(reason: string): Verdict {
  return { allow: false, reason };
}

// ---------------------------------------------------------------------------
// Shell parsing — enough of it, and failing closed where it is not enough.

export class UnparseableCommand extends Error {}

/**
 * Splits a command line into simple commands, each a list of words.
 *
 * Handles quotes, backslash escapes, heredocs, and the operators that start a
 * new command (`;`, `&&`, `||`, `|`, `&`, newline). What it does not understand
 * — a command substitution, a backtick, an unterminated quote or heredoc —
 * throws, and the caller refuses: a guard that guesses is a guard with a hole
 * in it.
 */
export function splitCommands(line: string): string[][] {
  return parse(line).commands;
}

interface Parsed {
  commands: string[][];
  /** Heredoc bodies, by the index of the command they feed. */
  heredocs: Map<number, string[]>;
  /** The text inside every `$(…)` and backtick, checked as command lines of their own. */
  substitutions: string[];
}

/**
 * What a `$(…)` becomes inside a word. The command inside is checked on its own;
 * the word it lands in has a value the guard cannot know, and that only matters
 * when the word is an argument of a command the guard watches.
 */
export const SUBSTITUTION = "\u0000$()";

/** The text of a `$(…)` starting at `start` (the `$`), and the index after it. */
function readDollarParen(line: string, start: number): { inner: string; end: number } {
  let depth = 0;
  let j = start + 1;
  while (j < line.length) {
    const c = line[j];
    // A heredoc inside the substitution: its body is text, and a `)` in it —
    // "a) the first point" in a commit message — is not the end.
    if (c === "<" && line[j + 1] === "<" && line[j + 2] !== "<") {
      const head = /^<<-?\s*(['"]?)([A-Za-z0-9_.-]+)\1/.exec(line.slice(j));
      if (head !== null) {
        const delimiter = head[2] as string;
        const bodyStart = line.indexOf("\n", j);
        if (bodyStart === -1) throw new UnparseableCommand("heredoc sem corpo");
        let k = bodyStart + 1;
        for (;;) {
          if (k >= line.length) throw new UnparseableCommand(`heredoc sem o terminador \`${delimiter}\``);
          const newline = line.indexOf("\n", k);
          const raw = newline === -1 ? line.slice(k) : line.slice(k, newline);
          k = newline === -1 ? line.length : newline + 1;
          if (raw.replace(/^\t+/, "") === delimiter) break;
        }
        j = k;
        continue;
      }
    }
    if (c === "'") {
      const close = line.indexOf("'", j + 1);
      if (close === -1) throw new UnparseableCommand("aspas simples sem fechar");
      j = close + 1;
      continue;
    }
    if (c === "\\") {
      j += 2;
      continue;
    }
    if (c === "(") depth += 1;
    if (c === ")") {
      depth -= 1;
      if (depth === 0) return { inner: line.slice(start + 2, j), end: j + 1 };
    }
    j += 1;
  }
  throw new UnparseableCommand("substituição de comando sem fechar");
}

/**
 * `$((…))` is arithmetic, not a command. Its text is not run — only the command
 * substitutions nested in it are, and those are returned to be checked.
 */
function nestedSubstitutions(text: string): string[] {
  const found: string[] = [];
  for (let k = 0; k < text.length; k += 1) {
    if (text[k] === "$" && text[k + 1] === "(" && text[k + 2] !== "(") {
      const sub = readDollarParen(text, k);
      found.push(sub.inner);
      k = sub.end - 1;
    }
  }
  return found;
}

/** The text of a backtick substitution starting at `start`, and the index after it. */
function readBacktick(line: string, start: number): { inner: string; end: number } {
  let j = start + 1;
  while (j < line.length && line[j] !== "`") j += line[j] === "\\" ? 2 : 1;
  if (j >= line.length) throw new UnparseableCommand("crase sem fechar");
  return { inner: line.slice(start + 1, j), end: j + 1 };
}

/**
 * The heredoc was found by the guard refusing its own author: a `<<'PY'` body is
 * literal text, and reading it as shell made a backtick in it look like command
 * substitution. A quoted delimiter is literal; an unquoted one still expands, so
 * its body is held to the same rule as the rest of the line.
 */
function parse(line: string): Parsed {
  const commands: string[][] = [];
  const heredocs = new Map<number, string[]>();
  const substitutions: string[] = [];
  const pending: { delimiter: string; stripTabs: boolean; quoted: boolean }[] = [];
  let words: string[] = [];
  let word = "";
  let inWord = false;
  let i = 0;

  const endWord = () => {
    if (inWord) words.push(word);
    word = "";
    inWord = false;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands.push(words);
    words = [];
  };
  const readHeredocBodies = () => {
    const owner = commands.length - 1;
    for (const doc of pending) {
      const lines: string[] = [];
      for (;;) {
        if (i >= line.length) throw new UnparseableCommand(`heredoc sem o terminador \`${doc.delimiter}\``);
        const newline = line.indexOf("\n", i);
        const raw = newline === -1 ? line.slice(i) : line.slice(i, newline);
        i = newline === -1 ? line.length : newline + 1;
        const candidate = doc.stripTabs ? raw.replace(/^\t+/, "") : raw;
        if (candidate === doc.delimiter) break;
        if (!doc.quoted && (raw.includes("`") || raw.includes("$("))) {
          throw new UnparseableCommand("substituição de comando num heredoc sem aspas no delimitador");
        }
        lines.push(raw);
      }
      heredocs.set(owner, [...(heredocs.get(owner) ?? []), lines.join("\n")]);
    }
    pending.length = 0;
  };

  while (i < line.length) {
    const c = line[i] as string;
    if (c === "<" && line[i + 1] === "<" && line[i + 2] !== "<") {
      endWord();
      let j = i + 2;
      const stripTabs = line[j] === "-";
      if (stripTabs) j += 1;
      while (line[j] === " " || line[j] === "\t") j += 1;
      let delimiter = "";
      let quoted = false;
      const quote = line[j];
      if (quote === "'" || quote === '"') {
        const close = line.indexOf(quote, j + 1);
        if (close === -1) throw new UnparseableCommand("delimitador de heredoc sem fechar");
        delimiter = line.slice(j + 1, close);
        quoted = true;
        j = close + 1;
      } else {
        if (quote === "\\") {
          quoted = true;
          j += 1;
        }
        while (j < line.length && /[A-Za-z0-9_.-]/.test(line[j] as string)) {
          delimiter += line[j];
          j += 1;
        }
      }
      if (delimiter === "") throw new UnparseableCommand("heredoc sem delimitador");
      pending.push({ delimiter, stripTabs, quoted });
      i = j;
      continue;
    }
    if (c === "'") {
      const close = line.indexOf("'", i + 1);
      if (close === -1) throw new UnparseableCommand("aspas simples sem fechar");
      word += line.slice(i + 1, close);
      inWord = true;
      i = close + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let value = "";
      while (j < line.length && line[j] !== '"') {
        if (line[j] === "\\" && j + 1 < line.length) {
          value += line[j + 1];
          j += 2;
          continue;
        }
        if (line[j] === "`" || (line[j] === "$" && line[j + 1] === "(")) {
          const sub = line[j] === "`" ? readBacktick(line, j) : readDollarParen(line, j);
          if (line[j] === "$" && line[j + 2] === "(") substitutions.push(...nestedSubstitutions(sub.inner));
          else substitutions.push(sub.inner);
          value += SUBSTITUTION;
          j = sub.end;
          continue;
        }
        value += line[j];
        j += 1;
      }
      if (j >= line.length) throw new UnparseableCommand("aspas duplas sem fechar");
      word += value;
      inWord = true;
      i = j + 1;
      continue;
    }
    if (c === "\\" && i + 1 < line.length) {
      if (line[i + 1] === "\n") {
        i += 2;
        continue;
      }
      word += line[i + 1];
      inWord = true;
      i += 2;
      continue;
    }
    if (c === "`" || (c === "$" && line[i + 1] === "(")) {
      const sub = c === "`" ? readBacktick(line, i) : readDollarParen(line, i);
      if (c === "$" && line[i + 2] === "(") substitutions.push(...nestedSubstitutions(sub.inner));
      else substitutions.push(sub.inner);
      word += SUBSTITUTION;
      inWord = true;
      i = sub.end;
      continue;
    }
    if (c === "#" && !inWord) {
      const newline = line.indexOf("\n", i);
      i = newline === -1 ? line.length : newline;
      continue;
    }
    if (c === "\n") {
      endCommand();
      i += 1;
      if (pending.length > 0) readHeredocBodies();
      continue;
    }
    if (c === ";") {
      endCommand();
      i += 1;
      continue;
    }
    // `2>&1` and `&>file` are redirections, not the background operator.
    if (c === "&" && (word.endsWith(">") || line[i + 1] === ">")) {
      word += c;
      inWord = true;
      i += 1;
      continue;
    }
    if (c === "&" || c === "|") {
      endCommand();
      i += line[i + 1] === c ? 2 : 1;
      continue;
    }
    if (c === "(" || c === ")" || c === "{" || c === "}") {
      endCommand();
      i += 1;
      continue;
    }
    if (c === " " || c === "\t") {
      endWord();
      i += 1;
      continue;
    }
    word += c;
    inWord = true;
    i += 1;
  }
  endCommand();
  if (pending.length > 0) throw new UnparseableCommand(`heredoc sem o terminador \`${pending[0]?.delimiter}\``);
  return { commands, heredocs, substitutions };
}

/**
 * Flags whose value is text, not an option: a substitution there — the
 * `git commit -m "$(cat <<'EOF' … EOF)"` Claude Code itself writes — cannot turn
 * into `--force`.
 */
const TEXT_VALUE_FLAGS = new Set(["-m", "--message", "-F", "--file", "--body", "-b", "--title", "-t", "--jq", "-q", "--notes"]);

/** Read-only git subcommands: a substitution in their arguments changes nothing. */
const READ_ONLY_GIT = new Set([
  "log", "show", "diff", "status", "rev-parse", "rev-list", "ls-files", "ls-tree", "grep", "blame",
  "describe", "for-each-ref", "cat-file", "merge-base", "shortlog", "name-rev", "show-ref",
]);

/**
 * The argument of a watched command whose value comes from a substitution, or
 * `null`. Watched means the arguments decide whether it is dangerous.
 */
function opaqueArgument(tool: string, args: string[]): string | null {
  const watched = tool === "git" || tool === "npm" || tool === "pnpm" || tool === "yarn" || tool === "gh" || tool === "rm";
  if (!watched) return null;
  if (tool === "git") {
    const sub = args.find((a) => !a.startsWith("-"));
    if (sub !== undefined && sub.includes(SUBSTITUTION)) return sub;
    if (sub !== undefined && READ_ONLY_GIT.has(sub)) return null;
  }
  for (let k = 0; k < args.length; k += 1) {
    const arg = args[k] as string;
    if (!arg.includes(SUBSTITUTION)) continue;
    const previous = args[k - 1];
    if (previous !== undefined && TEXT_VALUE_FLAGS.has(previous) && tool !== "rm" && tool !== "npm" && tool !== "pnpm" && tool !== "yarn") {
      continue;
    }
    const eq = arg.indexOf("=");
    if (eq > 0 && TEXT_VALUE_FLAGS.has(arg.slice(0, eq)) && tool !== "rm") continue;
    return arg;
  }
  return null;
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Leading `VAR=value` words, and the words after them. */
function splitAssignments(words: string[]): { env: string[]; argv: string[] } {
  let k = 0;
  while (k < words.length && ASSIGNMENT.test(words[k] as string)) k += 1;
  return { env: words.slice(0, k), argv: words.slice(k) };
}

/** `env X=1 cmd`, `command cmd`, `sudo cmd` and `time cmd` run `cmd`. */
function unwrap(argv: string[]): { env: string[]; argv: string[] } {
  const env: string[] = [];
  let rest = argv;
  for (;;) {
    const head = rest[0];
    if (head === "env") {
      const inner = splitAssignments(rest.slice(1).filter((w) => !w.startsWith("-")));
      env.push(...inner.env);
      rest = inner.argv;
      continue;
    }
    if (head === "command" || head === "sudo" || head === "time" || head === "exec" || head === "nohup") {
      rest = rest.slice(1);
      continue;
    }
    return { env, argv: rest };
  }
}

// ---------------------------------------------------------------------------
// Rules for one simple command.

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return join(home, path.slice(2));
  return path.replace(/^\$HOME(?=\/|$)/, home).replace(/^\$\{HOME\}(?=\/|$)/, home);
}

/** Flags of a git subcommand: long ones as is, short clusters split into letters. */
function flagsOf(args: string[]): { long: Set<string>; short: Set<string>; positional: string[] } {
  const long = new Set<string>();
  const short = new Set<string>();
  const positional: string[] = [];
  for (const arg of args) {
    if (arg === "--") break;
    if (arg.startsWith("--")) long.add(arg.split("=")[0] as string);
    else if (arg.startsWith("-") && arg.length > 1) for (const letter of arg.slice(1)) short.add(letter);
    else positional.push(arg);
  }
  return { long, short, positional };
}

/** `git -C dir -c k=v push …` → the directory and `push …`. */
function gitSubcommand(args: string[], cwd: string): { dir: string; sub: string | null; rest: string[] } {
  let dir = cwd;
  let k = 0;
  while (k < args.length) {
    const arg = args[k] as string;
    if (arg === "-C") {
      dir = resolve(cwd, args[k + 1] ?? ".");
      k += 2;
      continue;
    }
    if (arg === "-c" || arg === "--git-dir" || arg === "--work-tree" || arg === "--namespace") {
      k += 2;
      continue;
    }
    if (arg.startsWith("-")) {
      k += 1;
      continue;
    }
    return { dir, sub: arg, rest: args.slice(k + 1) };
  }
  return { dir, sub: null, rest: [] };
}

function refspecTarget(refspec: string): string {
  const withoutForce = refspec.replace(/^\+/, "");
  const target = withoutForce.includes(":") ? withoutForce.split(":")[1] ?? "" : withoutForce;
  return target.replace(/^refs\/heads\//, "");
}

function checkGit(args: string[], cwd: string, ctx: GuardContext): Verdict {
  const { dir, sub, rest } = gitSubcommand(args, cwd);
  if (sub === null) return ALLOW;
  const { long, short, positional } = flagsOf(rest);

  if (sub === "push") {
    if (long.has("--no-verify")) return refuse("`git push --no-verify` pula o `pre-push` — o gate que roda antes do CI (T17)");
    if (long.has("--force") || long.has("--force-with-lease") || long.has("--force-if-includes") || short.has("f")) {
      return refuse("push forçado reescreve histórico; se o push precisa de força, pare e diga por quê");
    }
    if (long.has("--tags") || long.has("--mirror") || long.has("--all")) {
      return refuse("`--tags`/`--mirror`/`--all` empurra refs em lote, e uma tag `v*` publica uma release; empurre a ref que você quer, pelo nome");
    }
    const refspecs = positional.slice(1);
    if (refspecs.some((spec) => spec.startsWith("+"))) {
      return refuse("um refspec com `+` é um push forçado escrito de outro jeito");
    }
    if (long.has("--delete") || short.has("d")) {
      if (refspecs.some((spec) => PROTECTED_BRANCHES.has(refspecTarget(spec)))) {
        return refuse("apagar `main` no remoto não é uma operação desta sessão");
      }
    }
    if (refspecs.some((spec) => spec.startsWith(":") && PROTECTED_BRANCHES.has(refspecTarget(spec)))) {
      return refuse("apagar `main` no remoto não é uma operação desta sessão");
    }
    if (refspecs.some((spec) => PROTECTED_BRANCHES.has(refspecTarget(spec)))) {
      return refuse("push direto para `main`: o caminho é uma branch e uma PR — o ruleset do GitHub recusaria de qualquer jeito");
    }
    if (refspecs.length === 0) {
      const branch = ctx.currentBranch(dir);
      if (branch !== null && PROTECTED_BRANCHES.has(branch)) {
        return refuse(`você está em \`${branch}\`: crie uma branch antes do push`);
      }
    }
    return ALLOW;
  }

  if (sub === "commit") {
    if (long.has("--no-verify") || short.has("n")) {
      return refuse("`git commit --no-verify` pula o `pre-commit` e o `commit-msg` (T17); se um hook está errado, conserte o hook");
    }
    return ALLOW;
  }

  if (sub === "reset" && long.has("--hard") && ctx.hasUncommittedChanges(dir)) {
    return refuse("`git reset --hard` com mudança não commitada apaga trabalho sem volta; faça um commit de WIP antes");
  }

  if (sub === "config" && positional.some((word) => word.toLowerCase() === "core.hookspath")) {
    const writes = positional.length > 1 || long.has("--unset") || long.has("--unset-all");
    if (writes) return refuse("mudar o `core.hooksPath` desliga os hooks do repositório (T17)");
  }

  return ALLOW;
}

/**
 * Any word, and not the first: `pnpm --filter @vinihcrosa/lumem-os publish` puts
 * the verb after a flag's value, and a first-positional rule lets it through.
 */
function checkPackageManager(tool: string, args: string[]): Verdict {
  const words = new Set(args.filter((a) => !a.startsWith("-")));
  for (const verb of ["publish", "unpublish", "deprecate"]) {
    if (words.has(verb)) {
      return refuse(`\`${tool} ${verb}\` mexe no registry público; publicar é por tag, pelo \`release.yml\`, com aprovação`);
    }
  }
  if (words.has("dist-tag")) {
    return refuse("`dist-tag` move `latest` no registry público; rollback é pelo workflow, com aprovação");
  }
  return ALLOW;
}

function checkGh(args: string[]): Verdict {
  const [group, verb] = args;
  if (group === "repo" && (verb === "delete" || verb === "archive")) {
    return refuse(`\`gh repo ${verb}\` não é uma operação desta sessão`);
  }
  if (group === "pr" && verb === "merge") {
    return refuse("mesclar é decisão do dono enquanto o merge automático da classe N3 não existir (Q7)");
  }
  if (group === "release" && verb === "delete") return refuse("`gh release delete` apaga uma release publicada");
  if (group === "api") {
    for (let k = 1; k < args.length; k += 1) {
      const arg = args[k] as string;
      const method =
        arg === "-X" || arg === "--method"
          ? args[k + 1]
          : arg.startsWith("-X")
            ? arg.slice(2)
            : arg.startsWith("--method=")
              ? arg.slice("--method=".length)
              : undefined;
      if (method !== undefined && method.toUpperCase() === "DELETE") {
        return refuse("`gh api` com `DELETE` apaga recurso no host");
      }
    }
  }
  return ALLOW;
}

function checkRm(args: string[], cwd: string, ctx: GuardContext): Verdict {
  const { short, long, positional } = flagsOf(args);
  const recursive = short.has("r") || short.has("R") || long.has("--recursive");
  if (!recursive) return ALLOW;
  const lumem = join(ctx.home, ".lumem");
  for (const target of positional) {
    const absolute = resolve(cwd, expandHome(target, ctx.home));
    if (absolute === ctx.home || absolute === "/") return refuse(`\`rm -r ${target}\` apaga a casa inteira`);
    if (absolute === lumem || absolute.startsWith(lumem + sep)) {
      return refuse("o `~/.lumem` é o estado de produção do produto nesta máquina");
    }
  }
  return ALLOW;
}

export function checkCommandLine(line: string, cwd: string, ctx: GuardContext): Verdict {
  let commands: string[][];
  let heredocs: Map<number, string[]>;
  let substitutions: string[];
  try {
    ({ commands, heredocs, substitutions } = parse(line));
  } catch (error) {
    if (error instanceof UnparseableCommand) {
      return refuse(
        `o guarda não conseguiu ler este comando (${error.message}) e recusa em vez de adivinhar; ` +
          "reescreva sem substituição de comando, ou em partes",
      );
    }
    throw error;
  }

  for (const inner of substitutions) {
    const verdict = checkCommandLine(inner, cwd, ctx);
    if (!verdict.allow) return verdict;
  }

  for (const [index, words] of commands.entries()) {
    const leading = splitAssignments(words);
    const { env, argv } = unwrap(leading.argv);
    const assignments = [...leading.env, ...env];
    if (argv[0] === "export") assignments.push(...argv.slice(1));
    if (assignments.some((a) => /^HUSKY=0?$/.test(a) || a === "HUSKY=false" || (a.startsWith("HUSKY=") && a.includes(SUBSTITUTION)))) {
      return refuse("`HUSKY=0` desliga todos os hooks de git (Q9); se um hook está errado, conserte o hook");
    }
    if (argv.length === 0) continue;
    if ((argv[0] as string).includes(SUBSTITUTION)) {
      return refuse("o nome do comando vem de uma substituição, e o guarda não sabe o que vai rodar");
    }
    const tool = (argv[0] as string).split("/").pop() as string;
    const args = argv.slice(1);
    const opaque = opaqueArgument(tool, args);
    if (opaque !== null) {
      return refuse(
        `o argumento \`${opaque.replace(SUBSTITUTION, "$(…)")}\` de \`${tool}\` vem de uma substituição de ` +
          "comando, e o guarda não sabe o valor; rode a substituição antes e passe o valor escrito",
      );
    }
    let verdict: Verdict = ALLOW;
    if (tool === "git") verdict = checkGit(args, cwd, ctx);
    else if (tool === "npm" || tool === "pnpm" || tool === "yarn") verdict = checkPackageManager(tool, args);
    else if (tool === "gh") verdict = checkGh(args);
    else if (tool === "rm") verdict = checkRm(args, cwd, ctx);
    else if ((tool === "bash" || tool === "sh" || tool === "zsh") && args[0] === "-c" && args[1] !== undefined) {
      verdict = checkCommandLine(args[1], cwd, ctx);
    } else if (tool === "bash" || tool === "sh" || tool === "zsh") {
      // A heredoc fed to a shell is a script: it is read like the line itself.
      for (const body of heredocs.get(index) ?? []) {
        verdict = checkCommandLine(body, cwd, ctx);
        if (!verdict.allow) break;
      }
    }
    if (!verdict.allow) return verdict;
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// File tools.

function isInside(path: string, root: string): boolean {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function checkWrite(filePath: string, cwd: string, ctx: GuardContext): Verdict {
  const absolute = resolve(cwd, expandHome(filePath, ctx.home));
  if (isInside(absolute, ctx.projectDir)) return ALLOW;
  if (ctx.writableRoots.some((root) => isInside(absolute, root))) return ALLOW;
  return refuse(
    `escrita fora do checkout (\`${absolute}\`): esta sessão escreve em \`${ctx.projectDir}\`, ` +
      "no diretório temporário e na própria memória",
  );
}

const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export function decide(input: HookInput, ctx: GuardContext): Verdict {
  const cwd = input.cwd ?? ctx.projectDir;
  const tool = input.tool_name ?? "";
  const toolInput = input.tool_input ?? {};
  if (tool === "Bash") {
    const command = toolInput["command"];
    if (typeof command !== "string") return refuse("chamada de Bash sem `command` legível");
    return checkCommandLine(command, cwd, ctx);
  }
  if (WRITE_TOOLS.has(tool)) {
    const path = toolInput["file_path"] ?? toolInput["notebook_path"];
    if (typeof path !== "string") return refuse(`chamada de ${tool} sem caminho legível`);
    return checkWrite(path, cwd, ctx);
  }
  return ALLOW;
}

// ---------------------------------------------------------------------------
// The hook process.

function gitOut(cwd: string, args: string[]): string | null {
  try {
    return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
}

export function realContext(projectDir: string): GuardContext {
  const home = homedir();
  return {
    projectDir,
    home,
    writableRoots: [tmpdir(), "/tmp", "/private/tmp", join(home, ".claude", "projects")],
    currentBranch: (cwd) => gitOut(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]),
    hasUncommittedChanges: (cwd) => (gitOut(cwd, ["status", "--porcelain"]) ?? "") !== "",
  };
}

async function main(): Promise<void> {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let verdict: Verdict;
  try {
    const input = JSON.parse(raw) as HookInput;
    const projectDir = process.env["CLAUDE_PROJECT_DIR"] ?? input.cwd ?? process.cwd();
    verdict = decide(input, realContext(projectDir));
  } catch (error) {
    verdict = refuse(`o guarda falhou ao ler a chamada (${(error as Error).message}) e recusa por segurança`);
  }
  if (!verdict.allow) {
    process.stderr.write(`Recusado pelo guarda do repositório (scripts/harness/guard.ts): ${verdict.reason}\n`);
    process.exit(2);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
