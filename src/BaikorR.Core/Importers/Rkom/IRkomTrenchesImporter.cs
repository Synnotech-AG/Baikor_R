using FluentResults;

namespace BaikorR.Api.Importers.Rkom;

public interface IRkomTrenchesImporter
{
    Task<Result<RkomTrenchesImportResponse>> ExecuteAsync(
        RkomTrenchesImportRequest request,
        CancellationToken cancellationToken);
}
