using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Get;

public interface IGetConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(Guid id, CancellationToken cancellationToken);
}
