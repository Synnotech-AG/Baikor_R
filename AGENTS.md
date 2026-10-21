# Baikor_R development rules

## Architecture

- React/TypeScript/OpenLayers frontend, ASP.NET Core backend, PostgreSQL/PostGIS and Keycloak. This repository owns application, image and Helm chart (`deploy/helm/baikor-r`); CIVITAS provisioning belongs to the [addon repository](https://github.com/Synnotech-AG/Baikor_R.Addon).
- Keep `BaikorR.Host` thin. Business rules belong in `BaikorR.Core/Features/<Feature>/<UseCase>`; follow existing controllers, validators, FluentResults error keys and HTTP problem responses.
- Use persistence sessions (`IConstructionSitesSession` for construction sites), keeping EF Core in adapters and entities free of business logic. Reuse frontend `src/shared` utilities and localized messages.
- Store geometries in PostGIS with EPSG:25832. GeoServer reads public SQL views directly from the application database.

## Feature development

1. Understand the existing flow before editing. Define acceptance criteria, permissions and public/private data boundaries. Prefer existing patterns and dependencies; avoid unrelated refactoring.
2. Complete affected API, UI, persistence and deployment changes together. Add EF migrations for schema/view changes; preserve data and never rewrite released migrations.
3. Cover changed behavior with regression tests, including denied access and failure cases, and run them in CI. Keep [OpenAPI](docs/openapi/README.md), validation errors and upload limits consistent across application and ingress.
4. Update affected operator documentation and `CHANGELOG.md`. Use the CI-gated [release workflow](docs/RELEASING.md), immutable versions and compatible app/chart/addon pins. Preserve EUPL-1.2 and public source/package distribution.

## Permissions and data

- Enforce permissions server-side on protected endpoints; keep anonymous access explicit. Use explicit Keycloak scopes (`fullScopeAllowed: false`); machine clients receive only their required permissions. `baikor_importer` is import-only, with no general read/edit/approve/delete access. Preserve cookie CSRF protection and test actual tokens.
- Separate database provisioning, migration, runtime and publication privileges. Bootstrap may create the database and activate server-provided PostGIS; subsequent deployments must work through the owner login without server-wide privileges. Keep credential namespaces configurable and document provisioning rights and the owner-login transition.
- Extend public views deliberately: only sanitized data from eligible Approved/Active records may be exposed. Keep contacts, attachments and base tables private by default. Publication is opt-in and requires recorded business approval and a privacy review of public free text.
- Keep credentials in deployment secrets. Never commit tokens, private keys, private inventories or sensitive logs; write customer-independent documentation for platform operators.

## Deployment and operation

- New containers/jobs must fit restricted Pod Security Admission: non-root, no privilege escalation, dropped capabilities, RuntimeDefault seccomp and read-only root filesystems. Set explicit security contexts and resource requests/limits. The addon creates namespaces through Core's `tasks/templates/k8s-namespace.yml`; see [Helm security](docs/HELM_SECURITY.md).
- Preserve Core 1.6 compatibility with `enable_gateway: false`. Map environments to Development/Staging/Production, defaulting unknown values to Production. Keep authentication and TLS verification enabled.
- Make provisioning repeatable: reconcile addon-managed resources, including existing GeoServer layers, while preserving operator-owned configuration. Upgrades/restarts must retain data, credentials, authentication keys and intended user access without manual repair.
- Keep NetworkPolicy optional and verify allowed/denied traffic. Migration hooks run before ordinary Helm resources and outside the application policy; any separate policy must already permit their dependencies.

## Verification

Use checks relevant to the change; prerequisites and exact CI invocations live in `.github/workflows/ci.yml`.

| Change | Checks |
| --- | --- |
| Backend | `dotnet test BaikorR.sln --configuration Release` |
| Frontend | In `src/baikor-r-web`: `pnpm install --frozen-lockfile`, `pnpm run lint`, `pnpm run build` |
| Helm | `helm lint deploy/helm/baikor-r`; `python -m unittest discover -s tests/helm -v` |
| Release/OpenAPI | `node --test tests/release/*.test.mjs`; OpenAPI lint from CI |
| Auth/import integration | `python tests/platform/run_ci.py` ([isolated Docker fixture](tests/platform/README.md)) |

- Verify affected behavior in practice: permissions, Geoportal visibility/exclusion, repeat deployment and restart persistence. Rendered YAML alone does not prove runtime security or network enforcement.
- Prefer isolated fixtures; preserve existing data and clean only test-owned resources. Release acceptance includes anonymous package retrieval and tests with published artifacts; restore the agreed local profile afterwards.
- Report executed checks, failures and untested boundaries. Claim fixes only with evidence; technical tests cannot provide business/privacy approval.

## GitNexus

- Before edits: `node .gitnexus/run.cjs impact "<target>" --direction upstream --repo .` (or MCP). Report callers/processes/risk; warn on HIGH/CRITICAL. UNKNOWN, missing targets or stale coverage require source/reference checks; zero callers are not proof of safety.
- Use `query` for unfamiliar flows, `context` for symbols, graph-aware `rename` instead of text replacement, and `explain` for security analysis (requires PDG).
- Refresh stale indices with `node .gitnexus/run.cjs analyze --index-only`; report unavailable coverage.
- Before commits: `node .gitnexus/run.cjs detect-changes --scope all --repo .`. Rerun partial/truncated results; never call them clean. For branch review use `--scope compare --base-ref main`.
