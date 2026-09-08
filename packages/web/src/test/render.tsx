import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { createQueryClient } from "../lib/queryClient.js";

/**
 * Renders with a query client that is fresh per call, so cached data never
 * leaks between tests.
 *
 * O cliente volta junto porque alguns defeitos só existem **na segunda
 * leitura** — a tela que muda de forma quando o host responde outra coisa. Sem
 * uma alça para invalidar, o teste teria que remontar o componente, e remontar
 * apaga justamente o estado que o defeito precisa (a escolha já feita).
 */
export function renderWithProviders(ui: ReactElement): RenderResult & { queryClient: QueryClient } {
  const queryClient = createQueryClient();
  return {
    ...render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>),
    queryClient,
  };
}
