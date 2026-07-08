import { describe, expect, it } from "vitest";

import { withAlpha } from "./anim";

/** Minimal stand-in for the parts of CanvasRenderingContext2D that withAlpha touches. */
function stubCtx() {
  const stack: number[] = [];
  const ctx = {
    globalAlpha: 1,
    save() {
      stack.push(this.globalAlpha);
    },
    restore() {
      this.globalAlpha = stack.pop() ?? 1;
    },
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

describe("withAlpha", () => {
  it("scales globalAlpha inside the draw callback and restores it after", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 0.5, () => {
      seen = ctx.globalAlpha;
    });
    expect(seen).toBe(0.5);
    expect(ctx.globalAlpha).toBe(1);
  });

  it("multiplies nested alphas", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 0.5, () => withAlpha(ctx, 0.5, () => (seen = ctx.globalAlpha)));
    expect(seen).toBe(0.25);
  });

  it("skips the callback entirely at alpha <= 0", () => {
    const ctx = stubCtx();
    let called = false;
    withAlpha(ctx, 0, () => (called = true));
    expect(called).toBe(false);
  });

  it("clamps alpha above 1", () => {
    const ctx = stubCtx();
    let seen = -1;
    withAlpha(ctx, 3, () => (seen = ctx.globalAlpha));
    expect(seen).toBe(1);
  });
});
