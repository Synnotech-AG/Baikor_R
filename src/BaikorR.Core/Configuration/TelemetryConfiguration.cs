namespace BaikorR.Core.Configuration;

public sealed class TelemetryConfiguration
{
    public const string SectionName = "Telemetry";

    public int MetricsPort { get; set; } = 9464;
}
