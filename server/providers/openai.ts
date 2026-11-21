/**
 * The real provider: OpenAI over fetch, with no SDK. Responses API for the planner (streamed), the scene writer
 * and the part finder (structured output); Images for drawing; Audio for the voice.
 * The key is read by the caller and is only ever sent to api.openai.com.
 */
import { partsSchema } from "../prompts";
import { noteExchange, readableBody, scrubbed } from "../trace";
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
  /** Reasoning effort for the planner, the scene writer and the part finder. "" leaves it to the model. */
  planEffort: string;
  writeEffort: string;
  inspectEffort: string;
  /** Mark the stable start of a scene writer's prompt as an explicit cache breakpoint, as AiRA does. */
  cacheBreakpoint: boolean;
  /** Optional cache lifetime: "30m" (the default) or "12h", passed as prompt_cache_options.ttl. */
  cacheTtl?: string;
}

export function openAISettings(env: Record<string, string | undefined>, key: string): OpenAISettings {
  return {
    key,
    planModel: env.FILM_PLAN_MODEL ?? "gpt-6-luna",
    writeModel: env.FILM_WRITE_MODEL ?? "gpt-6-luna",
    imageModel: env.FILM_IMAGE_MODEL ?? "gpt-image-2",
    imageQuality: env.FILM_IMAGE_QUALITY ?? "medium",
    inspectModel: env.FILM_INSPECT_MODEL ?? "gpt-6-luna",
    voiceModel: env.FILM_TTS_MODEL ?? "gpt-4o-mini-tts",
    voice: env.FILM_TTS_VOICE ?? "coral",
    hearModel: env.FILM_HEAR_MODEL ?? "whisper-1",
    planEffort: env.FILM_PLAN_EFFORT ?? "medium",
    writeEffort: env.FILM_WRITE_EFFORT ?? "medium",
    inspectEffort: env.FILM_INSPECT_EFFORT ?? "low",
    cacheBreakpoint: env.FILM_CACHE_BREAKPOINT !== "0",
    cacheTtl: env.FILM_CACHE_TTL || undefined,
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
      const began = Date.now();
      try {
        const res = await fetch(`${BASE}${path}`, {
          ...init,
          headers: { ...auth, ...(init.headers as Record<string, string> | undefined) },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (res.ok) {
          // The request as sent and the answer as it came, for the film's record. Picture and sound data are left out.
          const kind = res.headers.get("content-type") ?? "";
          const answer = kind.includes("json") ? scrubbed(await res.clone().json().catch(() => "<an answer that could not be read>")) : `<${kind || "data"}, left out>`;
          noteExchange({ path, request: readableBody(init.body), status: res.status, response: answer, ms: Date.now() - began });
          return res;
        }
        const body = await res.text();
        noteExchange({ path, request: readableBody(init.body), status: res.status, response: body.slice(0, 4000), ms: Date.now() - began });
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
  /**
   * Explicit mode: only the text before our own mark is written to the cache. Left to itself the provider
   * marks the end of every request, and then the whole prompt, including the part that is different every
   * time, is billed at the cache-write rate (1.25 times the normal input rate).
   */
  const cacheFields = (key: string) =>
    breakpoint ? { prompt_cache_key: key, prompt_cache_options: { mode: "explicit", ...(settings.cacheTtl ? { ttl: settings.cacheTtl } : {}) } } : {};
  /** For a request with nothing worth reusing: explicit mode with no mark, so nothing is written at all. */
  const noCache = () => (breakpoint ? { prompt_cache_options: { mode: "explicit" } } : {});

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
              // The step's own pictures, each named just before it. They come last, so the cached part is unchanged.
              ...(message.images ?? []).flatMap(({ label, image }) => [
                { type: "input_text", text: label },
                { type: "input_image", image_url: `data:${image.type};base64,${Buffer.from(image.bytes).toString("base64")}` },
              ]),
            ],
          },
    );

  /** One scene-writer style call. If the breakpoint field is refused, it is dropped and the call is made again. */
  async function respond(system: string, messages: Message[], extra: Record<string, unknown>): Promise<ResponsesOutput> {
    const body = () => json({ model: settings.writeModel, instructions: system, input: inputOf(messages), ...cacheFields("lumen_film_scene"), ...extra });
    try {
      return (await (await call("/responses", body(), 150_000, 1)).json()) as ResponsesOutput;
    } catch (error) {
      if (!breakpoint || !(error instanceof ApiError) || error.status !== 400 || !/prompt_cache/.test(error.message)) throw error;
      breakpoint = false;
      return (await (await call("/responses", body(), 150_000, 1)).json()) as ResponsesOutput;
    }
  }

  /** A reasoning field for a request, or nothing when the stage leaves effort to the model. */
  const reasoning = (effort: string) => (effort ? { reasoning: { effort } } : {});

  const provider: Provider = {
    name: "openai",
    stages: {
      plan: { model: settings.planModel, effort: settings.planEffort || "model default" },
      scene: { model: settings.writeModel, effort: settings.writeEffort || "model default" },
      parts: { model: settings.inspectModel, effort: settings.inspectEffort || "model default" },
      picture: { model: settings.imageModel, settings: { quality: settings.imageQuality, size: "1536x1024" } },
      voice: { model: settings.voiceModel, settings: { voice: settings.voice } },
      timing: { model: settings.hearModel },
    },

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
        const began = Date.now();
        // What this round sent and what it wrote, for the film's record.
        let sent: unknown = null;
        let wrote = "";
        try {
          const send = () => {
            const body = {
              model: settings.planModel,
              ...reasoning(settings.planEffort),
              max_output_tokens: 128_000,
              instructions: system,
              input,
              stream: true,
              ...cacheFields("lumen_film_plan"),
              ...(tools ? { tools } : {}),
              ...(previous ? { previous_response_id: previous } : {}),
            };
            sent = body;
            return fetch(`${BASE}/responses`, { method: "POST", headers: { ...auth, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
          };
          let res = await send();
          if (!res.ok) {
            const refusal = await res.text();
            // If the API does not accept the breakpoint field, plan without it rather than fail the film.
            if (!(round === 0 && breakpoint && res.status === 400 && /prompt_cache/.test(refusal))) throw new ApiError(res.status, refusal);
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
              if (event.type === "response.output_text.delta" && event.delta) {
                wrote += event.delta;
                onText(event.delta);
              }
              else if (event.type === "response.completed") done.response = event.response ?? null;
              else if (event.type === "response.failed" || event.type === "error") throw new ApiError(500, data);
              // Cut off by the token limit: the steps so far are kept, and the film says it stopped early.
              else if (event.type === "response.incomplete") throw new Error("the plan was cut off before it finished");
            }
          }
        } finally {
          clearTimeout(idle);
          // Streamed, so there is no one answer to keep: the text it wrote, any tool it called, and its counts.
          noteExchange({
            path: "/responses (streamed)",
            request: scrubbed(sent),
            status: done.response ? 200 : 0,
            response: { id: done.response?.id, text: wrote, calls: (done.response?.output ?? []).filter((item) => item.type === "function_call"), usage: done.response?.usage },
            ms: Date.now() - began,
          });
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

    async draw(prompt, reference, _pictureId, size = "1536x1024") {
      const common = { model: settings.imageModel, prompt, size, quality: settings.imageQuality };
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
      const request = () =>
        call(
        "/responses",
        json({
          model: settings.inspectModel,
          ...reasoning(settings.inspectEffort),
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
          // Each request is a short prompt and one new picture, so nothing would ever be read back. Without this
          // the provider writes the whole request to the cache anyway and bills it at the write rate.
          ...noCache(),
        }),
        120_000,
        1,
      );
      let res: Response;
      try {
        res = await request();
      } catch (error) {
        // If the API does not accept the cache option, find the parts without it rather than lose them.
        if (!breakpoint || !(error instanceof ApiError) || error.status !== 400 || !/prompt_cache/.test(error.message)) throw error;
        breakpoint = false;
        res = await request();
      }
      const found = (await res.json()) as ResponsesOutput;
      provider.report?.("parts", settings.inspectModel, counted(found.usage));
      return JSON.parse(outputText(found)) as PartsFound;
    },

    async write(system, messages: Message[]) {
      const reply = await respond(system, messages, { ...reasoning(settings.writeEffort), max_output_tokens: 16_000 });
      provider.report?.("scene", settings.writeModel, counted(reply.usage));
      return outputText(reply);
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
