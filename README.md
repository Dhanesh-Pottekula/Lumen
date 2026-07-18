# Lumen Simple JSON Lessons

This project contains four deterministic, seekable educational films authored only with the
Simple JSON lesson grammar:

- Biology: The Neuron Fires
- Physics: Why the Moon Does Not Fall
- Calculus: The Area Under a Curve
- History: The Mongol Empire

Each lesson declares scenes, objects, placements, beats, and actions. The Simple JSON pipeline
validates that data, resolves semantic layout, compiles it to GCL primitives, and renders it on an
HTML canvas.

The authoring contract is documented in docs/SIMPLE-JSON-AUTHORING-GUIDE.md. The four lesson specs
live in src/lessons/simple-json.

## Develop

- Install dependencies: npm install
- Start Vite: npm run dev
- Type-check and build: npm run build
