import { describe, expect, it } from "vitest";

import { trackWrite, whenWritesSettle } from "./pending-writes.js";

/** A promise the test decides when to settle. */
function deferred<T>(): { promise: Promise<T>; resolve(value: T): void; reject(why: unknown): void } {
  let resolve!: (value: T) => void;
  let reject!: (why: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

/** Whether a promise is already settled, without waiting for it to be. */
async function isSettled(promise: Promise<unknown>): Promise<boolean> {
  const marker = Symbol("pending");
  return (await Promise.race([promise, Promise.resolve(marker)])) !== marker;
}

describe("as gravações no ar", () => {
  it("não faz esperar quando não há nada no ar", async () => {
    await expect(whenWritesSettle()).resolves.toBeUndefined();
  });

  it("espera a gravação registrada", async () => {
    const write = deferred<void>();
    trackWrite(write.promise);

    const waiting = whenWritesSettle();
    expect(await isSettled(waiting)).toBe(false);

    write.resolve();

    await expect(waiting).resolves.toBeUndefined();
  });

  it("não transforma uma gravação que falhou em gesto que não aconteceu", async () => {
    const write = deferred<void>();
    trackWrite(write.promise);
    const waiting = whenWritesSettle();

    write.reject(new Error("README.md não está mais no checkout"));

    // Quem espera não está decidindo nada sobre o resultado: está esperando o
    // daemon terminar com aquele caminho, e uma gravação recusada terminou com
    // ele tanto quanto uma aceita. Rejeitar aqui faria "o salvamento falhou"
    // virar "o rename nunca saiu".
    await expect(waiting).resolves.toBeUndefined();
  });
});
