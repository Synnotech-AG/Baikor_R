# Changelog

Changes are recorded here before publication. Released versions and downloads
are listed in [GitHub Releases](https://github.com/Synnotech-AG/Baikor_R/releases).

## Unreleased — target 1.7.7

- Add a dedicated `baikor_importer` authorization policy for geodata imports;
  importer tokens cannot read, edit, approve or delete construction sites.
- Document the geodata import endpoint with an OpenAPI contract and HTTP tests.
- Configure independent migration-job resource requests and limits.
- Offer an optional application NetworkPolicy with explicit ingress/egress rules.
- Extend CI with import authorization and rendered Helm security checks.

## GitHub migration — 2026-10-19

- Publish the source under EUPL-1.2 and replace application hosting/build links.
- Add a single-version GitHub release workflow for GHCR images, OCI charts,
  checksums and source-revision metadata.
- Run backend, frontend, Helm and isolated real Keycloak/PostGIS checks in CI.

This migration entry is not a release announcement. The `1.7.6` packages were
uploaded privately; their public verification and GitHub release remain pending.
