import { useQuery } from "@tanstack/react-query";

import { trpc } from "./lib/trpc.js";

export function App() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: () => trpc.health.query(),
  });

  return (
    <main>
      <h1>Lumem-OS</h1>
      {health.isPending && <p>connecting to daemon…</p>}
      {health.isError && <p role="alert">daemon unreachable</p>}
      {health.data && <p>daemon v{health.data.version}</p>}
    </main>
  );
}
