import { ArrayBufferTarget, Muxer } from "mp4-muxer";

import { createFrame } from "../render/frame";
import { TEXTBOOK, type Theme } from "../render/theme";
import { paintTexture } from "../render/texture";
import type { CanvasSlideDefinition } from "../slides/types";

/**
 * Render a lesson slide to an MP4 (H.264 video + AAC audio) entirely in the browser via WebCodecs.
 *
 * The slide's render(t) is pure, so we render each frame offline (faster than real time) at a fixed fps,
 * feed the frames to a VideoEncoder, feed the narration PCM to an AudioEncoder, and mux both into one MP4.
 * Because the audio is encoded from the same samples the player uses, picture and voice stay perfectly
 * in sync — this is a deterministic export, not a real-time screen capture.
 */

export interface Mp4ExportOptions {
  fps?: number;
  /** Output pixel scale relative to the slide's view size (2 → crisp retina export). */
  scale?: number;
  theme?: Theme;
  bitrate?: number;
  onProgress?: (fraction: number) => void;
}

/** True if this browser can export MP4 (WebCodecs present). */
export function canExportMp4(): boolean {
  return typeof VideoEncoder !== "undefined" && typeof AudioEncoder !== "undefined" && typeof VideoFrame !== "undefined";
}

async function decodeAudio(blob: Blob): Promise<{ data: Float32Array; sampleRate: number } | null> {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  const ctx = new Ctor();
  try {
    const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
    return { data: buffer.getChannelData(0).slice(), sampleRate: buffer.sampleRate };
  } finally {
    void ctx.close();
  }
}

export async function exportLessonMp4(
  slide: CanvasSlideDefinition,
  audioBlob: Blob | null,
  options: Mp4ExportOptions = {},
): Promise<Blob> {
  if (!canExportMp4()) {
    throw new Error("Video export needs WebCodecs, which this browser doesn't support. Try a recent Chrome, Edge, or Safari 16.4+.");
  }

  const fps = options.fps ?? 30;
  const scale = options.scale ?? 2;
  const theme = options.theme ?? TEXTBOOK;
  const width = Math.round(slide.viewW * scale);
  const height = Math.round(slide.viewH * scale);
  const totalFrames = Math.max(1, Math.ceil(slide.duration * fps));

  const audio = audioBlob ? await decodeAudio(audioBlob) : null;

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: "avc", width, height },
    audio: audio ? { codec: "aac", numberOfChannels: 1, sampleRate: audio.sampleRate } : undefined,
    fastStart: "in-memory",
  });

  // ── Video ───────────────────────────────────────────────────────────────────────────────────────
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => { throw error; },
  });
  videoEncoder.configure({ codec: "avc1.4d0028", width, height, bitrate: options.bitrate ?? 6_000_000, framerate: fps });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create a 2D canvas for export.");

  const frameDurUs = 1_000_000 / fps;
  for (let i = 0; i < totalFrames; i++) {
    const t = Math.min(slide.duration, i / fps);
    ctx.setTransform(width / slide.viewW, 0, 0, height / slide.viewH, 0, 0);
    const frame = createFrame(ctx, t, slide.viewW, slide.viewH, theme);
    if (theme.texture !== "none") paintTexture(ctx, theme, slide.viewW, slide.viewH);
    slide.render(ctx, t, frame);
    frame.finish();

    const videoFrame = new VideoFrame(canvas, { timestamp: Math.round(i * frameDurUs), duration: Math.round(frameDurUs) });
    videoEncoder.encode(videoFrame, { keyFrame: i % (fps * 2) === 0 });
    videoFrame.close();

    // Keep the encoder queue bounded and yield to the event loop so the UI can show progress.
    if (videoEncoder.encodeQueueSize > 20) {
      await new Promise((resolve) => setTimeout(resolve));
    }
    if (i % 15 === 0) options.onProgress?.((i / totalFrames) * 0.9);
  }
  await videoEncoder.flush();

  // ── Audio ───────────────────────────────────────────────────────────────────────────────────────
  if (audio) {
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
      error: (error) => { throw error; },
    });
    audioEncoder.configure({ codec: "mp4a.40.2", sampleRate: audio.sampleRate, numberOfChannels: 1, bitrate: 128_000 });

    const block = 4096;
    for (let offset = 0; offset < audio.data.length; offset += block) {
      const slice = audio.data.slice(offset, Math.min(offset + block, audio.data.length));
      const audioData = new AudioData({
        format: "f32",
        sampleRate: audio.sampleRate,
        numberOfFrames: slice.length,
        numberOfChannels: 1,
        timestamp: Math.round((offset / audio.sampleRate) * 1_000_000),
        data: slice,
      });
      audioEncoder.encode(audioData);
      audioData.close();
    }
    await audioEncoder.flush();
  }

  muxer.finalize();
  options.onProgress?.(1);
  return new Blob([muxer.target.buffer], { type: "video/mp4" });
}
