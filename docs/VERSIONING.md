# Versioning

Lumen uses semantic versioning across its four public packages.

- Patch: compatible fixes and diagnostic improvements.
- Minor: additive Simple JSON capabilities and public APIs.
- Major: incompatible schema, rendering, or public API changes.

During `0.x`, changes can still move, but release notes must call out every
schema or rendered-output change. All companion packages are versioned together
for the initial releases.

The intended sequence is `0.1.0-beta.1`, clean-project installation tests,
beta feedback, then `0.1.0`. Nothing in this repository is published merely by
building it; release requires the dedicated workflow and npm authorization.
