using BaikorR.Core.Features.Alerts.Detection;

namespace BaikorR.Host.Hosting;

internal sealed class AlertDetectionWorker(IServiceScopeFactory scopes, TimeProvider clock,
    IConfiguration configuration, ILogger<AlertDetectionWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!configuration.GetValue("Alerts:WorkerEnabled", true))
        {
            return;
        }
        var unavailable = false;
        while (!stoppingToken.IsCancellationRequested)
        {
            var delay = TimeSpan.FromSeconds(1);
            try
            {
                await using var scope = scopes.CreateAsyncScope();
                var processor = scope.ServiceProvider.GetRequiredService<IAlertDetectionProcessor>();
                if (await processor.ProcessNextAsync(stoppingToken))
                {
                    delay = TimeSpan.FromMilliseconds(25);
                }
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
                    // Do not log connection strings, source payloads or user evidence.
                    logger.LogWarning("Alert detection queue is unavailable ({FailureType}); durable work will be retried.",
                        exception.GetType().Name);
                }
                unavailable = true;
                delay = TimeSpan.FromSeconds(5);
            }
            await Task.Delay(delay, clock, stoppingToken);
        }
    }
}
