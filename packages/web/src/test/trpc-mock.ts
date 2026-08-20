import { vi } from "vitest";

/**
 * A stand-in for the whole tRPC client.
 *
 * Every component test mocks the same module, and each one re-declaring the
 * shape by hand is how a procedure gets renamed on the server while the tests
 * keep passing against a mock that no longer matches anything.
 */
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
      list: { query: vi.fn() },
      read: { query: vi.fn() },
      write: { mutate: vi.fn() },
      forget: { mutate: vi.fn() },
      revert: { mutate: vi.fn() },
      search: { query: vi.fn() },
      decisions: { query: vi.fn() },
      usage: { query: vi.fn() },
      proposals: { query: vi.fn() },
      approveProposal: { mutate: vi.fn() },
      rejectProposal: { mutate: vi.fn() },
      reindex: { mutate: vi.fn() },
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
