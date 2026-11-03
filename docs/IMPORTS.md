# Construction-site imports

The application exposes a direct, authenticated import endpoint. Node-RED workflows belong to the operator; the addon never installs or modifies them.

## Importer architecture

Source-specific import logic lives under `BaikorR.Core/Importers/<Source>`. The R-KOM implementation is contained in `Importers/Rkom`:

- `RkomTrenchesImporter` coordinates validation, duplicate detection, parsing, entity creation, and persistence.
- `RkomTrenchesShapefileParser` owns the R-KOM ZIP, shapefile, projection, segmentation, and geometry rules.
- R-KOM request, response, result, status-mapping, and intermediate model types stay in the same source boundary.

ASP.NET controllers remain transport adapters and delegate to the importer interface. A future source gets its own sibling folder and importer contract instead of extending the R-KOM implementation with source-specific conditions.

## Trench shapefile endpoint

`POST /api/construction-sites/imports/trenches`

The request uses `multipart/form-data`:

- `file`: ZIP archive containing exactly one matching SHP, DBF, and PRJ set in WGS 84; maximum 25 MiB (26,214,400 bytes).
- `bufferMetres`: optional buffer on each side of the source line used to create polygon areas; default `1`, range `0.1` through `20` inclusive.

The endpoint uses the `BaikorImporter` policy, which accepts `baikor_importer`, `baikor_editor`, `baikor_approver` or `baikor_admin`. The dedicated importer role permits this import only; it does not permit reading, editing or deleting construction sites. The response includes the import batch ID, source project ID, source feature count, created construction-site count, and a breakdown by source status.

See the [OpenAPI specification](openapi/geodata-import.openapi.json) and [integration guide](openapi/README.md) for authentication, multipart requests, archive requirements, response examples and error handling.

## Segmentation

Each line feature is projected from WGS 84 longitude/latitude to WGS 84 / UTM zone 32N for buffering; the resulting geometry is stored with SRID `25832`. Every feature representing public space becomes one construction site. Features whose source type is `Hausanschluss` are skipped because they do not affect public space.

Every imported line is buffered and stored as one or more `ConstructionSiteArea` rows. The number of construction sites depends on the public-space features in the input; house connections do not create construction sites.

## Status mapping

| Source status | Construction-site status |
| --- | --- |
| Gross planning | Draft |
| Detailed planning | Draft |
| Assigned | Planned |
| Plan released | Approved |
| Executed | Active |
| Documented | Active |
| Canceled | Draft |

The original value is always retained in `source.status`, so later domain decisions can revise this mapping without losing source information.

## Searchable metadata

Every imported construction site contains these metadata keys:

- `source.system`
- `source.projectId`
- `source.groupId`
- `source.externalId`
- `source.type`
- `source.lengthMetres`
- `source.status`
- `source.featureCount`
- `import.batchId`
- `import.fileName`
- `import.fileSha256`
- `import.importedAtUtc`
- `geometry.bufferMetres`

The construction-site table searches metadata keys and values as well as the title. Searching for an `import.batchId`, project ID, source status, or file name therefore locates the complete import.

## Bulk archive

`POST /api/construction-sites/bulk-delete`

Request body:

```json
{
  "ids": ["construction-site-guid", "another-guid"]
}
```

The endpoint retains its existing URL and archives the selected construction sites atomically. Database lookups are split into bounded internal batches, so large selections do not exceed database parameter limits. The table supports selecting all filtered results, making it possible to search for an import batch and archive all its construction sites in one operation. Archived sites retain their areas, attachments and import metadata and can be restored by an editor.

Duplicate detection checks the exact file's SHA-256 against all retained construction sites carrying `import.fileSha256`, including archived sites. Restore an archived import instead of submitting the same file again. This is not semantic deduplication: repackaging the ZIP changes its hash, and concurrent submissions are not serialized. The dedicated importer role cannot read, archive or restore construction sites.

## Operator integration

See the [customer import API and Node-RED guide](https://github.com/Synnotech-AG/Baikor_R.Addon#optional-import-api) for service-account setup, requests, error handling and manual workflow configuration.
