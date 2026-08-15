import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Tokens antes da base, porque a base os consome.
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

import { App } from "./App.js";
import { createQueryClient } from "./lib/queryClient.js";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found in index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
