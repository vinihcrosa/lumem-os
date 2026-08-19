import type { CSSProperties } from "react";

import type { UsageView } from "../lib/conversation-model.js";

/**
 * What the turn cost, per turn (F2.7).
 *
 * This is what replaced `/usage`: the protocol reports utilization, the reset and
 * the warning threshold on every turn, which is more than the CLI's own command
 * gives — and it lands in the tab that spent it rather than in an answer you have
 * to go and ask for.
 *
 * The meter **starts quiet**. A session at 4% of its window is not good news, it
 * is the absence of news, and painting that green teaches the eye to ignore the
 * colour for the one moment it matters. It takes `warn` only after passing the
 * threshold the agent itself reports, and `over` only when the agent says it is in
 * overage.
 */

/** Fraction of the window, as a percentage string for the CSS variable. */
function percent(part: number, whole: number): string {
  if (whole <= 0) return "0%";
  const ratio = Math.min(1, Math.max(0, part / whole));
  // Two decimals: at 1M tokens, a whole percent is 10,000 of them, and a meter
  // that only moves in whole percents looks stuck for the first ten minutes.
  return `${(ratio * 100).toFixed(2)}%`;
}

/** `39.2k`, `1M` — the shapes the prototype writes. */
export function formatTokens(value: number): string {
  if (value < 1_000) return String(value);
  if (value < 1_000_000) {
    const thousands = value / 1_000;
    return `${thousands >= 100 ? Math.round(thousands) : thousands.toFixed(1).replace(".", ",")}k`;
  }
  const millions = value / 1_000_000;
  return `${millions >= 10 ? Math.round(millions) : millions.toFixed(1).replace(".", ",").replace(",0", "")}M`;
}

/** `US$ 0,2354`. Four decimals, because a turn often costs less than a cent. */
export function formatCost(amount: number, currency: string): string {
  const symbol = currency === "USD" ? "US$" : `${currency} `;
  return `${symbol} ${amount.toFixed(4).replace(".", ",")}`;
}

/** `reseta 19:00`, or `reseta em 4 d` when it is far enough that a clock is useless. */
export function formatReset(resetsAt: number, now: number): string {
  const seconds = resetsAt - Math.round(now / 1_000);
  if (seconds <= 0) return "resetou";

  const hours = seconds / 3_600;
  if (hours >= 24) return `reseta em ${Math.round(hours / 24)} d`;
  if (hours >= 6) return `reseta em ${Math.round(hours)} h`;

  const at = new Date(resetsAt * 1_000);
  return `reseta ${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
}

/**
 * Which tone the subscription meter takes.
 *
 * Three states and the boundaries come from the agent, not from us: the threshold
 * it reports is the one it considers worth warning about, and a number we chose
 * would disagree with the agent's own idea of trouble.
 */
export function limitTone(
  rateLimit: { utilization: number; surpassedThreshold?: number | null; isUsingOverage: boolean } | null,
): "quiet" | "warn" | "over" {
  if (!rateLimit) return "quiet";
  if (rateLimit.isUsingOverage) return "over";
  const threshold = rateLimit.surpassedThreshold;
  return threshold !== null && threshold !== undefined && rateLimit.utilization >= threshold
    ? "warn"
    : "quiet";
}

export interface UsageFooterProps {
  usage: UsageView;
  /** Injected so a test does not depend on when it ran. */
  now?: number;
}

export function UsageFooter({ usage, now = Date.now() }: UsageFooterProps) {
  const { rateLimit } = usage;
  const tone = limitTone(rateLimit);

  return (
    <>
      {/*
        Overage leaves the footer and becomes a band. A footer is the thing people
        learn not to read, and this is the one line that has to arrive before the
        invoice does.
      */}
      {tone === "over" && (
        <div className="overage" role="status">
          <span aria-hidden="true">⚠</span>
          <span>
            Você entrou no <b>overage</b> do ciclo. A partir daqui a sessão cobra fora da
            assinatura.
          </span>
        </div>
      )}

      <div className="usage">
        <span className="u">
          <span className="u__k">janela</span>
          {formatTokens(usage.used)} / {formatTokens(usage.size)}
          <Meter fraction={percent(usage.used, usage.size)} />
        </span>

        <span className={`u${usage.cost ? " u--cost" : ""}`}>
          <span className="u__k">turno</span>
          {usage.cost ? formatCost(usage.cost.amount, usage.cost.currency) : "—"}
          {/* The session total only appears once it differs from the turn's: two
              identical numbers side by side read as a rendering mistake. */}
          {usage.currency && usage.totalCost > (usage.cost?.amount ?? 0) && (
            <>
              <span className="u__k">sessão</span>
              {formatCost(usage.totalCost, usage.currency)}
            </>
          )}
        </span>

        <span className="usage__spacer" />

        {rateLimit && (
          // No modifier for `quiet`: quiet is what `.usage` already is, and a class
          // that restates the default is a second place to change one colour.
          <span className={`u${tone === "quiet" ? "" : ` u--${tone}`}`}>
            <span className="u__k">assinatura</span>
            {Math.round(rateLimit.utilization * 100)}%
            <Meter fraction={percent(rateLimit.utilization, 1)} />
            {rateLimit.isUsingOverage
              ? "em overage"
              : rateLimit.resetsAt !== null && rateLimit.resetsAt !== undefined
                ? formatReset(rateLimit.resetsAt, now)
                : null}
          </span>
        )}
      </div>
    </>
  );
}

/**
 * The bar.
 *
 * `display: block` on the fill is not a detail: the prototype's meter was a span,
 * an inline span ignores width, and every meter rendered an empty track — at 4%
 * and at 94% alike. The stylesheet carries the fix and this carries the test.
 */
function Meter({ fraction }: { fraction: string }) {
  return (
    <span className="meter" data-fill={fraction}>
      <span className="meter__f" style={{ "--w": fraction } as CSSProperties} />
    </span>
  );
}
