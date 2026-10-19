namespace BaikorR.Core.Configuration;

public sealed class DatabaseConfiguration
{
    public const string ConnectionStringName = "BaikorR";

    public string ConnectionString { get; set; } = string.Empty;
}
