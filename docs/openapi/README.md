# Application OpenAPI contracts

[construction-site-archive.openapi.json](construction-site-archive.openapi.json)
documents construction-site listing, UUID reads, archive and restore. Listing
defaults to `GET /api/construction-sites?archive=active`; use `archive=archived`
to find archived sites or `archive=all` for both. Filtering happens before the
existing 2,000-record limit. Responses include `isDeleted`.

The existing `DELETE /api/construction-sites/{id}` and
`POST /api/construction-sites/bulk-delete` routes archive records by setting
`IsDeleted=true`. Their paths, request bodies and success responses remain
compatible: single archive returns `204`; bulk archive returns `deletedCount`
with the number of selected records, including already archived records.
Repeating either operation is idempotent. Areas, contacts, communications,
attachments, source identities and metadata remain stored. UUID reads and
attachment listing/download remain available to Viewer accounts, including
historical conflict links.

Restore through `POST /api/construction-sites/{id}/restore` with a JSON body
containing the current `version`. An Editor account (including Approver/Admin)
is required for archive and restore; the import-only role is excluded. These
construction-site writes retain the global MVC antiforgery requirement for
both bearer-token and browser-cookie requests. Obtain `GET /api/antiforgery`
using the same authenticated identity, retain its antiforgery cookie and send
the returned token in `X-CSRF-TOKEN` with archive, bulk archive and restore.
The import endpoint below has its own bearer exemption; that exemption does
not apply to these construction-site writes. Restore returns `200` with
the full construction site and its new version. An already active record with
the current version returns `200` without another change; a stale version
returns `409` (`constructionSites.restore.conflict`), an unknown UUID returns
`404` (`constructionSites.restore.notFound`), and a missing version returns
framework `400`.

Archived records reject general updates, status changes and attachment uploads
or deletion with `409` (`constructionSites.archived`). Restore before editing.
Archive excludes a site from both public GeoServer views and new conflict
detection. Detection work reconciles existing conflicts to Cleared while
retaining alert evidence and review history. Disabled detection rules retain
their existing deferred reconciliation behavior. Restoring a site makes it
eligible under its retained status and dates again. These lifecycle operations
do not grant publication approval or expose private contacts/attachments.

The private route, GTFS import, alert/review, rule and detection endpoints are
documented separately in [routes-alerts.openapi.json](routes-alerts.openapi.json).
See [Routes and potential conflicts](../ROUTES_ALERTS.md) for ownership, temporal
precision, permissions and recovery behavior. The import-only machine role does
not gain access to those endpoints.

Individual route paths can be deleted with
`DELETE /api/routes/{id}/paths/{pathId}` and a JSON body containing the current
parent `version`. This Editor operation uses browser CSRF protection and returns
the updated parent, including its new version. Deletion marks only the path as
suppressed and retains its UUID, source binding, calendars and alert history;
reimports preserve that suppression. Deleting the final active path keeps the
parent active with no map or detection geometry until a path is restored.
Missing versions return `400` (`routes.version.required`), stale versions or a
suppressed parent return `409` (`routes.conflict` or `routes.suppressed`), and an
unknown or mismatched parent/path pair returns `404` (`routes.paths.notFound`).
Repeating deletion with the current parent version is idempotent; restore a path
through `POST /api/routes/{id}/paths/{pathId}/restore`.

[geodata-import.openapi.json](geodata-import.openapi.json) describes the existing `POST /api/construction-sites/imports/trenches` endpoint in OpenAPI 3.0.3. Import the file into an OpenAPI client or renderer and set its server to your Baikor_R origin. The document is checked in; the application does not expose a Swagger endpoint. Its `info.version` identifies the document, not a versioned route or release.

## Authentication and upload

Use an access token issued by the configured `Authentication:Authority`. Its `aud` must include the application's `Authentication:ClientId` (normally `baikor-r` in the addon). The service client's own ID is not sufficient as an audience. The top-level `roles` claim must include `baikor_importer`, `baikor_editor`, `baikor_approver` or `baikor_admin`.

`baikor_importer` is dedicated to imports: it cannot list, read, modify, archive or restore construction sites or enter the general application. An operator with an editing role must handle inspection, archive or restore. See the [addon import guide](https://github.com/Synnotech-AG/Baikor_R.Addon#optional-import-api) for identity-provider and service-account setup.

This example uses shell environment variables for the deployment URL and access token:

```sh
curl --fail-with-body \
  --request POST "$BAIKOR_URL/api/construction-sites/imports/trenches" \
  --header "Authorization: Bearer $ACCESS_TOKEN" \
  --form "file=@DEMO-100_Trenches.zip;type=application/zip" \
  --form "bufferMetres=1"
```

Let the client generate the multipart boundary. The file part must be named `file`; `bufferMetres` is optional, defaults to `1`, and accepts `0.1` through `20` inclusive, in metres on each side of the line. Use a dot as the decimal separator. Do not follow authentication redirects automatically: the current host challenges unauthenticated requests (including invalid bearer tokens) with a **302 redirect to OpenID Connect**, not a guaranteed JSON 401. A successful import is a **200 JSON response** with a `batchId`.

Browser cookie sessions are also supported. Obtain `GET /api/antiforgery`, retain its antiforgery cookie, and include its `token` in `X-CSRF-TOKEN` with the import. Bearer requests do not need this token.

## File contract

| Item | Contract |
| --- | --- |
| Upload | Nonempty `.zip` filename, case-insensitive; at most **26,214,400 bytes (25 MiB)** |
| Complete request | Controller limit **27,262,976 bytes (26 MiB)** including multipart overhead; proxy limits may be smaller |
| Archive | Exactly one `.shp`; exactly one same-stem `.dbf` and `.prj`, matched case-insensitively across the archive |
| Other entries | `.shx` is not required or read; unrelated entries are ignored |
| Coordinates | WGS 84 longitude/latitude in degrees; projected-coordinate input is unsupported |
| Projection file | `.prj` text must contain `WGS_1984` or `WGS 84` (case-insensitive). This text check does not validate the full CRS, so the producer must supply correct geographic coordinates |
| Geometry | `LineString` or `MultiLineString`; at least one public-space feature |
| DBF text | Windows-1252; `.cpg` does not override decoding |
| Other formats | DXF, GeoJSON and a standalone SHP are unsupported |

The Helm chart defaults `nginx.ingress.kubernetes.io/proxy-body-size` to `26m`, allowing the documented 25 MiB file plus multipart overhead through ingress-nginx. Operators can override or remove that annotation. Other Ingress or Gateway controllers need their equivalent complete-request limit set to at least 26 MiB to support the full file contract.

DBF attribute names below are checked in order; the first nonblank value is used. Provide these exact names. Validation also applies to house-connection features before they are skipped.

| Meaning | Attribute names | Requirement |
| --- | --- | --- |
| Source status | `executio_1`, `execution_status`, `status` | Nonblank |
| Trench type | `name`, `kmlType`, `masterItem` | Nonblank; `Hausanschluss` is skipped case-insensitively |
| External identifier | `externalID`, `external_id` | Optional; defaults to `feature-<one-based-index>` |

Each remaining feature becomes one construction site, possibly with multiple polygon areas. The parser projects geographic coordinates to WGS 84 / UTM zone 32N to apply the metre buffer, and stores those areas with SRID `25832`. The project ID comes from the SHP filename stem after removing a trailing `_Trenches`, not from the ZIP filename. There is no projection override, asynchronous job, or dry-run parameter.

Status mapping uses the following exact source strings; unrecognized values (including different capitalization) become `Draft`. Original values are retained in `source.status`.

| Source status | Application status |
| --- | --- |
| `Gross planning`, `Detailed planning`, `Canceled` | Draft |
| `Assigned` | Planned |
| `Plan released` | Approved |
| `Executed`, `Documented` | Active |

## Responses and retries

The specification contains success and failure examples. `featureCount` includes all source features; `skippedCount` counts house connections; `createdCount` counts construction sites. `createdBySourceStatus` uses original source status labels, grouped case-insensitively. The three warning strings describe buffering, skipped features and status mapping; warnings are also returned when no features are skipped.

Importer validation returns 400 Problem Details with `errorKey: api.validation.failed` and field-level `errorKeys`:

| Field | Error keys |
| --- | --- |
| `file` | `constructionSites.import.fileRequired`, `constructionSites.import.fileTypeInvalid`, `constructionSites.import.fileTooLarge`, `constructionSites.import.fileInvalid` |
| `bufferMetres` | `constructionSites.import.bufferInvalid` |

409 responses use `constructionSites.import.duplicate` or `constructionSites.import.conflict`. Framework binding, antiforgery, authentication, unhandled exceptions and proxy errors do not guarantee the same JSON/error-key envelope.

The size limits apply at different layers. A file of exactly 25 MiB is accepted when the archive is valid and the complete multipart request fits the 26 MiB limit. A file one byte larger returns importer validation **400** with `constructionSites.import.fileTooLarge`. If the complete request exceeds 26 MiB and reaches the application, the current host returns a form-binding **400** Problem Details response: `errors[""]` reports `Failed to read the request form. Request body too large. The max request body size is 27262976 bytes.` This framework response has no importer `errorKey` or `errorKeys`. A proxy can instead reject the request with **413**, potentially at a smaller configured limit; its response body is not part of the application contract.

Duplicate detection hashes the exact ZIP bytes and searches all retained construction sites, including archived records, for matching `import.fileSha256` metadata. This is **not semantic deduplication or an atomic idempotency guarantee**: repackaging the ZIP changes its hash, and concurrent submissions can pass the initial check. Archive preserves source identity and does not enable another import of the same file; restore the existing sites when needed. Imports never automatically restore archived records. Do not blindly retry after a timeout or lost response; the import may have persisted. An operator can inspect the import metadata before deciding whether to resubmit. A dedicated importer account cannot inspect or restore the existing sites.

## Verify the contract

From the repository root, validate the OpenAPI structure and examples with the pinned, development-only [Redocly CLI](https://redocly.com/docs/cli/commands/lint):

```sh
npx --yes @redocly/cli@2.64.1 lint docs/openapi/geodata-import.openapi.json --extends minimal
npx --yes @redocly/cli@2.64.1 lint docs/openapi/routes-alerts.openapi.json --extends minimal
npx --yes @redocly/cli@2.64.1 lint docs/openapi/construction-site-archive.openapi.json --extends minimal
```

The routes/alerts document produces one `no-ambiguous-paths` warning for
`/api/alerts/{id}/handling` and `/api/alerts/scans/{id}`. ASP.NET's GUID route
constraints disambiguate these paths at runtime; OpenAPI path templates cannot
express that routing constraint. The schema retains the actual API paths.

The .NET tests exercise real multipart uploads, shapefile parsing, response examples, duplicate handling, buffer boundaries and the current invalid-bearer challenge. Only persistence is replaced by the existing in-memory test session:

```sh
dotnet test tests/BaikorR.Api.Tests/BaikorR.Api.Tests.csproj --filter FullyQualifiedName~ImportOpenApiContractTests
```

The [isolated platform smoke test](../../tests/platform/README.md) also sends real multipart uploads to Kestrel with files of exactly 25 MiB and 25 MiB plus one byte. A request declaring more than 26 MiB uses `Expect: 100-continue` to receive the host's early rejection before transmitting an oversized body. These cases check the successful import, importer validation and full-request form-binding error separately:

```sh
python tests/platform/run_ci.py
```

Keep this document and its tests aligned when changing the importer, its request/response models, the controller or authentication policy. The OpenAPI syntax follows the [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html).
