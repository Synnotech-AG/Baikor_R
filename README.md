# Baikor_R

Baikor_R is a CIVITAS/CORE add-on for creating, managing, approving, and publishing construction-site (Baustelle) information with geospatial geometries.

The application uses React, OpenLayers, ASP.NET Core, PostgreSQL/PostGIS and Keycloak, with optional publication through CIVITAS/CORE's GeoServer and Masterportal.

The application source is maintained at [Synnotech-AG/Baikor_R](https://github.com/Synnotech-AG/Baikor_R).

The canonical architecture and implementation plan is maintained in [docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

Deployment automation is maintained in the separate `baikor_r_addon` repository. It deploys the application into CIVITAS/CORE; it is not the application source itself.

## License

Baikor_R is licensed under the European Union Public Licence, version 1.2
(SPDX identifier: `EUPL-1.2`). See [LICENSE](LICENSE) for the full license text.
Third-party dependencies retain their respective licenses.

## Current implementation

The application includes:

- A thin ASP.NET Core host with liveness, readiness, and version endpoints plus a separate Core project for application and persistence code.
- One-endpoint ASP.NET Core controllers organized by URL segments and use case below `Controllers/Auth` and `Controllers/Api`.
- Use-case-oriented application services under `Features/ConstructionSites/<UseCase>`; all business rules live in these services.
- Use-case-owned FluentResults factories with stable error keys and short explanations, exposed through a shared RFC 7807-style HTTP problem contract and translated by the frontend.
- Persistence-only POCO entities under `Persistence/Entities`.
- FluentValidation request validators nested in their request contracts, response factory methods, and one top-level backend type per source file.
- Application-wide validation and EPSG:25832 polygon utilities under `Shared`, separate from construction-site business rules.
- Structured JSON logging and condensed HTTP request logging through Serilog.
- OpenTelemetry runtime and ASP.NET Core metrics on the internal metrics port, with an optional Prometheus `ServiceMonitor` for the CIVITAS monitoring stack.
- An `IConstructionSitesSession` persistence boundary below `Persistence/Sessions`; only `ConstructionSiteDbSession` depends on EF Core, while use-case services remain database-technology agnostic and unit-testable.
- A React/OpenLayers editor centered on Regensburg in EPSG:25832.
- Reusable frontend date-picker, formatting, and HTTP utilities under `src/shared` rather than inside the main application component.
- Individually selectable polygon-area drawing, modification, deletion, focus, and area measurement.
- Persisted area names (`Area 1`, `Area 2`, ...) with natural frontend ordering.
- Editable contact cards, communication entries, diversion information, and downloadable attachments.
- Separate 1:n tables for contacts, communication entries, and attachment BLOBs; attachment metadata is listed without loading file content.
- Normalized PostGIS persistence using `baikor.construction_sites` and the 1:n child table `baikor.construction_site_areas` with `geometry(Polygon,25832)`.
- CIVITAS Keycloak login through an ASP.NET Core OIDC/cookie session, CSRF protection, and viewer/editor/approver/admin policies.
- Unrestricted status editing plus a dedicated status-change use case.
- Read-only display of persisted Baustellen in the protected OpenLayers map.
- A sanitized `baikor.public_construction_site_areas` view that publishes one feature per area for Approved/Active records.
- Optional GeoServer datastore/feature-type and Masterportal WMS-layer provisioning, explicitly enabled by the operator.
- TLS ingress and persistent authentication keys without modifying the shared
  CIVITAS service-portal registration.
- An EF Core migration command and Helm migration job.
- A multi-stage production container that serves the React build from ASP.NET Core.
- A baseline Helm chart for Kubernetes and CIVITAS integration.
- ASP.NET integration tests and frontend lint/build checks.

The deployable vertical slice is implemented and running in the local CIVITAS cluster. Import metadata and bulk operations are available; audit history and further domain-specific Ort/Umfang details remain future work.

## Local development

Start the API:

```powershell
docker compose up --detach postgis
dotnet tool restore
dotnet tool run dotnet-ef database update `
  --project src/BaikorR.Core `
  --startup-project src/BaikorR.Host
dotnet run --project src/BaikorR.Host
```

In a second terminal, start the React development server:

```powershell
Set-Location src/baikor-r-web
corepack enable
pnpm install
pnpm run dev
```

The frontend is then available at `http://localhost:5173` and proxies `/api` and `/health` to `http://localhost:5080`.

Run all baseline checks:

```powershell
dotnet test BaikorR.sln
Set-Location src/baikor-r-web
pnpm run lint
pnpm run build
```

Run the same disposable Keycloak/PostGIS fixture as CI (requires Docker Compose
and OpenSSL):

```powershell
python tests/platform/run_ci.py
```

See [platform test instructions](tests/platform/README.md) for isolated runs and
explicit configuration against an existing Core installation.

With the local CIVITAS Core platform running, test real Keycloak accounts:

```powershell
python tests/platform/test_keycloak_accounts.py
```

This test uses the `k3d-civitas-local` context and the local platform CA. It
creates temporary accounts for each Baikor role plus an account without a role,
tests real OIDC sessions, shared records, attachments, permissions, concurrent
edits, CSRF protection, logout and account switching, and removes its test data
and accounts afterwards. A Baikor role grants access to the shared workspace;
it does not create a separate set of records for each account.

Build the production container and validate the chart:

```powershell
docker build -t baikor-r:dev .
helm lint deploy/helm/baikor-r
```

## GitHub Actions and releases

The [CI workflow](.github/workflows/ci.yml) runs backend tests, frontend
lint/build, Helm validation, release guard tests and a real Keycloak/PostGIS
smoke test on pushes and pull requests. The smoke test creates its own disposable
environment and does not access a developer or customer cluster.

To publish, open [Actions > Release](https://github.com/Synnotech-AG/Baikor_R/actions/workflows/release.yml),
select `main`, enter an unused stable version (`MAJOR.MINOR.PATCH`), and choose **Run workflow**.
After the checks pass, it publishes:

- Image `ghcr.io/synnotech-ag/baikor-r:<version>`.
- OCI chart `oci://ghcr.io/synnotech-ag/baikor-r-chart`, version `<version>`.
- A GitHub release containing release notes, source revision, immutable digests,
  the chart archive and checksums.

One version input controls the application and chart versions. No manual tag or
version-file edits are required. Releases use the automatic GitHub token;
ordinary CI runs cannot publish. Published versions are never overwritten.
See [docs/RELEASING.md](docs/RELEASING.md) for initial package visibility setup,
safe retries and the operator deployment process.

Changes are recorded in [CHANGELOG.md](CHANGELOG.md). Application/chart release
[**0.2.0**](https://github.com/Synnotech-AG/Baikor_R/releases/tag/0.2.0) pairs with
addon [**0.2.0**](https://github.com/Synnotech-AG/Baikor_R.Addon/releases/tag/0.2.0).
Anonymous package downloads and isolated published-image runtime checks passed
on **2026-10-21**. The older GHCR image/chart versions **1.7.6 through 1.7.9**
were retired after verification. Historical GitHub releases and source tags
remain available. See the [version reset and package retirement
record](docs/RELEASING.md#version-reset-to-020) before using an older version pin.
The application and addon source repositories are public under EUPL-1.2.
See the [review status](https://github.com/Synnotech-AG/Baikor_R.Addon/blob/main/docs/REVIEW_STATUS.md)
for release completion and runtime acceptance evidence.

## Customer CIVITAS deployment

Use the [addon repository's Ansible installation instructions](https://github.com/Synnotech-AG/Baikor_R.Addon/blob/main/README.md).
The operator pins a compatible addon revision in Core, supplies the database,
trusted platform CA and Keycloak configuration, and runs the Core playbook. The
addon anonymously consumes the public chart and image; running Helm alone does
not configure these prerequisites. Keep certificate validation enabled.

See [Helm security configuration](docs/HELM_SECURITY.md) for application and
migration resources and the optional application NetworkPolicy. The
[geodata import API documentation](docs/openapi/README.md) includes its OpenAPI
contract, supported file format and machine-client authorization.

## Optional local development deployment

Release deployments use public GHCR artifacts through the addon submodule.
For local iteration, explicitly configure a separate local
inventory with `helm.local_chart_path` pointing to this checkout's chart and
`helm_values.image.repository: baikor-r` / `helm_values.image.tag: dev`. Then build
and import the development image into k3d:

```powershell
docker build -t baikor-r:dev .
k3d image import baikor-r:dev -c civitas-local
```

Run `ansible-playbook -i inventory-local.yml core_platform/playbook.yml --tags addons`
from the Core checkout in your configured Ansible environment. Do not use local
chart paths or development-image overrides in a customer inventory.

Windows must resolve the addon hostname. Run this once in an elevated PowerShell, then restart the browser if it cached the failure:

```powershell
Add-Content -LiteralPath "$env:SystemRoot\System32\drivers\etc\hosts" -Value "`n127.0.0.1 baikor-r.civitas.test"
ipconfig /flushdns
```

Then open [https://baikor-r.civitas.test/](https://baikor-r.civitas.test/)
directly. The addon deliberately does not register a card in the shared CIVITAS
service portal. The optional public layer is configured through the operator-owned
Geoportal workflow at [https://geoportal.civitas.test/portal/](https://geoportal.civitas.test/portal/).

## CIVITAS monitoring

The application exposes Prometheus-formatted OpenTelemetry metrics only on the internal service port `9464`; `/metrics` on the public application port returns `404`. To connect it to the optional CIVITAS operations stack, enable `inv_op_stack.monitoring` in the core inventory and enable the chart's `telemetry.metrics.serviceMonitor.enabled` value through `inv_addons.baikor_r.helm_values`. Prometheus then discovers the add-on through the `ServiceMonitor`, Grafana can visualize its metrics, and CIVITAS Alloy/Loki can collect the structured Serilog stdout stream.

Stop the local PostGIS service without deleting its persistent volume:

```powershell
docker compose stop postgis
```
