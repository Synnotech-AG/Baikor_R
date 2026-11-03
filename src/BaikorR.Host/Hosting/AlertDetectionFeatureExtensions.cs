using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Detection;

namespace BaikorR.Host.Hosting;

internal static class AlertDetectionFeatureExtensions
{
    public static WebApplicationBuilder AddAlertDetection(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<IAlertDetectionHandler, RouteConflictDetectionHandler>();
        builder.Services.AddScoped<IAlertDetectionProcessor, AlertDetectionProcessor>();
        builder.Services.AddScoped<IDetectionOperations, DetectionOperationsDbSession>();
        builder.Services.AddHostedService<AlertDetectionWorker>();
        return builder;
    }
}
