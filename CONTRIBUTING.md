# Contributing

Thanks for improving Lumen.

1. Discuss major schema or public API changes in an issue first.
2. Install with `npm ci`.
3. Keep public-package changes separate from playground lesson changes.
4. Add only documented, generally useful capabilities to Simple JSON.
5. Run:

```bash
npm run typecheck
npm run build
npm run pack:audit
npm run security:audit
```

Pull requests should explain the visual or API behavior affected, include
before/after keyframes when rendering changes, and mention compatibility or
security implications. By contributing, you agree that your contribution is
licensed under Apache-2.0.
