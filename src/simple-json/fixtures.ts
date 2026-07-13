import type { LessonSpec } from "./types";

/** A complete LLM-facing example: semantic values only, with no pixels, colors, seconds, zoom values,
 * raw SVG, or canonical GCL implementation details. */
export const NEWTON_CANNON_LESSON: LessonSpec = {
  version: "1",
  title: "Newton's cannon",
  theme: "blueprint",
  scenes: [
    {
      id: "orbital-thought-experiment",
      composition: "hero-diagram",
      objects: [
        {
          id: "title",
          kind: "text",
          text: "Newton's cannon",
          textRole: "heading",
          role: "hero",
          placement: { mode: "zone", zone: "title" },
          initial: "hidden",
        },
        {
          id: "cannon",
          kind: "visual",
          asset: "cannon",
          orientation: "left",
          role: "hero",
          size: "large",
          placement: { mode: "zone", zone: "main-left" },
          initial: "hidden",
        },
        {
          id: "earth",
          kind: "visual",
          asset: "planet",
          role: "primary",
          size: "hero",
          placement: { mode: "zone", zone: "main-right" },
          initial: "hidden",
        },
        {
          id: "trajectory",
          kind: "line",
          from: "cannon.muzzle",
          to: "earth.center",
          form: "curved",
          role: "primary",
          initial: "hidden",
        },
        {
          id: "equation",
          kind: "equation",
          value: "v = \\sqrt{GM/R}",
          role: "support",
          placement: { mode: "zone", zone: "support" },
          initial: "hidden",
        },
        {
          id: "speed",
          kind: "stat",
          value: 7.9,
          unit: "km/s",
          label: "Low-Earth orbital speed",
          decimals: 1,
          role: "support",
          placement: { mode: "zone", zone: "footer" },
          initial: "hidden",
        },
      ],
      beats: [
        {
          id: "reveal-experiment",
          pace: "dramatic",
          actions: [
            { do: "show", targets: ["title", "cannon", "earth"], entrance: "fade" },
            { do: "show", targets: ["trajectory"], entrance: "draw" },
          ],
        },
        {
          id: "show-math",
          pace: "normal",
          actions: [{ do: "show", targets: ["equation", "speed"], entrance: "wipe" }],
        },
        {
          id: "launch-point",
          pace: "slow",
          actions: [
            { do: "camera", target: "cannon.muzzle", shot: "detail", movement: "push" },
            { do: "label", target: "cannon.muzzle", title: "Launch point", text: "The projectile starts here", style: "pill" },
          ],
        },
        {
          id: "inspect-system",
          pace: "normal",
          actions: [
            {
              do: "tour",
              labelMode: "one-at-a-time",
              returnTo: "overview",
              stops: [
                { target: "cannon.breech", label: "Breech", shot: "close" },
                { target: "cannon.wheels", label: "Carriage and wheels", shot: "close" },
                { target: "earth.ring", label: "The curved world", shot: "detail" },
              ],
            },
          ],
        },
      ],
    },
  ],
};
