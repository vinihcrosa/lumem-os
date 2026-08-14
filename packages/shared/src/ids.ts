/**
 * Entity identifiers are opaque strings everywhere in the system. The server is
 * the only thing that mints them; clients only ever echo them back.
 *
 * `crypto.randomUUID` is used through `globalThis` on purpose: this module is
 * bundled for the browser as well as run in Node, and importing `node:crypto`
 * would break the web build.
 */
export type EntityId = string;

export function newId(): EntityId {
  return globalThis.crypto.randomUUID();
}
