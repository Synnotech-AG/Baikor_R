using BaikorR.Core.Shared.Security;

namespace BaikorR.Host.Hosting;

internal static class ApplicationEncryptionExtensions
{
    public static WebApplicationBuilder AddApplicationEncryption(this WebApplicationBuilder builder)
    {
        var config = builder.Configuration;
        builder.Services.AddSingleton(_ => new ApplicationSecretEncryption(
            config["Encryption:Key"], config["MailImports:EncryptionKey"]));

        if (config.GetValue<bool>("Encryption:Required") || config["Encryption:ExpectedKeySha256"] is not null
            || config["Encryption:Key"] is not null)
        {
            builder.Services.AddSingleton<ApplicationEncryptionHealthCheck>();
            builder.Services.AddHealthChecks().AddCheck<ApplicationEncryptionHealthCheck>("application-encryption");
        }
        return builder;
    }
}
