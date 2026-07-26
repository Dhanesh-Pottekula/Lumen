export interface TargetRef {
  raw: string;
  objectId: string;
  anchor?: string;
}

/** Parse an already-structured target using the current scene's exact object ids as the authority. */
export function parseTarget(raw: string, objectIds: ReadonlySet<string>): TargetRef {
  if (objectIds.has(raw)) return { raw, objectId: raw };
  const split = raw.lastIndexOf(".");
  if (split < 1 || split === raw.length - 1) return { raw, objectId: raw };
  return { raw, objectId: raw.slice(0, split), anchor: raw.slice(split + 1) };
}
