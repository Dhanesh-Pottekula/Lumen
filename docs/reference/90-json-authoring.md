# The JSON authoring format (the LLM target)

This is the schema an LLM emits. It is interpreted by `src/render/storyboard.ts`. A whole lesson is a **`Storyboard`**: a list of **scenes**, each a list of **beats**. `storyboardFilm(storyboard)` compiles it into a seekable film; `storyboardScene(scene)` compiles a single scene.

```ts
storyboardFilm(story: Storyboard): CanvasSlideDefinition   // JSON → playable, seekable film
```

## Top-level shape

```ts
interface Storyboard extends ComposeOptions {
  scenes: StoryScene[];
}

interface StoryScene {
  duration: number;              // seconds this scene lasts (its local timeline is 0 … duration)
  bg?: [string, string];         // background vertical gradient [topColor, bottomColor]; default ["#141c24","#0f151b"]
  captions?: { at: number; text: string }[];  // optional subtitle cues (NOTE: the demo player currently hides these)
  beats: Beat[];                 // the timed drawing instructions
}
```

`ComposeOptions` (inherited by `Storyboard`, so you can set them at the top level alongside `scenes`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `crossfade` | number | `2.5` | Seconds consecutive scenes overlap. |
| `progressDots` | boolean | `true` | Draw one dot per scene along the bottom. |
| `filmGrade` | boolean | `false` | Apply a filmic vignette + grain + grade to the whole film. |
| `transition` | `"crossfade" \| "zoom-through" \| "whip-pan"` | `"crossfade"` | Scene-to-scene transition style. |
| `theme` | Theme | `TEXTBOOK` | Art-direction theme (see themes section). |

**Scene timing on the film timeline:** scene 0 starts at 0; each next scene starts `previousDuration − crossfade` later (scenes overlap by `crossfade`). Film length = `Σ durations − (n−1) × crossfade`.

## The beat: shared fields

Every beat has these (from `Base`):

| Field | Type | Default | Meaning |
|---|---|---|---|
| `kind` | string | — | **required.** Which beat type (table below). |
| `at` | number | — | **required.** Scene-local time (seconds) the beat starts. Before `at`, the beat draws nothing. |
| `dur` | number | `1` (varies by kind) | How long the beat's entrance animation takes. Progress is `p = phase(t, at, at + dur)`. |
| `layer` | `"bg"\|"mid"\|"fg"\|"annotation"\|"fx"` | per-kind (see below) | Which compositing layer to draw on. Usually omit and accept the default. |

**Default layer per kind** (`defaultLayer`): `particles → fg`; `ring → fg`; `text, math, callout, counter → annotation`; `rect → bg`; everything else (`bars, pie, line, icon`) → `mid`.

## Beat catalogue

Below, every beat `kind` with all its fields. `x, y` are in the 920×430 space. `p` denotes the beat's own `phase(t, at, at+dur)` progress.

### `text` — a text line (plain / word-by-word / slam)
```jsonc
{ "kind": "text", "at": 0.2, "dur": 1, "x": 460, "y": 80,
  "text": "PHOTOSYNTHESIS", "size": 22, "color": "#eef5ef",
  "align": "center", "mode": "slam" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `text` | string | — | The string to show. |
| `x,y` | number | — | Anchor position. |
| `size` | number | `22` | Font pixel size (weight is 700 bold). |
| `color` | string | `"#eef5ef"` | Text color. |
| `align` | `"left"\|"center"\|"right"\|"start"\|"end"` | `"center"` | Horizontal anchor (CanvasTextAlign). Applies to `plain` mode. |
| `mode` | `"plain"\|"word"\|"slam"` | `"plain"` | `plain` = fade in; `word` = reveal word-by-word rising in; `slam` = impact drop-in. |

### `math` — a typeset equation (LaTeX subset)
```jsonc
{ "kind": "math", "at": 1, "dur": 1.5, "x": 460, "y": 240,
  "tex": "6CO_2 + 6H_2O \\rightarrow C_6H_{12}O_6 + 6O_2", "size": 30, "align": "center" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `tex` | string | — | LaTeX-subset string. Supports `\frac{}{}`, `\sqrt{}`, `^`, `_`, and a symbol dictionary (Greek, ∑ ∫ ∏ → ± ≤ …). See the math section for the full supported set. |
| `size` | number | `30` | Font size. |
| `color` | string | theme ink | Color. |
| `align` | `"left"\|"center"\|"right"` | `"center"` | Anchor. |
| — | | | The equation **writes on left→right** driven by `p`. |

### `counter` — an animated number
```jsonc
{ "kind": "counter", "at": 1, "dur": 2, "x": 460, "y": 200, "from": 0, "to": 24000000, "fmt": { "commas": true } }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `from`,`to` | number | — | Start and end values; counts `from`→`to` across `dur` (default dur here is `2`). |
| `size` | number | `40` | Font size (weight 800). |
| `color` | string | `"#5cc8ae"` | Color. |
| `fmt` | NumberFormat object | plain integer | Formatting **options object** (not a string). Fields: `decimals?: number`, `commas?: boolean`, `prefix?: string`, `suffix?: string`. Examples: thousands → `{ "commas": true }`; money → `{ "prefix": "$", "commas": true }`; percent → `{ "suffix": "%" }`; 1 decimal → `{ "decimals": 1 }`. See the kinetic-type section for exact fields. |

### `bars` — an animated bar chart
```jsonc
{ "kind": "bars", "at": 1, "x": 120, "y": 90, "w": 300, "h": 220,
  "data": [{ "label": "A", "value": 8, "color": "#5cc8ae" }], "ymax": 10, "color": "#5cc8ae" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Plot rectangle (top-left + size). |
| `data` | `Datum[]` | — | `Datum = { label: string; value: number; color?: string }`. |
| `ymax` | number | — | Top of the value axis. |
| `color` | string | — | Default bar color (overridden per-datum). |
| — | | | Bars grow in, **staggered** (0.18s apart), with values shown. |

### `pie` — an animated pie / donut
```jsonc
{ "kind": "pie", "at": 2, "dur": 2, "x": 460, "y": 240, "r": 90,
  "data": [{ "label": "N2", "value": 78 }], "donut": 0.5 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Center. |
| `r` | number | — | Radius. |
| `data` | `Datum[]` | — | Slices. |
| `donut` | number | none | 0–1 inner-hole fraction; omit for a full pie. Labels are on. Wedges sweep in with `p`. |

### `line` — an animated line / area chart
```jsonc
{ "kind": "line", "at": 1, "dur": 2, "x": 120, "y": 60, "w": 320, "h": 220,
  "series": [[0,0],[1,1],[2,4],[3,9]], "xDomain": [0,3], "yDomain": [0,10], "area": true, "color": "#6db0e8" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Plot rectangle. |
| `series` | `[number,number][]` | — | Data points `[x,y]`. |
| `xDomain`,`yDomain` | `[number,number]` | — | Axis ranges. |
| `area` | boolean | `false` | Fill under the line. |
| `color` | string | — | Line color. Markers are on; the line draws on with `p`. |

### `icon` — a vector glyph
```jsonc
{ "kind": "icon", "at": 0.5, "dur": 1, "x": 200, "y": 200, "name": "leaf", "size": 40, "color": "#38ef7d", "filled": true }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `name` | IconName | — | One of the 30 icon names (see icons section for the full list). |
| `x,y` | number | — | Center. |
| `size` | number | `28` | Pixel size. |
| `color` | string | theme ink | Color. |
| `filled` | boolean | `false` | Fill vs stroke (only "fillable" icons fill; open glyphs always stroke). Fades in with `p`. |

### `callout` — a label that points at something
```jsonc
{ "kind": "callout", "at": 1, "dur": 1.5, "x": 300, "y": 180,
  "text": "chloroplast", "title": "Organelle", "side": "top", "route": "elbow", "container": "bubble" }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | The **target** point the callout points at. |
| `text` | string | — | Body text (typewriter reveal). |
| `title` | string | none | Optional bold heading. |
| `side` | Side | auto | Placement relative to target (see callout section for values, e.g. `top/bottom/left/right/auto`). |
| `route` | `"straight"\|"elbow"\|"curve"` | — | Leader-line routing. |
| `container` | `"pill"\|"rect"\|"tag"\|"bubble"\|"badge"` | — | Note container style. |
| — | | | Leader draws on with `p`; label types on shortly after. |

### `particles` — a particle burst/stream (preset)
```jsonc
{ "kind": "particles", "at": 2, "x": 460, "y": 240, "preset": "confetti", "seed": 7 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Emitter origin. |
| `preset` | `"fire"\|"smoke"\|"sparks"\|"energy"\|"confetti"` | — | Which preset (only these 5 are exposed as beats). `confetti` loops. |
| `seed` | number | `1` | PRNG seed → deterministic but variable pattern. |
| — | | | Runs on local time `t − at` (so it starts when the beat starts). |

### `ring` — a highlight ring / converging focus
```jsonc
{ "kind": "ring", "at": 1, "x": 300, "y": 180, "r": 40, "color": "#e8a13c", "converge": false }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y` | number | — | Center. |
| `r` | number | — | Radius (used when `converge` is false). |
| `color` | string | — | Ring color. |
| `converge` | boolean | `false` | `true` = animated rings converging inward (attention grab); `false` = a steady highlight ring. |

### `rect` — a filled rectangle (panel / band / backdrop)
```jsonc
{ "kind": "rect", "at": 0, "dur": 0.5, "x": 0, "y": 0, "w": 920, "h": 60, "color": "#1b2733", "radius": 8 }
```
| Field | Type | Default | Meaning |
|---|---|---|---|
| `x,y,w,h` | number | — | Rectangle. |
| `color` | string | — | **required** fill color. |
| `radius` | number | `0` | Corner radius. Fades in with `p`. |

---

## How beats map to primitives (interpreter trace)

`renderBeat` gates each beat with `p = phase(t, at, at + (dur ?? 1))`, skips if `t < at`, picks the layer, then calls:

| kind | Underlying call (module) |
|---|---|
| `text` | `drawWordReveal` / `drawSlam` / `fadeText` (type-motion) |
| `math` | `drawMath(...,{ p })` (mathtext) |
| `counter` | `drawCounter(..., counterValue(t, at, dur ?? 2, from, to), fmt)` (type-motion) |
| `bars` | `barChart(makePlot(...,[0,1],[0,ymax]), data, { t, start:at, step:0.18, showValues })` (charts) |
| `pie` | `pie(x,y,r,data,p,{ donut, labels:true })` (charts) |
| `line` | `lineChart(makePlot(...,xDomain,yDomain), series, p, { area, markers:true })` (charts) |
| `icon` | `drawIcon(name,x,y,size,{ color, filled, alpha:p })` (icons) |
| `callout` | `callout(frame,{ target:[x,y], text, title, side, route, container, leaderP:p, labelP })` (callout) |
| `particles` | `emit(PRESETS[preset](x,y,seed), t − at)` (particles) |
| `ring` | `focusRings(...)` if `converge` else `highlightRing(...)` (focus) |
| `rect` | `roundRect` fill at `globalAlpha *= p` |

---

## Minimal complete example

```jsonc
{
  "transition": "crossfade",
  "filmGrade": true,
  "scenes": [
    {
      "duration": 6,
      "bg": ["#101820", "#0a0f14"],
      "beats": [
        { "kind": "text", "at": 0.3, "x": 460, "y": 70, "text": "THE WATER CYCLE", "mode": "slam", "size": 30 },
        { "kind": "icon", "at": 1.2, "x": 300, "y": 240, "name": "sun", "size": 60, "color": "#e8c14a" },
        { "kind": "icon", "at": 1.8, "x": 460, "y": 240, "name": "cloud", "size": 60, "color": "#9fb4c4", "filled": true },
        { "kind": "icon", "at": 2.4, "x": 620, "y": 240, "name": "drop", "size": 60, "color": "#6db0e8", "filled": true },
        { "kind": "callout", "at": 3.2, "dur": 1.6, "x": 460, "y": 240, "text": "evaporation → condensation → rain", "container": "bubble", "route": "elbow", "side": "bottom" }
      ]
    },
    {
      "duration": 5,
      "beats": [
        { "kind": "counter", "at": 0.4, "dur": 2, "x": 460, "y": 200, "from": 0, "to": 97, "fmt": "percent" },
        { "kind": "text", "at": 0.4, "x": 460, "y": 250, "text": "of Earth's water is in the oceans" }
      ]
    }
  ]
}
```

---

## What the JSON can and cannot do today (READ THIS)

The current `Beat` union exposes only a **subset** of the engine. An LLM emitting JSON can use exactly these effects:

- **Available now:** `text` (plain/word/slam), `math`, `counter`, `bars`, `pie`, `line`, `icon`, `callout`, `particles` (5 presets), `ring`, `rect`, plus scene `bg` gradient, `transition`, `filmGrade`, `theme`.

- **NOT expressible in JSON yet** (these exist as primitives but have no beat kind): draw-on **strokes** (step 04), the full **reveal** grammar (wipes/iris/dissolve/spotlight, step 05), most **focus/attention** tools (step 06, only `ring` is exposed), the engagement **build-steps/predict-reveal/punch/shake** (step 08), most **kinetic type** (only counter + text modes), the **camera** (step 11), the **timeline** (step 13), **morph** (step 14), the **geo/map** subsystem (step 16), and per-particle custom `EmitterConfig` (only 5 presets exposed).

If a lesson needs those, either (a) author it as hand-authored TypeScript (Path B), or (b) extend the `Beat` union — see the cookbook section for the recommended new beat kinds and exactly which primitive each should call.
