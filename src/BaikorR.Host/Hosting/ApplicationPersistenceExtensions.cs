using BaikorR.Api.Persistence;
using BaikorR.Api.Persistence.Sessions;
using BaikorR.Core.Configuration;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace BaikorR.Api.Hosting;

internal static class ApplicationPersistenceExtensions
{
    public static WebApplicationBuilder AddApplicationPersistence(this WebApplicationBuilder builder)
    {
        builder.Services.AddDbContext<BaikorRDbContext>((services, options) =>
        {
            var database = services.GetRequiredService<IOptions<DatabaseConfiguration>>().Value;
            options.UseNpgsql(database.ConnectionString, npgsql => npgsql.UseNetTopologySuite());
        });
        builder.Services.AddScoped<IConstructionSitesSession, ConstructionSiteDbSession>();
        builder.Services.AddScoped<IConstructionSiteAttachmentsSession, ConstructionSiteAttachmentDbSession>();

        return builder;
    }

    public static async Task MigrateDatabaseAsync(this WebApplication app)
    {
        await using var scope = app.Services.CreateAsyncScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<BaikorRDbContext>();
        await dbContext.Database.MigrateAsync();
    }
}
