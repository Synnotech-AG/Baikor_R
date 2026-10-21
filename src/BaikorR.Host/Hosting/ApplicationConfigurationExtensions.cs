using BaikorR.Core.Configuration;

namespace BaikorR.Host.Hosting;

internal static class ApplicationConfigurationExtensions
{
    public static WebApplicationBuilder AddApplicationConfiguration(this WebApplicationBuilder builder)
    {
        builder.Services
            .AddOptions<AuthenticationConfiguration>()
            .Bind(builder.Configuration.GetSection(AuthenticationConfiguration.SectionName));
        builder.Services
            .AddOptions<DataProtectionConfiguration>()
            .Bind(builder.Configuration.GetSection(DataProtectionConfiguration.SectionName));
        builder.Services
            .AddOptions<TelemetryConfiguration>()
            .Bind(builder.Configuration.GetSection(TelemetryConfiguration.SectionName))
            .Validate(configuration => configuration.MetricsPort is > 0 and <= 65535,
                "Telemetry:MetricsPort must be a valid TCP port.")
            .ValidateOnStart();
        builder.Services
            .AddOptions<DatabaseConfiguration>()
            .Configure(configuration =>
                configuration.ConnectionString = builder.Configuration.GetConnectionString(
                    DatabaseConfiguration.ConnectionStringName) ?? string.Empty)
            .Validate(configuration => !string.IsNullOrWhiteSpace(configuration.ConnectionString),
                $"ConnectionStrings:{DatabaseConfiguration.ConnectionStringName} must be configured.")
            .ValidateOnStart();

        return builder;
    }
}
