import { Cartesia } from "@cartesia/cartesia-js";

/**
 * Cartesia TTS — narration synthesis with word timestamps, mirroring the aira-api flow
 * (`get_context(add_timestamps=True)` → stream `timestamps` + `chunk` frames → accumulate words +
 * collect audio chunks). Runs in the browser via the Cartesia JS SDK; the API key comes from
 * `VITE_CARTESIA_API_KEY` in `.env`.
 *
 * One call turns the full narration text into: ONE audio blob (a self-describing WAV, from all the raw
 * PCM chunks concatenated) plus a per-word transcription `[{word,start,end}]`. Those timestamps are the
 * REFERENCE timeline the Simple JSON authoring step lays scenes against (loosely, not scene-locked).
 */

export interface WordTimestamp {
  word: string;
  start: number; // seconds
  end: number; // seconds
}

export interface NarrationResult {
  audioBlob: Blob; // audio/wav
  audioUrl: string; // object URL for <audio>
  words: WordTimestamp[]; // per-word timings over the whole audio
  durationSec: number;
  sampleRate: number;
}

// Cartesia voice ids (same as the aira-api voice_map).
export const CARTESIA_VOICES = {
  female: "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  male: "630ed21c-2c5c-41cf-9d82-10a7fd668370",
} as const;
export type CartesiaVoice = keyof typeof CARTESIA_VOICES;

const SAMPLE_RATE = 44100;
const MODEL_ID = "sonic-2";

function apiKey(): string {
  const key = import.meta.env.VITE_CARTESIA_API_KEY as string | undefined;
  if (!key) throw new Error("Missing VITE_CARTESIA_API_KEY — paste your Cartesia key into .env and restart the dev server.");
  return key;
}

/** Synthesize the whole narration into one audio + timestamped transcription. */
export async function synthesizeNarration(
  text: string,
  options: { voice?: CartesiaVoice; modelId?: string } = {},
): Promise<NarrationResult> {
  const client = new Cartesia({ apiKey: apiKey() });
  const ws = await client.tts.websocket();
  await ws.connect();

  const context = ws.context({
    model_id: options.modelId ?? MODEL_ID,
    output_format: { container: "raw", encoding: "pcm_f32le", sample_rate: SAMPLE_RATE },
    voice: { mode: "id", id: CARTESIA_VOICES[options.voice ?? "female"] },
    add_timestamps: true,
  });

  const words: WordTimestamp[] = [];
  const audioChunks: Uint8Array[] = [];

  try {
    // Same order as aira-api: per chunk, `timestamps` frames (word/start/end arrays) arrive, then the
    // raw PCM `chunk` frame(s). Accumulate words; collect audio. Loop ends on the `done` event.
    for await (const message of context.generate({ transcript: text })) {
      if (message.type === "timestamps" && message.word_timestamps) {
        const { words: ws2, start, end } = message.word_timestamps;
        for (let i = 0; i < ws2.length; i++) words.push({ word: ws2[i], start: start[i], end: end[i] });
      } else if (message.type === "chunk" && message.audio) {
        audioChunks.push(message.audio);
      } else if (message.type === "error") {
        throw new Error(`Cartesia TTS error: ${JSON.stringify((message as { error?: unknown }).error ?? message)}`);
      }
      // `done` ends the async iterator on its own.
    }
  } finally {
    ws.close();
  }

  const pcm = concatFloat32(audioChunks);
  const audioBlob = encodeWav(pcm, SAMPLE_RATE);
  const audioUrl = URL.createObjectURL(audioBlob);
  const durationSec = words.length ? words[words.length - 1].end : pcm.length / SAMPLE_RATE;
  return { audioBlob, audioUrl, words, durationSec, sampleRate: SAMPLE_RATE };
}

/** Concatenate raw little-endian float32 PCM chunks into one Float32Array. */
function concatFloat32(chunks: Uint8Array[]): Float32Array {
  let total = 0;
  for (const c of chunks) total += c.byteLength;
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  // Reinterpret the byte stream as float32 (the buffer is contiguous and 4-byte aligned by construction).
  return new Float32Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 4));
}

/** Encode mono float32 samples as a 16-bit PCM WAV blob (a self-describing audio file). */
function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  const dataLen = samples.length * bytesPerSample;
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true); // PCM chunk size
  view.setUint16(20, 1, true); // format = PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Serialize the transcription (words + timings) as a downloadable JSON blob. */
export function timestampsBlob(result: NarrationResult): Blob {
  return new Blob([JSON.stringify({ durationSec: result.durationSec, sampleRate: result.sampleRate, words: result.words }, null, 2)], {
    type: "application/json",
  });
}
