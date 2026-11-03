using BaikorR.Core.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql;

namespace BaikorR.Api.Tests;

public sealed class PostgisFactAttribute : FactAttribute
{
    public PostgisFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("BAIKOR_TEST_POSTGIS")))
        {
            Skip = "Set BAIKOR_TEST_POSTGIS to an isolated disposable PostGIS administrator connection.";
        }
    }
}

/// <summary>
/// Creates a unique database on a test-owned PostGIS server, applies the released migration chain,
/// and drops only that generated database. Never pass a production server connection.
/// </summary>
public sealed class PostgisTestDatabase : IAsyncDisposable
{
    private readonly string adminConnectionString;
    private readonly string databaseName;

    private PostgisTestDatabase(string adminConnectionString, string databaseName, string connectionString)
    {
        this.adminConnectionString = adminConnectionString;
        this.databaseName = databaseName;
        ConnectionString = connectionString;
        Options = new DbContextOptionsBuilder<BaikorRDbContext>().UseNpgsql(connectionString,
            options => options.UseNetTopologySuite()).Options;
    }

    public string ConnectionString { get; }
    public DbContextOptions<BaikorRDbContext> Options { get; }
    public BaikorRDbContext CreateContext() => new(Options);

    public static async Task<PostgisTestDatabase> CreateAsync(CancellationToken cancellationToken = default, string? migrationTarget = null)
    {
        var adminConnectionString = Environment.GetEnvironmentVariable("BAIKOR_TEST_POSTGIS")
            ?? throw new InvalidOperationException("BAIKOR_TEST_POSTGIS is required for isolated database tests.");
        var databaseName = "baikor_test_" + Guid.NewGuid().ToString("N");
        var builder = new NpgsqlConnectionStringBuilder(adminConnectionString) { Database = databaseName };
        await using (var connection = new NpgsqlConnection(adminConnectionString))
        {
            await connection.OpenAsync(cancellationToken);
            await using var command = new NpgsqlCommand($"CREATE DATABASE \"{databaseName}\"", connection);
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        var database = new PostgisTestDatabase(adminConnectionString, databaseName, builder.ConnectionString);
        try
        {
            await using var context = database.CreateContext();
            await context.GetService<IMigrator>().MigrateAsync(migrationTarget, cancellationToken);
            return database;
        }
        catch
        {
            await database.DisposeAsync();
            throw;
        }
    }

    public async ValueTask DisposeAsync()
    {
        // databaseName is generated here; no caller-provided names can enter this destructive statement.
        await using var connection = new NpgsqlConnection(adminConnectionString);
        await connection.OpenAsync();
        await using var command = new NpgsqlCommand($"DROP DATABASE IF EXISTS \"{databaseName}\" WITH (FORCE)", connection);
        await command.ExecuteNonQueryAsync();
    }
}
