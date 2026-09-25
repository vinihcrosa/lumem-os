/**
 * Quem o daemon aceita como interlocutor, em funções puras.
 *
 * Duas listas e três regras, e nada aqui conhece Fastify: a guarda
 * (`guard.ts`) é quem liga isto a uma requisição HTTP e a um upgrade de
 * WebSocket. A separação é o que torna testável o caso que dá nome à feature —
 * um `Host` de outro domínio apontando para 127.0.0.1 só chega por DNS
 * rebinding, e ninguém monta um DNS de TTL zero numa suíte.
 */

/**
 * Os nomes pelos quais o próprio daemon atende.
 *
 * `localhost` e `127.0.0.1` são a mesma máquina e dois cabeçalhos diferentes —
 * qual dos dois chega depende do que a pessoa digitou —, e `::1` é o terceiro
 * na máquina que resolve `localhost` por IPv6. Fora destes três, um `Host` que
 * chega aqui é o de uma página que se fez passar por loopback.
 */
export const LOOPBACK_HOSTNAMES = ["127.0.0.1", "localhost", "::1"] as const;

/** A porta implícita de um `Host` sem porta. O daemon nunca fala TLS. */
const DEFAULT_HTTP_PORT = 80;

export interface Authority {
  /** Minúsculo, sem colchetes de IPv6 e sem o ponto final de FQDN. */
  hostname: string;
  port: number;
}

/**
 * `localhost.`, `LOCALHOST` e `[::1]` são o mesmo host escrito de três jeitos.
 *
 * O ponto final é a raiz do DNS escrita à mão, legal em `Host` e invisível na
 * barra do browser; os colchetes são exigidos pela sintaxe da URL e não fazem
 * parte do nome. Comparar sem normalizar é deixar três grafias do mesmo
 * endereço caírem fora da lista.
 */
function normalizeHostname(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  const unbracketed =
    lowered.startsWith("[") && lowered.endsWith("]") ? lowered.slice(1, -1) : lowered;
  return unbracketed.endsWith(".") ? unbracketed.slice(0, -1) : unbracketed;
}

/** `":4317"` → `4317`. Qualquer outra coisa é um `Host` que não dá para crer. */
function readPort(rest: string): number | null {
  if (!/^:\d{1,5}$/.test(rest)) return null;
  const port = Number.parseInt(rest.slice(1), 10);
  return port > 65535 ? null : port;
}

/**
 * O `Host` partido em nome e porta.
 *
 * `null` para tudo que não é uma autoridade bem formada, e isso é deliberado: a
 * única resposta segura para um cabeçalho que não dá para interpretar é "não é
 * o meu", porque a alternativa é adivinhar a favor de quem o escreveu.
 */
export function parseAuthority(raw: string | undefined): Authority | null {
  if (raw === undefined) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  if (value.startsWith("[")) {
    const close = value.indexOf("]");
    if (close === -1) return null;
    const hostname = normalizeHostname(value.slice(1, close));
    const rest = value.slice(close + 1);
    const port = rest === "" ? DEFAULT_HTTP_PORT : readPort(rest);
    return hostname === "" || port === null ? null : { hostname, port };
  }

  const colon = value.indexOf(":");
  if (colon === -1) return { hostname: normalizeHostname(value), port: DEFAULT_HTTP_PORT };
  // Dois-pontos duas vezes sem colchetes é um IPv6 escrito errado, e a RFC 3986
  // exige os colchetes justamente porque sem eles não dá para saber onde o
  // endereço termina e a porta começa.
  if (value.indexOf(":", colon + 1) !== -1) return null;

  const hostname = normalizeHostname(value.slice(0, colon));
  const port = readPort(value.slice(colon));
  return hostname === "" || port === null ? null : { hostname, port };
}

export interface AllowedAuthority {
  hostnames: readonly string[];
  port: number;
}

/**
 * O `Host` é o do próprio daemon — nome **e** porta.
 *
 * A porta faz parte da checagem porque sem ela `evil.example` resolvendo para
 * 127.0.0.1 não seria o caso interessante: o caso interessante é a página que
 * mantém o próprio nome no `Host` e aponta o DNS para cá. Nome certo e porta
 * errada, por outro lado, é proxy mal configurado — e dizer isso alto é melhor
 * que servir por um caminho que ninguém desenhou.
 */
export function isAllowedAuthority(raw: string | undefined, allowed: AllowedAuthority): boolean {
  const authority = parseAuthority(raw);
  if (authority === null) return false;
  if (authority.port !== allowed.port) return false;
  return allowed.hostnames.some((hostname) => normalizeHostname(hostname) === authority.hostname);
}

/**
 * Os nomes que este daemon aceita: os três de loopback mais o configurado.
 *
 * A união existe para `LUMEM_HOST=127.0.0.2` — loopback de verdade, e fora dos
 * três. Host fora do loopback não chega aqui: o daemon recusa subir (S5).
 */
export function allowedHostnames(configuredHost: string): string[] {
  const configured = normalizeHostname(configuredHost);
  const known = LOOPBACK_HOSTNAMES.map(normalizeHostname);
  return known.includes(configured) ? known : [...known, configured];
}

/** `::1` só é uma origem válida entre colchetes. */
export function originOf(hostname: string, port: number): string {
  const normalized = normalizeHostname(hostname);
  const authority = normalized.includes(":") ? `[${normalized}]` : normalized;
  return `http://${authority}:${String(port)}`;
}

/**
 * A origem numa forma comparável, ou `null` quando não é uma origem.
 *
 * `Origin: null` — iframe em sandbox, página aberta de `file://` — chega aqui
 * como a string `"null"`, e é justamente o que não se pode aceitar: é a origem
 * que qualquer um consegue apresentar.
 */
export function normalizeOrigin(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  return url.origin === "null" ? null : url.origin;
}

/** `LUMEM_WEB_ORIGINS`: lista por vírgula, cada item normalizado ou descartado. */
export function parseWebOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [];
  const origins: string[] = [];
  for (const piece of raw.split(",")) {
    const origin = normalizeOrigin(piece);
    // Item torto vira item ignorado, e não daemon que não sobe: a variável é
    // escrita por script de workspace, e uma vírgula sobrando não pode derrubar
    // o desenvolvimento de ninguém.
    if (origin !== null && !origins.includes(origin)) origins.push(origin);
  }
  return origins;
}

export function isAllowedOrigin(raw: string, allowed: readonly string[]): boolean {
  const origin = normalizeOrigin(raw);
  return origin !== null && allowed.includes(origin);
}

/**
 * O que o browser diz sobre de onde partiu, quando não manda `Origin`.
 *
 * Cabeçalho ausente é `curl`, é o e2e pela API, é o agente — a porta do
 * produto, e ela passa. `same-origin` é a própria página do daemon; `none` é
 * navegação digitada ou `lumem --open`. O resto é outra página, e para o
 * browser `127.0.0.1:4318` e `127.0.0.1:4317` são o mesmo *site* — então
 * `same-site` sem `Origin` é outra porta desta máquina, que é o caso da fase 2
 * e não um caso legítimo hoje.
 */
export function isAllowedFetchSite(raw: string | undefined): boolean {
  if (raw === undefined) return true;
  const value = raw.trim().toLowerCase();
  return value === "same-origin" || value === "none";
}

/**
 * O host configurado é loopback (S5).
 *
 * `127.0.0.0/8` inteiro, porque `127.0.0.2` é tão local quanto `127.0.0.1`.
 * `0.0.0.0` e `::` **não** são: são "todas as interfaces", que é exatamente o
 * caso que a pergunta trata.
 */
export function isLoopbackHost(raw: string): boolean {
  const hostname = normalizeHostname(raw);
  if (hostname === "localhost" || hostname === "::1") return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) && isIpv4(hostname);
}

function isIpv4(value: string): boolean {
  return value.split(".").every((octet) => Number.parseInt(octet, 10) <= 255);
}
