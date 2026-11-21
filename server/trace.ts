/**
 * The record of a film's making: every model call, with everything that went in and everything that came out.
 *
 * A call is recorded by wrapping the provider, so any provider is recorded the same way and the pipeline does
 * not change. While a call runs, its record travels with it (AsyncLocalStorage): the token counts a provider
 * reports, and the requests it sends over the wire, are attached to whichever call they happened inside, however
 * many calls are running at once.
 *
 * Each record is one line in `calls.jsonl` in the run's folder: written once when the call begins, so a call
 * still running can be seen, and again when it ends. The last line for a number is the one that counts.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import type { CallRecord, CallSummary, TraceExchange, TracePart, UsageStage } from "../src/film/types";
import type { ImageBytes, Message, Provider } from "./providers/types";
import type { SkillTool } from "./skills";
import { type CallUsage, RATES, costOf } from "./usage";

const running = new AsyncLocalStorage<CallRecord>();

/** Long runs of picture or sound data are of no use to read and would swamp the record. */
const BLOB = /^(data:[^;,]+;base64,)?[A-Za-z0-9+/=\r\n]{2000}/;
/** Only the start is tested: matching a regular expression against several megabytes overflows the engine's stack. */
const isBlob = (value: string) => value.length >= 2000 && BLOB.test(value.slice(0, 2200));

/** A copy of a request or an answer with picture and sound data replaced by a note of its size. */
export function scrubbed(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return isBlob(value) ? `<${value.startsWith("data:") ? value.slice(5, value.indexOf(";")) : "data"}, ${value.length.toLocaleString("en")} characters, left out>` : value;
  if (Array.isArray(value)) return depth > 12 ? "<too deep>" : value.map((item) => scrubbed(item, depth + 1));
  if (value && typeof value === "object") return depth > 12 ? "<too deep>" : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrubbed(item, depth + 1)]));
  return value;
}

/** A request body as something that can be read: JSON as it was, a form as its fields. */
export function readableBody(body: unknown): unknown {
  if (typeof body === "string") {
    try {
      return scrubbed(JSON.parse(body));
    } catch {
      return body.length > 4000 ? `${body.slice(0, 4000)}…` : body;
    }
  }
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const fields: Record<string, unknown> = {};
    for (const [key, value] of body.entries()) fields[key] = typeof value === "string" ? scrubbed(value) : `<file ${value.name || "upload"}, ${value.type || "unknown type"}, ${value.size.toLocaleString("en")} bytes, left out>`;
    return fields;
  }
  return body === undefined || body === null ? null : "<a body that cannot be shown>";
}

/** Attach one request and its answer to the call that is running here, if one is. */
export function noteExchange(exchange: TraceExchange) {
  running.getStore()?.exchanges.push(exchange);
}

const EMPTY_USAGE = () => ({ input: 0, cached: 0, cacheWrite: 0, output: 0, reasoning: 0, images: 0, characters: 0, seconds: 0 });

/** The part of a record that lists show. */
export function summaryOf(record: CallRecord): CallSummary {
  const { n, stage, id, title, model, effort, status, at, ms, usage, cost, error, requests } = record;
  return { n, stage, id, title, model, ...(effort ? { effort } : {}), status, at, ms, usage, cost, ...(error ? { error } : {}), requests };
}

/** Every call of a run, as last written: one record for each number, in order. */
export function readCalls(file: string): CallRecord[] {
  if (!fs.existsSync(file)) return [];
  const last = new Map<number, CallRecord>();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line) continue;
    try {
      const record = JSON.parse(line) as CallRecord;
      last.set(record.n, record);
    } catch {
      // a line cut short by a crash is skipped
    }
  }
  return [...last.values()].sort((a, b) => a.n - b.n);
}

export interface TracerOptions {
  /** Where the records are written, or nothing to keep them only in memory. */
  file?: string;
  /** When the run began, as Date.now(). */
  started: number;
  /** The model and settings each stage is using, for the record. */
  describe: (stage: UsageStage) => { model: string; effort?: string; settings?: Record<string, string> };
  /** Where a picture or a sound the run makes will be fetched from. */
  outputSrc: (stage: UsageStage, id: string, type: string) => string | undefined;
}

const text = (title: string, value: string): TracePart => ({ kind: "text", title, text: value });
const size = (bytes: Uint8Array) => `${bytes.length.toLocaleString("en")} bytes`;

export function createTracer(options: TracerOptions) {
  let count = 0;
  /** What a picture or sound is, by the bytes themselves: set by the pipeline when it saves one. */
  const names = new WeakMap<Uint8Array, string>();
  const all: CallRecord[] = [];

  /** True from the second time a picture is drawn: a second try after a refusal or a drawing that could not be used. */
  const tries = new Map<string, number>();
  const drawnBefore = (id: string) => {
    const before = tries.get(id) ?? 0;
    tries.set(id, before + 1);
    return before > 0;
  };

  const write = (record: CallRecord) => {
    if (options.file) fs.appendFileSync(options.file, JSON.stringify(record) + "\n");
  };

  const media = (kind: "image" | "audio", title: string, data: ImageBytes): TracePart => {
    const src = names.get(data.bytes);
    return { kind, title, ...(src ? { src } : {}), note: `${data.type}, ${size(data.bytes)}` };
  };

  async function call<T>(stage: UsageStage, id: string, title: string, input: TracePart[], run: (record: CallRecord) => Promise<T>, output: (result: T, record: CallRecord) => TracePart[]): Promise<T> {
    const about = options.describe(stage);
    const record: CallRecord = {
      n: ++count,
      stage,
      id,
      title,
      model: about.model,
      ...(about.effort ? { effort: about.effort } : {}),
      settings: about.settings ?? {},
      status: "running",
      at: Math.round((Date.now() - options.started) / 100) / 10,
      ms: 0,
      input,
      output: [],
      tools: [],
      usage: EMPTY_USAGE(),
      cost: null,
      exchanges: [],
      requests: 0,
    };
    all.push(record);
    write(record);
    const began = Date.now();
    try {
      const result = await running.run(record, () => run(record));
      record.status = "ok";
      record.output = output(result, record);
      return result;
    } catch (error) {
      record.status = "failed";
      record.error = String((error as Error).message ?? error);
      throw error;
    } finally {
      record.ms = Date.now() - began;
      record.requests = Math.max(record.requests, record.exchanges.length);
      write(record);
    }
  }

  return {
    /** Remember where a saved picture or sound can be fetched, so a later call that sends it can say what it sent. */
    name(bytes: Uint8Array, src: string) {
      names.set(bytes, src);
    },

    /** Add what a provider reported to the call it was reported from. Called from the pipeline's `report`. */
    usage(model: string, usage: CallUsage) {
      const record = running.getStore();
      if (!record) return;
      record.model = model;
      record.requests += 1;
      for (const key of Object.keys(record.usage) as (keyof CallRecord["usage"])[]) record.usage[key] += usage[key] ?? 0;
      const cost = costOf(model, usage);
      if (cost !== null) record.cost = Math.round(((record.cost ?? 0) + cost) * 1_000_000) / 1_000_000;
      else if (!(model in RATES)) record.cost = record.cost ?? null;
    },

    calls: () => all,

    /** The same provider, with every call recorded. */
    wrap(provider: Provider): Provider {
      const wrapped: Provider = {
        ...provider,

        plan: (system, brief, onText, skills) => {
          let said = "";
          const input = [text("System prompt", system), text("The brief", brief), ...(skills ? [text("Tool offered: load_film_skills", skills.description)] : [])];
          return call(
            "plan",
            "",
            "Plan the film",
            input,
            (record) => {
              // The tool's answers are part of what the model read, so they are kept with the call.
              const watched: SkillTool | null | undefined = skills && {
                description: skills.description,
                load(args) {
                  const result = skills.load(args);
                  record.tools.push({ name: "load_film_skills", arguments: JSON.stringify(args), result });
                  return result;
                },
              };
              // The plan takes a minute or two to write. What it has written so far is saved every second or so,
              // so anyone watching the run can read the plan as it comes.
              let saved = 0;
              return provider.plan(
                system,
                brief,
                (delta) => {
                  said += delta;
                  if (Date.now() - saved > 1200) {
                    saved = Date.now();
                    record.output = [text("The plan so far, still being written", said)];
                    write(record);
                  }
                  onText(delta);
                },
                watched,
              );
            },
            () => [text("The plan, as written", said)],
          );
        },

        draw: (prompt, reference, pictureId, asked) =>
          call(
            "picture",
            pictureId,
            // A second try at the same picture is listed as one.
            drawnBefore(pictureId) ? `Draw ${pictureId} again` : `Draw ${pictureId}`,
            [text("Drawing prompt", prompt), ...(asked ? [text("Size asked for", asked)] : []), ...(reference ? [media("image", "Reference picture sent with it", reference)] : [])],
            () => provider.draw(prompt, reference, pictureId, asked),
            (image) => [{ kind: "image", title: "The drawing that came back", src: options.outputSrc("picture", pictureId, image.type), note: `${image.type}, ${size(image.bytes)}` }],
          ),

        findParts: (system, pictures, batchId) =>
          call(
            "parts",
            batchId,
            pictures.length === 1 ? `Find parts in ${pictures[0].id}` : `Find parts in ${pictures.length} pictures: ${pictures.map((ask) => ask.id).join(", ")}`,
            [text("System prompt", system), ...pictures.flatMap((ask) => [text(`Note for ${ask.id}`, ask.note), media("image", `The picture ${ask.id}`, ask.image)])],
            () => provider.findParts(system, pictures, batchId),
            (found) => [text("The answer", JSON.stringify(found, null, 2))],
          ),

        write: (system, messages, stepId) =>
          call("scene", stepId, messages.length > 1 ? `Correct scene ${stepId}` : `Write scene ${stepId}`, [text("System prompt", system), ...messageParts(messages)], () => provider.write(system, messages, stepId), (reply) => [text("The reply", reply)]),

        speak: (words, style, stepId) =>
          call(
            "voice",
            stepId,
            `Speak ${stepId}`,
            [text("Voice style", style), text("The narration, with its voice marks", words)],
            () => provider.speak(words, style, stepId),
            (audio) =>
              audio
                ? [{ kind: "audio", title: "The clip that came back", src: options.outputSrc("voice", stepId, audio.type), note: `${audio.type}, ${size(audio.bytes)}${audio.duration ? `, ${audio.duration.toFixed(1)} s` : ""}${audio.words ? `, ${audio.words.length} word times` : ""}` }]
                : [text("The answer", "This provider has no voice.")],
          ),

        hear: (audio, words) => {
          const src = names.get(audio.bytes) ?? "";
          const id = /\/([^/.]+)\.[a-z0-9]+$/.exec(src)?.[1] ?? "";
          return call(
            "timing",
            id,
            `Time the words of ${id || "a clip"}`,
            [media("audio", "The clip to listen to", audio), text("The words expected", words)],
            () => provider.hear(audio, words),
            (heard) => [text("The answer", heard ? JSON.stringify(heard, null, 2) : "Nothing could be measured.")],
          );
        },
      };
      return wrapped;

      function messageParts(messages: Message[]): TracePart[] {
        const parts: TracePart[] = [];
        messages.forEach((message, i) => {
          const who = message.role === "assistant" ? "Its own earlier reply" : i === 0 ? "The request" : "A follow-up";
          if (message.stable !== undefined) parts.push(text("The film's stable text (cached)", message.stable));
          parts.push(text(who, message.content));
          for (const shown of message.images ?? []) {
            parts.push(text("Before the picture", shown.label));
            parts.push(media("image", "Picture shown", shown.image));
          }
        });
        return parts;
      }
    },
  };
}

export type Tracer = ReturnType<typeof createTracer>;
