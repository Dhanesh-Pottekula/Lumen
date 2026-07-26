# Public API stability

The beta public entry points are:

- `@aira/lumen`
- `@aira/lumen-react`
- `@aira/lumen-react/style.css`
- `@aira/lumen-cartesia`
- `@aira/lumen-mp4`

Imports from package internals, `dist/*`, the private playground, or source
paths are unsupported.

`scripts/check-public-api.mjs` snapshots every runtime export. CI fails when an
export is added, removed, or renamed without intentionally updating the
snapshot. Type-only exports are reviewed through generated declarations and
the API reference.

During beta, public API changes require:

1. a documented reason and compatibility analysis;
2. updated types, API reference, examples, and snapshot;
3. a changelog entry;
4. clean-install and package-content tests.

The version 1 Simple JSON schema remains explicit. Additive schema capabilities
are minor changes; removals or semantic changes require a major version after
`1.0`.
