# Release readiness review

## Complete locally

- Workspace split into core, React, Cartesia, MP4, and private playground.
- Core has no React, LLM, Cartesia, MP4, application, or example dependency.
- Cartesia key is caller-supplied; playground supports silent preview.
- Main README and focused API/security/authoring/browser/release docs exist.
- Codex and Claude repository instructions and copyable prompts exist.
- Apache-2.0 license, contribution policy, security policy, and notices exist.
- Type checking and production builds pass.
- Runtime API snapshot passes.
- npm tarball allowlist passes for all four packages.
- Clean local tarballs install in vanilla and React projects.
- New Water Cycle lesson compiles with zero errors and zero warnings and has
  been reviewed in the browser at representative frames.
- Clean smoke projects report zero production vulnerabilities.

## Required before npm publication

- Confirm the maintainer owns or can publish to the npm `@aira` scope. The
  `@aira/lumen` name currently returns npm `E404`, which means it is not public
  or the current account cannot see it; it does not prove scope permission.
- Configure npm trusted publishing for this GitHub repository and protect the
  `npm` release environment.
- Run the GitHub secret scan and browser matrix on the exact release commit.
- Decide whether to ship the beta MP4 adapter with deprecated `mp4-muxer` or
  migrate it to Mediabunny in a separately reviewed behavior change.
- Add deterministic renderer regression fixtures before stable `0.1.0`.
- Test real Cartesia synthesis with a maintainer-owned test key outside CI and
  confirm cache clearing and error states.
- Test MP4 output and A/V sync in supported Chromium versions.
- Confirm copyright owner/contact and GitHub private vulnerability reporting.
- Publish beta, repeat clean installs from npm (not local tarballs), collect
  feedback, then publish stable.

No package has been published, and no Git commit or push is part of this local
preparation.
