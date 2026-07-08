/**
 * Speak the active narration caption via the browser's SpeechSynthesis.
 *
 * Timeline is master: every caption change cancels the previous utterance and
 * speaks the new one. `speaking` false cancels immediately — except when
 * `endedNaturally.current` is true (the film reached its end), where the
 * in-flight utterance is allowed to finish so the final line isn't clipped.
 *
 * Returns whether SpeechSynthesis is supported (callers hide their toggle when not).
 */
import { useEffect, type RefObject } from "react";

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

export function useSpeechNarration(
  caption: string | undefined,
  speaking: boolean,
  endedNaturally: RefObject<boolean>,
): boolean {
  useEffect(() => {
    if (!supported) return;
    if (!speaking || !caption) {
      if (!endedNaturally.current) window.speechSynthesis.cancel();
      return;
    }
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(caption));
  }, [caption, speaking, endedNaturally]);

  // unmount: never leave a voice talking over a dead player
  useEffect(() => {
    if (!supported) return;
    return () => window.speechSynthesis.cancel();
  }, []);

  return supported;
}
