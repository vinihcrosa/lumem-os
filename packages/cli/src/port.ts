/**
 * Who is already on the port, when someone is.
 *
 * Answering "occupied" is not enough: a Lumem that is already running and a
 * random other server are the same error message and two different next steps —
 * one is "open the one you have", the other is "pick another port". The daemon
 * publishes `/trpc/health`, so asking is cheap and unambiguous.
 */
export type Occupant =
  | { kind: "free" }
  | { kind: "lumem"; version: string }
  | { kind: "other" };

export interface ProbeOptions {
  origin: string;
  /** Injected by tests; `fetch` in production. */
  request?: typeof fetch;
  timeoutMs?: number;
}

export async function probePort({
  origin,
  request = fetch,
  timeoutMs = 1_500,
}: ProbeOptions): Promise<Occupant> {
  const signal = AbortSignal.timeout(timeoutMs);
  let response: Response;
  try {
    response = await request(`${origin}/trpc/health`, { signal });
  } catch {
    // Refused, reset, or nothing answering in time. Nothing is listening that
    // we can talk to, and the bind that follows will say so precisely if it is
    // in fact taken.
    return { kind: "free" };
  }

  if (!response.ok) return { kind: "other" };

  try {
    const body = (await response.json()) as { result?: { data?: { ok?: boolean; version?: string } } };
    const data = body.result?.data;
    if (data?.ok !== true) return { kind: "other" };
    return { kind: "lumem", version: data.version ?? "?" };
  } catch {
    return { kind: "other" };
  }
}
