using BaikorR.Api.Features.ConstructionSites.Common;
using BaikorR.Api.Persistence.Sessions;
using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.ChangeStatus;

public sealed class ChangeConstructionSiteStatusService(
    IConstructionSitesSession session,
    TimeProvider timeProvider) : IChangeConstructionSiteStatusService
{
    public async Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        ChangeConstructionSiteStatusRequest request,
        CancellationToken cancellationToken)
    {
        var constructionSite = await session.GetForUpdateAsync(id, cancellationToken);
        if (constructionSite is null)
        {
            return ChangeConstructionSiteStatusResults.NotFound();
        }

        constructionSite.Status = request.Status;
        constructionSite.UpdatedAt = timeProvider.GetUtcNow();
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return ChangeConstructionSiteStatusResults.Conflict();
        }

        return constructionSite.ToStatusChangeSuccess();
    }
}
