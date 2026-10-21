# Changelog

Changes are recorded here before publication. Released versions and downloads
are listed in [GitHub Releases](https://github.com/Synnotech-AG/Baikor_R/releases).

## Unreleased

- Remove the obsolete pre-baseline schema reset from initial database setup;
  preserve unrelated schema data and retain the existing EF migration chain.
- Verify initial schema creation and data preservation against real PostGIS in CI.
- Remove obsolete Node-RED upgrade guidance from the import documentation.

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
