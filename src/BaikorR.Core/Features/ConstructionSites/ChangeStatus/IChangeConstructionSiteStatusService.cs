using BaikorR.Api.Features.ConstructionSites.Common;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.ChangeStatus;

public interface IChangeConstructionSiteStatusService
{
    Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        ChangeConstructionSiteStatusRequest request,
        CancellationToken cancellationToken);
}
