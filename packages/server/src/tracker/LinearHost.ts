import type { SecretStore } from "../secrets/SecretStore.js";

import { redactKey, type TrackerHost, type TrackerIssue } from "./TrackerHost.js";

/**
 * O Linear, por GraphQL (`028` Parte 5, T42).
 *
 * **A chave vem do cofre do Lumem**, e é lida a cada chamada em vez de copiada
 * para um campo: um objeto que a segurasse teria uma cópia a mais para vazar, e
 * o cofre já é onde ela está.
 *
 * De onde ela vem é o
 * [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md),
 * que **superou** o meu de horas antes: o `gh` foi solução daquele caso e ler do
 * ambiente foi simplicidade — nenhuma das duas era política.
 *
 * A consulta é **por workspace e não por projeto** — o que ela pergunta é *"o
 * que tem o rótulo"*, e uma pergunta responde por todos os projetos. É o que faz
 * a cadência de 60 s caber em **2,4% da cota** (§3.2 do estudo de orquestração).
 */

const ENDPOINT = "https://api.linear.app/graphql";

/**
 * Só o que o Lumem usa.
 *
 * Pedir menos é menos ponto de complexidade na cota do Linear, e é menos
 * superfície: um campo a mais aqui é um campo a mais que alguém pode passar a
 * gravar sem perceber.
 */
const LABELLED = `query($label: String!) {
  issues(filter: { labels: { name: { eq: $label } } }, first: 50) {
    nodes {
      id
      identifier
      title
      description
      url
      state { type }
      assignee { id }
    }
  }
}`;

const COMMENT = `mutation($issueId: String!, $body: String!) {
  commentCreate(input: { issueId: $issueId, body: $body }) { success }
}`;

const MOVE = `mutation($issueId: String!, $stateId: String!) {
  issueUpdate(id: $issueId, input: { stateId: $stateId }) { success }
}`;

interface LinearNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  url: string;
  state: { type: string } | null;
  assignee: { id: string } | null;
}

export interface LinearHostOptions {
  /** O cofre do daemon. É de onde a chave vem. */
  secrets: Pick<SecretStore, "has" | "read">;
  /** Injetado para o teste não tocar a rede. O default é o `fetch` global. */
  fetch?: typeof globalThis.fetch;
}

/** O id do serviço no cofre. É o que a tela usa para dizer qual campo é qual. */
export const LINEAR_SECRET = "linear";

export function createLinearHost({
  secrets,
  fetch: call = globalThis.fetch,
}: LinearHostOptions): TrackerHost {
  function key(): string | undefined {
    const found = secrets.read(LINEAR_SECRET);
    return found === null || found.trim() === "" ? undefined : found;
  }

  async function graphql(query: string, variables: Record<string, unknown>): Promise<unknown> {
    const secret = key();
    // Nunca deveria chegar aqui sem chave — quem chama confere `available()` —,
    // e mesmo assim a frase existe: um `Authorization: undefined` produziria um
    // 400 do Linear cuja mensagem não fala de configuração nenhuma.
    if (secret === undefined) throw new Error("a credencial do Linear não está no cofre do Lumem");

    let response: Response;
    try {
      response = await call(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: secret },
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      /*
       * A rede falhou, e a mensagem passa pelo `redact` **mesmo assim**.
       *
       * Parece exagero — a chave não estaria num erro de DNS —, e não é: alguns
       * clientes HTTP ecoam a requisição inteira, cabeçalhos inclusive, na
       * mensagem de `TypeError: fetch failed`. Redigir sempre custa uma linha; o
       * contrário custa uma chave num log.
       */
      throw new Error(redactKey(error instanceof Error ? error.message : String(error), secret));
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(
        redactKey(`o Linear respondeu ${String(response.status)}: ${text.slice(0, 200)}`, secret),
      );
    }

    const payload = (await response.json()) as { data?: unknown; errors?: { message: string }[] };
    if (payload.errors && payload.errors.length > 0) {
      throw new Error(
        redactKey(payload.errors.map((one) => one.message).join("; "), secret),
      );
    }
    /*
     * `200` com `data` ausente e sem `errors` é resposta malformada, e ela
     * existe: um proxy corporativo que devolve uma página de login com status
     * 200 produz exatamente isto. Sem a guarda, o sintoma seria um
     * `Cannot read properties of undefined` no meio da tradução, que não fala
     * de rede nenhuma.
     */
    if (payload.data === undefined || payload.data === null) {
      throw new Error("o Linear respondeu sem dados");
    }
    return payload.data;
  }

  return {
    id: "linear",
    secretId: LINEAR_SECRET,
    available: () => secrets.has(LINEAR_SECRET),

    async labelled(label) {
      // Ausência não é erro: sem a chave, a feature simplesmente não existe —
      // do mesmo jeito que um projeto sem `test` declarado não ganha portão.
      if (key() === undefined) return [];

      const data = (await graphql(LABELLED, { label })) as {
        issues?: { nodes?: LinearNode[] };
      };
      return (data.issues?.nodes ?? []).map(
        (node): TrackerIssue => ({
          id: node.id,
          key: node.identifier,
          title: node.title,
          body: node.description ?? "",
          url: node.url,
          /*
           * O vocabulário é **nosso**, e a tradução acontece aqui.
           *
           * O Linear tem cinco tipos de estado — `backlog`, `unstarted`,
           * `started`, `completed`, `canceled` —, e o que o Lumem precisa saber
           * é uma coisa só: *ela ainda está aberta?*. É o
           * [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md)
           * — o modelo é do Lumem, e o que vem de fora se adapta.
           */
          state:
            node.state?.type === "completed" || node.state?.type === "canceled"
              ? "closed"
              : "open",
          assignee: node.assignee?.id ?? null,
        }),
      );
    },

    async comment(issueId, body) {
      await graphql(COMMENT, { issueId, body });
    },

    async moveState(issueId, stateId) {
      await graphql(MOVE, { issueId, stateId });
    },
  };
}
