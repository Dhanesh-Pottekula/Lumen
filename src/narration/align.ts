/**
 * Pure helpers for the in-app narration generator: align Cartesia word timestamps to caption
 * sentences, derive scene timings, and wrap raw PCM into a WAV. No I/O, no SDK — unit-tested.
 */

export interface Word {
  word: string;
  start: number;
  end: number;
}

export interface FlatCaption {
  scene: number;
  text: string;
}

export interface CaptionSpan {
  scene: number;
  text: string;
  start: number;
  end: number;
}

export interface SceneTiming {
  index: number;
  start: number;
  end: number;
}

const TOKEN_RE = /[a-z0-9]+/g;

/** Normalize to lowercase alphanumeric tokens (drops punctuation, subscripts, symbols). */
export function tokens(text: string): string[] {
  return text.toLowerCase().match(TOKEN_RE) ?? [];
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Assign real start/end times to each caption from the ordered Cartesia word stream.
 *
 * Words are consumed in order; each caption takes about as many words as it has normalized
 * tokens, and boundaries resync when the next caption's first token appears near the expected
 * cut (tolerating tokenization drift like `CO₂` → `c o two`). Empty words → all zero spans.
 */
export function alignWordsToCaptions(words: Word[], captions: FlatCaption[]): CaptionSpan[] {
  const norm = words.map((w) => tokens(w.word)[0] ?? "");
  const n = words.length;
  const spans: CaptionSpan[] = [];
  let wi = 0;

  for (let ci = 0; ci < captions.length; ci++) {
    const cap = captions[ci];
    if (wi >= n) {
      const last = n > 0 ? words[n - 1].end : 0;
      spans.push({ scene: cap.scene, text: cap.text, start: last, end: last });
      continue;
    }
    const startWi = wi;
    const startTime = words[wi].start;
    let target = Math.min(wi + Math.max(1, tokens(cap.text).length), n);

    const nextToks = ci + 1 < captions.length ? tokens(captions[ci + 1].text) : [];
    const nextFirst = nextToks[0];
    if (nextFirst !== undefined) {
      const lo = Math.max(startWi + 1, target - 3);
      const hi = Math.min(n, target + 4);
      for (let k = lo; k < hi; k++) {
        if (norm[k] === nextFirst) {
          target = k;
          break;
        }
      }
    }

    const endWi = Math.max(startWi + 1, target);
    spans.push({ scene: cap.scene, text: cap.text, start: startTime, end: words[endWi - 1].end });
    wi = endWi;
  }
  return spans;
}

/**
 * Derive contiguous per-scene {index,start,end} from aligned caption spans.
 * A scene starts at its first caption's start, ends where the next scene starts; the last ends
 * at `duration`. Starts are forced non-decreasing.
 */
export function buildSceneTimings(spans: CaptionSpan[], sceneCount: number, duration: number): SceneTiming[] {
  const firsts = new Map<number, number>();
  for (const s of spans) if (!firsts.has(s.scene)) firsts.set(s.scene, s.start);

  const starts: number[] = [];
  for (let i = 0; i < sceneCount; i++) {
    starts[i] = firsts.get(i) ?? (i > 0 ? starts[i - 1] : 0);
    if (i > 0 && starts[i] < starts[i - 1]) starts[i] = starts[i - 1];
  }

  const scenes: SceneTiming[] = [];
  for (let i = 0; i < sceneCount; i++) {
    const end = i + 1 < sceneCount ? starts[i + 1] : duration;
    scenes.push({ index: i, start: round3(starts[i]), end: round3(Math.max(end, starts[i])) });
  }
  return scenes;
}

/** Seconds of 16-bit mono PCM given the WAV byte length (44-byte header + data). */
export function wavDurationSeconds(wavByteLength: number, sampleRate: number): number {
  return Math.max(0, wavByteLength - 44) / (sampleRate * 2);
}

/** Prepend a canonical 44-byte RIFF/WAVE header to headerless 16-bit LE mono PCM. */
export function wrapWav(pcm: Uint8Array, sampleRate: number): Uint8Array {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const out = new Uint8Array(44 + pcm.length);
  const dv = new DataView(out.buffer);
  const ascii = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(offset + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  dv.setUint32(4, 36 + pcm.length, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); // PCM
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, byteRate, true);
  dv.setUint16(32, blockAlign, true);
  dv.setUint16(34, bitsPerSample, true);
  ascii(36, "data");
  dv.setUint32(40, pcm.length, true);
  out.set(pcm, 44);
  return out;
}
