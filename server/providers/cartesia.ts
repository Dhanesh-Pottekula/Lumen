/**
 * AiRA's voice: Cartesia, model sonic-3.6, the same voice id AiRA's speech adapter uses for "female", as one
 * MP3 per step. Used when CARTESIA_API_KEY is set; if a call fails, the caller falls back to its other voice.
 */
import { forCartesia } from "../voice";
import type { ImageBytes } from "./types";

export interface CartesiaSettings {
  key: string;
  model: string;
  voice: string;
}

export function cartesiaSettings(env: Record<string, string | undefined>, key: string): CartesiaSettings {
  return {
    key,
    model: env.FILM_CARTESIA_MODEL ?? "sonic-3.6",
    voice: env.FILM_CARTESIA_VOICE ?? "db6b0ed5-d5d3-463d-ae85-518a07d3c2b4",
  };
}

export async function cartesiaSpeak(settings: CartesiaSettings, marked: string): Promise<ImageBytes> {
  const res = await fetch("https://api.cartesia.ai/tts/bytes", {
    method: "POST",
    headers: { "X-API-Key": settings.key, "Cartesia-Version": "2025-04-16", "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: settings.model,
      transcript: forCartesia(marked),
      voice: { mode: "id", id: settings.voice },
      language: "en",
      output_format: { container: "mp3", sample_rate: 44100, bit_rate: 128000 },
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Cartesia HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), type: "audio/mpeg" };
}
