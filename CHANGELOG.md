# Changelog

Changes are recorded here before publication. Released versions and downloads
are listed in [GitHub Releases](https://github.com/Synnotech-AG/Baikor_R/releases).

The 1.7.x entries below record historical release-time verification. Their GHCR
image/chart versions were retired on 2026-10-21; source tags, GitHub releases and
attached release assets remain available.

## Unreleased

- Apply the R_next branding with a shared brown-red, sage and white application
  theme, the original logo artwork and locally hosted Open Sans fonts.
- Refine table spacing, status badges and selection styling, and keep all columns
  accessible in narrow panels with horizontal scrolling.
- Use neutral table headers and secondary editor actions alongside the colored
  row selections.

## 0.2.0 — 2026-10-21

- Reset application, chart and addon release numbering to **0.2.0** for fresh
  installations, without changing application behavior from 1.7.9. Update local
  chart defaults and public installation examples to the new pairing.
- Retire GHCR image/chart versions 1.7.6 through 1.7.9 after 0.2.0 passed release
  and anonymous-download checks. Historical source tags, GitHub releases and
  their attached assets remain available; retired versions are not
  reused. Anonymous checks confirmed all eight old package versions are
  unavailable by both tag and digest, with only 0.2.0 remaining in each package.

The [0.2.0 release](https://github.com/Synnotech-AG/Baikor_R/releases/tag/0.2.0)
was published by [Release run 39593999803](https://github.com/Synnotech-AG/Baikor_R/actions/runs/39593999803)
from source `66af217bb6c6ea487b951deb4e67b557a18f3c72`, paired with
[addon 0.2.0](https://github.com/Synnotech-AG/Baikor_R.Addon/releases/tag/0.2.0).
Required CI checks and anonymous image/chart retrieval passed. The downloaded
chart passed metadata, checksum and lint checks; the isolated published-image
fixture passed 106 checks covering database setup, user roles and importer tokens.

## 1.7.9 — 2026-10-21

- Wait for PostgreSQL TCP readiness in the isolated platform tests, avoiding
  premature migration startup during database initialization.

Published by [Release run 39592124497](https://github.com/Synnotech-AG/Baikor_R/actions/runs/39592124497)
from source `de2cba059d5136ef907862284946b315c5aa4443`. This release rebuilt
the then-current main branch for fresh installations with addon **1.7.10**;
application and chart behavior were unchanged from 1.7.8. All required CI checks
and anonymous package downloads passed.

## 1.7.8 — 2026-10-21

- Remove the obsolete pre-baseline schema reset from initial database setup;
  preserve unrelated schema data and retain the existing EF migration chain.
- Verify initial schema creation and data preservation against real PostGIS in CI.
- Remove obsolete Node-RED upgrade guidance from the import documentation.

Published by [Release run 39587862516](https://github.com/Synnotech-AG/Baikor_R/actions/runs/39587862516)
from source `e3695b0ea8e20a69d637e27e039f67a88e278a4e`. The workflow passed its
anonymous image/chart download checks. Local anonymous retrieval and Core 1.6
runtime acceptance passed, including database permissions, authentication,
imports, Geoportal publication, repeated deployment, NetworkPolicy and cold
restart with retained session and attachment.

## 1.7.7 — 2026-10-20

- Add a dedicated `baikor_importer` authorization policy for geodata imports;
  importer tokens cannot read, edit, approve or delete construction sites.
- Document the geodata import endpoint with an OpenAPI contract and HTTP tests.
- Configure independent migration-job resource requests and limits.
- Offer an optional application NetworkPolicy with explicit ingress/egress rules.
- Extend CI with import authorization and rendered Helm security checks.
- Allow documented 25 MiB imports through ingress-nginx by setting a bounded
  26 MiB request allowance; test real HTTP file/request-size boundaries in CI.

The [GitHub release](https://github.com/Synnotech-AG/Baikor_R/releases/tag/1.7.7)
is complete. Anonymous Docker and Helm downloads were verified on 2026-10-20.
The recovered original workflow preserved source revision
`6afbbaed75f4c201c584d88eaee1e196b15a2720` and the existing package digests.

## GitHub migration — 2026-10-19

- Publish the source under EUPL-1.2 and replace application hosting/build links.
- Add a single-version GitHub release workflow for GHCR images, OCI charts,
  checksums and source-revision metadata.
- Run backend, frontend, Helm and isolated real Keycloak/PostGIS checks in CI.

This migration entry records the historical source migration. The `1.7.6`
packages were uploaded before the package visibility change and do not contain
the subsequent 1.7.7 review fixes.
