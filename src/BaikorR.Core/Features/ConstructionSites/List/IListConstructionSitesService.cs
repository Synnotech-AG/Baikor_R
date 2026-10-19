using BaikorR.Api.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.List;

public interface IListConstructionSitesService
{
    Task<Result<IReadOnlyList<ConstructionSiteResponse>>> ExecuteAsync(
        CancellationToken cancellationToken);
}
