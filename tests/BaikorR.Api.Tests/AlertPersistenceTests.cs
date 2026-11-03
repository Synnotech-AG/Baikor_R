using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence;
using BaikorR.Core.Persistence.Alerts;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Api.Tests;

public sealed class AlertPersistenceTests
{
    [Fact]
    public void ReconciledEvidenceAndEventsAreAddedToTrackedExistingCase()
    {
        using var context = CreateContext();
        var reconciler = new AlertReconciler();
        var rule = new AlertRule();
        var candidate = new RouteConflictDetector().Evaluate(rule, RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site()).Candidate!;
        var record = reconciler.Reconcile(null, candidate, DateTimeOffset.UtcNow);
        context.Attach(record);

        reconciler.Reconcile(record, new RouteConflictDetector().Evaluate(rule, RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site(1)).Candidate!, DateTimeOffset.UtcNow);
        context.ChangeTracker.DetectChanges();

        Assert.Equal(EntityState.Added, context.Entry(record.RouteConflict!.Evidence[^1]).State);
        Assert.Equal(EntityState.Added, context.Entry(record.Events[^1]).State);
    }

    [Fact]
    public void HistoricalSubjectIdentitiesHaveNoCascadeForeignKeyAndCaseIdentityIsUnique()
    {
        using var context = CreateContext();
        var detail = context.Model.FindEntityType(typeof(RouteConflictAlert))!;
        Assert.DoesNotContain(detail.GetForeignKeys(), key => key.PrincipalEntityType.ClrType == typeof(ConstructionSite));
        Assert.Contains(context.Model.FindEntityType(typeof(AlertRecord))!.GetIndexes(), index => index.IsUnique
            && index.Properties.Select(property => property.Name).SequenceEqual(["RuleId", "IdentityKey"]));
    }

    private static MappingContext CreateContext() => new(new DbContextOptionsBuilder<MappingContext>()
        .UseNpgsql("Host=localhost;Database=unused;Username=unused;Password=unused", options => options.UseNetTopologySuite()).Options);

    private sealed class MappingContext(DbContextOptions<MappingContext> options) : DbContext(options)
    {
        protected override void OnModelCreating(ModelBuilder modelBuilder) => AlertModelConfiguration.Configure(modelBuilder);
    }
}
