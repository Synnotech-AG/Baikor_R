using FluentResults;

namespace BaikorR.Core.Features.ConstructionSites.Delete;

public interface IDeleteConstructionSiteService
{
    Task<Result> ExecuteAsync(Guid id, CancellationToken cancellationToken);
}
