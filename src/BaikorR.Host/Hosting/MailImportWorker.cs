using BaikorR.Core.Features.MailImports;

namespace BaikorR.Host.Hosting;

internal sealed class MailImportWorker(IServiceScopeFactory scopes, TimeProvider clock,
    IConfiguration configuration, IMailImportSecretProtector protector, ILogger<MailImportWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("MailImports:WorkerEnabled", true) || !protector.IsConfigured)
        {
            return;
        }
        var owner = Guid.NewGuid();
        var unavailable = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                await scope.ServiceProvider.GetRequiredService<MailImportProcessor>().ProcessAsync(owner, stoppingToken);
                unavailable = false;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                if (!unavailable)
                {
                    logger.LogWarning("Mail import is unavailable ({FailureType}); durable work will be retried.", exception.GetType().Name);
                }
                unavailable = true;
            }
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(unavailable ? 5 : 2), clock, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
        }
    }
}
