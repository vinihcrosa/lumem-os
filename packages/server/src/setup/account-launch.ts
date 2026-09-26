import { adapterById, type AdapterSpec } from "@lumem/shared";

import type { AcpProbeReport } from "../acp/AcpManager.js";
import type { Db } from "../db/index.js";
import type { AgentAccountRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";
import { accountEnvFor } from "./adapter-command.js";

/**
 * A conta que o login e a conferência sobem (`034` T6).
 *
 * Separado do `adapterInvocationFor` porque aqui a conta **desconectada** sobe:
 * é conectando que ela deixa de estar. O resto é o mesmo ambiente — a variável
 * da spec apontando para o diretório, ou ausente na conta sem diretório.
 */
export interface AccountLaunch {
  /** A spec da conta, quando o catálogo a conhece. */
  spec: AdapterSpec | null;
  /** `null` quando o agente ainda não tem configuração — nada foi conectado. */
  account: AgentAccountRow | null;
  env: Record<string, string>;
  unsetEnv: readonly string[];
}

/**
 * A conta pedida, ou a padrão do agente da `spec`.
 *
 * Sem configuração ainda (o primeiro acesso, antes de conectar), não há conta:
 * sobe como a padrão subiria — a variável **ausente** —, e nada é gravado.
 */
export async function accountLaunchFor(
  db: Db,
  secrets: { read(id: string): string | null },
  spec: AdapterSpec | null,
  accountId?: string,
): Promise<AccountLaunch> {
  const accounts = createAgentAccountRepository(db);
  const configs = createAgentConfigRepository(db);

  let account: AgentAccountRow | null = null;
  let resolvedSpec = spec;
  if (accountId !== undefined) {
    account = (await accounts.get(accountId)) ?? null;
    if (account === null) throw new DomainError("NOT_FOUND", `conta ${accountId} não existe`);
    const config = await configs.findById(account.agentConfigId);
    resolvedSpec = config === undefined ? spec : (adapterById(config.name) ?? spec);
  } else if (spec !== null) {
    const config = await configs.findByName(spec.id);
    account = config === undefined ? null : await accounts.ensureDefault(config.id);
  }

  if (account === null) {
    const variable = resolvedSpec?.accountEnv ?? null;
    return { spec: resolvedSpec, account: null, env: {}, unsetEnv: variable === null ? [] : [variable] };
  }
  return { spec: resolvedSpec, account, ...accountEnvFor(resolvedSpec, account, {}, secrets) };
}

/**
 * Grava na conta o que a conferência leu — só quando ela leu um login.
 *
 * Deslogado **não** apaga a identidade anterior: é ela que deixa a tela dizer
 * *qual* conta reconectar. O estado (`connected`) é da T8, e não muda aqui.
 */
export async function recordProbedIdentity(
  db: Db,
  account: AgentAccountRow | null,
  report: Pick<AcpProbeReport, "loggedIn" | "identity">,
  now: number = Date.now(),
): Promise<void> {
  if (account === null || !report.loggedIn || report.identity === null) return;
  await createAgentAccountRepository(db).recordIdentity(account.id, {
    email: report.identity.email,
    plan: report.identity.plan,
    checkedAt: now,
  });
}
