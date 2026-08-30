import { vi } from "vitest";

/**
 * A stand-in for the whole tRPC client.
 *
 * Every component test mocks the same module, and each one re-declaring the
 * shape by hand is how a procedure gets renamed on the server while the tests
 * keep passing against a mock that no longer matches anything.
 *
 * **Algumas queries têm resposta default, e é de propósito.** `useQuery` estoura
 * quando a `queryFn` devolve `undefined`, e uma tela nova que consulta o daemon no
 * `mount` faz cada teste antigo que renderiza o `App` cair — não porque o teste
 * ficou errado, mas porque o mock dele não conhecia a tela. Isso aconteceu quando
 * a tela do workspace nasceu: seis testes de projeto quebraram com "Found multiple
 * elements with the role alert", que é o banner de erro de uma query que ninguém
 * pediu.
 *
 * O default é sempre a **resposta vazia**, nunca dado inventado: quem quer
 * asserir sobre conteúdo continua obrigado a dizer qual é o conteúdo.
 *
 * `vi.clearAllMocks()` limpa chamadas e preserva implementação, então o default
 * atravessa o `beforeEach` das suítes que usam ele. `vi.resetAllMocks()` **apaga a
 * implementação** — quem chama aquele precisa de `installTrpcDefaults()` depois,
 * senão volta a receber `undefined`.
 */
const EMPTY_MEMORY = { entries: [], shadowed: [] };
const EMPTY_CORE = { chars: 0, recentChars: 0, entries: [] };
const DEFAULT_SETTINGS = { distill: false, autoLearn: false, autoLearnBudget: 3 };
function createTrpcMock() {
  return {
    health: { query: vi.fn() },
    events: { onChange: { subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })) } },
    workspace: {
      list: { query: vi.fn() },
      get: { query: vi.fn() },
      create: { mutate: vi.fn() },
      rename: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    },
    project: {
      listByWorkspace: { query: vi.fn() },
      get: { query: vi.fn() },
      // A query, and it stays one: the flow shows what the daemon read *before*
      // anything is registered, and a mock that made it a mutation would hide the
      // one property that matters about it.
      inspect: { query: vi.fn() },
      add: { mutate: vi.fn() },
      rename: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
      // What the `↳` line reads. A query, and it stays one: it runs while the
      // person is still typing and before anything has been agreed to.
      parseSource: { query: vi.fn() },
      clone: { mutate: vi.fn() },
      cloneJobs: { query: vi.fn() },
      cloneCancel: { mutate: vi.fn() },
      // Typed as the real client's shape — input first, handlers second — so a
      // test can drive `onData` without the mock's signature disagreeing.
      cloneProgress: {
        subscribe: vi.fn(
          (_input: { jobId: string }, _handlers: { onData: (job: unknown) => void }) => ({
            unsubscribe: () => {},
          }),
        ),
      },
    },
    worktree: {
      listByProject: { query: vi.fn() },
      getDetail: { query: vi.fn() },
      plan: { query: vi.fn() },
      create: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    },
    agentConfig: {
      list: { query: vi.fn() },
      create: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
    },
    files: {
      listDir: { query: vi.fn() },
      read: { query: vi.fn() },
      write: { mutate: vi.fn() },
      create: { mutate: vi.fn() },
      rename: { mutate: vi.fn() },
      remove: { mutate: vi.fn() },
      // A query, and it stays one here: the dialog consults it before anyone
      // agreed to anything, and a mock that turned it into a mutation would hide
      // the one difference that decides what a browser can fire on its own.
      deletePreview: { query: vi.fn() },
    },
    changes: {
      list: { query: vi.fn() },
      patch: { query: vi.fn() },
    },
    /** The three reads of the first-access flow. All queries; it writes nothing. */
    setup: {
      preflight: { query: vi.fn() },
      agents: { query: vi.fn() },
      probe: { query: vi.fn() },
      // The two that write: the daemon installs the adapter, and runs the login
      // command the adapter named.
      installAdapter: { mutate: vi.fn() },
      login: { mutate: vi.fn() },
    },
    memory: {
      list: { query: vi.fn().mockResolvedValue(EMPTY_MEMORY) },
      read: { query: vi.fn() },
      write: { mutate: vi.fn() },
      forget: { mutate: vi.fn() },
      revert: { mutate: vi.fn() },
      search: { query: vi.fn() },
      decisions: { query: vi.fn().mockResolvedValue([]) },
      usage: { query: vi.fn().mockResolvedValue([]) },
      core: { query: vi.fn().mockResolvedValue(EMPTY_CORE) },
      settings: { query: vi.fn().mockResolvedValue(DEFAULT_SETTINGS) },
      playbooks: { query: vi.fn().mockResolvedValue([]) },
      archivePlaybook: { mutate: vi.fn() },
      pin: { mutate: vi.fn() },
      proposals: { query: vi.fn().mockResolvedValue([]) },
      approveProposal: { mutate: vi.fn() },
      rejectProposal: { mutate: vi.fn() },
      reindex: { mutate: vi.fn() },
    },
    usage: {
      byProject: { query: vi.fn().mockResolvedValue([]) },
      byWorktree: {
        query: vi.fn().mockResolvedValue({
          worktrees: [],
          outside: { tokens: 0, cost: null, currency: null, turns: 0 },
        }),
      },
    },
    session: {
      listByScope: { query: vi.fn() },
      getDetail: { query: vi.fn() },
      createShell: { mutate: vi.fn() },
      createAgent: { mutate: vi.fn() },
      // Phase 5's two, and they were missing here for exactly the reason this mock
      // exists: nothing failed while the client called procedures the mock did not
      // have, because the tests that use them inject their own loader.
      transcript: { query: vi.fn() },
      resume: { mutate: vi.fn() },
      close: { mutate: vi.fn() },
    },
  };
}

export type TrpcMock = ReturnType<typeof createTrpcMock>;

/**
 * One instance, shared by every test file.
 *
 * `vi.mock` is hoisted above the imports, so its factory cannot close over a
 * value the test module created — but it can import this. Tests reset it in
 * `beforeEach`; nothing here leaks between files, which run in their own
 * module registries.
 */
export const trpcMock: TrpcMock = createTrpcMock();

/**
 * Reinstala as respostas default das queries que toda tela consulta.
 *
 * Existe para as suítes que usam `vi.resetAllMocks()`: ele apaga implementação, e
 * uma query sem implementação devolve `undefined`, que é o que o `useQuery`
 * recusa. O sintoma não parece isso — vem como um banner de erro a mais na tela e
 * um `Found multiple elements with the role "alert"` num teste que não fala de
 * erro nenhum.
 *
 * Chamar isto depois do reset é o que mantém um teste de projeto falando de
 * projeto quando uma tela nova passa a consultar o daemon no `mount`.
 */
export function installTrpcDefaults(mock: TrpcMock = trpcMock): void {
  mock.usage.byProject.query.mockResolvedValue([]);
  mock.usage.byWorktree.query.mockResolvedValue({
    worktrees: [],
    outside: { tokens: 0, cost: null, currency: null, turns: 0 },
  });
  mock.memory.list.query.mockResolvedValue({ entries: [], shadowed: [] });
  mock.memory.core.query.mockResolvedValue({ chars: 0, recentChars: 0, entries: [] });
  mock.memory.settings.query.mockResolvedValue({
    distill: false,
    autoLearn: false,
    autoLearnBudget: 3,
  });
  mock.memory.proposals.query.mockResolvedValue([]);
  mock.memory.decisions.query.mockResolvedValue([]);
  mock.memory.usage.query.mockResolvedValue([]);
  mock.memory.playbooks.query.mockResolvedValue([]);
}
