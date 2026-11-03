using BaikorR.Host.Hosting;

var builder = WebApplication.CreateBuilder(args);
var runMigrations = args.Contains("--migrate", StringComparer.OrdinalIgnoreCase);

builder
    .AddApplicationConfiguration()
    .AddApplicationObservability()
    .AddApplicationPersistence()
    .AddConstructionSiteFeatures()
    .AddRouteFeatures()
    .AddAlertFeatures()
    .AddAlertDetection()
    .AddApplicationSecurity(runMigrations)
    .AddApplicationWeb();

var app = builder.Build();

if (runMigrations)
{
    await app.MigrateDatabaseAsync();
    return;
}

app.UseApplicationPipeline();
app.Run();

namespace BaikorR.Host
{
    public partial class Program;
}
