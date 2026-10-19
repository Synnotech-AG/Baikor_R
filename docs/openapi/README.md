# Geodata import OpenAPI

[geodata-import.openapi.json](geodata-import.openapi.json) describes the existing `POST /api/construction-sites/imports/trenches` endpoint in OpenAPI 3.0.3. Import the file into an OpenAPI client or renderer and set its server to your Baikor_R origin. The document is checked in; the application does not expose a Swagger endpoint. Its `info.version` identifies the document, not a versioned route or release.

## Authentication and upload

Use an access token issued by the configured `Authentication:Authority`. Its `aud` must include the application's `Authentication:ClientId` (normally `baikor-r` in the addon). The service client's own ID is not sufficient as an audience. The top-level `roles` claim must include `baikor_importer`, `baikor_editor`, `baikor_approver` or `baikor_admin`.

`baikor_importer` is dedicated to imports: it cannot list, read, modify or delete construction sites or enter the general application. An operator with an editing role must handle inspection or deletion. See the [addon import guide](https://github.com/Synnotech-AG/Baikor_R.Addon#optional-import-api) for identity-provider and service-account setup.

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

409 responses use `constructionSites.import.duplicate` or `constructionSites.import.conflict`. Framework binding, antiforgery, authentication, unhandled exceptions and proxy errors do not guarantee the same JSON/error-key envelope. A request rejected for overall size may return 413 before importer validation runs.

Duplicate detection hashes the exact ZIP bytes and checks up to 2,000 existing construction sites for matching `import.fileSha256` metadata. It is **not a global idempotency guarantee**: repackaging the ZIP changes its hash, and the lookup is bounded. Do not blindly retry after a timeout or lost response; the import may have persisted. An operator can inspect the import metadata before deciding whether to resubmit. A dedicated importer account cannot perform delete-and-reimport cleanup itself.

## Verify the contract

From the repository root, validate the OpenAPI structure and examples with the pinned, development-only [Redocly CLI](https://redocly.com/docs/cli/commands/lint):

```sh
npx --yes @redocly/cli@2.64.1 lint docs/openapi/geodata-import.openapi.json --extends minimal
```

The .NET tests exercise real multipart uploads, shapefile parsing, response examples, duplicate handling, buffer boundaries and the current invalid-bearer challenge. Only persistence is replaced by the existing in-memory test session:

```sh
dotnet test tests/BaikorR.Api.Tests/BaikorR.Api.Tests.csproj --filter FullyQualifiedName~ImportOpenApiContractTests
```

Keep this document and its tests aligned when changing the importer, its request/response models, the controller or authentication policy. The OpenAPI syntax follows the [OpenAPI 3.0.3 specification](https://spec.openapis.org/oas/v3.0.3.html).
