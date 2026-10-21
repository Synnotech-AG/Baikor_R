using BaikorR.Core.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.ChangeStatus;

public interface IChangeConstructionSiteStatusService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        ChangeConstructionSiteStatusRequest request,
        CancellationToken cancellationToken);
}
