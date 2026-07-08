import { describe, expect, it } from "vitest";

import { alignWordsToCaptions, buildSceneTimings, tokens, wavDurationSeconds, wrapWav, type Word } from "./align";

const words = (pairs: [string, number, number][]): Word[] =>
  pairs.map(([word, start, end]) => ({ word, start, end }));

describe("alignWordsToCaptions", () => {
  it("aligns one word per token cleanly", () => {
    const w = words([
      ["hello", 0, 0.5],
      ["world", 0.5, 1],
      ["again", 1, 1.4],
    ]);
    const spans = alignWordsToCaptions(w, [
      { scene: 0, text: "hello world" },
      { scene: 0, text: "again" },
    ]);
    expect(spans[0]).toEqual({ scene: 0, text: "hello world", start: 0, end: 1 });
    expect(spans[1]).toEqual({ scene: 0, text: "again", start: 1, end: 1.4 });
  });

  it("tolerates punctuation in caption text", () => {
    const w = words([
      ["hello", 0, 0.5],
      ["world", 0.5, 1],
    ]);
    const spans = alignWordsToCaptions(w, [{ scene: 0, text: "Hello, world!" }]);
    expect(spans[0].start).toBe(0);
    expect(spans[0].end).toBe(1);
  });

  it("resyncs on the next caption's first word when tokenization drifts", () => {
    // "co2 rises" is 2 tokens but Cartesia spelled CO2 as c/o/two → 4 words before "then".
    const w = words([
      ["c", 0, 0.2],
      ["o", 0.2, 0.4],
      ["two", 0.4, 0.7],
      ["rises", 0.7, 1.1],
      ["then", 1.1, 1.5],
      ["stops", 1.5, 1.9],
    ]);
    const spans = alignWordsToCaptions(w, [
      { scene: 0, text: "co2 rises" },
      { scene: 1, text: "then stops" },
    ]);
    expect(spans[1].start).toBe(1.1); // caption 1 begins exactly at "then"
    expect(spans[1].end).toBe(1.9);
    expect(spans[0].end).toBe(1.1); // caption 0 ends right before "then"
  });

  it("returns zero spans for empty words", () => {
    expect(alignWordsToCaptions([], [{ scene: 0, text: "anything" }])).toEqual([
      { scene: 0, text: "anything", start: 0, end: 0 },
    ]);
  });
});

describe("buildSceneTimings", () => {
  it("is contiguous and ends at the film duration", () => {
    const spans = [
      { scene: 0, text: "a", start: 0, end: 3 },
      { scene: 0, text: "b", start: 3, end: 6 },
      { scene: 1, text: "c", start: 6, end: 9 },
    ];
    expect(buildSceneTimings(spans, 2, 12)).toEqual([
      { index: 0, start: 0, end: 6 },
      { index: 1, start: 6, end: 12 },
    ]);
  });
});

describe("wav helpers", () => {
  it("computes duration from byte length", () => {
    expect(wavDurationSeconds(44 + 48000, 24000)).toBe(1);
  });

  it("wraps PCM into a 44-byte-header WAV of the right size and magic bytes", () => {
    const pcm = new Uint8Array(48000);
    const wav = wrapWav(pcm, 24000);
    expect(wav.length).toBe(44 + 48000);
    expect(String.fromCharCode(...wav.slice(0, 4))).toBe("RIFF");
    expect(String.fromCharCode(...wav.slice(8, 12))).toBe("WAVE");
    // sample rate at byte offset 24, little-endian
    const dv = new DataView(wav.buffer);
    expect(dv.getUint32(24, true)).toBe(24000);
  });

  it("tokenizes to lowercase alphanumeric", () => {
    expect(tokens("CO₂ + H₂O!")).toEqual(["co", "h", "o"]);
  });
});
