/**
 * The film scene writer's catalog: one entry per object kind, action verb, placement form, frame and
 * composition, written in the house catalog format. Signatures, types, limits and enum values are read
 * from the filtered schema at render time, so they cannot drift; this file holds only the words.
 * `renderCatalog` refuses to render when a kind or verb has no entry, an entry has no variant, a field
 * is undescribed, or an enum value has no meaning.
 */

export type JsonNode = {
  type?: string;
  const?: string;
  enum?: readonly string[];
  properties?: Record<string, JsonNode>;
  required?: readonly string[];
  items?: JsonNode;
  prefixItems?: readonly JsonNode[];
  oneOf?: readonly JsonNode[];
  anyOf?: readonly JsonNode[];
  additionalProperties?: boolean | JsonNode;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  minItems?: number;
  maxItems?: number;
  maxLength?: number;
  $defs?: Record<string, JsonNode>;
};

/** What the bundler hands over: the writers' contract after its withheld kinds, verbs and marks are struck out. */
export interface CatalogContract {
  compositions: readonly string[];
  objectKinds: readonly string[];
  actions: readonly string[];
  mathTextCommands: readonly string[];
  expressionFunctions: readonly string[];
  expressionConstants: readonly string[];
  schema: JsonNode;
}

type Family =
  | "Writing"
  | "Lines and marks"
  | "Pictures"
  | "Figures"
  | "Charts"
  | "Showing"
  | "Naming"
  | "Attention"
  | "Colour and level"
  | "Motion"
  | "Emphasis"
  | "Camera";

interface FieldDoc {
  /** The type as written, when the schema's own reads worse ("Ref" for an id string). */
  type?: string;
  lines?: readonly string[];
  /** The meaning of each enum value, by value. */
  values?: Readonly<Record<string, string>>;
  /** One line covering every value, for a set whose names say what they are. */
  allValues?: string;
  /** Shares the value meanings of another entry's field, `<entry>.<field>`. */
  same?: string;
  attached?: boolean;
  never?: string;
  /** Its nested keys are described in its own lines, not as blocks of their own. */
  flat?: boolean;
}

interface EntryDoc {
  family?: Family;
  summary: string;
  use?: readonly string[];
  fields?: Readonly<Record<string, FieldDoc>>;
  /** Keys the film reads before the engine sees the scene; never in the schema. */
  extra?: Readonly<Record<string, FieldDoc & { optional: boolean }>>;
}

interface HandEntry {
  signature: string;
  summary: string;
  use?: readonly string[];
}

const ATTACHED = { attached: true } as const;

const THEME_ROLES = {
  ink: "The writing colour.",
  accent: "The film's highlight colour.",
  muted: "A soft grey.",
  danger: "Red. Only for what is wrong or dangerous, unless red has its own meaning in the subject.",
  none: "Nothing painted.",
};

const PACES = {
  instant: "About a quarter second, with no transition.",
  quick: "About one second. A brisk step.",
  normal: "About two seconds. Default.",
  slow: "About three and a half seconds. Time to look.",
  dramatic: "About five seconds. A major reveal.",
};

const ROTATION = {
  clockwise: "Clockwise. Default.",
  counterclockwise: "Anticlockwise.",
};

const LAND = {
  surface: "Stops against the target's drawn edge. Default.",
  centre: "Goes all the way in, to its middle.",
};

const GAIT = {
  walk: "A light bob as it goes.",
  run: "A quicker, bigger bounce.",
  hop: "Hops along.",
};

const FILM_CATALOG = {
  intro:
    "Every key and value a scene can use. A key or value that is not here does not exist. The engine refuses it, and whatever used it is lost. Write the scene as one JSON object. Double every backslash inside a JSON string: `\\\\frac`.",

  conventions: [
    "`Ref` names one thing in this scene. Every `Ref` below follows this.",
    "An object's id is a `Ref`.",
    "A picture's part is a `Ref`: `<picture>.<part>`, with one dot. Spell it exactly as the picture table lists it.",
    "A figure's corner `<figure>.v<i>` and side `<figure>.s<i>` are `Ref`s.",
    "A point along a side is a `Ref`: `<figure>.s<i>@t`, where `t` runs from 0 to 1.",
    "A piece of an object is a `Ref`: `<object>.<piece>`.",
    "An equation's term is a `Ref`: `<equation>.<term>`.",
    "A chart's mark is a `Ref`: `<chart>.bar<i>`, `.pt<i>` or `.series<i>`.",
    "Positions and lengths are in view units. The screen is portrait, 540 view units wide and 960 tall.",
    "Build a piece on its own beat. `show` `<object>.<piece>` on the words that name it.",
    "Showing the whole object builds all its pieces across one beat.",
    "Showing a piece also reveals its object's frame.",
    "A piece already on screen cannot be shown again. So an object whose pieces you show one by one is never `\"initial\": \"visible\"`.",
    "A piece takes `attention` and `label` in the beat that shows it, or later. Never in the beat that shows its whole object.",
    "Only the pieces an entry lists exist.",
  ],

  scene: {
    scene: {
      summary: "One scene. The animation that plays while one step's narration is spoken.",
      fields: {
        id: { lines: ["The step's id, unchanged."] },
        composition: { type: "Composition", allValues: "One of the compositions below." },
        objects: { type: "Object[]", flat: true, lines: ["Everything the scene draws, each declared once. See Objects."] },
        beats: { type: "Beat[]", flat: true, lines: ["The moments of the scene, in order. See `beat`."] },
        narration: { lines: ["The step's narration, word for word.", "The scene lasts at least as long as the voice takes to speak it."] },
        check: { type: "Check", flat: true, lines: ["Only when the step has a question. See `check`."] },
        categories_of: {
          type: "{Ref: string}",
          lines: [
            "Colours picture parts and figure pieces by the film's categories, from the scene's first frame.",
            "Written as `{\"<picture>.<part>\": \"<category id>\"}`.",
            "Each part is washed inside its traced outline.",
            "A part with no outline has nothing to colour and is dropped.",
          ],
        },
      },
    },
    beat: {
      summary: "One moment of a scene. Its actions start together.",
      use: ["The next beat starts after it, or on its own `say`."],
      fields: {
        id: { lines: ["Any label, unique in the scene."] },
        actions: { type: "Action[]", flat: true, lines: ["One or more. See Actions."] },
        pace: { lines: ["How long its changes take and how long it holds."], values: PACES },
        say: {
          lines: [
            "The narration's own words this beat begins on, copied letter for letter.",
            "The beat starts as they are spoken.",
            "Each beat's words come later in the narration than the beat before's.",
            "Every beat after the first carries it. The first may leave it out and starts with the scene.",
          ],
        },
      },
    },
    check: {
      summary: "A question the phone asks after the narration ends.",
      use: [
        "The scene's last frame holds while it is asked.",
        "It shows `answer` and the `wrong` answers shuffled together.",
        "Keep every field within its limit. A field over its limit drops the whole check.",
      ],
      fields: {
        question: { lines: ["The question, as spoken and shown."] },
        answer: { lines: ["The right answer."] },
        why: { lines: ["Why it is right, in one sentence.", "Shown after a right tap."] },
        wrong: { lines: ["The wrong answers.", "A wrong tap shows its `why`, then the right one."] },
        "wrong.text": { lines: ["A wrong answer."] },
        "wrong.why": { lines: ["Why it is wrong, in one sentence."] },
        place: {
          values: {
            below: "Under the held frame. Default.",
            over: "Over the frame, hiding it. For when the frame would give the answer away.",
          },
        },
      },
    },
  },

  object: {
    summary: "Every object below also takes these keys.",
    use: [
      "Every object is revealed exactly once: `\"initial\": \"visible\"` or one `show`. Never both, never neither.",
      "Nothing carries into the next scene. Everything a scene draws ends with it.",
    ],
    fields: {
      id: {
        lines: [
          "Starts with a letter, then letters, digits, `_` or `-`.",
          "Unique in the scene.",
          "Write lowercase words joined by `-` that say what it is: `war-link`, `date`.",
        ],
      },
      kind: { type: "string", lines: ["The name of its entry below: `text`, `line`, `image`, `chart`."] },
      role: {
        lines: ["Sets its colour and its layer.", "Sets its size too, when `size` does not.", "Writing is drawn in open space beside pictures, never over them."],
        values: {
          background: "Scenery behind everything, muted. Goes to the `background` zone when it has no placement.",
          support: "A companion, muted and small, about a third of the subject. Goes to `support` when it has no placement.",
          primary: "The thing being taught, drawn large in the accent colour. Default. One at a time. Two are drawn as equals only in a comparison.",
          hero: "The dominant subject, drawn in front at `hero` size.",
          annotation: "A teaching mark in ink, drawn small over pictures. Goes to `overlay` when it has no placement.",
          hud: "A readout pinned to the screen, top right. The camera never moves it.",
        },
      },
      placement: { type: "Placement", flat: true, lines: ["Where it goes. One of the placement forms below.", "Left out, its role picks a zone."] },
      size: {
        lines: [
          "A size word is only a default fallback.",
          "`{like, dimension?, times?}` sets the size exactly and wins.",
          "A picture (`image`) takes no size word: its role and its place in the scene size it. Its only `size` is `{like, dimension?, times?}`.",
          "Copy the table's `size` onto a picture whenever the thing it names is in the scene.",
          "The scene's subject picture fills the width when nothing is beside it in its row.",
          "No picture is drawn smaller than about 90 view units on its longer side, a sixth of the screen. A smaller one is raised to that.",
          "A figure drawn in code that is the step's subject is `\"large\"`.",
          "Writing takes a size by how much it matters: `term`, `name`, `tag` or `number`.",
          "Writing with no size is a `name`.",
          "No writing is ever drawn smaller than its size's floor, which a phone can read.",
        ],
        values: {
          term: "Writing only. Large. The word being taught.",
          name: "Writing only. Medium. A name that orients. Default for writing.",
          tag: "Writing only. Small, still readable. A date, a unit or a place tag.",
          number: "Writing only. Very large. One key figure on its own.",
          tiny: "About 70 view units on a figure's longer side.",
          mini: "About 110.",
          small: "About 155.",
          compact: "About 205.",
          medium: "About 260, half the width.",
          large: "About 300.",
          hero: "About 330.",
          fill: "The full width.",
        },
      },
      "size.like": { type: "Ref", lines: ["The thing it is measured against.", "Any object or part, such as `rocket.nozzle`."] },
      "size.dimension": { values: { width: "Its drawn width is `times` that thing's width. Default.", height: "Its drawn height is `times` that thing's height." } },
      "size.times": { lines: ["How many times as big."] },
      rotate: {
        lines: [
          "Degrees clockwise about its centre. It is the turn it starts the scene in.",
          "Its parts turn with it.",
          "A turn never changes which way a picture faces. Its drawing already faces its planned way. Turn it only when the lesson shows it turned, such as upside down or tipped over.",
          "A picture drawn facing `left` that must point down takes `-90`.",
        ],
      },
      attach: {
        lines: [
          "Sets its own point exactly on another thing's point, like a plume's top on a nozzle's bottom.",
          "It is then carried with that thing.",
          "Copy the table's `attach` onto a picture whenever the thing it names is in the scene.",
          "On a stage drawn in code, a picture stands at its true point.",
          "`{\"self\": \"bottom\", \"to\": \"stage.v1\", \"at\": \"center\"}` sets its base on corner `v1`.",
        ],
      },
      "attach.self": { lines: ["Its own edge, or one of its own parts.", "An edge is `top`, `bottom`, `left`, `right` or `center`."] },
      "attach.to": { type: "Ref", lines: ["The thing it attaches to.", "Any object, part, corner or side."] },
      "attach.at": {
        lines: ["The point of `to`, read on its drawn shape and turned with it."],
        values: { top: "Its top edge.", bottom: "Its bottom edge.", left: "Its left edge.", right: "Its right edge.", center: "Its middle." },
      },
      initial: {
        values: {
          hidden: "Not drawn until a `show` reveals it. Default.",
          visible: "On screen as the scene opens. A picture the step before left on screen is declared again this way. It is never shown again.",
        },
      },
      space: {
        values: {
          world: "Moves with the camera. Default.",
          screen: "Pinned to the screen. The camera never moves it, and other things are kept off it. The same as role `hud`.",
        },
      },
      temporary: {
        lines: [
          "`true`: a later beat of this scene must `hide` it.",
          "One still showing when the scene ends is an error.",
          "Rarely needed. Everything a scene draws ends with it anyway.",
        ],
      },
      category: {
        lines: [
          "The id of one of the film's categories.",
          "Writing and strokes take its colour.",
          "A picture is washed in it over its outline.",
          "Each category keeps one colour in every scene and every key.",
        ],
      },
      tint: {
        lines: [
          "How strongly a category colours a picture or its parts.",
          "The wash never animates and sits under every glow.",
          "It stays while its picture is on screen.",
        ],
        values: { faint: "A still wash at about a quarter strength. Default.", strong: "A strong wash." },
      },
    },
  },

  placement: {
    zone: {
      summary: "A named place on the screen. The composition sets where each zone sits.",
      use: [
        "Zones are furniture, not places in the world.",
        "Never choose a zone because it lies the way a thing should be.",
        "Things in one zone stack downward.",
        "The screen is twice as tall as it is wide, so two pictures stack.",
        "Put the subject in `main` and the companion `above` or `below` it.",
        "Side by side halves each picture's width. Use it only for a left-to-right comparison.",
      ],
      fields: {
        zone: {
          values: {
            main: "The subject's place, in the middle.",
            "main-left": "The left half, for one side of a comparison.",
            "main-right": "The right half, for the other side.",
            support: "Under the subject. For a companion or a readout.",
            footer: "Along the foot. For a term with its meaning, or one relation.",
            background: "Behind everything. For scenery.",
            overlay: "Over the scene. For marks laid on it.",
            hud: "Pinned top right. For a fixed readout.",
            strip: "Along the top, under the app's progress dots. For a running timeline.",
            badge: "The bottom-left corner. For a date tag with its place, written \"date · place\".",
          },
        },
      },
    },
    relative: {
      summary: "Next to another thing, by how the two sit in the world.",
      use: [
        "Use it for every picture beside the subject.",
        "Use it for a traveller where it starts, with `near` or `on`.",
        "One solver places everything. It keeps the relation, stays off what is actually drawn, and stays in frame.",
        "On a picture of a place it prefers open space, such as the sea over the land.",
        "Only when the stated side has no clear room does it take the nearest clear spot round the target.",
        "Writing with nowhere clear shrinks a step or two first.",
      ],
      fields: {
        target: { type: "Ref", lines: ["Any object or part."] },
        relation: {
          values: {
            above: "Just past its top edge.",
            below: "Just past its bottom edge.",
            "left-of": "Just past its left edge. For a line, off its middle on that side.",
            "right-of": "Just past its right edge. For a line, off its middle on that side.",
            near: "The nearest clear spot all round it, off it.",
            on: "Standing on it. Its base is on a point inside the outline, its body above.",
            inside: "Wholly within its outline.",
          },
        },
        gap: { lines: ["Clearance from the target's drawn edge, in view units."] },
      },
    },
    anchor: {
      summary: "Centred on a thing's middle.",
      use: [
        "A region's middle is its inside point, not its box centre.",
        "A picture anchored on a region of a map stands on it.",
        "Writing anchored on a picture's part is set beside the part, so the part stays seen.",
      ],
      fields: {
        target: { type: "Ref", lines: ["Any object, part, corner or side."] },
      },
    },
  },

  frames: {
    intro:
      "Any `path`, `text` or `equation` takes `in`, the frame its numbers are written in. So a mark lands exactly where it means. Whatever is drawn in a frame stays in it. It moves, turns and grows with its thing. So do the lines, spans, angles, labels and glows aimed at it.",
    entries: [
      {
        signature: 'in: "<path id>"',
        summary: "That figure's own grid, the units its `d` is written in.",
        use: [
          "Use it for the pieces of one figure, so they line up.",
          "A square built on a side, a grid of tiles and a line through a corner all work this way.",
        ],
      },
      {
        signature: 'in: "<object or part>"',
        summary: "Its box, whatever its shape.",
        use: [
          "x runs 0 to 1000 across its width.",
          "y runs 0 to 1000 down its height.",
          "Use it for a mark on a thing, like a crack across a wall or a ray bending inside a glass.",
        ],
      },
      {
        signature: 'in: "<figure>.v<i>"',
        summary: "A corner, with the origin on the corner.",
        use: [
          "x runs along the side to the next corner.",
          "y runs along the side to the previous corner.",
          "Both are in the figure's grid units.",
          "`M40 0 L40 40 L0 40` there is the square mark of a right angle, 40 units a side.",
          "An end of an open path has one side. The other axis stands square to it, pointing inward.",
        ],
      },
      {
        signature: 'in: "<figure>.s<i>" | "<figure>.s<i>@t"',
        summary: "A side, running from `v<i>` to the next corner.",
        use: [
          "The origin is the side's start, or the point `t` along it.",
          "x runs along the side.",
          "y points out of the figure.",
          "`M0 -24 L0 24` at `tri.s0@0.5` is a tick across the middle of a side.",
          "A dimension line drawn at y 40 sits outside the figure.",
        ],
      },
    ] as readonly HandEntry[],
    rules: [
      "A frame is a figure, a picture, a part, a corner or a side.",
      "Never a `line`, `span`, `angle` or chart. These have no grid.",
      "Never a `path` or `curve` laid `from` one thing `to` another. These have no grid either.",
      "Never lay a `path` `in` a map picture. You cannot see the drawing, so it lands somewhere else.",
      "Draw every mark on a figure in that figure's grid, corner or side. Ticks, square corners, arcs, chevrons, heights, tiles and slices are all marks.",
      "Never draw such a mark in a box of its own, or it will not line up.",
      "The film draws nothing you did not ask for.",
      "Set one angle apart from the others with two or three arcs. Draw them as paths in the corner's frame, starting with `M60 0 Q60 60 0 60`.",
      "Each next arc is 16 units further out: `M76 0 Q76 76 0 76`.",
      "Equal angles carry the same count of arcs. Different ones never do.",
      "Paired lines are drawn in the same direction. Pairs are two lines marked parallel, two marked equal, or two rays of one beam.",
      "Then the same chevron `M-16 -14 L0 0 L-16 14` at `<line>.s0@0.5` points the same way on both.",
      "A corner's letter is a `label` on the corner, with `\"emphasis\": \"quiet\"`.",
      "Light a side through its handle, such as `tri.s1`. Never through a shape laid over it.",
    ],
  },

  objects: {
    text: {
      family: "Writing",
      summary: "Words on screen.",
      use: [
        "Every word on screen is a `text`, a `label` or a `speak` line.",
        "Its `size` says how much it matters, not its `textRole`.",
        "Use it for a term with its short meaning: \"mobilise = call up the army\".",
        "Use it for one key relation in words: \"heat makes steam\". The things themselves show the change, not an arrow.",
        "Use it for a date tag in `badge`: \"date · place\".",
        "Never over a map or a photograph. A place's name is a `label` on its part.",
      ],
      fields: {
        text: { lines: ["The words.", "Too wide for the screen, it breaks at whole words.", "`\\n` starts a line."] },
        textRole: {
          values: {
            body: "Ordinary writing. Default.",
            bullet: "A line of a list.",
            caption: "Small writing for a name, a term or a date tag.",
          },
        },
        emphasis: {
          values: {
            attention: "On a plate that keeps it readable over pictures. Default.",
            quiet: "No plate. Blended onto what it sits on at lower contrast. For writing that only orients.",
          },
        },
        in: { type: "Ref", lines: ["Sets it at an exact point of a figure or a part. See Frames."] },
        at: {
          lines: [
            "The point in the `in` frame its centre sits on.",
            "Default the origin.",
            "In a side frame, a y other than 0 keeps the whole of the writing that far off the side.",
            "A positive y is outside.",
          ],
        },
      },
    },
    equation: {
      family: "Writing",
      summary: "Maths typeset from TeX. See Math writing.",
      use: [
        "Its terms are `Ref`s: `<id>.<term>`.",
        "Copy the term exactly as `value` writes it, as in `law.F` for `F = m a`.",
        "Spacing does not matter. The first place a term is written is the one meant.",
        "Any `attention` verb lights a term in place, on the word that names it.",
        "`cancel` strikes a term through on the word \"cancels\".",
        "Use it for an equation built in stages. Write one `equation` per stage, each `below` the one before.",
        "Show each stage with `rise` on its words.",
        "Beside a figure or pictures, `trace` the thing each term stands for as the term is said.",
        "Use it for something becoming something else. The equation builds term by term.",
        "Write the starting things first, then \"→\" and the result.",
      ],
      fields: {
        value: {
          lines: [
            "TeX: backslashed commands, `_` and `^`. Never spoken words.",
            "A unit or a name is upright, in `\\mathrm{}`, as in `5\\,\\mathrm{m}`.",
            "A variable is not upright.",
          ],
        },
        in: { type: "Ref", lines: ["Same as `text.in`."] },
        at: { lines: ["Same as `text.at`.", "A side's name just outside its middle is `\"in\": \"tri.s2@0.5\", \"at\": [0, 24]`."] },
      },
    },
    measure: {
      family: "Writing",
      summary: "One figure drawn large, counting up as it appears.",
      use: [
        "Use it for one amount. Several amounts are a `chart`.",
        "Use it with a `meter` for a level that grows or falls, or a share of a whole. Never a line drawn for it.",
        "Its `unit` and `label` say what it counts. Its `icon` shows it.",
        "Use it for a rate beside a thing that rises, such as \"5 mm a year\". The thing itself rises, with no arrow.",
        "Use it for a heavier burden.",
      ],
      fields: {
        value: { lines: ["The figure it ends on."] },
        countFrom: { lines: ["Where the count starts. Default 0."] },
        unit: { lines: ["Written after the figure: `km`, `%`."] },
        label: { lines: ["A small line under the figure."] },
        decimals: { lines: ["Decimal places."] },
        commas: { lines: ["Thousands separators. Default true."] },
        prefix: { lines: ["Written before the figure: `$`."] },
        scale: {
          lines: [
            "[low, high]: the range the figure lives in.",
            "With it, the meter shows how big the number is.",
            "Two measures on one scale compare by length.",
          ],
        },
        meter: {
          lines: [
            "Give `scale` with it, so its size means something.",
            "The whole track is a thick hollow outline, and the share up to the value is solid.",
            "A fall from 100% to 50% is `countFrom` 100, `value` 50, `scale` [0, 100]: it empties to half hollow, half full.",
          ],
          values: { bar: "A bar under the figure, filled to the value.", ring: "A ring round the figure, filled to the value." },
        },
        tone: {
          lines: ["Colours the figure and its meter by what the amount means.", "A rise is not always good: a price that rises is `bad`."],
          values: { good: "Green: good news.", bad: "Red: bad news." },
        },
        quiet: {
          lines: [
            "`true` draws the meter with no figure, for an amount the voice gives no number for.",
            "Needs a `scale`. Its `value` then only sets how full the meter is.",
          ],
        },
        icon: {
          type: "Ref",
          lines: [
            "A picture of this scene that says what the meter counts, such as a worker for jobs.",
            "It is set at the meter's left, as tall as the meter, wherever else it was placed.",
            "Declare it as its own small picture, and show it on the meter's beat.",
          ],
        },
      },
    },
    table: {
      family: "Writing",
      summary: "A grid of words.",
      use: ["Use it for three or more things across two or more attributes.", "In `main` or `footer`, never a half zone."],
      fields: {
        rows: { lines: ["Rows of cells. Keep every row the same length."] },
        header: { lines: ["`true`: the first row is the header."] },
      },
    },
    legend: {
      family: "Writing",
      summary: "The key to the film's categories, each name in exactly its colour.",
      use: ["Only in a scene whose step asks for the key.", "`\"tint\": \"faint\"` on it draws faint swatches to match faint washes."],
      fields: {
        categories: { lines: ["`\"film\"`: every category the film declares.", "Or a list of category ids."] },
      },
    },

    line: {
      family: "Lines and marks",
      summary: "A stroke joining two things. It re-aims every frame as either end moves.",
      use: [
        "At most two arrows on a screen, each only for something that travels or passes from one thing to another.",
        "A plain line with no `arrow` joins the members of a web. It is not an arrow.",
        "A tree or a list is a `diagram`, never lines drawn by hand.",
        "A cause, a demand or a name is never a line. The things themselves move or change: the cause acts, the effect grows, shrinks, fills or lights.",
        "A journey across a map is the traveller moving through its parts, with no line drawn.",
        "Use it for a force, drawn from what pushes to what is pushed.",
        "Label a force with its size, such as \"10 N\". Then the pushed thing moves the way it points.",
        "A force arrow points the way the push acts. Its head is at the thing, on the side the push comes from.",
        "Never draw a force from the thing out to a caption.",
        "Equal forces are drawn the same length.",
        "Both ends are things, never a zone.",
      ],
      fields: {
        from: { type: "Ref", lines: ["Where it starts.", "Any object, part, corner or side."] },
        to: { type: "Ref", lines: ["Where it ends."] },
        form: {
          values: {
            straight: "Straight. Default.",
            elbow: "One real corner.",
            curved: "Bows off the straight line by `bend`.",
            traced: "Hand-drawn, bowing by `bend`.",
          },
        },
        bend: {
          lines: [
            "How far a curved or traced line bows, as a share of its length.",
            "Default 0.18.",
            "Positive bows to the right of travel.",
          ],
        },
        arrow: {
          lines: ["A head on the line's true direction.", "Only when the line points from one thing to another."],
          values: { end: "A head at its end.", start: "A head at its start.", both: "A head at each end." },
        },
      },
    },
    span: {
      family: "Lines and marks",
      summary: "A measured distance: a line capped at each end. It means how far apart, not joined.",
      use: [
        "Use it for a real length, labelled with its value, such as `5\\,\\mathrm{cm}`.",
        "Use it for a picture that must be believed as a true size.",
        "Between the two corners that bound one side of a figure, it is a dimension line.",
        "That dimension line is set off the side, outside the figure, with an arrowhead at each end.",
        "Between anything else, it is the distance with a bar across each end.",
        "A side named only by its letter is a `label` on the side, never a span.",
      ],
      fields: {
        from: { type: "Ref", lines: ["One end.", "Any object, part, corner or side."] },
        to: { type: "Ref", lines: ["The other end."] },
      },
    },
    path: {
      family: "Lines and marks",
      summary: "A route, an arrow, a bracket, a boundary, a mark, or a piece of an exact figure. Drawn in SVG path syntax.",
      use: [
        "On its own, with no `from`, `to` or `in`, its grid is its own box.",
        "On its own, its shape is kept and fitted into the room its size gives. It is placed like any object.",
        "Between two things, with `from` and `to`, the point `0,0` lands on `from` and `1000,0` on `to`.",
        "Then y bows sideways in the same units, positive to the right of travel. ±250 is a quarter of the distance.",
        "`M0 0 C300 -250 700 -250 1000 0` arcs over.",
        "Between two things, it re-aims as either end moves.",
        "In a frame, with `in`, it sits exactly there. See Frames.",
        "Drawn on its own place, it is a figure. Its corners are `v0`, `v1`, … in the order its `d` passes them.",
        "Its sides are `s0`, `s1`, … Side i runs from `v<i>` to the next corner. A closed path's last side runs back to `v0`.",
        "A triangle `M200 100 L900 850 L100 850 Z` has `v0` at the top, `v1` bottom right and `v2` bottom left. `s1` is its base.",
        "Each corner and side is a `Ref` and sets a frame.",
        "As a route for `along`, the traveller walks exactly the curve drawn.",
        "It starts from the tail when the path has an `arrow`. Otherwise it starts from the end nearer it.",
        "A route of its own is read on the screen's grid, where 1000 units is the screen's width.",
        "A route anchored on a thing, or drawn `in` it, moves and turns with that thing.",
        "Never the drawing of a thing, such as a leaf, a heart or a country. Those are pictures.",
        "A thing with no picture is named in words.",
        "Only on a stage drawn in code is a thing drawn as a symbol, when the subject draws it as that symbol.",
        "Never a filled block, bar or wedge standing for an amount.",
        "Never a line standing for an amount, such as jobs falling or prices rising.",
        "An amount over time is a `chart` `line`. A level or a share of a whole is a `measure` with a `meter`.",
        "Beside pictures, a path on its own is one straight stroke, such as a force.",
        "There, any path that turns or curves is dropped. Only a stage set on by its corners, a route walked `along`, or a path anchored on a thing may turn.",
        "Never build axes, a grid of cells, a coastline or an outline by hand.",
        "A `chart`, `table` or picture does those instead.",
        "Use it for a force with nothing drawn pushing: `M0 500 L1000 500` with `\"arrow\": \"end\"`.",
        "Place that force `left-of` the thing, with its size in a caption above it. The motion's `with` carries it with the thing.",
        "Use it for a model of the problem on its own grid.",
        "A bar model, a number line and a shape cut into equal parts are such models.",
        "Draw the model's equal pieces `in` it, and fill the pieces taken with `accent`.",
        "Write the model's numbers `in` it, beside the tick they name.",
        "Use it for a stage that shares the screen with pictures. One path is its base, such as an axis, a floor or a ramp.",
        "The points that matter are the base's corners. Every other piece is drawn `in` it.",
        "Use it for a rearrangement. Each piece moves `to` the corner, side or part it lands on.",
        "Fill the pieces of a rearrangement alternately `accent` and `muted`, so each can be followed.",
      ],
      fields: {
        d: {
          lines: [
            "`M L H V C S Q T A Z`, starting with `M`.",
            "Upper case is absolute, lower case is relative.",
            "Whole numbers on a 1000-unit grid, y down.",
          ],
        },
        from: { type: "Ref", lines: ["With `to`, lays the path between two things."] },
        to: { type: "Ref", lines: ["With `from`, the far end."] },
        in: { type: "Ref", lines: ["The frame its `d` is written in.", "Without it, paths set in one zone share one grid."] },
        stroke: { lines: ["A theme role, never a colour code."], values: THEME_ROLES },
        fill: { same: "path.stroke", lines: ["Paints each closed piece, one that ends in `Z`."] },
        arrow: { same: "line.arrow", lines: ["On the true direction of its last open piece."] },
        appearance: { values: { solid: "A solid stroke. Default.", dashed: "A dashed stroke." } },
      },
    },
    angle: {
      family: "Lines and marks",
      summary: "The arc between two directions out of a corner. It opens and closes with the figure.",
      use: [
        "Use it for an angle that is not a right angle.",
        "A right angle is its square: a `path` in the corner's frame, `\"in\": \"tri.v1\"`, `M40 0 L40 40 L0 40`.",
        "Name it with a `label` on it. Its value is written inside, just past the arc.",
      ],
      fields: {
        at: { type: "Ref", lines: ["The corner: `tri.v0`."] },
        from: { type: "Ref", lines: ["A point along the first direction: `tri.v1`."] },
        to: { type: "Ref", lines: ["A point along the second direction: `tri.v2`."] },
      },
    },
    curve: {
      family: "Lines and marks",
      summary: "A curve drawn from a formula, for mathematics only. A wave, a spiral, a plotted path.",
      use: [
        "A designed route, bend or outline is a `path`.",
        "Anchored on a point with `anchor` placement, it is centred there.",
        "One unit is the resting distance of the thing that travels it. Keep coefficients near 1.",
        "A circle round a centre is `x` `cos(u)`, `y` `sin(u)` over `[0, 6.283]`. Never `220*sin(u)`.",
        "Its `y` points up, so `-cos(u)` hangs below.",
        "A picture follows it with `along`.",
        "Use it for an orbit. Place the traveller `relative` `right-of` the centre. That gap is the radius.",
        "Then anchor the curve on the centre, and send the traveller `along` it.",
        "Use it for a swing's arc: `x` `sin(u)`, `y` `-cos(u)`, `domain` `[-0.52, 0.52]`, dashed.",
        "Anchor a swing's arc on the pivot part. Its radius is the swinging end's own distance, so it passes through it.",
        "Never a `path` for an orbit or a swing. A path is sized as a picture, and the traveller rides over the centre.",
      ],
      fields: {
        x: { lines: ["An expression in `u`. See Math writing."] },
        y: { lines: ["An expression in `u`. Positive is up."] },
        domain: { lines: ["[from, to]: the range of `u`."] },
        appearance: { same: "path.appearance" },
        from: {
          type: "Ref",
          lines: ["With `to`, the formula is laid between two things.", "It is turned and stretched so it starts on `from` and ends on `to`."],
        },
        to: { type: "Ref", lines: ["The far end."] },
      },
    },
    shape: {
      family: "Lines and marks",
      summary: "A plain geometric shape, for geometry only.",
      use: ["Never a stand-in for a thing that has a picture.", "A thing with a real shape, a star or a heart among them, is a picture."],
      fields: {
        shape: {
          values: {
            circle: "A circle.",
            polygon: "A regular polygon with `sides` sides.",
          },
        },
        sides: { lines: ["For a `polygon`."] },
        appearance: {
          values: { solid: "Filled. Default.", outline: "Only its border." },
        },
      },
    },

    image: {
      family: "Pictures",
      summary: "A picture from the step's picture table, placed by its id.",
      use: [
        "It is one piece. It enters, leaves, moves and pulses whole.",
        "A picture is placed, never described.",
        "Write only `id`, `kind`, `role`, `placement`, `initial`, the table's `attach` and `size`, `rotate`, `category`, `tint`, and `picture` for a copy.",
        "Its drawing, shape, parts and facing are attached after you.",
        "Its parts are `<picture>.<part>`, exactly as the table lists them.",
        "A part takes `attention` with `trace`, `dim`, `encircle`, `brackets`, `underline` or `hold`.",
        "A part takes a `label`. It can be an end of a `line`, `span` or `path`.",
        "A part can be a frame with `in`, and the target of `relative` and `anchor` placement.",
        "A part can be named in `attach` and `size`.",
        "A part can be a motion's `to`, `toward`, `away`, `around`, `about` and `through`.",
        "A part takes `fill`, `tint` and `categories_of`.",
        "Only the whole picture takes `show`, `hide`, a motion, `emphasize` and `rotate`.",
        "A part is a place to point at, never a piece that moves.",
        "A part with no outline is only pointed at. It is never filled or washed.",
        "A part cannot be addressed in the beat that shows its picture. Show the picture in one beat, then point inside it in the next.",
        "Showing a picture shows all of it.",
        "To change what is seen inside a thing, `hide` one state's picture and `show` the next. Do both in the same place, on the same beat.",
        "It enters with `fade`, `rise` or `instant`. Never `draw` or `wipe`.",
        "It enters with `iris` when the scene opens on a closer view.",
      ],
      fields: {
        src: ATTACHED,
        alt: { never: "Never write this. Films leave it out." },
        aspect: ATTACHED,
        hotspots: ATTACHED,
        outlines: ATTACHED,
        silhouette: ATTACHED,
        facing: {
          attached: true,
          lines: ["Which way the drawn thing faces or travels.", "The table shows it.", "`opposite` and `away` fall back on it."],
        },
      },
      extra: {
        picture: {
          optional: true,
          type: "string",
          lines: [
            "Only for a second copy of a picture on screen at once, such as two daughter cells or two identical carts.",
            "Each copy has its own `id`, and its `picture` is the picture's id.",
            "A copy's parts are the picture's parts.",
            "`id` alone is the picture shown once.",
          ],
        },
      },
    },

    diagram: {
      family: "Figures",
      summary: "Boxes of words laid out as a structure, joined by lines the layout draws.",
      use: [
        "Use it for a structure: a hierarchy, a set of kinds, or a list of steps in order.",
        "Its boxes hold words only. A member that needs a picture is a picture, never a node.",
        "Pieces: each node is `<id>.<node>`, and each join is `<id>.<from>-<to>`.",
        "Show one node per beat, on the words that name it. Its join draws in just before it.",
        "Light a node with `trace` on it, one node among many with `dim`, and a group with `encircle`.",
        "Its joins are not arrows, and never count toward a screen's two.",
      ],
      fields: {
        layout: {
          values: {
            tree: "A hierarchy from one root down, each node joined to its parent by a plain line. A wide tree turns on its side.",
            sequence: "Numbered stages top to bottom, each joined to the next by a short line with a small head.",
          },
        },
        nodes: {
          lines: [
            "The boxes, in order.",
            "`id` names the node's piece. `label` is its name, in one to three words.",
            "`note` is one short line under the name, only where the name alone is not enough.",
            "`parent`: in a `tree`, the id of the node it hangs from. The root has none.",
          ],
        },
      },
    },
    working: {
      family: "Figures",
      summary: "A worked solution line by line, aligned on `=`. Each line dims when the next is written.",
      use: [
        "Use it for a worked calculation. One move per line, one line per beat.",
        "Show each line after the voice gives its reason.",
        "As a move is named, `underline` the term it acts on in the line before: `<id>.l<i>`.",
        "That underline comes before the new line appears.",
        "Lines an earlier scene wrote are shown in the first beat.",
        "Pieces: `l0`, `l1`, …, and `l<i>-cancel` for a line's struck terms.",
      ],
      fields: {
        lines: { lines: ["The lines."] },
        "lines.tex": { lines: ["TeX of the line."] },
        "lines.note": { lines: ["The operation, written in the margin: `−7 both sides`."] },
        "lines.cancel": { lines: ["Terms struck through, copied exactly from this line's `tex`.", "The strike lands on the word \"cancels\"."] },
      },
    },
    timeline: {
      family: "Figures",
      summary: "A time axis, earlier on the left, later on the right.",
      use: [
        "Only when the step asks for a timeline. Then it is the scene's subject: role `primary` in `main`.",
        "One that is not `primary` or `hero` becomes a running clock in the strip along the top.",
        "It spans only the dates it compares.",
        "Write each event's label as the voice says it.",
        "Each event is a `Ref`, `<id>.ev<i>`, by its place in `events`.",
      ],
      fields: {
        from: {
          lines: [
            "The earliest year.",
            "Years are signed. 431 BCE is `-431`, written \"431 BCE\" on the axis.",
            "A `from` later than `to` is read as years BCE, with a warning.",
          ],
        },
        to: { lines: ["The latest year."] },
        events: { lines: ["Points in time."] },
        "events.at": { lines: ["Its year."] },
        "events.label": { lines: ["What happened, as the voice says it."] },
        "events.side": { values: { above: "Above the axis. Default.", below: "Below the axis." } },
        "events.lane": { lines: ["Which of `lanes` it sits on, by index."] },
        eras: { lines: ["Spans of time."] },
        "eras.from": { lines: ["Its first year."] },
        "eras.to": { lines: ["Its last year."] },
        "eras.label": { lines: ["Its name."] },
        "eras.category": { lines: ["A film category. The era takes its colour."] },
        "eras.lane": { lines: ["Which of `lanes` it sits on, by index."] },
        playhead: { lines: ["A fixed mark at a year, or one that moves from `from` to `to` over its beat.", "It never runs backward."] },
        "playhead.from": { lines: ["The year it starts at."] },
        "playhead.to": { lines: ["The year it stops at."] },
        "playhead.pace": { same: "beat.pace" },
        lanes: { lines: ["Names of rows for things that overlap, written at their left."] },
        links: { lines: ["Cause arrows between two events.", "Rare. Only for a cause the step names between two dated events."] },
        "links.from": { lines: ["The causing event's index."] },
        "links.to": { lines: ["The caused event's index."] },
        "links.label": { lines: ["The verb, as the voice says it, such as \"provoked\"."] },
      },
    },

    "chart:bar|pie|donut": {
      family: "Charts",
      summary: "Amounts by category.",
      use: ["Marks: `bar<i>` for a bar, `slice<i>` for a pie or donut.", "Otherwise it is shown whole, with its axes."],
      fields: {
        chart: { values: { bar: "Vertical bars.", pie: "Slices of a whole.", donut: "A pie with a hole in it." } },
        data: { lines: ["One entry per bar or slice.", "Each has a name, its amount, and optionally a film category whose colour it takes."] },
        "data.label": { lines: ["Its name."] },
        "data.value": { lines: ["Its amount."] },
        "data.category": { lines: ["A film category. It takes that colour."] },
      },
    },
    "chart:line|area|scatter": {
      family: "Charts",
      summary: "Values along an x axis.",
      use: [
        "Use a `line` for an amount over time, such as jobs, prices or a share price rising or falling. Never a drawn `path`.",
        "It is drawn as a real graph: axes with their values, a heavy line, and its last point marked with its value.",
        "Give `yLabel` the amount and its unit, such as \"jobs (thousands)\", and `xLabel` the time, such as \"year\".",
        "Marks: `pt<i>` for a point and `series<i>` for one whole line.",
        "Pieces: `marker`, and `panel<i>` when four lines become small multiples.",
        "Otherwise it is shown whole, with its axes.",
        "A line that moves is another series.",
      ],
      fields: {
        chart: { values: { line: "A line through the points.", area: "The line, with the area under it filled.", scatter: "Points only." } },
        series: {
          lines: [
            "One line of `[x, y]` points, at least 2.",
            "Or up to four lines on one pair of axes, each in its own colour.",
            "Written as `[[1951, 361], [1971, 548]]`.",
          ],
        },
        names: { lines: ["Each line's name, written at its end."] },
        trend: { lines: ["For `scatter`: the best-fit line through the points."] },
        marker: {
          lines: [
            "A point riding the line between two x values over its beat. Never indexes.",
            "It keeps step with a motion in the same beat.",
            "It is the piece `marker`, shown on its own beat.",
            "Its value is a `label` on `<id>.marker`, in that beat or later.",
          ],
        },
        "marker.from": { lines: ["The x value it starts at."] },
        "marker.to": { lines: ["The x value it stops at."] },
      },
    },
    "chart:function": {
      family: "Charts",
      summary: "A plotted function of `x`.",
      use: ["Pieces: `tangent`, `marker`.", "Otherwise it is shown whole, with its axes."],
      fields: {
        function: { lines: ["An expression in `x`. See Math writing."] },
        tangent: {
          lines: [
            "A secant from `from` whose far point slides along the curve onto `at`.",
            "There it turns into the tangent.",
            "It is the piece `tangent`, on a slow beat.",
          ],
        },
        "tangent.at": { lines: ["The x where it becomes the tangent."] },
        "tangent.from": { lines: ["The x it starts from."] },
        marker: { flat: true, lines: ["Same as the `line` chart's `marker`."] },
      },
    },
    "chart:hbar": {
      family: "Charts",
      summary: "Amounts compared at a glance.",
      fields: {
        chart: { values: { hbar: "Sorted horizontal bars. The default for comparing amounts. Pieces `bar<i>`." } },
        data: { flat: true, lines: ["Same as the `bar` chart's `data`."] },
      },
    },
    "chart:units": {
      family: "Charts",
      summary: "An icon array: counts drawn as that many small icons.",
      use: ["Pieces: `group<i>`.", "No negative values."],
      fields: {
        data: { flat: true, lines: ["Same as the `bar` chart's `data`.", "Each `value` is a count."] },
        total: { lines: ["How many units the whole is drawn as.", "Use 10 or 100 for a chance.", "The rest stay empty."] },
        icon: { allValues: "Each draws a small icon of that name, such as `person` for people and `drop` for water." },
        per: { lines: ["What one unit stands for, written under it: \"1 icon = 1,000 people\"."] },
      },
    },
  } satisfies Record<string, EntryDoc>,

  chart: {
    summary: "Every chart below also takes these keys.",
    use: [
      "Use it for real data, and for the shares of a society or of sides.",
      "It is the step's drawing, in `main`. Never axes built from lines and shapes.",
      "Drawn in by default. Bars start at 0.",
      "Built piece by piece, it shows `<id>.source` with its first data.",
      "It shows `<id>.title` once its data is on screen.",
      "A series, bar or datum of one of the film's groups takes its `category`, so it keeps its colour.",
    ],
    fields: {
      xDomain: { lines: ["[low, high] across."] },
      yDomain: { lines: ["[low, high] up."] },
      axes: { lines: ["Draw the axes. Default true."] },
      xLabel: { lines: ["The across axis's name."] },
      yLabel: { lines: ["The up axis's name and unit, written over its top."] },
      title: { lines: ["Its takeaway, written over it.", "It is the piece `title`, shown after its data."] },
      source: { lines: ["Where the numbers come from, in a small line under it.", "It is the piece `source`."] },
    },
    marks: {
      signature: "<chart>.bar<i> | <chart>.slice<i> | <chart>.pt<i> | <chart>.series<i>",
      summary: "One mark of a chart.",
      use: [
        "`attention` on it glows that mark. The chart's other marks of its kind fade back.",
        "A mark is only pointed at, never shown on its own.",
        "`attention` also takes a chart's pieces: an hbar's `bar<i>`, a units chart's `group<i>`, and `panel<i>`.",
        "`in` never names a chart. A point on a chart is its `marker`.",
      ],
    } satisfies HandEntry,
  },

  actionsIntro: [
    "Every action is `{\"do\": …}`.",
    "`show`, `hide` and `tint` take `targets`, a list. Every other verb takes one `target`.",
    "What an action aims at is on screen by its beat, shown in that beat or before.",
    "Every beat carries at least one action.",
  ],

  actions: {
    show: {
      family: "Showing",
      summary: "Reveals whole objects, or pieces of figures and charts.",
      use: [
        "Never a picture's part.",
        "Build a drawing the film makes stroke by stroke as it is narrated, with `draw`.",
        "A figure, a force arrow and a route are drawings the film makes.",
        "Show one piece per beat. Never fade a drawing in finished.",
      ],
      fields: {
        targets: { type: "Ref[]", lines: ["Object ids, or pieces `<object>.<piece>`."] },
        entrance: {
          values: {
            instant: "Appears at once.",
            fade: "Fades in. Default for most things.",
            draw: "Drawn on stroke by stroke. For the film's own lines, paths, curves, spans and angles. Default for a line. Never a picture.",
            wipe: "Wiped in from one side. Never a picture.",
            iris: "Opens from its centre. For a picture when the scene opens on a closer view.",
            slam: "Lands with a punch. For a short, important word or number.",
            "word-by-word": "Writing, one word at a time.",
            typewriter: "Writing, letter by letter.",
            scramble: "Letters settle out of noise.",
            rise: "Revealed from its base upward. For something that rises or grows, such as a mountain pushed up, a plant, or water filling. It rises over its earlier state, hidden in the same beat. Also for a new power rising as the old one falls.",
          },
        },
      },
    },
    hide: {
      family: "Showing",
      summary: "Removes whole objects.",
      use: [
        "Only an object this scene declares, or a label, strike, tick or `speak` line given an `id` in an earlier beat.",
        "Use it for a traveller that arrived, a state your scene replaces, or a mark that is done.",
        "Hiding a thing also takes off its labels, strikes, ticks and spoken line.",
        "Writing set on, in or against a thing leaves on the beat that thing is hidden.",
      ],
      fields: {
        targets: { type: "Ref[]", lines: ["Object ids, or the `id` of a label, strike, tick or `speak` line."] },
        exit: {
          values: {
            instant: "Gone at once.",
            fade: "Fades out. Default.",
            erase: "Rubbed out along its strokes.",
            wipe: "Wiped out to one side.",
            iris: "Closes to its centre.",
            dissolve: "Breaks up as it fades.",
            slide: "Slides away.",
            shrink: "Shrinks away. For something falling from power. Show the new one with `rise` in its place, in the same beat.",
          },
        },
      },
    },
    aside: {
      family: "Showing",
      summary: "Steps a picture aside: it shrinks to companion size and greys back, so a new subject can take the centre.",
      use: [
        "It moves into the free band above or below what stays on screen.",
        "It happens in one beat, and it stays aside until it is hidden.",
        "Show the new subject in the same beat or the next one. It takes the old one's place.",
        "Its parts, labels and the writing beside it go with it.",
        "Use it when the old subject is still needed for context. Else `hide` it.",
        "Once per picture in a scene.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, chart or drawing. Never a part."] },
      },
    },
    label: {
      family: "Naming",
      summary: "A name on or beside its target that follows it as it moves.",
      use: [
        "It stays until its target is hidden or the scene ends.",
        "A `hide` naming its `id` takes it off sooner.",
        "Labelling its target again replaces it.",
        "Exactly the word the voice says, in the same form.",
        "Labels of one scene are laid out together, so no two print over each other.",
        "On a map whose places were not found, a `label` on the whole picture names where the voice is. It does not point inside it.",
      ],
      fields: {
        id: { lines: ["Names the label, so a `hide` can take it off while its target stays.", "Unique in the scene, and never an object's id."] },
        target: { type: "Ref", lines: ["Any object, part, piece, corner or side."] },
        text: { lines: ["The name."] },
        size: { same: "Every object.size", lines: ["How much the name matters. Default `name`."] },
        title: { lines: ["A heading over `text`."] },
        style: {
          lines: ["Only changes the plate."],
          values: {
            text: "No plate.",
            pill: "A rounded plate. Default.",
            rect: "A square plate.",
            tag: "A tag-shaped plate.",
            bubble: "A speech bubble.",
            badge: "A small badge.",
          },
        },
        emphasis: {
          values: {
            attention: "On a plate. The name the voice is teaching now. Default.",
            quiet: "No plate. Blended onto the picture at lower contrast, never drawing the eye. For a name that only orients, names on a map, or a corner's letter.",
          },
        },
        place: {
          lines: [
            "Left out, a part's name goes beside it on free space, so the part stays seen.",
            "With no free space, a part's name goes to the pointer column.",
            "Left out, a drawn shape's name goes inside it when it fits. Else beside it, else to the column.",
          ],
          values: {
            inside: "Written on the part. Only a large traced part with room. Never on a map.",
            beside: "Right next to it.",
            pointer: "In one tidy column beside the picture, with a line to the part. Over or under a picture as wide as the screen, in rows instead. Always on a map, and for many names on one picture.",
          },
        },
      },
    },
    speak: {
      family: "Naming",
      summary: "A character's own words, handwritten beside its head with a short tick to its mouth. No balloon.",
      use: [
        "For a picture that acts as a character: a person, an animal, or a country or group drawn as one. Also a thing, saying the effect it feels.",
        "Its own words, in the first person and present tense, such as \"You take the east\".",
        "Never a number or a date. Those are the narrator's: a `text` or a `label`.",
        "What the speaker has, lacks or feels is its own line, such as \"We have no food\". It says the moment from inside, never the narration word for word.",
        "Write the hook of the line, not all of it. The voice says the rest.",
        "Give it the beat whose `say` begins the line. It is written on clause by clause across that beat.",
        "It goes beside the speaker's head, on the side facing whoever else is on screen. With no room there, above the head. Never over a picture.",
        "Two speakers stand apart, side by side or one above the other, with room beside each head.",
        "A line leaves when its sentence ends. Set `hold` to true only when the next sentence is still about its speaker.",
        "A held line stays until the next `speak` in the scene wipes it, from either speaker.",
        "A `hide` naming its `id`, or hiding the speaker, takes it off sooner.",
        "One `speak` per beat. The answer takes the next beat.",
        "It wraps by itself, to at most three short rows.",
      ],
      fields: {
        id: { lines: ["Names the line, so a `hide` can take it off before anyone speaks again.", "Unique in the scene, and never an object's id."] },
        target: {
          type: "Ref",
          lines: ["The speaker: a picture, or the part of it that speaks.", "The tick points at the part named. Else at the picture's `mouth`, `face` or `head` part. Else at its top."],
        },
        text: { lines: ["The words, as written on screen.", "End each clause with a comma or a full stop. Each clause is written as the voice reaches it."] },
        stress: {
          lines: ["One word of `text`, or a few in a row, written in the film's highlight colour.", "The thing the argument is about, such as a place or a demand.", "Copied exactly from `text`. Left out, no word is coloured."],
        },
        hold: { lines: ["`true`: the line stays past its sentence, until the next `speak` or its speaker hides."] },
      },
    },
    attention: {
      family: "Attention",
      summary: "Draws the eye to one thing for the length of its beat.",
      use: [
        "Every mark lights what is actually drawn.",
        "A stroke lights along itself, and a figure's side along its stroke.",
        "A traced part lights along its outline, and an untraced part round its box.",
        "Writing and pictures light round their own drawn pixels.",
        "A thing with nothing drawn gets nothing.",
        "Never light a whole picture that is the scene's subject, such as a map or a photograph. Light one of its parts, or nothing.",
        "Use `trace` for the part the voice turns to. It glows along the part's edge.",
        "Use `trace` for a route the voice follows, along a line already drawn.",
        "Use `dim` to pick one part among many.",
        "Use `encircle` or `brackets` to mark a region.",
        "Use `underline` for a term the voice leans on.",
        "Use `hold` for a quantity kept the same while another changes.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A thing, a part, a piece, a corner or side, an equation's term, or a chart's mark."] },
        verb: {
          values: {
            dim: "It stays lit while everything else softens toward the page. Only the first target stays lit. The `with` targets glow.",
            trace: "Colour runs along a `line`, `curve` or `path` from start to end, with a glowing head. For a route or a process followed. Anything else glows along its own edge.",
            underline: "A stroke drawn under a word, a term or a label, on the spoken word.",
            hold: "Greys it and tags it with `text`, \"fixed\" by default. For a quantity held constant.",
            cancel: "An equation's term struck through, then faded, on the word \"cancels\". It stays struck while the equation is shown.",
            brackets: "Corner brackets round it.",
            encircle: "A ring round a point, such as a city on a map. Anything bigger glows round its own border.",
          },
        },
        with: {
          type: "Ref[]",
          lines: ["More targets lit by the same verb at the same moment.", "For the matching part in two views, or the lands of one side."],
        },
        from: { type: "Ref", lines: ["Not used by these verbs. `pointer` takes it."] },
        text: { lines: ["The tag `hold` writes.", "Other verbs ignore it."] },
      },
    },
    pointer: {
      family: "Attention",
      summary: "An arrow from one thing pointing at another, for its beat.",
      use: ["Rarely needed.", "A force is a `line` or a `path`. A flow or a link is the things themselves moving or changing, never an arrow."],
      fields: {
        target: { type: "Ref", lines: ["What it points at."] },
        from: { type: "Ref", lines: ["Where the arrow starts."] },
        text: { lines: ["Not drawn by a pointer."] },
      },
    },
    strike: {
      family: "Attention",
      summary: "Strikes the target out as wrong: a cross over it, in red.",
      use: [
        "Writing is struck through with one line.",
        "Anything else gets a cross drawn over it.",
        "Works on writing, objects, picture parts and maps.",
        "It stays until its target or the strike is hidden.",
        "Strike on the words that say it is wrong.",
      ],
      fields: {
        id: { lines: ["Names the strike, so a `hide` can take it off while its target stays.", "Unique in the scene, and never an object's id."] },
        target: { type: "Ref", lines: ["Any object, part, piece, or a map's place."] },
      },
    },
    tick: {
      family: "Attention",
      summary: "A check mark beside the target, for what is right.",
      use: [
        "It sits beside the target, on the side with room.",
        "It stays until its target or the tick is hidden.",
        "Tick on the words that say it is right.",
      ],
      fields: {
        id: { lines: ["Names the tick, so a `hide` can take it off while its target stays.", "Unique in the scene, and never an object's id."] },
        target: { type: "Ref", lines: ["Any object, part, piece, or a map's place."] },
      },
    },
    tint: {
      family: "Colour and level",
      summary: "Washes pictures, parts or figure pieces in a film category's colour from this beat.",
      use: [
        "Use it for a group the film colour-codes, on the beat whose words name it.",
        "Tint every part of that side the table lists, so the side reads whole.",
        "Put `\"tint\": \"faint\"` on the picture.",
        "`categories_of` is the same colouring from the scene's first frame.",
        "Use it for a member changing sides.",
      ],
      fields: {
        targets: { type: "Ref[]", lines: ["Pictures, parts with an outline, or figure pieces."] },
        category: {
          lines: ["A category id.", "The wash fades in, or changes from the colour they had.", "Left out, the wash comes off."],
        },
      },
    },
    fill: {
      family: "Colour and level",
      summary: "Tints inside a part's exact shape up to a level, and holds it there.",
      use: [
        "Use it for something that fills or empties inside a part.",
        "Blood in a chamber, fuel in a cylinder, air in a lung and water in a tank all fill this way.",
        "Fill it on the beat the narration says it.",
        "A part that fills starts empty. A later `fill` to `empty` drains it.",
        "Only a part with a traced outline.",
        "Which group a part belongs to is its category, never a fill.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A picture's part."] },
        to: {
          values: {
            empty: "Drained.",
            quarter: "A quarter full.",
            half: "Half full.",
            "three-quarters": "Three quarters full.",
            full: "Full.",
          },
        },
        direction: {
          values: { up: "Rises from the bottom. Default.", down: "Fills from the top down.", left: "Fills toward the left.", right: "Fills toward the right." },
        },
        color: { same: "path.stroke" },
      },
    },
    emphasize: {
      family: "Emphasis",
      summary: "Moves a whole thing briefly to stress it, then lets it settle.",
      fields: {
        target: { type: "Ref", lines: ["A whole object, never a part."] },
        emphasis: { values: { punch: "A quick swell and back.", shake: "A sideways shake.", pulse: "A soft throb.", wiggle: "A small rock." } },
        strength: { values: { subtle: "Slight.", normal: "Default.", strong: "Strong." } },
      },
    },
    move: {
      family: "Motion",
      summary: "Sends a whole thing one way.",
      use: [
        "Exactly one way to go: `to`, `toward`, `away`, `opposite` or `direction`.",
        "A stated direction is never changed.",
        "An end that would land on another picture, or on another traveller's end, slides along the line of travel.",
        "Every end stays in frame.",
        "An action and its reaction move in the same beat, the reaction `opposite` the action.",
        "A bigger push or a lighter thing gets a quicker `pace` and a longer `by`.",
        "Use it for a hand or tool acting on a part. Trace the part first, then move the hand `to` it.",
        "Move the hand `away` on the next beat.",
        "Add `\"trail\": \"ghosts\"` when the depth of the push matters.",
        "A repeated action is repeated beats at the rate's pace.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, `text` or `shape`."] },
        to: {
          type: "Ref",
          lines: [
            "Goes to a thing or part, landing against its drawn edge.",
            "With `\"land\": \"centre\"` it lands in its middle.",
            "On a region of a map, it stands on it.",
            "A zone name also works. It goes as far as that zone lies from the band it is in.",
            "Prefer a thing, or a move by meaning.",
          ],
        },
        toward: { type: "Ref", lines: ["Goes toward it."] },
        away: { type: "Ref", lines: ["Goes away from it, or out of its owner through it."] },
        opposite: {
          lines: [
            "The id of another thing moving in this beat.",
            "It goes the other way to that thing's journey.",
            "If that thing makes no journey, it goes against the way that thing faces.",
          ],
        },
        direction: {
          lines: ["Or degrees anticlockwise from right."],
          values: { up: "Up.", down: "Down.", left: "Left.", right: "Right." },
        },
        by: {
          lines: [
            "How far a `toward`, `away`, `opposite` or `direction` move goes.",
            "In view units, or `{\"times\": n, \"of\": REF, \"dimension\": …}`: that many times a thing's width or height.",
            "Left out, it goes its own length that way.",
            "With `opposite`, it goes as far as its partner.",
          ],
        },
        "by.times": { lines: ["How many times."] },
        "by.of": { type: "Ref", lines: ["The thing measured."] },
        "by.dimension": { same: "Every object.size.dimension" },
        land: { values: LAND },
        gait: { values: GAIT },
      },
    },
    fall: {
      family: "Motion",
      summary: "Drops a whole thing onto another under gravity.",
      use: [
        "Use it for something falling from power.",
        "The old picture falls while the new one is shown with `rise` in its place, in the same beat.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, `text` or `shape`."] },
        to: { type: "Ref", lines: ["What it lands on."] },
        land: { same: "move.land" },
        bounce: { values: { none: "No bounce. Default.", soft: "A soft bounce.", strong: "A strong bounce." } },
      },
    },
    orbit: {
      family: "Motion",
      summary: "Sends a whole thing round another.",
      use: [
        "Its radius is how far it rests from the centre.",
        "Place it `relative` `right-of` the centre first.",
        "A rider sitting on its centre spins instead.",
        "Or draw the orbit as a `curve` anchored on the centre, and send the thing `along` it.",
        "Never an orbit `path` of your own.",
        "It never ends. No other journey of the same thing can follow it in the scene.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, `text` or `shape`."] },
        around: { type: "Ref", lines: ["The centre, on screen by this beat.", "The orbit follows it if it moves."] },
        turns: { lines: ["How many times round, a number. Default 1."] },
        direction: { values: ROTATION },
        ratio: { lines: ["Height ÷ width.", "1 is a circle. Less is an ellipse seen edge-on."] },
      },
    },
    along: {
      family: "Motion",
      summary: "Sends a whole thing along a drawn route, or through named places.",
      use: [
        "Use it for a thing travelling inside a picture, such as a wire, the gut, a vessel or a river.",
        "Send it `through` the picture's parts in order, so it stays on the picture instead of cutting across.",
        "Use it for a group travelling through places on a map, `through` their parts. No route is drawn behind it.",
        "Use it for power, orders or goods passing between people or places.",
        "A small picture of the thing travels from giver to receiver, `through` them, with no arrow drawn.",
        "Use it for a circling motion along a drawn path, with `\"trail\": \"dots\"`.",
      ],
      fields: {
        target: {
          type: "Ref",
          lines: ["A whole picture, `text` or `shape`.", "A thing with no shape, such as heat or light energy, travels as a `text`."],
        },
        along: {
          type: "Ref",
          lines: ["A `line`, `span`, `curve` or `path` of this scene.", "It walks exactly the route drawn, from its tail toward its arrow."],
        },
        through: {
          type: "Ref[]",
          lines: [
            "Instead of a drawn route.",
            "A smooth route from where it rests, through each named thing in order.",
            "Each is an object or a part.",
          ],
        },
        gait: { same: "move.gait" },
        repeat: {
          values: {
            once: "Once. Default.",
            "there-and-back": "Out and back.",
            loop: "Round and round. It never ends, so no other journey of the same thing can follow it.",
          },
        },
        face: { values: { path: "Turns with the route, as a car follows a road." } },
      },
    },
    spin: {
      family: "Motion",
      summary: "Turns a whole thing about its own centre, or about a point.",
      use: [
        "A spin combines with any journey.",
        "The turn a spin leaves is where the next scene starts the thing.",
        "Use it for a swing about a fixed point. Spin it `about` the pivot part.",
        "Give a swing a `sweep` of 60 at most, half to each side, with `\"repeat\": \"there-and-back\"`.",
        "Give one swing per beat. Repeat the beat for more swings.",
        "A slower swing is a slower `pace`.",
        "A swing's arc is a `curve` anchored on the pivot.",
        "Use it for a twist, `about` the part it turns on.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, `text` or `shape`."] },
        direction: { same: "orbit.direction" },
        about: { type: "Ref", lines: ["The point it turns about, when not its own centre.", "A pendulum turns about its pivot part."] },
        sweep: { lines: ["Degrees to turn through, instead of going round and round."] },
        repeat: {
          values: {
            once: "Opens through the sweep once. Default.",
            "there-and-back": "Swings to either side of rest, one swing per beat.",
            loop: "Ratchets round and round.",
          },
        },
      },
    },
    morph: {
      family: "Motion",
      summary: "Changes the form of a thing drawn in code. It keeps the new form after the beat.",
      use: [
        "Use it for a geometric figure that changes form, with `\"ghost\": true`.",
        "A real thing that changes form is its next picture, never a morph.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A `path` or a `shape`."] },
        ghost: { lines: ["`true`: a faded copy of the old form stays through the beat."] },
        d: { lines: ["For a `path`: its new `d`, on the same grid as its own.", "The path is laid out with room for every shape it takes, so it never grows over a neighbour."] },
        shape: { lines: ["For a `shape`: its new shape."], values: { circle: "A circle.", polygon: "A polygon with `sides` sides." } },
        sides: { lines: ["For a `polygon`."] },
      },
    },
    wander: {
      family: "Motion",
      summary: "A random walk about where it rests, as molecules jostle.",
      use: [
        "Particles and molecules never travel in a beeline.",
        "One waiting, or one in a liquid or gas, wanders in place.",
        "Add `\"trail\": \"dots\"` when its zigzag is the point.",
        "When two meet by chance, one wanders `to` the other with `\"land\": \"centre\"`.",
      ],
      fields: {
        target: { type: "Ref", lines: ["A whole picture, `text` or `shape`."] },
        to: { type: "Ref", lines: ["A jostling approach that arrives there after a few near-misses."] },
        land: { same: "move.land" },
      },
    },
    camera: {
      family: "Camera",
      summary: "Moves the view onto a thing.",
      use: [
        "At most one push in a scene, then back to `overview`.",
        "Use it for going inside a part.",
        "A scene that leaves a level ends on `close`, on the part the next scene enters.",
        "The next scene opens on the closer picture with `\"entrance\": \"iris\"`.",
      ],
      fields: {
        target: { type: "Ref", lines: ["Any thing or part on screen."] },
        shot: {
          values: {
            overview: "The whole scene.",
            wide: "The thing with its context, about 1.2 times.",
            medium: "The thing, about 1.5 times. Default.",
            close: "A part, filling about half the screen.",
            detail: "One precise point, closer still.",
          },
        },
        movement: {
          values: { cut: "Jumps at once.", move: "Travels smoothly. Default.", push: "A push in.", arc: "Swings onto it along a gentle bow." },
        },
      },
    },
  } satisfies Record<string, EntryDoc>,

  motion: {
    summary: "Every motion below also takes these keys, where its signature lists them.",
    use: [
      "A motion moves a whole picture, a `text` or a `shape`. Never a part.",
      "A thing with a picture travels as its picture.",
      "What it goes to or by is on screen by its beat.",
      "That covers `to`, `toward`, `away`, `opposite`, `around`, `along` and every `through`.",
      "One journey per thing per beat.",
      "A later journey starts where the last one ended.",
      "Things that move at the same moment move in the same beat.",
      "After a motion, hold the frame and name the result before the next motion starts.",
    ],
    fields: {
      with: {
        type: "Ref[]",
        lines: [
          "Things that ride rigidly with it.",
          "A bob rides with its rod, and a cup with a hand.",
          "A force arrow rides with its caption.",
        ],
      },
      trail: {
        lines: ["For a journey whose route is the lesson.", "Ghosts are for pictures. Writing never leaves them, since a copy of it says its words again."],
        values: { dots: "A dotted route left behind.", ghosts: "Faded copies of a picture left along the way." },
      },
      dates: {
        lines: [
          "For a dated journey, such as a march or a migration.",
          "The dates are spaced evenly from its start to its arrival.",
          "Each date is written where the traveller was then.",
          "A faded copy is left at each date but the last.",
          "It implies `\"trail\": \"ghosts\"`, so writing never takes it.",
          "Only dates the step quotes.",
        ],
      },
    },
  },

  compositions: {
    intro: "A composition moves where the zones sit. It never limits what a scene may hold.",
    entries: {
      hero: "One subject in the middle. The usual choice.",
      equation: "A formula-led scene. The middle is raised, with `support` close under it.",
      "overview-detail": "A broad subject with its detail. The halves are set wide apart.",
      split: "Two balanced halves.",
      comparison: "Two things as equals. Two `primary` pictures, side by side or stacked, are drawn the same size.",
      process: "A sequence or a change. The halves are set furthest apart, and the middle is raised.",
      "equation-plot": "A plot with its equation. `main` moves left and `support` moves right.",
      data: "Charts and readouts, with `support` and `footer` low.",
      timeline: "A time axis as the subject. The middle is raised.",
      table: "A table as the subject.",
      "custom-relational": "Things set by how they relate to each other.",
    } as Readonly<Record<string, string>>,
  },

  math: {
    tex: [
      "An `equation`, a force's `label` and a `working` line are TeX.",
      "Letters are italic variables.",
      "`\\mathrm{…}`, `\\text{…}` and `\\operatorname{…}` are upright. Units and names go in them: `5\\,\\mathrm{m}`, `20\\,\\mathrm{N}`.",
      "`\\mathbf` is bold.",
      "Greek letters by name: `\\alpha`, `\\Delta`.",
      "`^` and `_` for superscripts and subscripts.",
      "Fractions and roots: `\\frac`, `\\sqrt`, `\\sqrt[3]{…}`.",
      "Over a letter: `\\vec`, `\\hat`, `\\bar`, `\\overline`, `\\dot`, `\\ddot`, `\\tilde`.",
      "`90^\\circ` for degrees.",
    ],
    expressions: [
      "A `curve`'s `x` and `y` use `u`.",
      "A `function` chart uses `x`.",
      "Operators: `+ - * / ^`. `2x` multiplies.",
      "`log` is base 10. `ln` is natural.",
      "An expression that does not parse draws nothing.",
    ],
  },
};

const OBJECT_FAMILIES: readonly Family[] = ["Writing", "Lines and marks", "Pictures", "Figures", "Charts"];
const ACTION_FAMILIES: readonly Family[] = ["Showing", "Naming", "Attention", "Colour and level", "Motion", "Emphasis", "Camera"];
const MOTION_SHARED = ["with", "trail", "dates"] as const;

/** Problems collected while rendering; the render throws them all at once. */
class Gaps {
  readonly found: string[] = [];
  add(problem: string) {
    this.found.push(problem);
  }
}

const quoted = (value: string) => `'${value}'`;
const plural = (count: number) => (count === 1 ? "item" : "items");

function alternatives(node: JsonNode): readonly JsonNode[] | undefined {
  return node.oneOf ?? node.anyOf;
}

function keysOf(node: JsonNode): string[] {
  const required = new Set(node.required ?? []);
  return Object.keys(node.properties ?? {}).map((key) => (required.has(key) ? key : `${key}?`));
}

function typeOf(node: JsonNode | undefined): string {
  if (!node) return "unknown";
  if (node.const !== undefined) return JSON.stringify(node.const);
  if (node.enum) return node.enum.map(quoted).join(" | ");
  const options = alternatives(node);
  if (options) return [...new Set(options.map(typeOf))].join(" | ");
  if (node.type === "array") {
    if (node.prefixItems) return `[${node.prefixItems.map(typeOf).join(", ")}]`;
    const inner = typeOf(node.items);
    return inner.includes(" | ") ? `(${inner})[]` : `${inner}[]`;
  }
  if (node.type === "object" && node.properties) return `{${keysOf(node).join(", ")}}`;
  return node.type ?? "unknown";
}

function numberLimit(node: JsonNode): string | undefined {
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum } = node;
  if (minimum !== undefined && maximum !== undefined) return `${minimum} to ${maximum}.`;
  if (exclusiveMinimum !== undefined && maximum !== undefined) return `More than ${exclusiveMinimum}, at most ${maximum}.`;
  if (exclusiveMinimum !== undefined && exclusiveMaximum !== undefined) return `More than ${exclusiveMinimum}, less than ${exclusiveMaximum}.`;
  if (exclusiveMinimum !== undefined) return `More than ${exclusiveMinimum}.`;
  if (minimum !== undefined) return `At least ${minimum}.`;
  if (maximum !== undefined) return `At most ${maximum}.`;
  return undefined;
}

function itemLimit(node: JsonNode): string | undefined {
  const { minItems, maxItems } = node;
  if (minItems !== undefined && maxItems !== undefined) return minItems === maxItems ? undefined : `${minItems} to ${maxItems} ${plural(maxItems)}.`;
  if (maxItems !== undefined) return `At most ${maxItems} ${plural(maxItems)}.`;
  if (minItems !== undefined && minItems > 1) return `At least ${minItems} items.`;
  return undefined;
}

/** The limits a field's schema sets, as plain bullets: they are read from the schema, so they cannot drift. */
function limitsOf(node: JsonNode): string[] {
  const options = alternatives(node);
  if (options) {
    return options.flatMap((option) => {
      if (option.type !== "number" && option.type !== "integer") return [];
      const limit = numberLimit(option);
      return limit ? [`As a number, ${limit[0].toLowerCase()}${limit.slice(1)}`] : [];
    });
  }
  if (node.type === "number" || node.type === "integer") return [numberLimit(node)].filter((one) => one !== undefined);
  if (node.type === "string") return node.maxLength !== undefined ? [`At most ${node.maxLength} characters.`] : [];
  if (node.type !== "array") return [];
  const limits = [itemLimit(node)];
  const longest = node.items?.maxLength ?? node.prefixItems?.find((item) => item.maxLength !== undefined)?.maxLength;
  if (longest !== undefined) limits.push(`Each at most ${longest} characters.`);
  return limits.filter((one) => one !== undefined);
}

/** Every enum value a field accepts at its own level: through `oneOf`, not into nested objects. */
function enumsOf(node: JsonNode): string[] {
  if (node.enum) return [...node.enum];
  return (alternatives(node) ?? []).flatMap((option) => option.enum ?? []);
}

/** The object nested under a field, through arrays and `oneOf`, whose keys get blocks of their own. */
function nestedObject(node: JsonNode): JsonNode | undefined {
  if (node.type === "object" && node.properties) return node;
  if (node.type === "array" && node.items) return nestedObject(node.items);
  for (const option of alternatives(node) ?? []) {
    const found = nestedObject(option);
    if (found) return found;
  }
  return undefined;
}

interface RenderContext {
  gaps: Gaps;
  /** Each rendered field's value meanings, by `<entry>.<field>`, so `same` can point at them. */
  meanings: Map<string, Set<string>>;
  /** `same` references, checked once every entry is rendered. */
  pending: Array<{ from: string; to: string; values: string[] }>;
}

function fieldBlock(
  context: RenderContext,
  entry: string,
  name: string,
  node: JsonNode,
  optional: boolean,
  docs: Readonly<Record<string, FieldDoc>>,
): string[] {
  const doc = docs[name];
  const where = `${entry}.${name}`;
  const values = enumsOf(node);
  const nested = name.includes(".");
  if (!doc && (!nested || values.length > 0)) {
    context.gaps.add(`${where} has no description`);
    return [];
  }

  const written = doc?.type && (values.length === 0 || doc.allValues) ? doc.type : typeOf(node);
  const lines = [`${name}${optional ? "?" : ""} ${written}`];
  if (doc?.attached) lines.push("- Attached by the film from the drawing. Never write this.");
  if (doc?.never) lines.push(`- ${doc.never}`);
  for (const line of doc?.lines ?? []) lines.push(`- ${line}`);
  if (doc?.attached || doc?.never) return [lines.join("\n")];

  for (const limit of limitsOf(node)) lines.push(`- ${limit}`);
  if (doc?.same) {
    lines.push(`- Same values as \`${doc.same.replace(/^Every object\./, "")}\`.`);
    context.pending.push({ from: where, to: doc.same, values });
  } else if (doc?.allValues) {
    if (values.length === 0) context.gaps.add(`${where} describes values it does not have`);
    lines.push(`- ${doc.allValues}`);
    context.meanings.set(where, new Set(values));
  } else if (values.length > 0 || doc?.values) {
    const meant = doc?.values ?? {};
    for (const value of values) {
      if (meant[value] === undefined) context.gaps.add(`${where} value "${value}" has no meaning`);
      else lines.push(`- \`"${value}"\` — ${meant[value]}`);
    }
    for (const value of Object.keys(meant)) if (!values.includes(value)) context.gaps.add(`${where} describes "${value}", which the contract does not offer`);
    context.meanings.set(where, new Set(values));
  }

  const blocks = [lines.join("\n")];
  const inner = doc?.flat || doc?.same ? undefined : nestedObject(node);
  if (!inner) return blocks;

  const required = new Set(inner.required ?? []);
  for (const [key, child] of Object.entries(inner.properties ?? {})) {
    blocks.push(...fieldBlock(context, entry, `${name}.${key}`, child, !required.has(key), docs));
  }
  return blocks;
}

function signatureKeys(variant: JsonNode, hidden: ReadonlySet<string>, extra: Readonly<Record<string, { optional: boolean }>> = {}): string {
  const properties = variant.properties ?? {};
  const required = variant.required ?? [];
  const constant = Object.keys(properties).filter((key) => properties[key].const !== undefined);
  const tokens = [
    ...(properties.id && !hidden.has("id") && required.includes("id") ? ["id"] : []),
    ...constant.map((key) => `${key}: ${JSON.stringify(properties[key].const)}`),
    ...required.filter((key) => key !== "id" && !constant.includes(key) && !hidden.has(key)).map((key) => (properties[key].enum && key === "chart" ? `chart: ${properties[key].enum!.map((one) => JSON.stringify(one)).join(" | ")}` : key)),
    ...Object.keys(properties).filter((key) => !required.includes(key) && !constant.includes(key) && !hidden.has(key)).map((key) => `${key}?`),
    ...Object.entries(extra).map(([key, field]) => `${key}${field.optional ? "?" : ""}`),
  ];
  return `{ ${tokens.join(", ")} }`;
}

function entryText(head: string, summary: string, use: readonly string[] = [], blocks: readonly string[] = []): string {
  const top = [head, summary].join("\n");
  const bullets = use.length > 0 ? [use.map((line) => `- ${line}`).join("\n")] : [];
  return [top, ...bullets, ...blocks].join("\n\n");
}

function variantEntry(
  context: RenderContext,
  key: string,
  name: string,
  variant: JsonNode,
  doc: EntryDoc,
  hiddenFromSignature: ReadonlySet<string>,
  describedElsewhere: ReadonlySet<string>,
): string {
  const properties = variant.properties ?? {};
  const required = new Set(variant.required ?? []);
  const fields = doc.fields ?? {};
  const own = Object.keys(properties).filter((field) => properties[field].const === undefined && !describedElsewhere.has(field));
  const ordered = [...own.filter((field) => required.has(field)), ...own.filter((field) => !required.has(field))];
  const blocks = ordered.flatMap((field) => fieldBlock(context, key, field, properties[field], !required.has(field), fields));
  for (const [field, extra] of Object.entries(doc.extra ?? {})) {
    blocks.push([`${field}${extra.optional ? "?" : ""} ${extra.type ?? "string"}`, ...(extra.lines ?? []).map((line) => `- ${line}`)].join("\n"));
  }
  for (const field of Object.keys(fields)) {
    const top = field.split(".")[0];
    if (!(top in properties) || describedElsewhere.has(top)) context.gaps.add(`${key}.${field} is described but the contract has no such key`);
  }
  return entryText(`${name} ${signatureKeys(variant, hiddenFromSignature, doc.extra)}`, doc.summary, doc.use, blocks);
}

function sharedEntry(context: RenderContext, key: string, head: string, node: JsonNode, keys: readonly string[], doc: { summary: string; use?: readonly string[]; fields: Readonly<Record<string, FieldDoc>> }): string {
  const properties = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const blocks = keys.flatMap((field) => fieldBlock(context, key, field, properties[field], !required.has(field), doc.fields));
  const signature = `{ ${keys.map((field) => (required.has(field) ? field : `${field}?`)).join(", ")} }`;
  return entryText(`${head} ${signature}`, doc.summary, doc.use, blocks);
}

function objectKey(variant: JsonNode): string {
  const kind = variant.properties?.kind?.const ?? "";
  if (kind !== "chart") return kind;
  const chart = variant.properties?.chart;
  return `chart:${chart?.const ?? (chart?.enum ?? []).join("|")}`;
}

function actionKey(variant: JsonNode): string {
  const properties = variant.properties ?? {};
  if (properties.do?.const === "motion") return properties.motion?.const ?? "motion";
  if (properties.do?.const === "attention" && properties.verb?.const) return properties.verb.const;
  return properties.do?.const ?? "";
}

function sharedKeys(variants: readonly JsonNode[]): string[] {
  const [first, ...rest] = variants;
  return Object.keys(first?.properties ?? {}).filter((key) => rest.every((variant) => key in (variant.properties ?? {})));
}

function section(title: string, parts: readonly string[]): string {
  return [`## ${title}`, ...parts].join("\n\n");
}

/**
 * Render the scene writer's capability catalog from the filtered contract.
 *
 * Throws when a kind, verb or composition the contract offers has no entry, an entry describes
 * something the contract no longer offers, a field is undescribed, or an enum value has no meaning.
 */
export function renderCatalog(contract: CatalogContract): string {
  const context: RenderContext = { gaps: new Gaps(), meanings: new Map(), pending: [] };
  const { gaps } = context;
  const schema = contract.schema;
  const sceneNode = schema.properties?.scenes?.items ?? {};
  const beatNode = sceneNode.properties?.beats?.items ?? {};
  const checkNode = sceneNode.properties?.check ?? {};
  const objectVariants = schema.$defs?.object?.oneOf ?? [];
  const actionVariants = beatNode.properties?.actions?.items?.oneOf ?? [];
  const catalog = FILM_CATALOG;

  const sceneEntry = (key: "scene" | "beat" | "check", node: JsonNode) => {
    const doc = catalog.scene[key];
    return variantEntry(context, key, key, node, doc, new Set(), new Set());
  };
  const sceneSection = section("Scene", [sceneEntry("scene", sceneNode), sceneEntry("beat", beatNode), sceneEntry("check", checkNode)]);

  const objectShared = sharedKeys(objectVariants).sort((a, b) => Number(b === "id") - Number(a === "id") || Number(b === "kind") - Number(a === "kind"));
  const objectBase = objectVariants[0] ?? {};
  const everyObject = sharedEntry(context, "Every object", "Every object", objectBase, objectShared, catalog.object);
  const placementVariants = objectBase.properties?.placement?.oneOf ?? [];
  const placementDocs = catalog.placement as Readonly<Record<string, EntryDoc>>;
  const placements = placementVariants.map((variant) => {
    const mode = variant.properties?.mode?.const ?? "";
    const doc = placementDocs[mode];
    if (!doc) {
      gaps.add(`placement mode "${mode}" has no entry`);
      return "";
    }
    return variantEntry(context, mode, mode, variant, doc, new Set(), new Set());
  });
  for (const mode of Object.keys(placementDocs)) {
    if (!placementVariants.some((variant) => variant.properties?.mode?.const === mode)) gaps.add(`placement entry "${mode}" has no mode in the contract`);
  }
  const frames = [
    catalog.frames.intro,
    ...catalog.frames.entries.map((entry) => entryText(entry.signature, entry.summary, entry.use)),
    catalog.frames.rules.map((rule) => `- ${rule}`).join("\n"),
  ];

  const objectDocs = catalog.objects as Readonly<Record<string, EntryDoc>>;
  const chartVariants = objectVariants.filter((variant) => variant.properties?.kind?.const === "chart");
  const chartShared = sharedKeys(chartVariants).filter((key) => !objectShared.includes(key) && key !== "kind" && key !== "chart");
  const objectHidden = new Set(objectShared.filter((key) => key !== "id"));
  const offeredObjects = new Map(objectVariants.map((variant) => [objectKey(variant), variant]));
  for (const kind of contract.objectKinds) {
    if (![...offeredObjects.keys()].some((key) => key === kind || key.startsWith(`${kind}:`))) gaps.add(`object kind "${kind}" has no variant`);
  }
  for (const key of offeredObjects.keys()) if (!objectDocs[key]) gaps.add(`object "${key}" has no catalog entry`);
  for (const key of Object.keys(objectDocs)) if (!offeredObjects.has(key)) gaps.add(`catalog entry "${key}" is for an object the contract withholds or no longer has`);

  const familyParts = (family: Family): string[] => {
    const entries = Object.entries(objectDocs).filter(([key, doc]) => doc.family === family && offeredObjects.has(key));
    const rendered = entries.map(([key, doc]) => {
      const variant = offeredObjects.get(key)!;
      const charted = key.startsWith("chart:");
      const hidden = charted ? new Set([...objectHidden, ...chartShared]) : objectHidden;
      const elsewhere = new Set([...objectShared, ...(charted ? chartShared : [])]);
      return variantEntry(context, key, charted ? "chart" : key, variant, doc, hidden, elsewhere);
    });
    if (family !== "Charts") return rendered;
    const everyChart = sharedEntry(context, "Every chart", "Every chart", chartVariants[0] ?? {}, chartShared, catalog.chart);
    return [everyChart, ...rendered, entryText(catalog.chart.marks.signature, catalog.chart.marks.summary, catalog.chart.marks.use)];
  };
  const objectsSection = section("Objects", [
    everyObject,
    ["### Placement", ...placements].join("\n\n"),
    ["### Frames", ...frames].join("\n\n"),
    ...OBJECT_FAMILIES.map((family) => [`### ${family}`, ...familyParts(family)].join("\n\n")),
  ]);

  const actionDocs = catalog.actions as Readonly<Record<string, EntryDoc>>;
  const offeredActions = new Map(actionVariants.map((variant) => [actionKey(variant), variant]));
  for (const verb of contract.actions) {
    if (![...offeredActions.values()].some((variant) => variant.properties?.do?.const === verb)) gaps.add(`action "${verb}" has no variant`);
  }
  for (const key of offeredActions.keys()) if (!actionDocs[key]) gaps.add(`action "${key}" has no catalog entry`);
  for (const key of Object.keys(actionDocs)) if (!offeredActions.has(key)) gaps.add(`catalog entry "${key}" is for an action the contract withholds or no longer has`);
  const motionVariants = actionVariants.filter((variant) => variant.properties?.do?.const === "motion");
  const motionShared = MOTION_SHARED.filter((key) => motionVariants.some((variant) => key in (variant.properties ?? {})));
  const motionCarrier: JsonNode = {
    properties: Object.fromEntries(motionShared.map((key) => [key, motionVariants.find((variant) => key in (variant.properties ?? {}))!.properties![key]])),
  };

  const actionParts = (family: Family): string[] => {
    const rendered = Object.entries(actionDocs)
      .filter(([key, doc]) => doc.family === family && offeredActions.has(key))
      .map(([key, doc]) => {
        const variant = offeredActions.get(key)!;
        const elsewhere = new Set(family === "Motion" ? motionShared : []);
        return variantEntry(context, key, key, variant, doc, new Set(), elsewhere);
      });
    if (family !== "Motion") return rendered;
    return [sharedEntry(context, "Every motion", "Every motion", motionCarrier, motionShared, catalog.motion), ...rendered];
  };
  const actionsSection = section("Actions", [
    catalog.actionsIntro.map((line) => `- ${line}`).join("\n"),
    ...ACTION_FAMILIES.map((family) => [`### ${family}`, ...actionParts(family)].join("\n\n")),
  ]);

  const compositionDocs = catalog.compositions.entries;
  for (const composition of contract.compositions) if (!compositionDocs[composition]) gaps.add(`composition "${composition}" has no entry`);
  for (const composition of Object.keys(compositionDocs)) if (!contract.compositions.includes(composition)) gaps.add(`composition entry "${composition}" is not in the contract`);
  const compositionsSection = section("Compositions", [
    catalog.compositions.intro,
    ...contract.compositions.filter((one) => compositionDocs[one]).map((one) => `${one}\n${compositionDocs[one]}`),
  ]);

  const commands = contract.mathTextCommands.map((command) => `\\${command}`).join(" ");
  const mathSection = section("Math writing", [
    [
      "### TeX",
      [...catalog.math.tex.map((line) => `- ${line}`), `- Commands it knows: \`${commands}\`.`, "- Any other command is refused, and so is an unbalanced `{`."].join("\n"),
    ].join("\n\n"),
    [
      "### Expressions",
      [
        ...catalog.math.expressions.map((line) => `- ${line}`),
        `- Constants: ${contract.expressionConstants.map((one) => `\`${one}\``).join(", ")}.`,
        `- Functions: ${contract.expressionFunctions.map((one) => `\`${one}\``).join(", ")}.`,
      ].join("\n"),
    ].join("\n\n"),
  ]);

  for (const reference of context.pending) {
    const target = context.meanings.get(reference.to);
    if (!target) gaps.add(`${reference.from} points at ${reference.to}, which has no value meanings`);
    else for (const value of reference.values) if (!target.has(value)) gaps.add(`${reference.from} value "${value}" is not described by ${reference.to}`);
  }
  if (gaps.found.length > 0) throw new Error(`the film catalog is out of step with the contract:\n- ${gaps.found.join("\n- ")}`);

  const head = ["# Scene catalog", catalog.intro, catalog.conventions.map((line) => `- ${line}`).join("\n")].join("\n\n");
  return `${[head, sceneSection, objectsSection, actionsSection, compositionsSection, mathSection].join("\n\n")}\n`;
}
