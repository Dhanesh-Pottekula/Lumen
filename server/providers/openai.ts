/**
 * The real provider: OpenAI over fetch, with no SDK. Responses API for the planner (streamed), the scene writer
 * and the part finder (structured output); Images for drawing; Audio for the voice.
 * The key is read by the caller and is only ever sent to api.openai.com.
 */
import { partsSchema } from "../prompts";
import { deliveryNotes, plainOf } from "../voice";
import type { CallUsage } from "../usage";
import type { ImageBytes, Message, PartsFound, Provider } from "./types";

const BASE = "https://api.openai.com/v1";

/**
 * Fixed opening lines of the two big requests. They carry the cache mark, so what is cached before them (the
 * system prompt and tools) holds nothing that belongs to one user or one film. Changing a word here, or in the
 * system prompts, empties the cache for everyone until it is written again.
 */
const PLAN_LEAD = "Plan one film for the brief that follows.\n\n";
const SCENE_LEAD = "Write one scene. The film's visual skills come first, then this step.\n\n";

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
  /** Mark the stable start of a scene writer's prompt as an explicit cache breakpoint, as AiRA does. */
  cacheBreakpoint: boolean;
  /** Optional longer cache lifetime, such as "24h", passed as prompt_cache_retention. */
  cacheRetention?: string;
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
    cacheBreakpoint: env.FILM_CACHE_BREAKPOINT !== "0",
    cacheRetention: env.FILM_CACHE_RETENTION || undefined,
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

interface ResponsesUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number; text_tokens?: number; image_tokens?: number };
  output_tokens_details?: { reasoning_tokens?: number };
}

interface ResponsesOutput {
  output?: { type: string; content?: { type: string; text?: string }[] }[];
  usage?: ResponsesUsage;
}

/** A provider's token counters in the pipeline's own shape. */
const counted = (usage: ResponsesUsage | undefined): CallUsage => ({
  input: usage?.input_tokens ?? 0,
  cached: usage?.input_tokens_details?.cached_tokens ?? 0,
  cacheWrite: usage?.input_tokens_details?.cache_write_tokens ?? 0,
  output: usage?.output_tokens ?? 0,
  reasoning: usage?.output_tokens_details?.reasoning_tokens ?? 0,
});

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

  /** Cleared if the API ever refuses the breakpoint field, so the film carries on without it. */
  let breakpoint = settings.cacheBreakpoint;
  const cacheFields = (key: string) => ({ prompt_cache_key: key, ...(settings.cacheRetention ? { prompt_cache_retention: settings.cacheRetention } : {}) });

  /**
   * The conversation as Responses input. A message's `stable` text goes first, as its own part carrying a
   * cache breakpoint: everything up to it (the fixed prompt plus the film's skills) is one cache entry that
   * every scene writer of the film reads.
   */
  const mark = () => (breakpoint ? { prompt_cache_breakpoint: { mode: "explicit" } } : {});
  const inputOf = (messages: Message[]) =>
    messages.map((message) =>
      message.stable === undefined
        ? { role: message.role, content: message.content }
        : {
            role: message.role,
            content: [
              // The only mark: what every request of every film shares (the fixed prompt and this line).
              { type: "input_text", text: SCENE_LEAD, ...mark() },
              // Not marked: this film's skill rules, then this step's own pictures and words.
              { type: "input_text", text: message.stable },
              { type: "input_text", text: message.content },
            ],
          },
    );

  /** One scene-writer style call. If the breakpoint field is refused, it is dropped and the call is made again. */
  async function respond(system: string, messages: Message[], extra: Record<string, unknown>): Promise<ResponsesOutput> {
    const body = () => json({ model: settings.writeModel, instructions: system, input: inputOf(messages), ...cacheFields("lumen_film_scene"), ...extra });
    try {
      return (await (await call("/responses", body(), 150_000, 1)).json()) as ResponsesOutput;
    } catch (error) {
      if (!breakpoint || !(error instanceof ApiError) || error.status !== 400 || !/prompt_cache_breakpoint/.test(error.message)) throw error;
      breakpoint = false;
      return (await (await call("/responses", body(), 150_000, 1)).json()) as ResponsesOutput;
    }
  }

  const provider: Provider = {
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
      // The breakpoint sits before the brief, on a line that never changes. What is written to the cache is then
      // only what every film shares: the fixed prompt, the tool and this line. Every user's plan reads that same
      // entry, and so does round 2 of this plan, which sends it all again followed by the skills.
      const briefInput = (): unknown[] => [
        {
          role: "user",
          content: [
            { type: "input_text", text: PLAN_LEAD, ...(breakpoint ? { prompt_cache_breakpoint: { mode: "explicit" } } : {}) },
            { type: "input_text", text: `The brief:\n${brief}` },
          ],
        },
      ];
      let input = briefInput();
      let previous: string | undefined;
      // At most four rounds: a refused skill call may be corrected, then the plan is written.
      for (let round = 0; round < 4; round++) {
        const controller = new AbortController();
        // The planner is cancelled when the stream goes quiet for two minutes.
        let idle = setTimeout(() => controller.abort(), 120_000);
        type Completed = { id?: string; usage?: ResponsesUsage; output?: { type: string; call_id?: string; arguments?: string }[] };
        const done: { response: Completed | null } = { response: null };
        try {
          const send = () =>
            fetch(`${BASE}/responses`, {
              method: "POST",
              headers: { ...auth, "Content-Type": "application/json" },
              body: JSON.stringify({
                model: settings.planModel,
                reasoning: { effort: "medium" },
                max_output_tokens: 128_000,
                instructions: system,
                input,
                stream: true,
                ...cacheFields("lumen_film_plan"),
                ...(tools ? { tools } : {}),
                ...(previous ? { previous_response_id: previous } : {}),
              }),
              signal: controller.signal,
            });
          let res = await send();
          if (!res.ok) {
            const refusal = await res.text();
            // If the API does not accept the breakpoint field, plan without it rather than fail the film.
            if (!(round === 0 && breakpoint && res.status === 400 && /prompt_cache_breakpoint/.test(refusal))) throw new ApiError(res.status, refusal);
            breakpoint = false;
            input = briefInput();
            res = await send();
            if (!res.ok) throw new ApiError(res.status, await res.text());
          }
          if (!res.body) throw new ApiError(res.status, "the planner returned no stream");
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
        if (done.response?.usage) provider.report?.("plan", settings.planModel, counted(done.response.usage));
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
      const body = (await res.json()) as { data: { b64_json: string }[]; usage?: ResponsesUsage };
      provider.report?.("picture", settings.imageModel, { ...counted(body.usage), imageInput: body.usage?.input_tokens_details?.image_tokens ?? 0, images: 1 });
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
          ...cacheFields("lumen_film_parts"),
        }),
        120_000,
        1,
      );
      const found = (await res.json()) as ResponsesOutput;
      provider.report?.("parts", settings.inspectModel, counted(found.usage));
      return JSON.parse(outputText(found)) as PartsFound;
    },

    async write(system, messages: Message[]) {
      const reply = await respond(system, messages, { reasoning: { effort: "medium" }, max_output_tokens: 16_000 });
      provider.report?.("scene", settings.writeModel, counted(reply.usage));
      return outputText(reply);
    },

    async warm(system, stable) {
      // The same fixed prompt and stable text the scene writers will send, with almost nothing to answer.
      const reply = await respond(system, [{ role: "user", stable, content: "Reply with the one word: ready" }], { reasoning: { effort: "low" }, max_output_tokens: 64 });
      provider.report?.("warm-up", settings.writeModel, counted(reply.usage));
    },

    async speak(text, style): Promise<ImageBytes> {
      const res = await call(
        "/audio/speech",
        json({ model: settings.voiceModel, voice: settings.voice, input: plainOf(text), instructions: `${style} ${deliveryNotes(text)}`.trim(), response_format: "mp3" }),
        180_000,
        1,
      );
      const bytes = new Uint8Array(await res.arrayBuffer());
      // The speech endpoint returns no usage. Its MP3 is 128 kbit/s, so the clip's length follows from its size.
      provider.report?.("voice", settings.voiceModel, { characters: plainOf(text).length, seconds: bytes.length / 16_000 });
      return { bytes, type: "audio/mpeg" };
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
      provider.report?.("timing", settings.hearModel, { seconds: body.duration ?? audio.bytes.length / 16_000 });
      return body.words?.length && body.duration ? { words: body.words, duration: body.duration } : null;
    },
  };
  return provider;
}
