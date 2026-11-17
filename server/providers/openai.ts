/**
 * The real provider: OpenAI over fetch, with no SDK. Responses API for the planner (streamed), the scene writer
 * and the part finder (structured output); Images for drawing; Audio for the voice.
 * The key is read by the caller and is only ever sent to api.openai.com.
 */
import { partsSchema } from "../prompts";
import { deliveryNotes, plainOf } from "../voice";
import type { ImageBytes, Message, PartsFound, Provider } from "./types";

const BASE = "https://api.openai.com/v1";

export interface OpenAISettings {
  key: string;
  planModel: string;
  writeModel: string;
  imageModel: string;
  imageQuality: string;
  inspectModel: string;
  voiceModel: string;
  voice: string;
  hearModel: string;
}

export function openAISettings(env: Record<string, string | undefined>, key: string): OpenAISettings {
  return {
    key,
    planModel: env.FILM_PLAN_MODEL ?? "gpt-6.1-sol",
    writeModel: env.FILM_WRITE_MODEL ?? "gpt-6.1-sol",
    imageModel: env.FILM_IMAGE_MODEL ?? "gpt-image-2",
    imageQuality: env.FILM_IMAGE_QUALITY ?? "medium",
    inspectModel: env.FILM_INSPECT_MODEL ?? "gpt-6-luna",
    voiceModel: env.FILM_TTS_MODEL ?? "gpt-4o-mini-tts",
    voice: env.FILM_TTS_VOICE ?? "coral",
    hearModel: env.FILM_HEAR_MODEL ?? "whisper-1",
  };
}

class ApiError extends Error {
  constructor(
    readonly status: number,
    body: string,
  ) {
    super(`OpenAI HTTP ${status}: ${body.slice(0, 500)}`);
  }
}

interface ResponsesOutput {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
}

const outputText = (response: ResponsesOutput): string =>
  (response.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text ?? "")
    .join("");

export function openAIProvider(settings: OpenAISettings): Provider {
  const auth = { Authorization: `Bearer ${settings.key}` };

  /** One call with a timeout; 429 and 5xx are retried with a growing wait. */
  async function call(path: string, init: RequestInit, timeoutMs: number, retries: number): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      try {
        const res = await fetch(`${BASE}${path}`, {
          ...init,
          headers: { ...auth, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) return res;
        const body = await res.text();
        if ((res.status === 429 || res.status >= 500) && attempt < retries) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
          continue;
        }
        throw new ApiError(res.status, body);
      } catch (error) {
        if (error instanceof ApiError || attempt >= retries) throw error;
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
  }

  const json = (body: unknown): RequestInit => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return {
    name: "openai",

    async plan(system, brief, onText, skills) {
      const tools = skills
        ? [
            {
              type: "function",
              name: "load_film_skills",
              description: skills.description,
              parameters: { type: "object", properties: { narrative: { type: "string" }, visuals: { type: "array", items: { type: "string" } } }, required: ["narrative", "visuals"] },
              strict: false,
            },
          ]
        : undefined;
      let input: unknown[] = [{ role: "user", content: `The brief:\n${brief}` }];
      let previous: string | undefined;
      // At most four rounds: a refused skill call may be corrected, then the plan is written.
      for (let round = 0; round < 4; round++) {
        const controller = new AbortController();
        // The planner is cancelled when the stream goes quiet for two minutes.
        let idle = setTimeout(() => controller.abort(), 120_000);
        type Completed = { id?: string; output?: { type: string; call_id?: string; arguments?: string }[] };
        const done: { response: Completed | null } = { response: null };
        try {
          const res = await fetch(`${BASE}/responses`, {
            method: "POST",
            headers: { ...auth, "Content-Type": "application/json" },
            body: JSON.stringify({
              model: settings.planModel,
              reasoning: { effort: "medium" },
              max_output_tokens: 128_000,
              instructions: system,
              input,
              stream: true,
              prompt_cache_key: "lumen_film_plan",
              ...(tools ? { tools } : {}),
              ...(previous ? { previous_response_id: previous } : {}),
            }),
            signal: controller.signal,
          });
          if (!res.ok || !res.body) throw new ApiError(res.status, await res.text());
          const decoder = new TextDecoder();
          let buffer = "";
          for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
            clearTimeout(idle);
            idle = setTimeout(() => controller.abort(), 120_000);
            buffer += decoder.decode(chunk, { stream: true });
            let cut: number;
            while ((cut = buffer.indexOf("\n\n")) >= 0) {
              const block = buffer.slice(0, cut);
              buffer = buffer.slice(cut + 2);
              const data = block
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trim())
                .join("");
              if (!data || data === "[DONE]") continue;
              const event = JSON.parse(data) as { type: string; delta?: string; response?: Completed };
              if (event.type === "response.output_text.delta" && event.delta) onText(event.delta);
              else if (event.type === "response.completed") done.response = event.response ?? null;
              else if (event.type === "response.failed" || event.type === "error") throw new ApiError(500, data);
              // Cut off by the token limit: the steps so far are kept, and the film says it stopped early.
              else if (event.type === "response.incomplete") throw new Error("the plan was cut off before it finished");
            }
          }
        } finally {
          clearTimeout(idle);
        }
        const calls = (done.response?.output ?? []).filter((item) => item.type === "function_call");
        if (!skills || calls.length === 0) return;
        previous = done.response?.id;
        input = calls.map((call) => {
          let args: unknown = null;
          try {
            args = JSON.parse(call.arguments ?? "null");
          } catch {
            // an unreadable call is refused by the tool itself
          }
          return { type: "function_call_output", call_id: call.call_id, output: skills.load(args) };
        });
      }
    },

    async draw(prompt, reference) {
      const common = { model: settings.imageModel, prompt, size: "1536x1024", quality: settings.imageQuality };
      let res: Response;
      if (reference) {
        const form = new FormData();
        for (const [k, v] of Object.entries(common)) form.set(k, v);
        form.set("output_format", "png");
        form.append("image[]", new Blob([reference.bytes as BlobPart], { type: reference.type }), "reference.png");
        res = await call("/images/edits", { method: "POST", body: form }, 240_000, 1);
      } else {
        res = await call("/images/generations", json({ ...common, n: 1, output_format: "png" }), 240_000, 1);
      }
      const body = (await res.json()) as { data: { b64_json: string }[] };
      return { bytes: new Uint8Array(Buffer.from(body.data[0].b64_json, "base64")), type: "image/png" };
    },

    async findParts(system, context, image, _pictureId, partIds) {
      const res = await call(
        "/responses",
        json({
          model: settings.inspectModel,
          reasoning: { effort: "low" },
          max_output_tokens: 3000,
          instructions: system,
          input: [
            {
              role: "user",
              content: [
                { type: "input_text", text: context },
                { type: "input_image", image_url: `data:${image.type};base64,${Buffer.from(image.bytes).toString("base64")}` },
              ],
            },
          ],
          text: { format: { type: "json_schema", name: "Parts", strict: true, schema: partsSchema(partIds) } },
        }),
        120_000,
        1,
      );
      return JSON.parse(outputText((await res.json()) as ResponsesOutput)) as PartsFound;
    },

    async write(system, messages: Message[]) {
      const res = await call(
        "/responses",
        json({
          model: settings.writeModel,
          reasoning: { effort: "medium" },
          max_output_tokens: 16_000,
          instructions: system,
          input: messages,
          prompt_cache_key: "lumen_film_scene",
        }),
        150_000,
        1,
      );
      return outputText((await res.json()) as ResponsesOutput);
    },

    async speak(text, style): Promise<ImageBytes> {
      const res = await call(
        "/audio/speech",
        json({ model: settings.voiceModel, voice: settings.voice, input: plainOf(text), instructions: `${style} ${deliveryNotes(text)}`.trim(), response_format: "mp3" }),
        180_000,
        1,
      );
      return { bytes: new Uint8Array(await res.arrayBuffer()), type: "audio/mpeg" };
    },

    async hear(audio, text) {
      const form = new FormData();
      form.set("model", settings.hearModel);
      form.set("response_format", "verbose_json");
      form.append("timestamp_granularities[]", "word");
      form.set("prompt", text.slice(0, 800)); // the expected words, so names and numbers are spelled the same way
      form.set("file", new Blob([audio.bytes as BlobPart], { type: audio.type }), "voice.mp3");
      const res = await call("/audio/transcriptions", { method: "POST", body: form }, 180_000, 1);
      const body = (await res.json()) as { words?: { word: string; start: number; end: number }[]; duration?: number };
      return body.words?.length && body.duration ? { words: body.words, duration: body.duration } : null;
    },
  };
}
