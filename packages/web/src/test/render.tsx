import { QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderResult } from "@testing-library/react";
import type { ReactElement } from "react";

import { createQueryClient } from "../lib/queryClient.js";

/**
 * Renders with a query client that is fresh per call, so cached data never
 * leaks between tests.
 */
export function renderWithProviders(ui: ReactElement): RenderResult {
  return render(<QueryClientProvider client={createQueryClient()}>{ui}</QueryClientProvider>);
}
