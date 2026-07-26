# Security policy

## Supported versions

Security fixes are provided for the latest stable minor release. During beta,
only the latest published beta is supported.

## Reporting a vulnerability

Please use GitHub private vulnerability reporting for this repository. Do not
open a public issue with exploit details, credentials, private lesson content,
or user data. Include the affected package/version, reproduction, impact, and
any suggested mitigation.

## Credential policy

The repository and npm packages contain no Cartesia, OpenAI, Anthropic, or
other provider key. `@aira/lumen-cartesia` requires a caller-supplied key.
Browser keys are visible to browser users and should not be permanent service
credentials. Use a backend proxy in production.

## Untrusted lesson input

Pass unknown lesson JSON through `compileLessonSpec` or `renderLessonSpec`.
Simple JSON rejects unknown fields and restricts SVG, math expressions, and
references. Do not expose lower-level renderer/GCL inputs directly to
untrusted authors without applying equivalent URL and drawing restrictions.

Lumen is a renderer, not a content-fact checker. Applications remain
responsible for factual review, accessible alternatives, privacy, and
authorization to render supplied content.
