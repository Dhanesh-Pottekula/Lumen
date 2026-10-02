export interface TargetRef {
  raw: string;
  objectId: string;
  anchor?: string;
}

/** Where an owner's id ends in `owner.anchor`: at the last dot before any `@`, so `tri.s0@0.5` is `tri` and `s0@0.5`. */
export function anchorDot(raw: string): number {
  const at = raw.indexOf("@");
  return (at < 0 ? raw : raw.slice(0, at)).lastIndexOf(".");
}

/** Parse an already-structured target using the current scene's exact object ids as the authority. */
export function parseTarget(raw: string, objectIds: ReadonlySet<string>): TargetRef {
  if (objectIds.has(raw)) return { raw, objectId: raw };
  const split = anchorDot(raw);
  if (split < 1 || split === raw.length - 1) return { raw, objectId: raw };
  return { raw, objectId: raw.slice(0, split), anchor: raw.slice(split + 1) };
}
