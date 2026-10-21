using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.BulkDelete;

public interface IBulkDeleteConstructionSitesService
{
    Task<Result<BulkDeleteConstructionSitesResponse>> ExecuteAsync(
        BulkDeleteConstructionSitesRequest request,
        CancellationToken cancellationToken);
}
