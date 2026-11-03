using BaikorR.Core.Features.ConstructionSites.Common;
using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Shared.Results;
using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.List;

public sealed class ListConstructionSitesService(IConstructionSitesSession session)
    : IListConstructionSitesService
{
    public async Task<Result<IReadOnlyList<ConstructionSiteResponse>>> ExecuteAsync(
        CancellationToken cancellationToken,
        string archive = "active")
    {
        var filter = archive.ToLowerInvariant() switch
        {
            "active" => ConstructionSiteArchiveFilter.Active,
            "archived" => ConstructionSiteArchiveFilter.Archived,
            "all" => ConstructionSiteArchiveFilter.All,
            _ => (ConstructionSiteArchiveFilter?)null
        };
        if (filter is null)
        {
            return Result.Fail<IReadOnlyList<ConstructionSiteResponse>>(ApiError.Validation(
                "constructionSites.validation.archive.invalid",
                "Archive must be active, archived or all.",
                "archive"));
        }

        var constructionSites = await session.ListAsync(2000, cancellationToken, filter.Value);

        return constructionSites.ToListSuccess();
    }
}
