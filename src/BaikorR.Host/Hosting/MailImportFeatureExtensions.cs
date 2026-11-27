using BaikorR.Core.Features.MailImports;
using BaikorR.Core.Features.MailImports.Security;
using BaikorR.Core.Features.MailImports.Transport;
using BaikorR.Core.Persistence.MailImports;

namespace BaikorR.Host.Hosting;

internal static class MailImportFeatureExtensions
{
    public static WebApplicationBuilder AddMailImports(this WebApplicationBuilder builder)
    {
        builder.Services.AddSingleton<IMailImportSecretProtector, MailImportSecretProtector>();
        builder.Services.AddSingleton<IMailboxClientFactory, MailKitMailboxClientFactory>();
        builder.Services.AddScoped<IMailImportStore, MailImportDbStore>();
        builder.Services.AddScoped<MailImportService>();
        builder.Services.AddScoped<MailImportProcessor>();
        builder.Services.AddHostedService<MailImportWorker>();
        return builder;
    }
}
