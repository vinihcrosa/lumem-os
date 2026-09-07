import { ADAPTERS, type AdapterSpec } from "@lumem/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useLoginTerminal } from "../hooks/useLoginTerminal.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, CopyCommand, Glyph, Input } from "../ui/index.js";
import { AgentConfigDialog } from "./AgentConfigDialog.js";

import "./agent-login.css";

const AGENT_CONFIGS_KEY = ["agentConfig", "list"];
const AGENTS_KEY = ["setup", "agents"];
const PROBE_KEY = ["setup", "probe"];

/**
 * Os agentes do rodapé: uma linha por agente, e o `＋` que conecta o próximo.
 *
 * Até a `second-agent`, este rodapé tinha **uma** linha, e ela era duas coisas ao
 * mesmo tempo: o estado da conexão e o botão de conectar — `conectar um agente`
 * virava `claude · conectado`. Com dois agentes isso deixa de fechar: a linha só
 * pode ser **estado**, e o verbo precisa de lugar próprio. O cabeçalho `Agentes`
 * com um `＋` é a regra que a `sidebar-actions` já tinha estabelecido para
 * `Projetos` — a ação mora no cabeçalho da lista que ela alimenta, presa ao título
 * e não ao fim da lista, para não se afastar da coisa quando a lista cresce.
 *
 * O custo está medido na folha `lumem-second-agent.html`: o rodapé sai de 45px
 * para 105px com dois agentes, e 28 deles são o cabeçalho — cobrados mesmo de quem
 * tem um agente só.
 *
 * Cada botão de login continua vindo do `authMethods` do handshake, e agora há
 * duas naturezas de método porque os agentes são dois: o `claude-agent-acp`
 * oferece `type: "terminal"` — comandos que o daemon roda num PTY — e o
 * `codex-acp` não oferece comando nenhum, só chamadas de `authenticate`. A tela
 * desenha o que o agente ofereceu, e nada além.
 */
export function AgentLogin() {
  /** Qual painel está aberto: o de conectar, o de um agente, ou nenhum. */
  const [open, setOpen] = useState<{ kind: "connect" } | { kind: "agent"; id: string } | null>(
    null,
  );
  const [custom, setCustom] = useState(false);

  const configs = useQuery({
    queryKey: AGENT_CONFIGS_KEY,
    queryFn: () => trpc.agentConfig.list.query(),
  });

  /*
   * Só as configurações de conversa.
   *
   * `pty` continua criável pelo `AgentConfigDialog` — é o caminho alternativo que
   * a decisão do ACP preservou —, mas ele não tem login, não tem handshake e não
   * tem estado para relatar. Uma linha dele aqui seria uma linha sem nada a dizer.
   */
  const agents = (configs.data ?? []).filter((row) => row.transport === "acp");

  const chosen = open?.kind === "agent" ? agents.find((row) => row.id === open.id) : undefined;
  const close = useCallback(() => setOpen(null), []);

  return (
    <>
      {custom && (
        <div className="setup" role="group" aria-label="outro agente ACP">
          <div className="setup__head">
            <span className="setup__t">Outro agente ACP</span>
            <button
              type="button"
              className="setup__x"
              aria-label="fechar"
              onClick={() => setCustom(false)}
            >
              ✕
            </button>
          </div>
          {/*
            Os cinco campos não desapareceram — viraram uma gaveta que ninguém
            precisa abrir para começar. Este é o caminho que ainda precisa deles:
            um adaptador que o daemon não instala e não sabe nomear.
          */}
          <AgentConfigDialog embedded onClose={() => setCustom(false)} />
        </div>
      )}

      {!custom && open?.kind === "connect" && (
        <ConnectPanel
          configured={agents.map((row) => row.command)}
          onClose={close}
          onCustom={() => {
            setCustom(true);
            setOpen(null);
          }}
          onConnected={(id) => setOpen({ kind: "agent", id })}
        />
      )}

      {!custom && chosen !== undefined && (
        <AgentPanel config={chosen} onClose={close} onCustom={() => setCustom(true)} />
      )}

      <div className="foot-head">
        <span className="foot-head__label">Agentes</span>
        {/*
          O `＋` é o único caminho para o **próximo** agente, e é o único sempre
          visível: com zero agentes não há linha onde passar o ponteiro, e um botão
          que só aparece no hover, num estado em que não existe nada para apontar,
          é uma saída que não existe (`sidebar-actions`, Q1).
        */}
        <button
          type="button"
          className="act"
          title="conectar um agente"
          aria-label="conectar um agente"
          onClick={() => setOpen({ kind: "connect" })}
        >
          ＋
        </button>
      </div>

      {agents.length === 0 ? (
        <span className="foot-empty">nenhum agente conectado</span>
      ) : (
        agents.map((config) => (
          <AgentRow
            key={config.id}
            config={config}
            open={open?.kind === "agent" && open.id === config.id}
            onOpen={() => setOpen({ kind: "agent", id: config.id })}
          />
        ))
      )}
    </>
  );
}

/** O que uma linha do rodapé precisa saber sobre a configuração dela. */
interface AgentConfigView {
  id: string;
  name: string;
  command: string;
  args: readonly string[];
  adapterVersion: string | null;
}

/**
 * O handshake de **uma** configuração.
 *
 * Uma consulta por agente, e a chave é o comando mais os argumentos — que é o que
 * faz a linha e o painel do mesmo agente dividirem uma resposta em vez de subirem
 * dois processos. Mandar só o comando já foi um defeito de verdade: uma
 * configuração cujo comando é `node` e o argumento é um script sobe, sem o
 * argumento, um REPL que não responde handshake nenhum e pendura até o limite.
 */
function useAgentProbe(config: AgentConfigView) {
  return useQuery({
    queryKey: [...PROBE_KEY, config.command, config.args.join(" ")],
    queryFn: () => trpc.setup.probe.query({ command: config.command, args: [...config.args] }),
    retry: false,
    refetchOnWindowFocus: false,
    /*
     * Não é perguntado de novo a cada montagem.
     *
     * Um probe é um processo: sobe o adaptador, aperta a mão e mata. Isso é barato
     * em token (zero) e não é grátis em tempo (~0,6 s), e a resposta muda mais ou
     * menos com a frequência com que uma credencial expira. "Verificar de novo" é
     * o botão para quando muda.
     */
    staleTime: 5 * 60_000,
  });
}

type AgentProbe = ReturnType<typeof useAgentProbe>;

/** Verde passa, âmbar espera, vermelho não vai — a escala de três da barra da PR. */
function stateOf(probe: AgentProbe): { tone: "on" | "off" | "warn" | "err"; word: string } {
  if (probe.isPending) return { tone: "off", word: "verificando" };
  if (probe.isError) return { tone: "err", word: "falhou" };
  // Instalado e sem credencial não é `nenhum` nem `falhou`: é uma pendência com
  // saída, e a saída é clicar na linha. O rótulo é um **verbo** por isso.
  if (probe.data?.authRequired === true) return { tone: "warn", word: "entrar" };
  return { tone: "on", word: "conectado" };
}

function AgentRow({
  config,
  open,
  onOpen,
}: {
  config: AgentConfigView;
  open: boolean;
  onOpen: () => void;
}) {
  const probe = useAgentProbe(config);
  const { tone, word } = stateOf(probe);

  return (
    <button
      type="button"
      className={`foot-row foot-row--${tone}${open ? " is-open" : ""}`}
      aria-label={`${config.name}: ${word}`}
      onClick={onOpen}
    >
      <Glyph tone="agent">◆</Glyph>
      <span className="foot-row__label">{config.name}</span>
      {/*
        O ponto tem a cor do estado. Ele nascia cinza nos três — herda a cor da
        linha, e a cor do estado vive na palavra ao lado. Com uma linha a palavra
        bastava; com duas, o ponto é o que o olho varre primeiro.
      */}
      <span className="pip" />
      <span className="foot-row__st">{word}</span>
    </button>
  );
}

/** Uma entrada do relatório de pré-voo, do jeito que esta tela a lê. */
interface AdapterEntry {
  id: string;
  label: string;
  adapter: { path: string | null; version: string | null };
  cli: { command: string; path: string | null; version: string | null } | null;
  apiKeyEnv: string | null;
}

/**
 * O `＋`: qual agente conectar, e o preparo dele.
 *
 * A lista é o **catálogo do daemon** e não uma lista desta tela: `ADAPTERS`, no
 * `shared`. O que já está conectado continua listado, desabilitado — sumir com ele
 * faz a pessoa procurar.
 */
function ConnectPanel({
  configured,
  onClose,
  onCustom,
  onConnected,
}: {
  configured: readonly string[];
  onClose: () => void;
  onCustom: () => void;
  onConnected: (configId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<"idle" | "installing" | "handshaking">("idle");
  const [chosen, setChosen] = useState<AdapterSpec | null>(null);

  const report = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => trpc.setup.agents.query(),
    refetchOnWindowFocus: false,
  });

  const connect = useMutation({
    mutationFn: async (spec: AdapterSpec) => {
      setChosen(spec);
      const found = entryOf(report.data, spec.id);
      let command = found?.adapter.path ?? null;

      if (command === null) {
        setStage("installing");
        const installed = await trpc.setup.installAdapter.mutate({ adapterId: spec.id });
        command = installed.path;
      }

      setStage("handshaking");
      const probe = await trpc.setup.probe.query({ command });
      const created = await trpc.agentConfig.create.mutate({
        // Curto, porque ele nomeia a aba da sessão.
        name: spec.id,
        command,
        args: [],
        transport: "acp",
        // A versão é **detectada**, nunca digitada: ela vem do handshake.
        adapterVersion: probe.agentInfo?.version ?? spec.pinnedVersion,
      });
      return created.id;
    },
    onSettled: async () => {
      setStage("idle");
      await queryClient.invalidateQueries({ queryKey: AGENT_CONFIGS_KEY });
      await queryClient.invalidateQueries({ queryKey: AGENTS_KEY });
    },
    onSuccess: (id) => onConnected(id),
  });

  return (
    <div className="setup" role="group" aria-label="conectar agente">
      <div className="setup__head">
        <span className="setup__t">
          {connect.isPending ? `Preparando o ${chosen?.label ?? "agente"}` : "Conectar agente"}
        </span>
        {!connect.isPending && (
          <button type="button" className="setup__x" aria-label="fechar" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {connect.isPending ? (
        <Preparing spec={chosen} stage={stage} entry={entryOf(report.data, chosen?.id)} />
      ) : (
        <>
          {ADAPTERS.map((spec, index) => {
            const found = entryOf(report.data, spec.id);
            const already =
              found?.adapter.path != null && configured.includes(found.adapter.path);

            return (
              <button
                type="button"
                key={spec.id}
                /*
                 * Um preenchido por painel, e é o primeiro do catálogo que ainda
                 * não está conectado. Dois preenchidos seriam duas recomendações.
                 */
                className={index === 0 && !already ? "opt opt--primary" : "opt"}
                /*
                 * Desabilitado também enquanto a detecção está no ar, e isso não é
                 * gentileza: o `connect` decide se instala lendo o que a detecção
                 * achou. Clicado antes da resposta, ele lê "não achei nada" e
                 * instala um adaptador que já estava lá — minutos de npm para nada.
                 */
                disabled={already || connect.isPending || report.isPending}
                onClick={() => connect.mutate(spec)}
              >
                <span className="opt__t">
                  <span className="opt__g" aria-hidden="true">
                    ◆
                  </span>
                  {spec.label}
                </span>
                <span className="opt__d">
                  {describeSpec(spec, found, already === true, report.isPending)}
                </span>
              </button>
            );
          })}
          <button type="button" className="linkbtn" onClick={onCustom}>
            outro agente ACP…
          </button>
          <span className="setup__note">
            A lista é o <b>catálogo do daemon</b>. O adaptador é instalado{" "}
            <b>dentro da pasta do app</b> e fixado numa versão — nunca <code>@latest</code>, para uma
            atualização de madrugada não mudar o comportamento do agente.
          </span>
          {connect.isError && <Banner tone="danger">{connect.error.message}</Banner>}
        </>
      )}
    </div>
  );
}

function entryOf(
  report: { adapters: readonly AdapterEntry[] } | undefined,
  id: string | undefined,
): AdapterEntry | undefined {
  if (id === undefined) return undefined;
  return report?.adapters.find((entry) => entry.id === id);
}

/** O que a linha do catálogo diz sobre uma spec, antes do clique. */
function describeSpec(
  spec: AdapterSpec,
  found: AdapterEntry | undefined,
  already: boolean,
  pending: boolean,
): string {
  if (already) return "já conectado";
  if (pending) return "procurando na sua máquina…";

  /*
   * O que a linha relata é o que a pessoa **não** resolve clicando.
   *
   * O adaptador o daemon instala; o CLI que ele dirige, não — e por isso é a
   * presença do CLI que decide se vale clicar. Quando a spec não dirige nenhum
   * (o `codex-acp` traz o próprio, §4.8), o que sobra a relatar é o adaptador.
   */
  if (spec.cli !== null) {
    return found?.cli?.path == null
      ? `o CLI ${spec.cli.command} não está no PATH — o adaptador precisa dele`
      : `${spec.cli.command} encontrado · ${found.cli.version ?? "versão não lida"}`;
  }
  return found?.adapter.path == null
    ? "o adaptador traz o próprio agente dentro"
    : `instalado · ${found.adapter.version ?? "versão não lida"}`;
}

/**
 * O preparo, em duas ou três linhas.
 *
 * Três quando a spec dirige um CLI que tem que existir; **duas** quando ela traz o
 * próprio agente dentro. A linha desaparece porque a etapa desaparece — medido: o
 * `codex-acp` responde o handshake com `PATH=/nonexistent`.
 */
function Preparing({
  spec,
  stage,
  entry,
}: {
  spec: AdapterSpec | null;
  stage: "idle" | "installing" | "handshaking";
  entry: AdapterEntry | undefined;
}) {
  type Mark = "done" | "now" | "wait";
  const rows: [string, Mark][] = [];

  if (spec?.cli != null) {
    rows.push([`${spec.cli.command} encontrado`, entry?.cli?.path == null ? "wait" : "done"]);
  }
  rows.push([
    "instalando o adaptador",
    stage === "installing" ? "now" : stage === "handshaking" ? "done" : "wait",
  ]);
  rows.push(["handshake", stage === "handshaking" ? "now" : "wait"]);

  return (
    <>
      <div className="prep">
        {rows.map(([label, mark]) => (
          <div className={`prep__r prep__r--${mark}`} key={label}>
            <span className="prep__m" aria-hidden="true">
              {mark === "done" ? "✓" : mark === "now" ? "◐" : "○"}
            </span>
            {label}
          </div>
        ))}
      </div>
      <span className="setup__note">
        {spec !== null && spec.cli === null ? (
          <>
            Duas linhas, e não três: este adaptador <b>não precisa de CLI no PATH</b> — ele traz o
            próprio. Não há o que procurar na sua máquina.
          </>
        ) : (
          <>
            Nada para rodar no terminal: o adaptador é instalado <b>dentro da pasta do app</b> e
            fixado numa versão.
          </>
        )}
      </span>
    </>
  );
}

/**
 * O painel de **um** agente: conectado, precisando entrar, ou quebrado.
 *
 * Ele é aberto pela linha, e a linha fica marcada enquanto ele está aberto — com
 * duas linhas, um painel sem dono obriga a ler o título para saber de quem ele é.
 */
function AgentPanel({
  config,
  onClose,
  onCustom,
}: {
  config: AgentConfigView;
  onClose: () => void;
  onCustom: () => void;
}) {
  const queryClient = useQueryClient();
  const [advanced, setAdvanced] = useState(false);
  const probe = useAgentProbe(config);

  const reprobe = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PROBE_KEY });
  }, [queryClient]);

  /** O rótulo do agente: o `title` do handshake, e o nome da configuração antes dele. */
  const label = probe.data?.agentInfo?.title ?? config.name;

  return (
    <div className="setup" role="group" aria-label={`agente ${config.name}`}>
      <div className="setup__head">
        <span className="setup__t">{title()}</span>
        <button type="button" className="setup__x" aria-label="fechar" onClick={onClose}>
          ✕
        </button>
      </div>
      {body()}
    </div>
  );

  function title(): string {
    if (advanced) return "Adaptador";
    if (probe.isError) return "Não deu para conectar";
    if (probe.data?.authRequired === true) return `Entrar no ${label}`;
    return label;
  }

  function body() {
    if (advanced) return advancedDrawer();
    if (probe.isError) return failure(probe.error.message);
    if (probe.data?.authRequired === true) {
      return (
        <LoginOptions
          config={config}
          methods={probe.data.authMethods}
          onDone={() => void reprobe()}
        />
      );
    }
    return connected();
  }

  function connected() {
    const report = probe.data;

    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">agente</span>
            <span className="acct__v">
              <b>{label}</b>
              {report?.agentInfo != null && <> · {report.agentInfo.version}</>}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">entrada</span>
            <span className="acct__v">
              {report?.authMethods.length === 0 ? "credencial local, já válida" : "credencial local"}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">padrão</span>
            <span className="acct__v">{report?.currentMode ?? "o padrão do agente"}</span>
          </div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={() => void reprobe()}>
            verificar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={() => setAdvanced(true)}>
            avançado
          </button>
        </div>
        {/*
          Sem `sair`, e isso é a resposta do protocolo e não uma omissão: o
          `logout` existe no ACP e é gatilhado em `agentCapabilities.auth.logout`.
          O `claude-agent-acp` manda `auth: null`; o `codex-acp` **declara** a
          capacidade, e o Lumem ainda não a chama — está no backlog. Um botão aqui
          mentiria nos dois casos, por motivos diferentes.
        */}
        <span className="setup__note">
          Trocar de conta é <code>/logout</code> no seu agente: o Lumem ainda não chama a capacidade{" "}
          <code>auth.logout</code>, então um botão aqui não faria nada.
        </span>
      </>
    );
  }

  function advancedDrawer() {
    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">comando</span>
            <span className="acct__v">{config.command}</span>
          </div>
          <div className="acct__r">
            <span className="acct__k">args</span>
            <span className="acct__v">{config.args.length ? config.args.join(" ") : "nenhum"}</span>
          </div>
          <div className="acct__r">
            <span className="acct__k">versão</span>
            <span className="acct__v">{config.adapterVersion ?? "não fixada"}</span>
          </div>
        </div>
        <span className="setup__note">
          Só para quem mantém o próprio adaptador. O Lumem usa o que instalou e a versão que fixou —
          para trocar, remova esta configuração em <b>outro agente ACP…</b> e crie a sua.
        </span>
        <button type="button" className="linkbtn" onClick={() => setAdvanced(false)}>
          voltar
        </button>
      </>
    );
  }

  function failure(message: string) {
    return (
      <>
        <div className="fail">
          <span className="fail__title">
            <span aria-hidden="true">✕</span>
            não deu para conectar
          </span>
          <span className="fail__body">
            O adaptador não respondeu ao handshake. O que ele disse está abaixo.
          </span>
          <div className="fail__cmd">{message}</div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="primary" onClick={() => void reprobe()}>
            tentar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={onCustom}>
            outro agente ACP…
          </button>
        </div>
      </>
    );
  }
}

interface AuthMethodView {
  id: string;
  name: string;
  description: string | null;
  type: string;
  command: string | null;
  args: readonly string[];
}

/**
 * Os jeitos de entrar, como o adaptador os listou — e são de duas naturezas.
 *
 * Um método `type: "terminal"` é um **comando**: o daemon abre um PTY e roda o que
 * o adaptador nomeou. Qualquer outro é uma **chamada**: `authenticate`, que pode
 * pedir uma chave ou mandar mostrar uma URL com um código. Medido na fase 0 da
 * `second-agent`: o `claude-agent-acp` só oferece comandos e o `codex-acp` só
 * oferece chamadas, então esta é a tela em que os dois agentes divergem mais.
 *
 * **Nenhum caminho aqui inventa método.** Se o adaptador não ofereceu nada que dê
 * para executar, o painel diz isso — nunca um botão que não existe.
 */
function LoginOptions({
  config,
  methods,
  onDone,
}: {
  config: AgentConfigView;
  methods: readonly AuthMethodView[];
  onDone: () => void;
}) {
  const [loginPty, setLoginPty] = useState<string | null>(null);
  const [keyFor, setKeyFor] = useState<AuthMethodView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);

  const terminal = useLoginTerminal({
    ptySessionId: loginPty,
    // Quem confirma o login é o adaptador respondendo, nunca a pessoa afirmando.
    onFinished: () => {
      setLoginPty(null);
      onDone();
    },
  });

  const target = { command: config.command, args: [...config.args] };

  const byCommand = useMutation({
    mutationFn: (methodId: string) => trpc.setup.login.mutate({ methodId, ...target }),
    onSuccess: (started) => setLoginPty(started.ptySessionId),
  });

  const byCall = useMutation({
    mutationFn: (input: { methodId: string; apiKey?: string }) =>
      trpc.setup.authenticate.mutate({ ...input, ...target }),
    onSuccess: (attempt) => setLoginId(attempt.id),
  });

  /*
   * O estado da chamada, perguntado enquanto ela dura.
   *
   * Um `authenticate` de método de navegador espera uma **pessoa** autorizar noutro
   * lugar, e o pedido de mostrar a URL chega no meio dessa espera — não no fim
   * dela. Por isso o daemon devolve um id e a tela pergunta: é o mesmo desenho do
   * login por comando, que devolvia um `ptySessionId` para o cliente acompanhar.
   */
  const attempt = useQuery({
    queryKey: ["setup", "authState", loginId],
    queryFn: () => trpc.setup.authState.query({ loginId: loginId ?? "" }),
    enabled: loginId !== null,
    refetchInterval: (query) =>
      query.state.data === undefined || query.state.data.state === "running" ? 700 : false,
  });

  const cancel = useMutation({
    mutationFn: () => trpc.setup.cancelAuth.mutate({ loginId: loginId ?? "" }),
    onSuccess: () => setLoginId(null),
  });

  const state = attempt.data?.state;

  if (loginPty !== null || terminal.running) return waitingForCommand();
  if (loginId !== null && state === "ok") return entered();
  if (loginId !== null && (state === "running" || state === undefined)) return waitingForCall();
  if (keyFor !== null) return keyForm(keyFor);

  /*
   * O que o Lumem sabe executar.
   *
   * Um método `terminal` sem comando é o adaptador dizendo "eu mesmo", e adivinhar
   * qual dos nomes dele está nesta máquina é justamente o palpite que já produziu
   * um comando de instalação errado. Os métodos de **chamada** não têm esse
   * problema: o id basta.
   */
  const usable = methods.filter((method) => method.type !== "terminal" || method.command !== null);

  if (usable.length === 0) {
    return (
      <>
        <Banner tone="warning">
          O adaptador não ofereceu nenhuma forma de entrar que o Lumem saiba executar
          {methods.length > 0 && <> — ele listou {methods.length}, e nenhuma delas dá para rodar</>}.
        </Banner>
        <Button size="sm" variant="ghost" onClick={onDone}>
          verificar de novo
        </Button>
      </>
    );
  }

  return (
    <>
      {usable.map((method, index) => (
        <button
          type="button"
          key={method.id}
          // Um preenchido por painel: o caminho que serve para quase todo mundo.
          // O segundo é contorno, não gêmeo.
          className={index === 0 ? "opt opt--primary" : "opt"}
          disabled={byCommand.isPending || byCall.isPending}
          onClick={() => {
            if (method.type === "terminal") {
              byCommand.mutate(method.id);
              return;
            }
            // Uma chave é a única coisa que a pessoa tem que digitar; ela ganha um
            // campo antes da chamada. Os outros métodos vão direto.
            if (needsKey(method)) {
              setKeyFor(method);
              return;
            }
            byCall.mutate({ methodId: method.id });
          }}
        >
          <span className="opt__t">
            <span className="opt__g" aria-hidden="true">
              {index === 0 ? "◆" : "◇"}
            </span>
            {method.name}
          </span>
          <span className="opt__d">{describeMethod(method)}</span>
        </button>
      ))}
      <span className="setup__note">
        Estas opções vieram <b>do próprio adaptador</b>, no handshake. O Lumem não inventa método de
        login.
      </span>
      {byCommand.isError && <Banner tone="danger">{byCommand.error.message}</Banner>}
      {byCall.isError && <Banner tone="danger">{byCall.error.message}</Banner>}
      {state === "failed" && attempt.data?.message != null && (
        <Banner tone="danger">{attempt.data.message}</Banner>
      )}
    </>
  );

  /** O comando do adaptador rodando num terminal do daemon. */
  function waitingForCommand() {
    return (
      <>
        <div className="prep">
          <div className="prep__r prep__r--done">
            <span className="prep__m" aria-hidden="true">
              ✓
            </span>
            adaptador de pé
          </div>
          <div className="prep__r prep__r--now">
            <span className="prep__m" aria-hidden="true">
              ◐
            </span>
            autorize no navegador e volte
          </div>
        </div>
        {terminal.output.length > 0 && (
          <div className="out out--short">
            {terminal.output.map((line, index) => (
              // Output lines have no identity and never reorder.
              // eslint-disable-next-line react/no-array-index-key
              <span className="l" key={index}>
                {line}
              </span>
            ))}
          </div>
        )}
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={() => setLoginPty(null)}>
            cancelar
          </Button>
        </div>
        <span className="setup__note">
          Terminou lá? Este painel muda sozinho — quem confirma é o adaptador respondendo, não você
          dizendo que entrou.
        </span>
      </>
    );
  }

  /** A chamada em andamento — e a URL com o código, quando o agente pede uma. */
  function waitingForCall() {
    const elicitation = attempt.data?.elicitation ?? null;

    return (
      <>
        {elicitation !== null && (
          <div className="dcode">
            <span className="dcode__k">abra em qualquer aparelho</span>
            <CopyCommand command={elicitation.url} />
            {/*
              O código é o único texto grande desta tela, e por um motivo medido:
              ele é o único número que a pessoa vai **ler e digitar** em outro
              lugar. O protocolo não tem campo para ele — o adaptador o escreve
              dentro da frase —, então o daemon destaca o que parece um código e a
              tela mostra a frase inteira embaixo. Sem código reconhecível, a frase
              é tudo, e ela continua ali.
            */}
            {elicitation.code !== null && (
              <>
                <span className="dcode__k">e digite este código</span>
                <span className="dcode__v">{elicitation.code}</span>
              </>
            )}
            <span className="setup__note">{elicitation.message}</span>
          </div>
        )}
        <div className="prep">
          <div className="prep__r prep__r--now">
            <span className="prep__m" aria-hidden="true">
              ◐
            </span>
            {elicitation === null ? "entrando…" : "esperando você autorizar"}
          </div>
        </div>
        <div className="setup__acts">
          <Button
            size="sm"
            variant="ghost"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            cancelar
          </Button>
        </div>
        <span className="setup__note">
          {elicitation === null
            ? "Terminou lá? Este painel muda sozinho — quem confirma é o adaptador respondendo."
            : "Nada abre aqui, e é de propósito: o daemon pode estar noutra máquina."}
        </span>
      </>
    );
  }

  /** Entrou. O painel fecha quando o probe novo disser que não há mais o que pedir. */
  function entered() {
    return (
      <>
        <div className="prep">
          <div className="prep__r prep__r--done">
            <span className="prep__m" aria-hidden="true">
              ✓
            </span>
            credencial aceita pelo adaptador
          </div>
        </div>
        <div className="setup__acts">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setLoginId(null);
              onDone();
            }}
          >
            continuar
          </Button>
        </div>
      </>
    );
  }

  /** Colar, não digitar: um campo, sem confirmação em dois passos. */
  function keyForm(method: AuthMethodView) {
    return (
      <>
        <div className="key-in">
          <Input
            type="password"
            aria-label="chave de API"
            placeholder="sk-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={apiKey.trim() === "" || byCall.isPending}
            onClick={() => {
              byCall.mutate({ methodId: method.id, apiKey: apiKey.trim() });
              // Apagada da tela no mesmo gesto que a envia: ela atravessa o daemon
              // e não tem por que continuar existindo aqui.
              setApiKey("");
              setKeyFor(null);
            }}
          >
            usar
          </Button>
        </div>
        <span className="setup__note">
          Ela <b>atravessa</b> o daemon e vai para o adaptador. O Lumem não grava chave: não vai para
          o <code>~/.lumem</code>, não vai para log, e não volta para esta tela.
        </span>
        <button type="button" className="linkbtn" onClick={() => setKeyFor(null)}>
          voltar aos jeitos de entrar
        </button>
      </>
    );
  }
}

/** Um método que pede uma chave é o único que precisa de um campo antes da chamada. */
function needsKey(method: AuthMethodView): boolean {
  return method.type === "env_var" || /api[- ]?key/i.test(method.id);
}

/** A descrição do agente, e o que o Lumem sabe dizer quando ele não deu uma. */
function describeMethod(method: AuthMethodView): string {
  if (method.description !== null && method.description !== "") return method.description;
  if (method.type === "terminal") return "roda um comando num terminal do daemon";
  return "abre o navegador nesta máquina";
}
