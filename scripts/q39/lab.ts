import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

/** Um repositório de laboratório: pequeno, real, e descartável. */
export function labRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "q39-repo-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });

  git("init", "-b", "main");
  git("config", "user.email", "q39@lumem.local");
  git("config", "user.name", "q39");

  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(
    join(dir, "src", "orders.ts"),
    [
      "export interface Cart {",
      "  items: { sku: string; price: number }[];",
      "}",
      "",
      "/** Soma o carrinho. */",
      "export function total(cart: Cart): number {",
      "  return cart.items.reduce((sum, item) => sum + item.price, 0);",
      "}",
      "",
      "/** O maior preço do carrinho. */",
      "export function biggest(cart: Cart): number {",
      "  return cart.items.map((item) => item.price).sort()[0]!;",
      "}",
      "",
    ].join("\n"),
  );
  writeFileSync(join(dir, "README.md"), "# loja\n\nUm módulo de carrinho.\n");
  git("add", "-A");
  git("commit", "-m", "inicial");
  return dir;
}

export const ADAPTER = join(
  homedir(),
  ".lumem/adapters/claude/node_modules/.bin/claude-agent-acp",
);

export function requireAdapter(): string {
  if (!existsSync(ADAPTER)) throw new Error(`adaptador ausente em ${ADAPTER}`);
  return ADAPTER;
}
