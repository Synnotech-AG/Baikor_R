using System.Text.Json;
using System.Text.Json.Serialization;
using BaikorR.Api.Authentication;
using BaikorR.Api.Shared.Telemetry;
using BaikorR.Core.Configuration;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Serilog;
using Serilog.AspNetCore;
using Serilog.Events;

namespace BaikorR.Api.Hosting;

internal static class ApplicationWebExtensions
{
    public static WebApplicationBuilder AddApplicationWeb(this WebApplicationBuilder builder)
    {
        builder.Services
            .AddControllersWithViews(options =>
                options.Filters.Add(new AutoValidateAntiforgeryTokenAttribute()))
            .AddJsonOptions(options =>
                options.JsonSerializerOptions.Converters.Add(
                    new JsonStringEnumConverter(JsonNamingPolicy.CamelCase)));

        return builder;
    }

    public static WebApplication UseApplicationPipeline(this WebApplication app)
    {
        var telemetry = app.Services.GetRequiredService<IOptions<TelemetryConfiguration>>().Value;

        app.UseForwardedHeaders();
        app.UseStaticFiles();
        app.UseSerilogRequestLogging(ConfigureRequestLogging);
        app.UseInternalMetricsEndpoint(telemetry.MetricsPort);
        app.UseAuthentication();
        app.UseAuthorization();
        app.UseAntiforgery();
        app.MapControllers();
        app.MapHealthChecks("/health/live", new HealthCheckOptions
        {
            Predicate = registration => registration.Tags.Contains("live")
        });
        app.MapHealthChecks("/health/ready", new HealthCheckOptions
        {
            Predicate = _ => true
        });
        app.MapFallbackToFile("index.html")
            .RequireAuthorization(BaikorPolicies.Viewer);

        return app;
    }

    private static void ConfigureRequestLogging(RequestLoggingOptions options)
    {
        options.GetLevel = (httpContext, _, exception) =>
        {
            if (exception is not null || httpContext.Response.StatusCode >= 500)
            {
                return LogEventLevel.Error;
            }

            return httpContext.Request.Path.StartsWithSegments("/health")
                ? LogEventLevel.Debug
                : LogEventLevel.Information;
        };
        options.EnrichDiagnosticContext = (diagnosticContext, httpContext) =>
        {
            diagnosticContext.Set("RequestHost", httpContext.Request.Host.Value);
            diagnosticContext.Set("RequestScheme", httpContext.Request.Scheme);
        };
    }
}
