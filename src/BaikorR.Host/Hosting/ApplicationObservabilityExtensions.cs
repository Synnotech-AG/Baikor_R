using BaikorR.Api.Persistence;
using BaikorR.Api.Shared.Telemetry;
using Microsoft.Extensions.Diagnostics.HealthChecks;
using Serilog;

namespace BaikorR.Api.Hosting;

internal static class ApplicationObservabilityExtensions
{
    public static WebApplicationBuilder AddApplicationObservability(this WebApplicationBuilder builder)
    {
        builder.Services.AddSerilog((services, loggerConfiguration) => loggerConfiguration
            .ReadFrom.Configuration(builder.Configuration)
            .ReadFrom.Services(services)
            .Enrich.FromLogContext());
        builder.Services.AddApplicationTelemetry();
        builder.Services
            .AddHealthChecks()
            .AddCheck("self", () => HealthCheckResult.Healthy(), tags: ["live"])
            .AddDbContextCheck<BaikorRDbContext>("database", tags: ["ready"]);

        return builder;
    }
}
