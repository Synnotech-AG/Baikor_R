namespace BaikorR.Core.Persistence.Entities;

public sealed class GtfsImportSource
{
    public string Identity { get; set; } = string.Empty;
    public string SourceId { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}
