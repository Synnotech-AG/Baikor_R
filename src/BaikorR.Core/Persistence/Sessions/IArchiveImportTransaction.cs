namespace BaikorR.Core.Persistence.Sessions;

public interface IArchiveImportTransaction : IAsyncDisposable
{
    bool IsDuplicate { get; }
    bool IsAuthorized { get; }
    Task<bool> CompleteAsync(CancellationToken cancellationToken);
}
