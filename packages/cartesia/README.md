# @aira/lumen-cartesia

Optional Cartesia narration and scene-timing adapter for `@aira/lumen`.

```bash
npm install @aira/lumen @aira/lumen-cartesia
```

```ts
const audio = await synthesizeNarration(fullNarration(lesson), {
  apiKey: userSuppliedKey
});
```

The key is mandatory and caller-supplied. This package does not read `.env` or
contain an AiRA credential. Browser demos should ask the user for a key;
production applications should proxy synthesis through a backend.

See [Cartesia integration](../../docs/CARTESIA.md).
