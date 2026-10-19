using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.BulkDelete;

public interface IBulkDeleteConstructionSitesService
{
    Task<Result<BulkDeleteConstructionSitesResponse>> ExecuteAsync(
        BulkDeleteConstructionSitesRequest request,
        CancellationToken cancellationToken);
}
