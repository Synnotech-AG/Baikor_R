namespace BaikorR.Core.Configuration;

public sealed class DataProtectionConfiguration
{
    public const string SectionName = "DataProtection";

    public string KeysPath { get; set; } = string.Empty;
}
