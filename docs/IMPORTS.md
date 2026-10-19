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

- `file`: ZIP archive containing exactly one matching SHP, DBF, and PRJ set in WGS 84; maximum 25 MB.
- `bufferMetres`: optional buffer on each side of the source line used to create polygon areas; default `1`.

The endpoint requires the Baikor editor policy. It returns the import batch ID, source project ID, source feature count, created construction-site count, and a breakdown by source status.

## Segmentation

Each line feature is transformed from WGS 84 to EPSG:25832. Every feature representing public space becomes one construction site. Features whose source type is `Hausanschluss` are skipped because they do not affect public space.

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

## Bulk deletion

`POST /api/construction-sites/bulk-delete`

Request body:

```json
{
  "ids": ["construction-site-guid", "another-guid"]
}
```

Any number of unique construction sites can be requested for atomic deletion. Database lookups are split into bounded internal batches, so large selections do not exceed database parameter limits. The table supports selecting all filtered results, making it possible to search for an import batch and remove all its construction sites in one operation.

An identical file cannot be imported twice while construction sites carrying its `import.fileSha256` still exist. This prevents accidental duplication and still permits an intentional delete-and-reimport workflow.

## Operator integration

See the [customer import API and Node-RED guide](https://github.com/Synnotech-AG/Baikor_R.Addon/blob/main/docs/IMPORT_API.md) for service-account setup, requests, error handling and manual workflow configuration. Earlier automatically installed flows are no longer managed; see the addon upgrade notes before removing any legacy mounts or credentials.
