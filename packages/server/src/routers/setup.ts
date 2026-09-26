import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { DEFAULT_ADAPTER_ID, adapterById, type AdapterSpec } from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import { accountLaunchFor, recordProbedIdentity, type AccountLaunch } from "../setup/account-launch.js";
import { detectAgents } from "../setup/agents.js";
import { adapterCommandFor, adaptersDir, catalogedAdapterAt } from "../setup/adapter-command.js";
import {
  adapterBinaryPath,
  adapterDir,
  installAdapter,
  installedAdapterVersion,
} from "../setup/install-adapter.js";
import { startLogin } from "../setup/login.js";
import { preflight } from "../setup/preflight.js";
import { domainSafe, domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * What the first-access and login flows read, and the two things they run.
 *
 * The reads — `preflight`, `agents`, `probe` — change nothing. The two mutations
 * do, and both are deliberate widenings of what a local daemon does on a click:
 * `installAdapter` runs a package manager and then executes what it downloaded,
 * and `login` runs a command the *adapter* named, in a terminal. Each one carries
 * its own note about why that is acceptable and what bounds it.
 */
/**
 * The spec of an id, refusing an id nobody catalogued.
 *
 * Refused **here**, before any `npm` runs: an unknown id that fell through to a
 * default would install Claude for someone who asked for something else, and the
 * screen would report success for the wrong agent.
 */
function specOf(id: string | undefined): AdapterSpec {
  const spec = adapterById(id ?? DEFAULT_ADAPTER_ID);
  if (spec === null) {
    throw new DomainError("INVALID_ARGUMENT", `não existe adaptador "${id}" no catálogo`);
  }
  return spec;
}

/**
 * A spec de partida para resolver a conta: a do comando explícito, a do
 * `adapterId`, ou nenhuma quando só a conta foi dita — aí quem diz o agente é
 * a configuração dela.
 */
function requestedSpec(
  stateDir: string,
  input: { command?: string | undefined; adapterId?: string | undefined; accountId?: string | undefined },
): AdapterSpec | null {
  if (input.command !== undefined) return catalogedAdapterAt(input.command, stateDir);
  if (input.accountId !== undefined && input.adapterId === undefined) return null;
  return specOf(input.adapterId);
}

/** O binário a lançar: o explícito, ou a cópia gerenciada da spec da conta. */
function commandFor(stateDir: string, explicit: string | undefined, launch: AccountLaunch): string {
  if (explicit !== undefined) return explicit;
  if (launch.spec === null) {
    throw new DomainError(
      "INVALID_ARGUMENT",
      "esta conta é de um agente fora do catálogo: diga o comando do adaptador",
    );
  }
  return adapterCommandFor(launch.spec, stateDir);
}

/** O `env`/`unsetEnv` de uma conta, só com o que há — um objeto vazio não é nada a dizer. */
function accountEnvOptions(launch: AccountLaunch) {
  return {
    ...(Object.keys(launch.env).length > 0 ? { env: launch.env } : {}),
    ...(launch.unsetEnv.length > 0 ? { unsetEnv: launch.unsetEnv } : {}),
  };
}

/**
 * Qual conta, para `probe`, `login` e `authenticate` (`034` T6). Ausente, a
 * padrão do agente — que sobe sem a variável do CLI.
 */
const accountIdField = z.string().trim().min(1).optional();

/** Which adapter, for the procedures that act on one. Absent means the default. */
const adapterInput = z.object({ adapterId: z.string().trim().min(1).optional() }).optional();

export const setupRouter = router({
  /** The five checks, each one able to fail without the others. */
  preflight: publicProcedure.query(({ ctx }) => preflight({ config: ctx.config })),

  /**
   * `claude` and the adapter: where they are, and what version they claim.
   *
   * The adapter is looked for on the PATH *and* in the directory the daemon
   * installs into — a machine where the daemon installed it has no reason to also
   * have it globally, and the flow must not ask twice for the same thing.
   */
  agents: publicProcedure.query(({ ctx }) =>
    detectAgents({
      installedAt: (spec) => adapterBinaryPath(adaptersDir(ctx.config.stateDir), spec),
    }),
  ),

  /**
   * Installs the adapter into the daemon's own directory, at the pinned version.
   *
   * A mutation, and the only one this router has: it downloads and writes. What it
   * costs is named in `install-adapter.ts` — the daemon runs a package manager and
   * then executes what it downloaded.
   */
  installAdapter: publicProcedure
    .input(adapterInput)
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() =>
        installAdapter({ spec: specOf(input?.adapterId), dir: adaptersDir(ctx.config.stateDir) }),
      ),
    ),

  /**
   * Runs one of the adapter's own login commands in a terminal the daemon owns.
   *
   * The command is not chosen here: it is the one the adapter handed over in
   * `authMethods`, which is why this takes it as input rather than composing it.
   * A client that invented a command would be running arbitrary binaries on the
   * daemon's machine, so the input is checked against what the adapter offered.
   */
  login: publicProcedure
    .input(
      z.object({
        methodId: z.string().trim().min(1),
        /** Which adapter to ask. Defaults to what the flow installed or found. */
        command: z.string().trim().min(1).optional(),
        /** Which catalogued adapter, when no explicit command is given. */
        adapterId: z.string().trim().min(1).optional(),
        /**
         * And its arguments, because a command without them is a different program.
         *
         * `node` with the adapter's script is an adapter; `node` alone is a REPL
         * that answers no handshake and hangs until the timeout.
         */
        args: z.array(z.string()).optional(),
        cols: z.number().int().min(1).max(5_000).optional(),
        rows: z.number().int().min(1).max(5_000).optional(),
        /** Em que conta entrar — o login grava no diretório dela. */
        accountId: accountIdField,
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const launch = await accountLaunchFor(
          ctx.db,
          ctx.secrets,
          requestedSpec(ctx.config.stateDir, input),
          input.accountId,
        );
        const command = commandFor(ctx.config.stateDir, input.command, launch);
        const cwd = join(ctx.config.stateDir, "probe");

        /*
         * Asked again rather than trusted from the client.
         *
         * The client sends a `methodId`, not a command line: what actually gets
         * executed is whatever the adapter itself declared for that id. A client
         * that could name the binary would be a client that can run anything on
         * the machine the daemon is on.
         */
        const report = await ctx.acpManager.probe({
          command,
          ...(input.args === undefined ? {} : { args: input.args }),
          cwd,
          ...accountEnvOptions(launch),
        });
        const method = report.authMethods.find((candidate) => candidate.id === input.methodId);

        if (method === undefined) {
          throw new DomainError(
            "NOT_FOUND",
            `o adaptador não oferece o método de login "${input.methodId}"`,
          );
        }
        if (method.type !== "terminal" || method.command === null) {
          throw new DomainError(
            "BLOCKED",
            `"${method.name}" não é um login que o Lumem saiba executar: ${
              method.type === "terminal"
                ? "o adaptador não disse qual comando rodar"
                : `o método é do tipo ${method.type}`
            }`,
          );
        }

        return startLogin({
          ptyManager: ctx.ptyManager,
          command: method.command,
          args: method.args,
          cwd,
          // O terminal do login roda **na conta**: é o diretório que a variável
          // aponta que recebe a credencial.
          ...accountEnvOptions(launch),
          cols: input.cols,
          rows: input.rows,
        });
      }),
    ),

  /**
   * Entrar no agente, pela chamada que o próprio agente ofereceu (T10, T11).
   *
   * Três procedimentos e nenhum bloqueante, porque um deles espera **uma
   * pessoa**: o `authenticate` de um método de navegador fica pendurado até
   * alguém autorizar noutro lugar, e o pedido de mostrar uma URL chega no meio
   * dessa espera. Começar e perguntar é o mesmo desenho do login por comando, que
   * devolvia um `ptySessionId` para o cliente acompanhar.
   *
   * O `command` continua sendo conferido contra o handshake — o cliente manda um
   * `methodId`, e o que roda é o que o adaptador declarou para aquele id.
   */
  authenticate: publicProcedure
    .input(
      z.object({
        methodId: z.string().trim().min(1),
        /** Qual adaptador, quando não vem um comando explícito. */
        adapterId: z.string().trim().min(1).optional(),
        command: z.string().trim().min(1).optional(),
        args: z.array(z.string()).optional(),
        /**
         * A chave, quando o método pede uma.
         *
         * Ela entra por aqui, atravessa o daemon e vai para o adaptador. Não é
         * gravada, não é logada e **não volta** em nenhuma resposta — o que volta
         * é o estado da tentativa.
         */
        apiKey: z.string().min(1).optional(),
        /** Em que conta entrar. */
        accountId: accountIdField,
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const launch = await accountLaunchFor(
          ctx.db,
          ctx.secrets,
          input.command === undefined ? requestedSpec(ctx.config.stateDir, input) : null,
          input.accountId,
        );
        const spec = launch.spec ?? specOf(input.adapterId);
        const cwd = join(ctx.config.stateDir, "probe");
        mkdirSync(cwd, { recursive: true });

        return Promise.resolve(
          ctx.agentAuth.start({
            command: input.command ?? adapterCommandFor(spec, ctx.config.stateDir),
            ...(input.args === undefined ? {} : { args: input.args }),
            cwd,
            ...accountEnvOptions(launch),
            methodId: input.methodId,
            ...(input.apiKey === undefined ? {} : { apiKey: input.apiKey }),
            /*
             * A versão **no disco**, e não `spec.pinnedVersion`.
             *
             * Era o pino, literalmente — o que faz do campo uma repetição da
             * constante em vez de um relato, que é exatamente o que o
             * `install-adapter.ts` chama de *"a mentira que esconde a LUM-54"*. Lá
             * foi consertado; aqui, no caminho do login, ficou. Nesta máquina isso
             * estava vivo em 2026-09-08: o daemon rodava o `0.40.0` e um login
             * teria carimbado `0.75.1` na linha.
             *
             * Cai para o pino só quando não há `package.json` a ler — um layout
             * que este daemon não escreveu, onde a resposta honesta é a única que
             * ele tem.
             */
            adapterVersion:
              installedAdapterVersion(
                adapterDir(adaptersDir(ctx.config.stateDir), spec),
                spec,
              ) ?? spec.pinnedVersion,
          }),
        );
      }),
    ),

  /** O estado de uma tentativa de login. É o que a tela pergunta enquanto espera. */
  authState: publicProcedure
    .input(z.object({ loginId: z.string().trim().min(1) }))
    .query(({ ctx, input }) => domainSafe(() => ctx.agentAuth.status(input.loginId))),

  /**
   * Desistir: mata o adaptador.
   *
   * Não há "cancelar" no protocolo — o `authenticate` está esperando uma pessoa,
   * e a única forma de parar de esperar é o processo acabar. Ele é do daemon.
   */
  cancelAuth: publicProcedure
    .input(z.object({ loginId: z.string().trim().min(1) }))
    .mutation(({ ctx, input }) => domainSafe(() => ctx.agentAuth.cancel(input.loginId))),

  /**
   * One handshake, then the process dies.
   *
   * A query and not a mutation, deliberately: it changes nothing that outlives
   * the call. That it starts a process is an implementation detail of *reading*
   * whether the adapter works — the same way `project.inspect` runs git.
   */
  probe: publicProcedure
    .input(
      z
        .object({
          /** Defaults to the adapter the flow installs. */
          command: z.string().trim().min(1).optional(),
          /** Which catalogued adapter, when no explicit command is given. */
          adapterId: z.string().trim().min(1).optional(),
          args: z.array(z.string()).optional(),
          /** Qual conta conferir. Ausente, a padrão. */
          accountId: accountIdField,
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const launch = await accountLaunchFor(
          ctx.db,
          ctx.secrets,
          requestedSpec(ctx.config.stateDir, input ?? {}),
          input?.accountId,
        );
        const command = commandFor(ctx.config.stateDir, input?.command, launch);

        /*
         * A directory of its own, and an empty one.
         *
         * `cwd` is where the agent would read files from, and pointing a probe at
         * a real checkout would have the adapter index a repository to answer a
         * question about whether it starts.
         */
        const cwd = join(ctx.config.stateDir, "probe");
        try {
          mkdirSync(cwd, { recursive: true });
        } catch (error) {
          throw new DomainError(
            "SPAWN_FAILED",
            `não deu para criar ${cwd}: ${error instanceof Error ? error.message : String(error)}`,
            { cause: error },
          );
        }

        const report = await ctx.acpManager.probe(
          {
            command,
            ...(input?.args === undefined ? {} : { args: input.args }),
            cwd,
            ...accountEnvOptions(launch),
          },
          // Conferido pela identidade (`034` T6), e não pelo `session/new`, que
          // no Claude `0.75.1` fecha sem credencial nenhuma.
          { identity: launch.spec?.identity ?? null },
        );
        await recordProbedIdentity(ctx.db, launch.account, report);
        // Uma conferência que leu o login pode ter conectado a conta e trocado
        // a padrão (`034` T8): a lista de contas de outra aba ficou velha.
        if (launch.account !== null && report.loggedIn && launch.spec !== null) {
          ctx.events.emit({ type: "account.changed", adapterId: launch.spec.id });
        }

        /*
         * O que este probe descobriu vai para o catálogo, e é o que tira a
         * pílula de `sem login` depois de alguém entrar na conta.
         *
         * Até aqui, só uma sessão aberta gravava `authRequired: false` — e a
         * sessão não abre, porque a pílula diz que não dá. "Verificar de novo"
         * depois do login é este probe, então é aqui que a resposta nova tem
         * que ficar. Só para o binário gerenciado de uma spec e sem argumento:
         * qualquer outro comando é um programa que o catálogo não descreve.
         *
         * Sem `optionsByModel`, que o catálogo preserva: este probe não percorre
         * modelo. E nunca derruba a resposta — o catálogo é cache.
         */
        //
        // Só a conta padrão escreve aqui: o catálogo ainda é por adaptador, e a
        // T9 o faz por conta. Gravar a leitura da conta 2 no lugar da padrão
        // mentiria sobre a pílula de quem nunca escolheu a conta 2.
        const spec = launch.spec;
        if (spec !== null && (input?.args ?? []).length === 0 && input?.accountId === undefined) {
          await ctx.adapterCatalog
            .recordOptions(spec.id, report.configOptions, { authRequired: report.authRequired })
            .catch(() => undefined);
        }
        return report;
      }),
    ),
});
