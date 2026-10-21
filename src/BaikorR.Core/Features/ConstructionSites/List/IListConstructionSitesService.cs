using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.List;

public interface IListConstructionSitesService
{
    Task<Result<IReadOnlyList<ConstructionSiteResponse>>> ExecuteAsync(
        CancellationToken cancellationToken);
}
