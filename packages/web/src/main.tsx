import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Tokens antes da base, porque a base os consome.
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

import { App } from "./App.js";
import { mountAgentation } from "./lib/agentation.js";
import { installGlobalErrorHandlers } from "./lib/globalErrors.js";
import { createQueryClient } from "./lib/queryClient.js";
import "./ui/ui.css";
import "./ui/modal.css";

// Whatever escapes React and the query caches still lands in the error log.
installGlobalErrorHandlers();

const container = document.getElementById("root");
if (!container) throw new Error("#root not found in index.html");

const root = createRoot(container);

root.render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);

/**
 * O anotador entra depois do render, e sem `await` no caminho da tela: ele é
 * ferramenta de dev, e uma falha ao carregá-lo não pode atrasar nem derrubar a
 * aplicação. Em produção a chamada volta na primeira linha e o bundler já
 * removeu o pacote.
 */
void mountAgentation();
