/**
 * AiRA's voice: Cartesia, model sonic-3.6, the same voice id AiRA's speech adapter uses for "female".
 *
 * The clip is asked for with word timestamps, as AiRA does (`add_timestamps`), so the voice itself says when
 * each word starts and nothing has to listen to the clip afterwards. That needs Cartesia's event stream, which
 * sends raw sound, so the clip is saved as a WAV file. Used when CARTESIA_API_KEY is set; if a call fails,
 * the caller falls back to its other voice.
 */
import { forCartesia } from "../voice";
import type { SpokenAudio } from "./types";

export interface CartesiaSettings {
  key: string;
  model: string;
  voice: string;
}

/** Samples a second. AiRA asks for the same; a spoken voice loses nothing at this rate. */
const RATE = 24_000;

export function cartesiaSettings(env: Record<string, string | undefined>, key: string): CartesiaSettings {
  return {
    key,
    model: env.FILM_CARTESIA_MODEL ?? "sonic-3.6",
    voice: env.FILM_CARTESIA_VOICE ?? "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  };
}

/** Raw 16-bit mono sound with the 44-byte header that makes it a WAV file a browser can play. */
export function wavOf(pcm: Uint8Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm.length);
  const view = new DataView(out.buffer);
  const text = (at: number, value: string) => [...value].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, "RIFF");
  view.setUint32(4, 36 + pcm.length, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true); // size of the format block
  view.setUint16(20, 1, true); // plain PCM
  view.setUint16(22, 1, true); // one channel
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true); // bytes a second
  view.setUint16(32, 2, true); // bytes a sample
  view.setUint16(34, 16, true); // bits a sample
  text(36, "data");
  view.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}

interface StreamEvent {
  type?: string;
  data?: string;
  word_timestamps?: { words?: string[]; start?: number[]; end?: number[] };
  title?: string;
  message?: string;
  error?: string;
}

/** One reading of Cartesia's event stream: the sound so far, and the words with their times. */
export function readEvents(events: StreamEvent[]): { pcm: Uint8Array; words: { word: string; start: number; end: number }[] } {
  const chunks: Uint8Array[] = [];
  const words: { word: string; start: number; end: number }[] = [];
  for (const event of events) {
    if (event.type === "error") throw new Error(`Cartesia: ${event.title ?? event.error ?? "error"} ${event.message ?? ""}`.trim());
    if (event.type === "chunk" && event.data) chunks.push(new Uint8Array(Buffer.from(event.data, "base64")));
    if (event.type === "timestamps" && event.word_timestamps) {
      const { words: said = [], start = [], end = [] } = event.word_timestamps;
      said.forEach((word, i) => {
        if (typeof start[i] === "number" && typeof end[i] === "number") words.push({ word, start: start[i], end: end[i] });
      });
    }
  }
  const pcm = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) {
    pcm.set(chunk, at);
    at += chunk.length;
  }
  return { pcm, words };
}

export async function cartesiaSpeak(settings: CartesiaSettings, marked: string): Promise<SpokenAudio> {
  const res = await fetch("https://api.cartesia.ai/tts/sse", {
    method: "POST",
    headers: { "X-API-Key": settings.key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: settings.model,
      transcript: forCartesia(marked),
      voice: { mode: "id", id: settings.voice },
      language: "en",
      output_format: { container: "raw", encoding: "pcm_s16le", sample_rate: RATE },
      add_timestamps: true,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Cartesia HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);

  // The stream is frames of "data: <json>" separated by a blank line.
  const events: StreamEvent[] = [];
  for (const frame of (await res.text()).split(/\r?\n\r?\n/)) {
    const line = frame.split(/\r?\n/).find((l) => l.startsWith("data:"));
    if (!line) continue;
    try {
      events.push(JSON.parse(line.slice(5).trim()) as StreamEvent);
    } catch {
      // A frame that is not JSON carries nothing we need.
    }
  }
  const { pcm, words } = readEvents(events);
  if (pcm.length === 0) throw new Error("Cartesia sent no sound");
  return { bytes: wavOf(pcm, RATE), type: "audio/wav", words, duration: pcm.length / (RATE * 2) };
}
