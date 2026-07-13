import type { ErrorObject } from "ajv";

export type DiagnosticCode =
  | "INVALID_JSON"
  | "SCHEMA_ERROR"
  | "DUPLICATE_ID"
  | "UNKNOWN_TARGET"
  | "UNKNOWN_ASSET"
  | "INVALID_ANCHOR"
  | "INVALID_ACTION_TARGET"
  | "INVALID_LIFECYCLE"
  | "PLACEMENT_CYCLE"
  | "CANONICAL_ERROR"
  | "TARGET_NOT_VISIBLE"
  | "UNKNOWN_RECIPE";

export interface Diagnostic {
  code: DiagnosticCode;
  path: string;
  message: string;
  received?: unknown;
  suggestions?: string[];
  availableTargets?: string[];
}

export type ValidationResult<T> =
  | { valid: true; value: T; warnings: Diagnostic[] }
  | { valid: false; errors: Diagnostic[] };

function valueAt(input: unknown, pointer: string): unknown {
  if (!pointer) return input;
  return pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined), input);
}

export function formatAjvErrors(errors: ErrorObject[] | null | undefined, input: unknown): Diagnostic[] {
  return (errors ?? []).map((error) => {
    const missing = error.keyword === "required" ? String(error.params.missingProperty) : undefined;
    const extra = error.keyword === "additionalProperties" ? String(error.params.additionalProperty) : undefined;
    const path = `${error.instancePath}${missing ? `/${missing}` : extra ? `/${extra}` : ""}` || "/";
    return {
      code: "SCHEMA_ERROR",
      path,
      message: extra ? `Unknown field '${extra}' is not allowed` : `${error.message ?? "Invalid value"}`,
      received: extra ? valueAt(input, `${error.instancePath}/${extra}`) : valueAt(input, error.instancePath),
    };
  });
}
