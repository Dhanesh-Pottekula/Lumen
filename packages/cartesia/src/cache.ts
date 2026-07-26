import type { NarrationResult, WordTimestamp } from "./tts";

/**
 * Persistent narration cache (IndexedDB). The synthesized audio + word timestamps are stored under a key
 * derived from the narration text and voice, so a lesson is synthesized ONCE and reused on every reload —
 * and only re-synthesized when its narration (or voice) actually changes. WAV blobs are a few MB, so
 * IndexedDB (which stores Blobs natively) is used rather than localStorage.
 */

const DB_NAME = "aira-narration";
const STORE = "clips";

interface StoredClip {
  audioBlob: Blob;
  words: WordTimestamp[];
  durationSec: number;
  sampleRate: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Stable key for a narration + voice (FNV-1a hash → hex). Changing the text or voice changes the key. */
export function narrationKey(text: string, voice: string): string {
  const source = `${voice}:${text}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}

/** Return a cached narration (with a fresh object URL) or null. Best-effort: any failure resolves to null. */
export async function getCachedNarration(key: string): Promise<NarrationResult | null> {
  try {
    const db = await openDb();
    const clip = await new Promise<StoredClip | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      request.onsuccess = () => resolve(request.result as StoredClip | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (!clip) return null;
    return {
      audioBlob: clip.audioBlob,
      audioUrl: URL.createObjectURL(clip.audioBlob),
      words: clip.words,
      durationSec: clip.durationSec,
      sampleRate: clip.sampleRate,
    };
  } catch {
    return null;
  }
}

/** Store a synthesized narration under a key. Best-effort: failures are swallowed (caching is optional). */
export async function putCachedNarration(key: string, result: NarrationResult): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(
        { audioBlob: result.audioBlob, words: result.words, durationSec: result.durationSec, sampleRate: result.sampleRate } satisfies StoredClip,
        key,
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* caching is best-effort */
  }
}

/** Delete a cached narration so it will be re-synthesized next time (used by "re-synthesize"). */
export async function clearCachedNarration(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* best-effort */
  }
}
