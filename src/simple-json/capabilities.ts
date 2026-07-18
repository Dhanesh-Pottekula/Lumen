import { MATH_TEXT_COMMANDS } from "../render/mathtext";
import { LESSON_SPEC_SCHEMA, SIMPLE_JSON_MAP_ICONS } from "./schema";
import {
  SIMPLE_JSON_SVG_ATTRIBUTES,
  SIMPLE_JSON_SVG_MAX_ELEMENTS,
  SIMPLE_JSON_SVG_MAX_MARKUP_LENGTH,
  SIMPLE_JSON_SVG_TAGS,
} from "./svg";
import { availableVisualAssets, visualAssetAnchors } from "./visual-catalog";

type JsonSchemaNode = {
  enum?: readonly string[];
  const?: string;
  properties?: Record<string, JsonSchemaNode>;
  oneOf?: readonly JsonSchemaNode[];
  items?: JsonSchemaNode;
  $defs?: Record<string, JsonSchemaNode>;
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The machine-readable source of truth supplied to lesson-generating LLMs.
 * Values are derived from the executable schema and registries so prompts do
 * not drift from the compiler as capabilities evolve.
 */
export function getSimpleJsonCapabilities() {
  const schema = LESSON_SPEC_SCHEMA as unknown as JsonSchemaNode;
  const properties = schema.properties ?? {};
  const scene = properties.scenes?.items;
  const objectVariants = schema.$defs?.object?.oneOf ?? [];
  const actionVariants = scene?.properties?.beats?.items?.properties?.actions?.items?.oneOf ?? [];
  const assets = availableVisualAssets().map((asset) => ({ asset, anchors: visualAssetAnchors(asset) ?? [] }));

  return {
    version: "1" as const,
    themes: [...(properties.theme?.enum ?? [])],
    compositions: [...(scene?.properties?.composition?.enum ?? [])],
    objectKinds: [...new Set(objectVariants.flatMap((variant) => variant.properties?.kind?.const ?? []))],
    actions: [...new Set(actionVariants.flatMap((variant) => variant.properties?.do?.const ?? []))],
    visualAssets: assets,
    mapIcons: [...SIMPLE_JSON_MAP_ICONS],
    svg: {
      tags: [...SIMPLE_JSON_SVG_TAGS],
      attributes: [...SIMPLE_JSON_SVG_ATTRIBUTES],
      maxCharacters: SIMPLE_JSON_SVG_MAX_MARKUP_LENGTH,
      maxElements: SIMPLE_JSON_SVG_MAX_ELEMENTS,
      publicParts: "root-level <g id=\"...\"> elements",
    },
    mathTextCommands: [...MATH_TEXT_COMMANDS],
    schema: clone(LESSON_SPEC_SCHEMA),
  };
}

export type SimpleJsonCapabilities = ReturnType<typeof getSimpleJsonCapabilities>;
