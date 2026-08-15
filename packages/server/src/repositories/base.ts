import { DomainError, type DomainErrorCode } from "../errors.js";

/**
 * Turning SQLite's constraint failures into things a user can read.
 *
 * "UNIQUE constraint failed: workspace.name" is accurate and useless: it names
 * a column, not the thing the person did wrong, and it leaks the schema to the
 * browser. Every repository declares which constraints it expects to hit and
 * what each one means; anything unexpected becomes CONSTRAINT_VIOLATION, which
 * is a defect in the mapping rather than a message worth showing.
 */

export interface ConstraintTranslation {
  code: DomainErrorCode;
  message: string;
}

/**
 * Keys are the shape of the failure, not the raw text:
 *
 * - `unique:workspace.name` — a UNIQUE index, keyed by the columns SQLite names
 * - `check:worktree_state` — a CHECK, keyed by its constraint name
 * - `foreignKey` — SQLite never says *which* one, so there is only the one key
 */
export type ConstraintMap = Readonly<Record<string, ConstraintTranslation>>;

interface SqliteLikeError {
  code?: string;
  message: string;
}

function asSqliteError(error: unknown): SqliteLikeError | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as Partial<SqliteLikeError>;
  if (typeof candidate.message !== "string") return null;
  if (typeof candidate.code !== "string" || !candidate.code.startsWith("SQLITE_CONSTRAINT")) {
    return null;
  }
  return { code: candidate.code, message: candidate.message };
}

/**
 * The lookup key for a constraint failure, or null if this is not one.
 *
 * Exported because it is the part worth testing directly: everything else in
 * this module is a table lookup around it.
 */
export function constraintKey(error: unknown): string | null {
  const sqlite = asSqliteError(error);
  if (!sqlite) return null;

  // Matched on the message, not the code: SQLite implements ON DELETE RESTRICT
  // with an internal trigger, so a refused *delete* arrives as
  // SQLITE_CONSTRAINT_TRIGGER while a bad *insert* arrives as
  // SQLITE_CONSTRAINT_FOREIGNKEY. Both are the same thing to a caller.
  if (sqlite.message.includes("FOREIGN KEY constraint failed")) return "foreignKey";

  const unique = /UNIQUE constraint failed: (.+)$/.exec(sqlite.message);
  // Composite indexes report every column; the key keeps them in schema order.
  if (unique?.[1]) return `unique:${unique[1].split(", ").join(",")}`;

  const check = /CHECK constraint failed: (.+)$/.exec(sqlite.message);
  if (check?.[1]) return `check:${check[1]}`;

  const notNull = /NOT NULL constraint failed: (.+)$/.exec(sqlite.message);
  if (notNull?.[1]) return `notNull:${notNull[1]}`;

  return "constraint";
}

/**
 * Runs a write, translating the constraint failures it declares.
 *
 * Anything that is not a constraint failure is rethrown untouched — a disk
 * error is not a domain error and must not be dressed up as one.
 */
export async function withConstraints<TResult>(
  run: () => Promise<TResult>,
  translations: ConstraintMap,
): Promise<TResult> {
  try {
    return await run();
  } catch (error) {
    const key = constraintKey(error);
    if (key === null) throw error;

    const translation = translations[key];
    if (translation) {
      throw new DomainError(translation.code, translation.message, { cause: error });
    }

    // Deliberately vague: the raw text names columns and tables, and reaching
    // here at all means a repository forgot to declare a constraint it can hit.
    throw new DomainError(
      "CONSTRAINT_VIOLATION",
      "the daemon refused the change because it would break a data rule",
      { cause: error },
    );
  }
}

/** Narrows an optional row to a value, or fails with a message the user can act on. */
export function required<TRow>(row: TRow | undefined, message: string): TRow {
  if (row === undefined) throw new DomainError("NOT_FOUND", message);
  return row;
}
