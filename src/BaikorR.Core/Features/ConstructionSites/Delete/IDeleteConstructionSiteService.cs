using FluentResults;

namespace BaikorR.Api.Features.ConstructionSites.Delete;

public interface IDeleteConstructionSiteService
{
    Task<Result> ExecuteAsync(Guid id, CancellationToken cancellationToken);
}
