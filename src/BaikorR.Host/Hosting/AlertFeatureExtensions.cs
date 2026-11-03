using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Sessions;

namespace BaikorR.Host.Hosting;

internal static class AlertFeatureExtensions
{
    public static WebApplicationBuilder AddAlertFeatures(this WebApplicationBuilder builder)
    {
        builder.Services.AddScoped<IAlertsSession, AlertsDbSession>();
        builder.Services.AddScoped<IAlertQueryService, AlertQueryService>();
        builder.Services.AddScoped<IAlertHandlingService, AlertHandlingService>();
        builder.Services.AddScoped<IAlertRuleService, AlertRuleService>();
        builder.Services.AddSingleton<AlertReconciler>();
        builder.Services.AddSingleton<RouteConflictDetector>();
        builder.Services.AddSingleton<IRouteConflictDetector>(services => services.GetRequiredService<RouteConflictDetector>());
        builder.Services.AddSingleton<IAlertDetector>(services => services.GetRequiredService<RouteConflictDetector>());
        return builder;
    }
}
