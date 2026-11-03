using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BaikorR.Core.Persistence;

/// <summary>Allows schema tooling without starting hosted workers or authentication.</summary>
public sealed class BaikorRDesignTimeDbContextFactory : IDesignTimeDbContextFactory<BaikorRDbContext>
{
    public BaikorRDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__BaikorR")
            ?? "Host=localhost;Database=baikor_design;Username=unused;Password=unused";
        return new(new DbContextOptionsBuilder<BaikorRDbContext>()
            .UseNpgsql(connection, options => options.UseNetTopologySuite()).Options);
    }
}
