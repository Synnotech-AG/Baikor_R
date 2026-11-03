using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Restore;

public sealed class RestoreConstructionSiteService(
    IConstructionSitesSession session,
    TimeProvider timeProvider) : IRestoreConstructionSiteService
{
    public async Task<Result<ConstructionSiteResponse>> ExecuteAsync(
        Guid id,
        RestoreConstructionSiteRequest request,
        CancellationToken cancellationToken)
    {
        var constructionSite = await session.GetForUpdateAsync(id, cancellationToken);
        if (constructionSite is null)
        {
            return Result.Fail<ConstructionSiteResponse>(ApiError.NotFound(
                "constructionSites.restore.notFound", "The construction site could not be found."));
        }

        if (constructionSite.Version != request.Version)
        {
            return Conflict();
        }

        if (!constructionSite.IsDeleted)
        {
            return Result.Ok(ConstructionSiteResponse.Create(constructionSite));
        }

        session.SetExpectedVersion(constructionSite, request.Version);
        constructionSite.IsDeleted = false;
        constructionSite.UpdatedAt = timeProvider.GetUtcNow();
        if (!await session.SaveChangesAsync(cancellationToken))
        {
            return Conflict();
        }

        return Result.Ok(ConstructionSiteResponse.Create(constructionSite));
    }

    private static Result<ConstructionSiteResponse> Conflict() =>
        Result.Fail<ConstructionSiteResponse>(ApiError.Conflict(
            "constructionSites.restore.conflict",
            "The construction site changed while it was being restored. Reload it and try again."));
}
