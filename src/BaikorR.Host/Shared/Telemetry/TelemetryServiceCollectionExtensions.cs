using OpenTelemetry.Metrics;
using OpenTelemetry.Resources;

namespace BaikorR.Api.Shared.Telemetry;

internal static class TelemetryServiceCollectionExtensions
{
    public static IServiceCollection AddApplicationTelemetry(this IServiceCollection services)
    {
        services
            .AddOpenTelemetry()
            .ConfigureResource(resource => resource.AddService("BaikorR.Host"))
            .WithMetrics(metrics => metrics
                .AddAspNetCoreInstrumentation()
                .AddRuntimeInstrumentation()
                .AddMeter(
                    "Microsoft.AspNetCore.Hosting",
                    "Microsoft.AspNetCore.Server.Kestrel",
                    "System.Net.Http")
                .AddPrometheusExporter());

        return services;
    }
}
