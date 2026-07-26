# Releasing

## Beta

1. Finish and preserve local changes; do not combine unrelated behavior work.
2. Confirm package name availability and npm scope access.
3. Update all four versions together and move the changelog entry to a date.
4. Run `npm ci`, type checking, build, package-content audit, dependency audit,
   and secret scan.
   Run `npm run smoke:install` to install the locally packed artifacts into
   clean vanilla and React projects before contacting npm.
5. Inspect each tarball manually.
6. Merge to `main`.
7. Run the protected **Release packages** workflow with tag `beta`.
8. Install the published packages into clean vanilla and React projects.
9. Test validation failures, playback, runtime Cartesia key handling, and MP4
   feature detection.

## Stable

After beta feedback, make only reviewed fixes, repeat every audit and clean
installation test, update versions to `0.1.0`, and run the release workflow
with tag `latest`.

The release workflow intentionally requires manual dispatch from `main` and an
`npm` GitHub environment. Configure npm trusted publishing for the repository;
do not add a long-lived npm token to source. Protect the environment with
required reviewers before stable publication.
