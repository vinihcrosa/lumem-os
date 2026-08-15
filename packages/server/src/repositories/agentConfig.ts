import { newId } from "@lumem/shared";
import { asc, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { agentConfig, type AgentConfigRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints, type ConstraintMap } from "./base.js";

/**
 * Agent configurations, PRD F6.1–F6.4.
 *
 * A configuration is a recipe, not code: name, command, args, env. Adding
 * another agent is adding a row — that is the whole point of §3, and it is why
 * nothing in the daemon knows what "claude" is.
 */

export interface AgentConfigInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface AgentConfigRepository {
  create(input: AgentConfigInput): Promise<AgentConfigRow>;
  list(): Promise<AgentConfigRow[]>;
  findById(id: string): Promise<AgentConfigRow | undefined>;
  findByName(name: string): Promise<AgentConfigRow | undefined>;
  update(id: string, input: Partial<AgentConfigInput>): Promise<AgentConfigRow>;
  remove(id: string): Promise<void>;
  /** F6.4. Idempotent, so it can run on every boot. */
  seedDefaults(): Promise<void>;
}

/** F6.4: Claude Code, bare `claude`, no permission flags of any kind. */
export const DEFAULT_AGENT_CONFIG: AgentConfigInput = {
  name: "claude-code",
  command: "claude",
  args: [],
  env: {},
};

function conflicts(name: string): ConstraintMap {
  return {
    "unique:agent_config.name": {
      code: "DUPLICATE",
      message: `já existe uma configuração chamada "${name}"`,
    },
    foreignKey: {
      code: "IN_USE",
      message: "a configuração ainda está em uso por alguma sessão",
    },
  };
}

export function createAgentConfigRepository(db: Db): AgentConfigRepository {
  async function require_(id: string): Promise<AgentConfigRow> {
    const found = await db.query.agentConfig.findFirst({ where: eq(agentConfig.id, id) });
    if (!found) throw new DomainError("NOT_FOUND", `configuração ${id} não existe`);
    return found;
  }

  return {
    async create({ name, command, args = [], env = {} }) {
      const [row] = await withConstraints(
        () =>
          db
            .insert(agentConfig)
            .values({ id: newId(), name, command, args, env })
            .returning(),
        conflicts(name),
      );
      return row!;
    },

    list() {
      return db.select().from(agentConfig).orderBy(asc(agentConfig.name));
    },

    findById(id) {
      return db.query.agentConfig.findFirst({ where: eq(agentConfig.id, id) });
    },

    findByName(name) {
      return db.query.agentConfig.findFirst({ where: eq(agentConfig.name, name) });
    },

    async update(id, input) {
      const current = await require_(id);
      const [row] = await withConstraints(
        () =>
          db
            .update(agentConfig)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(agentConfig.id, id))
            .returning(),
        conflicts(input.name ?? current.name),
      );
      return row!;
    },

    async remove(id) {
      await require_(id);
      // A session still pointing here keeps it: the detail view has to be able
      // to say what the process was launched from, even after it exited.
      await withConstraints(
        () => db.delete(agentConfig).where(eq(agentConfig.id, id)).returning(),
        conflicts(""),
      );
    },

    async seedDefaults() {
      // Keyed on the name, not on "is the table empty": someone who added
      // configurations of their own must not stop the default from existing.
      // The trade-off is deliberate — deleting the default brings it back on
      // the next boot, which is recoverable; never shipping it is not.
      const existing = await db.query.agentConfig.findFirst({
        where: eq(agentConfig.name, DEFAULT_AGENT_CONFIG.name),
      });
      if (existing) return;

      await db.insert(agentConfig).values({
        id: newId(),
        name: DEFAULT_AGENT_CONFIG.name,
        command: DEFAULT_AGENT_CONFIG.command,
        args: DEFAULT_AGENT_CONFIG.args ?? [],
        env: DEFAULT_AGENT_CONFIG.env ?? {},
      });
    },
  };
}
