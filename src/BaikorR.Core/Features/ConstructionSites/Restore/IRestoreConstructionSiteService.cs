using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Restore;

public interface IRestoreConstructionSiteService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        RestoreConstructionSiteRequest request,
        CancellationToken cancellationToken);
}
