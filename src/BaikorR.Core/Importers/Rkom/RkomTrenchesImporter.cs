using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using BaikorR.Api.Persistence.Entities;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;
using FluentValidation;
using NetTopologySuite.IO.Esri;

namespace BaikorR.Api.Importers.Rkom;

public sealed class RkomTrenchesImporter(
    IConstructionSitesSession session,
    TimeProvider timeProvider,
    RkomTrenchesShapefileParser parser,
    IValidator<RkomTrenchesImportRequest> validator) : IRkomTrenchesImporter
{
    private const string SourceSystem = "trench-shapefile";

    public async Task<Result<RkomTrenchesImportResponse>> ExecuteAsync(
        RkomTrenchesImportRequest request,
        CancellationToken cancellationToken)
    {
        var validationResult = await validator.ValidateAsync(request, cancellationToken);
        if (!validationResult.IsValid)
        {
            return RkomTrenchesImportResults.ValidationFailed(validationResult);
        }

        var fileHash = Convert.ToHexString(SHA256.HashData(request.Content)).ToLowerInvariant();
        var existing = await session.ListAsync(2000, cancellationToken);
        if (existing.Any(site =>
                site.Metadata.TryGetValue("import.fileSha256", out var importedHash)
                && string.Equals(importedHash, fileHash, StringComparison.OrdinalIgnoreCase)))
        {
            return RkomTrenchesImportResults.Duplicate();
        }

        ParsedRkomTrenches import;
        try
        {
            import = parser.Parse(
                request.Content,
                request.BufferMetres);
        }
        catch (Exception exception) when (exception is InvalidDataException or ShapefileException or ArgumentException)
        {
            return RkomTrenchesImportResults.InvalidFile(exception.Message);
        }

        var batchId = Guid.NewGuid();
        var now = timeProvider.GetUtcNow();
        var typePositions = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (var component in import.Components)
        {
            var constructionSiteId = Guid.NewGuid();
            var position = typePositions.GetValueOrDefault(component.SourceType) + 1;
            typePositions[component.SourceType] = position;
            var groupId = CreateGroupId(component);
            var constructionSite = new ConstructionSite
            {
                Id = constructionSiteId,
                Title = $"{import.SourceProjectId} – {component.SourceType} – Abschnitt {position:000}",
                Status = RkomTrenchStatusMapping.ToConstructionSiteStatus(component.SourceStatus),
                Metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                {
                    ["source.system"] = SourceSystem,
                    ["source.projectId"] = import.SourceProjectId,
                    ["source.groupId"] = groupId,
                    ["source.externalId"] = component.SourceExternalId,
                    ["source.type"] = component.SourceType,
                    ["source.lengthMetres"] = component.SourceLengthMetres.ToString("0.###", CultureInfo.InvariantCulture),
                    ["source.status"] = component.SourceStatus,
                    ["source.featureCount"] = component.SourceIndexes.Count.ToString(CultureInfo.InvariantCulture),
                    ["import.batchId"] = batchId.ToString("D"),
                    ["import.fileName"] = Path.GetFileName(request.FileName),
                    ["import.fileSha256"] = fileHash,
                    ["import.importedAtUtc"] = now.ToString("O", CultureInfo.InvariantCulture),
                    ["geometry.bufferMetres"] = request.BufferMetres.ToString(CultureInfo.InvariantCulture)
                },
                CreatedAt = now,
                UpdatedAt = now,
                Areas = component.Areas.Select((area, areaIndex) => new ConstructionSiteArea
                {
                    Id = Guid.NewGuid(),
                    ConstructionSiteId = constructionSiteId,
                    Name = $"Area {areaIndex + 1}",
                    Geometry = area
                }).ToList()
            };
            session.Add(constructionSite);
        }

        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return RkomTrenchesImportResults.Conflict();
        }

        var warnings = new[]
        {
            "The source contains line geometries without a construction width; each line was buffered using the configured area buffer.",
            $"{import.SkippedCount} house-connection features were skipped because they do not affect public space.",
            "Source statuses 'Executed' and 'Documented' are mapped to Active. 'Canceled' is mapped to Draft and retained in metadata."
        };
        return RkomTrenchesImportResults.Success(new RkomTrenchesImportResponse(
            batchId,
            import.SourceProjectId,
            import.FeatureCount,
            import.SkippedCount,
            import.Components.Count,
            import.Components
                .GroupBy(component => component.SourceStatus, StringComparer.OrdinalIgnoreCase)
                .OrderBy(group => group.Key, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count()),
            warnings));
    }

    private static string CreateGroupId(RkomTrenchComponent component)
    {
        var source = $"{component.SourceStatus}|{component.SourceExternalId}";
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(source))).ToLowerInvariant();
    }
}
