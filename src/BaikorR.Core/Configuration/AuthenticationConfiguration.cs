namespace BaikorR.Core.Configuration;

public sealed class AuthenticationConfiguration
{
    public const string SectionName = "Authentication";

    public bool Enabled { get; set; }

    public string Authority { get; set; } = string.Empty;

    public string ClientId { get; set; } = string.Empty;

    public string ClientSecret { get; set; } = string.Empty;

    public bool AllowInvalidServerCertificate { get; set; }
}
