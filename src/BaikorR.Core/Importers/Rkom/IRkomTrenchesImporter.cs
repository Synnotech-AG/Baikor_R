using FluentResults;

namespace BaikorR.Core.Importers.Rkom;

public interface IRkomTrenchesImporter
{
    Task<Result<RkomTrenchesImportResponse>> ExecuteAsync(
        RkomTrenchesImportRequest request,
        CancellationToken cancellationToken);
}
