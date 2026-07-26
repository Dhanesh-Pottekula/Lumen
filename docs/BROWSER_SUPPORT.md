# Browser support

Lumen targets current evergreen desktop and mobile browsers.

| Capability | Requirement |
|---|---|
| Core rendering | Canvas 2D, `Path2D`, `ResizeObserver`, ES2022 |
| React player | React 18 or newer |
| Cartesia adapter | WebSocket, Blob URL, IndexedDB |
| MP4 export | WebCodecs; current Chromium recommended |

Safari and Firefox can render lessons and use the React player. MP4 export
depends on their WebCodecs and codec implementation and should be feature
detected. Provide a server-side export fallback when export is a product
requirement.

Automated support policy for `0.1`: latest two stable releases of Chrome,
Edge, Firefox, and Safari. This is a target policy until the cross-browser CI
matrix is established during beta.
