import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Tokens antes da base, porque a base os consome.
import "./styles/tokens.css";
import "./styles/fonts.css";
import "./styles/base.css";

import { App } from "./App.js";
import { mountAgentation } from "./lib/agentation.js";
import { createQueryClient } from "./lib/queryClient.js";
import "./ui/ui.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found in index.html");

/**
 * The styleguide is a development tool, not a page of the product.
 *
 * A static `import.meta.env.DEV` check lets the bundler drop the whole module
 * from a production build — the app has no router, and adding one to reach a
 * page users never open would be the tail wagging the dog. Open-questions Q11
 * revisits this once there is a measurement of what it costs.
 */
const wantsStyleguide = import.meta.env.DEV && window.location.pathname === "/styleguide";

const root = createRoot(container);

if (wantsStyleguide) {
  const { Styleguide } = await import("./ui/Styleguide.js");
  root.render(
    <StrictMode>
      <Styleguide />
    </StrictMode>,
  );
} else {
  root.render(
    <StrictMode>
      <QueryClientProvider client={createQueryClient()}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
}

/**
 * O anotador entra depois do render, e sem `await` no caminho da tela: ele é
 * ferramenta de dev, e uma falha ao carregá-lo não pode atrasar nem derrubar a
 * aplicação. Em produção a chamada volta na primeira linha e o bundler já
 * removeu o pacote.
 */
void mountAgentation();
