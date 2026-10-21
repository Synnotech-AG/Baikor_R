namespace BaikorR.Host.Shared.Telemetry;

internal static class TelemetryApplicationExtensions
{
    public static IApplicationBuilder UseInternalMetricsEndpoint(
        this IApplicationBuilder app,
        int metricsPort)
    {
        app.UseWhen(
            context => context.Request.Path == "/metrics"
                       && context.Connection.LocalPort != metricsPort,
            branch => branch.Run(context =>
            {
                context.Response.StatusCode = StatusCodes.Status404NotFound;
                return Task.CompletedTask;
            }));
        app.UseOpenTelemetryPrometheusScrapingEndpoint(context =>
            context.Request.Path == "/metrics"
            && context.Connection.LocalPort == metricsPort);

        return app;
    }
}
