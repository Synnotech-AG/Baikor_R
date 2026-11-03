using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace BaikorR.Core.Persistence.Routes;

public static class RouteModelConfiguration
{
    public static void Configure(ModelBuilder modelBuilder)
    {
        var source = modelBuilder.Entity<GtfsImportSource>();
        source.ToTable("gtfs_import_sources", "baikor");
        source.HasKey(item => item.Identity);
        source.Property(item => item.Identity).HasMaxLength(64);
        source.Property(item => item.SourceId).HasMaxLength(100).IsRequired();
        source.HasIndex(item => item.SourceId).IsUnique();

        var definition = modelBuilder.Entity<RouteDefinition>();
        definition.ToTable("route_definitions", "baikor", table => table.HasCheckConstraint("CK_route_definitions_source_binding",
            "(\"SourceId\" IS NULL AND \"ExternalRouteId\" IS NULL) OR (\"SourceId\" IS NOT NULL AND \"ExternalRouteId\" IS NOT NULL)"));
        definition.HasKey(item => item.Id);
        definition.Property(item => item.Title).HasMaxLength(200).IsRequired();
        definition.Property(item => item.Description).HasMaxLength(10000);
        definition.Property(item => item.SourceId).HasMaxLength(100);
        definition.Property(item => item.ExternalRouteId).HasMaxLength(255);
        definition.Property(item => item.Version).IsRowVersion();
        definition.HasIndex(item => new { item.SourceId, item.ExternalRouteId }).IsUnique();
        definition.HasMany(item => item.Paths).WithOne(item => item.RouteDefinition).HasForeignKey(item => item.RouteDefinitionId).OnDelete(DeleteBehavior.Cascade);

        var route = modelBuilder.Entity<RoutePath>();
        route.ToTable("routes", "baikor", table => table.HasCheckConstraint("CK_routes_source_binding",
            "(\"SourceId\" IS NULL AND \"ExternalRouteId\" IS NULL AND \"ExternalShapeId\" IS NULL) OR (\"SourceId\" IS NOT NULL AND \"ExternalRouteId\" IS NOT NULL AND \"ExternalShapeId\" IS NOT NULL)"));
        route.HasKey(item => item.Id);
        route.Property(item => item.Title).HasMaxLength(200).IsRequired();
        route.Property(item => item.Description).HasMaxLength(10000);
        route.Property(item => item.SourceId).HasMaxLength(100);
        route.Property(item => item.ExternalRouteId).HasMaxLength(255);
        route.Property(item => item.ExternalShapeId).HasMaxLength(255);
        route.Property(item => item.Version).IsRowVersion();
        route.HasIndex(item => new { item.SourceId, item.ExternalRouteId, item.ExternalShapeId }).IsUnique();
        route.HasMany(item => item.Versions).WithOne(item => item.RoutePath).HasForeignKey(item => item.RoutePathId).OnDelete(DeleteBehavior.Cascade);

        var version = modelBuilder.Entity<RoutePathVersion>();
        version.ToTable("route_path_versions", "baikor", table =>
        {
            table.HasCheckConstraint("CK_route_versions_valid_dates", "\"ValidFrom\" IS NULL OR \"ValidTo\" IS NULL OR \"ValidFrom\" <= \"ValidTo\"");
            table.HasCheckConstraint("CK_route_versions_coverage", "(\"SourceCoverageStart\" IS NULL AND \"SourceCoverageEnd\" IS NULL) OR (\"SourceCoverageStart\" IS NOT NULL AND \"SourceCoverageEnd\" IS NOT NULL AND \"SourceCoverageStart\" <= \"SourceCoverageEnd\")");
        });
        version.HasKey(item => item.Id);
        version.Property(item => item.Geometry).HasColumnType("geometry(MultiLineString,25832)").IsRequired();
        version.Property(item => item.ServiceDayCalendarJson).HasColumnType("jsonb");
        version.HasIndex(item => item.Geometry).HasMethod("gist");
        version.HasIndex(item => new { item.RoutePathId, item.SourceCoverageStart, item.SourceCoverageEnd });
        version.HasMany(item => item.Periods).WithOne(item => item.RoutePathVersion).HasForeignKey(item => item.RoutePathVersionId).OnDelete(DeleteBehavior.Cascade);

        var period = modelBuilder.Entity<RouteOperatingPeriod>();
        period.ToTable("route_operating_periods", "baikor", table => table.HasCheckConstraint("CK_route_periods_dates", "\"From\" <= \"To\""));
        period.HasKey(item => item.Id);
        period.HasIndex(item => new { item.RoutePathVersionId, item.From, item.To }).IsUnique();
    }
}
