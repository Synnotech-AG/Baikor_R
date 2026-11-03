using BaikorR.Core.Persistence;
using BaikorR.Core.Features.Alerts;
using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Persistence.Sessions;
using System.Text.Json;
using Npgsql;
using NpgsqlTypes;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace BaikorR.Api.Tests;

public sealed class GroupedRoutesMigrationTests
{
    [PostgisFact]
    public async Task UpgradeGroupsPathsPreservesSeparateHistoriesAndRepairsPendingSubjects()
    {
        await using var database = await PostgisTestDatabase.CreateAsync(migrationTarget: "20261028130616_TrackActualAlertEvaluations");
        await using var connection = new NpgsqlConnection(database.ConnectionString);
        await connection.OpenAsync();
        var first = Guid.Parse("00000000-0000-0000-0000-000000000001");
        var second = Guid.Parse("00000000-0000-0000-0000-000000000002");
        var canonical = Guid.Parse("10000000-0000-0000-0000-000000000001");
        var legacy = Guid.Parse("10000000-0000-0000-0000-000000000002");
        var snapshot = new RouteConflictDetector().Evaluate(new AlertRule(), RouteConflictDetectorTests.Route(), RouteConflictDetectorTests.Site()).Candidate!.Snapshot;
        await using (var seed = new NpgsqlCommand("""
            INSERT INTO baikor.routes ("Id", "Title", "SourceId", "ExternalRouteId", "ExternalShapeId", "IsSuppressed", "CreatedAt", "UpdatedAt") VALUES
                ('00000000-0000-0000-0000-000000000001', '1', 'provider-a', 'line-1', 'outbound', false, now(), now()),
                ('00000000-0000-0000-0000-000000000002', '1', 'provider-a', 'line-1', 'inbound', true, now(), now()),
                ('00000000-0000-0000-0000-000000000003', '1', null, null, null, true, now(), now()),
                ('00000000-0000-0000-0000-000000000004', '1', 'provider-b', 'line-1', 'outbound', false, now(), now());
            INSERT INTO baikor.route_path_versions ("Id", "RoutePathId", "Geometry", "HasOperatingCalendar", "SourceCoverageStart", "SourceCoverageEnd", "ServiceDayCalendarJson") VALUES
                ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', ST_GeomFromText('MULTILINESTRING((725000 5432050,725100 5432050))',25832), true, '2026-09-21', '2026-09-27', '{"2026-09-21":[0]}'),
                ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', ST_GeomFromText('MULTILINESTRING((725100 5432050,725000 5432050))',25832), true, '2026-09-21', '2026-09-27', '{"2026-09-26":[0]}');
            INSERT INTO baikor.route_operating_periods ("Id", "RoutePathVersionId", "From", "To") VALUES
                ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '2026-09-21', '2026-09-21'),
                ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '2026-09-26', '2026-09-26');
            INSERT INTO baikor.alerts ("Id", "RuleId", "Type", "IdentityKey", "Summary", "Condition", "Handling", "Occurrence", "EvidenceRevision", "EvidenceHash", "ReviewedEvidenceRevision", "HandlingActor", "HandlingNote", "CreatedAt", "UpdatedAt", "FirstDetectedAt", "LastDetectedAt", "LastEvaluatedAt") VALUES
                ('10000000-0000-0000-0000-000000000001', '86ddf9a0-3aa1-4efd-85a6-2c8b97332e01', 'routeConflict', '00000000-0000-0000-0000-000000000001/40000000-0000-0000-0000-000000000001', 'Earlier outbound case', 'Present', 'Handled', 1, 1, repeat('A',64), 1, 'first-reviewer', 'keep first decision', now(), now(), now(), now(), now()),
                ('10000000-0000-0000-0000-000000000002', '86ddf9a0-3aa1-4efd-85a6-2c8b97332e01', 'routeConflict', '00000000-0000-0000-0000-000000000002/40000000-0000-0000-0000-000000000001', 'Earlier inbound case', 'Present', 'Acknowledged', 1, 1, repeat('B',64), 1, 'second-reviewer', 'keep second decision', now(), now(), now(), now(), now());
            INSERT INTO baikor.route_conflict_alerts ("AlertId", "RouteId", "ConstructionSiteId") VALUES
                ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001'),
                ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000001');
            INSERT INTO baikor.route_conflict_evidence ("AlertId", "Revision", "MaterialHash", "SnapshotJson", "CreatedAt") VALUES
                ('10000000-0000-0000-0000-000000000001', 1, repeat('A',64), @snapshot, now()),
                ('10000000-0000-0000-0000-000000000002', 1, repeat('B',64), @snapshot, now());
            INSERT INTO baikor.alert_events ("Id", "AlertId", "Occurrence", "EvidenceRevision", "CreatedAt", "Actor", "Kind", "Explanation", "Handling", "Note") VALUES
                (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', 1, 1, now(), 'first-reviewer', 'handlingChanged', 'Original review', 'Handled', 'keep first decision'),
                (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', 1, 1, now(), 'second-reviewer', 'handlingChanged', 'Original review', 'Acknowledged', 'keep second decision');
            INSERT INTO baikor.alert_detection_work ("Kind", "SubjectId", "CreatedAt", "AvailableAt", "Attempts", "FailureCode") VALUES
                ('route', '00000000-0000-0000-0000-000000000002', now(), now(), 5, 'transient'),
                ('routeVersion', '20000000-0000-0000-0000-000000000002', now(), now(), 2, 'transient');
            """, connection))
        {
            seed.Parameters.AddWithValue("snapshot", NpgsqlDbType.Jsonb, JsonSerializer.Serialize(snapshot));
            await seed.ExecuteNonQueryAsync();
        }
        await using var context = database.CreateContext();
        await context.Database.MigrateAsync();
        var definitions = await context.RouteDefinitions.Include(item => item.Paths).ThenInclude(item => item.Versions).ThenInclude(item => item.Periods).ToListAsync();
        Assert.Equal(3, definitions.Count);
        var grouped = Assert.Single(definitions, item => item.SourceId == "provider-a");
        Assert.Equal(first, grouped.Id);
        Assert.False(grouped.IsSuppressed);
        Assert.Equal(2, grouped.Paths.Count);
        Assert.True(grouped.Paths.Single(item => item.Id == second).IsSuppressed);
        Assert.Equal(new DateOnly(2026, 9, 21), grouped.Paths.Single(item => item.Id == first).Versions.Single().Periods.Single().From);
        Assert.Equal(new DateOnly(2026, 9, 26), grouped.Paths.Single(item => item.Id == second).Versions.Single().Periods.Single().From);
        Assert.True(Assert.Single(definitions, item => item.SourceId == null).IsSuppressed);
        var alerts = await context.Alerts.Include(item => item.RouteConflict!).ThenInclude(item => item.Evidence).Include(item => item.Events).ToListAsync();
        var current = alerts.Single(item => item.Id == canonical);
        var retired = alerts.Single(item => item.Id == legacy);
        Assert.Null(current.SupersededByAlertId);
        Assert.Equal(canonical, retired.SupersededByAlertId);
        Assert.Equal(first, retired.RouteConflict!.RouteId);
        Assert.Equal(AlertHandling.Handled, current.Handling);
        Assert.Equal(AlertHandling.Acknowledged, retired.Handling);
        Assert.Equal("keep second decision", retired.HandlingNote);
        Assert.Contains(retired.Events, item => item.Actor == "second-reviewer" && item.Note == "keep second decision");
        Assert.Contains(retired.Events, item => item.Kind == "superseded");
        Assert.Contains(current.Events, item => item.Kind == "routeGrouped");
        Assert.Equal(JsonSerializer.Serialize(snapshot), JsonSerializer.Serialize(JsonSerializer.Deserialize<RouteConflictSnapshot>(retired.RouteConflict.Evidence.Single().SnapshotJson)));
        var session = new AlertsDbSession(context);
        var page = await session.ListAsync(new AlertListQuery(), default);
        Assert.Equal(1, page.TotalCount);
        Assert.Equal(canonical, page.Items.Single().Id);
        Assert.Equal(legacy, (await session.ListRelatedAsync(canonical, canonical, default)).Single().Id);
        var old = await new AlertQueryService(session).GetEvidenceAsync(legacy, 1, default);
        Assert.True(old.IsSuccess);
        var pending = await context.AlertDetectionWork.Where(item => item.FailureCode == "transient").ToListAsync();
        Assert.Equal(2, pending.Count);
        Assert.All(pending, item => { Assert.Equal("routeDefinition", item.Kind); Assert.Equal(first, item.SubjectId); });
        Assert.Equal(new[] { 2, 5 }, pending.Select(item => item.Attempts).Order().ToArray());
    }

    [PostgisFact]
    public async Task GroupingDowngradeRefusesPopulatedDatabaseWithoutLosingParents()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        var parent = new RouteDefinition { Id = Guid.NewGuid(), Title = "Retained route", CreatedAt = DateTimeOffset.UtcNow, UpdatedAt = DateTimeOffset.UtcNow };
        context.RouteDefinitions.Add(parent);
        await context.SaveChangesAsync();
        var error = await Assert.ThrowsAsync<PostgresException>(() => context.GetService<IMigrator>()
            .MigrateAsync("20261028130616_TrackActualAlertEvaluations"));
        Assert.Contains("pre-upgrade backup", error.MessageText);
        Assert.True(await context.RouteDefinitions.AnyAsync(item => item.Id == parent.Id));
    }

    [Fact]
    public void GroupingIsAnAdditiveMigrationAfterEvaluationTracking()
    {
        using var context = new BaikorRDbContext(new DbContextOptionsBuilder<BaikorRDbContext>()
            .UseNpgsql("Host=localhost;Database=unused;Username=unused;Password=unused", options => options.UseNetTopologySuite()).Options);
        var migrations = context.Database.GetMigrations().ToArray();
        Assert.Contains(migrations, name => name.EndsWith("_GroupRouteDefinitions", StringComparison.Ordinal));
        Assert.True(Array.FindIndex(migrations, name => name.EndsWith("_GroupRouteDefinitions", StringComparison.Ordinal))
            > Array.FindIndex(migrations, name => name.EndsWith("_TrackActualAlertEvaluations", StringComparison.Ordinal)));
    }
}
