import type { AcpEvent, AcpTranscriptEntry } from "@lumem/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { emptyConversation, reduceConversation, replayConversation, type ConversationState } from "./conversation-model.js";
import { Transcript } from "./Transcript.js";

/**
 * O bloco de pensamento dentro da conversa (`036` S2): aberto enquanto é
 * escrito, fechado quando acaba, e a escolha de quem clicou acima das duas.
 *
 * No `Transcript`, e não no `Thought`, porque é ele que sabe qual bloco ainda
 * cresce — o último do último turno de uma conversa em stream.
 */

let clock = 1_000;
const at = (event: AcpEvent, deltaMs = 100): AcpTranscriptEntry => ({ at: (clock += deltaMs), event });
const reduce = (entries: readonly AcpTranscriptEntry[], state = emptyConversation()): ConversationState =>
  entries.reduce(reduceConversation, state);

const asked = (): AcpTranscriptEntry => at({ type: "message", messageId: "u-1", role: "user", text: "arruma o parser" });
const thought = (text: string, deltaMs = 100): AcpTranscriptEntry => at({ type: "thought", messageId: "u-1", text }, deltaMs);
const said = (text: string): AcpTranscriptEntry => at({ type: "message", messageId: "u-1", role: "agent", text });
const tool = (toolCallId: string): AcpTranscriptEntry =>
  at({ type: "tool_call", toolCallId, title: "Read loader.ts", name: "Read", kind: "read", status: "running", locations: [] });
const ended = (): AcpTranscriptEntry => at({ type: "turn_end", stopReason: "end_turn" });

function transcript(conversation: ConversationState) {
  return <Transcript conversation={conversation} session={null} failure={null} readOnly={false} answer={vi.fn()} />;
}

const thoughts = () => screen.getAllByRole("button", { name: /pens/ });

describe("o pensamento na conversa", () => {
  it("opens a thought while it streams", () => {
    render(transcript(reduce([asked(), thought("dois caminhos")])));

    const [button] = thoughts();
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(document.querySelector(".thought__text")).not.toBeNull();
  });

  it("closes a thought when it stops streaming", () => {
    const streaming = [asked(), thought("dois caminhos")];
    const { rerender } = render(transcript(reduce(streaming)));

    rerender(transcript(reduce([...streaming, said("Vou separar.")])));

    const [button] = thoughts();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(document.querySelector(".thought__text")).toBeNull();
  });

  it("keeps the state a click chose", async () => {
    const user = userEvent.setup();

    // Fechado por clique durante o stream: continua fechado quando acaba.
    const streaming = [asked(), thought("dois caminhos")];
    const first = render(transcript(reduce(streaming)));
    await user.click(thoughts()[0]!);
    expect(thoughts()[0]).toHaveAttribute("aria-expanded", "false");
    first.rerender(transcript(reduce([...streaming, said("Vou separar.")])));
    expect(thoughts()[0]).toHaveAttribute("aria-expanded", "false");
    first.unmount();

    // Aberto por clique depois de acabar: continua aberto quando outro bloco chega.
    const finished = [asked(), thought("dois caminhos"), said("Vou separar.")];
    const second = render(transcript(reduce(finished)));
    await user.click(thoughts()[0]!);
    expect(thoughts()[0]).toHaveAttribute("aria-expanded", "true");
    second.rerender(transcript(reduce([...finished, tool("tc-1")])));
    expect(thoughts()[0]).toHaveAttribute("aria-expanded", "true");
  });

  it("toggles one thought without the other", async () => {
    const user = userEvent.setup();
    // O mesmo `messageId` nos dois, como o transcript de 2026-09-01 grava.
    render(
      transcript(reduce([asked(), thought("ler o loader"), tool("tc-1"), thought("separar"), said("Pronto."), ended()])),
    );
    expect(thoughts()).toHaveLength(2);

    await user.click(thoughts()[0]!);

    expect(thoughts()[0]).toHaveAttribute("aria-expanded", "true");
    expect(thoughts()[1]).toHaveAttribute("aria-expanded", "false");
  });

  it("replays thoughts collapsed with their duration", () => {
    clock = 1_000;
    const entries = [
      asked(),
      thought("ler ", 100),
      thought("o loader", 2_400),
      tool("tc-1"),
      thought("separar", 100),
      thought(" o parser", 12_200),
      said("Pronto."),
      ended(),
    ];
    const live = entries.reduce<ConversationState>(
      (state, entry) => reduceConversation(state, entry),
      emptyConversation(),
    );

    const { unmount } = render(transcript(live));
    const liveLabels = thoughts().map((button) => button.textContent);
    unmount();

    render(transcript(replayConversation(entries)));
    const replayed = thoughts();
    expect(replayed.map((button) => button.getAttribute("aria-expanded"))).toEqual(["false", "false"]);
    expect(replayed.map((button) => button.textContent)).toEqual(liveLabels);
    expect(replayed[0]).toHaveTextContent("pensou por 2,4 s");
    expect(replayed[1]).toHaveTextContent("pensou por 12,2 s");
  });
});
