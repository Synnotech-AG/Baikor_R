using System.IO.Compression;
using System.Text;
using BaikorR.Core.Importers.Gtfs;

namespace BaikorR.Api.Tests;

public sealed class GtfsRouteTests
{
    [Fact]
    public void PathLabelsUseStopsAndDifferentiateIdenticalEndpoints()
    {
        var feed = new GtfsScheduleParser().Parse(TwoPathsArchive());
        var labels = feed.Routes.Select(route => route.PathTitle).ToArray();
        Assert.Equal(new[] { "Start → End (S1)", "Start → End (S2)" }, labels);
    }

    internal static byte[] TwoPathsArchive()
    {
        var content = Rewrite(Archive(), "trips.txt", "route_id,service_id,trip_id,shape_id,direction_id\nR1,D1,T1,S1,0\nR1,D1,T2,S2,1\n");
        content = Rewrite(content, "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,23:55:00,23:55:00,P1,1\nT1,25:10:00,25:10:00,P2,2\nT2,10:00:00,10:00:00,P1,1\nT2,11:00:00,11:00:00,P2,2\n");
        return Rewrite(content, "shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\nS1,49.0,12.1,1\nS1,49.01,12.11,2\nS2,49.0,12.1,1\nS2,49.02,12.12,2\n");
    }

    [Fact]
    public void CalendarExceptionsAndOvernightTimesPreserveCivilDayGaps()
    {
        var feed = new GtfsScheduleParser().Parse(Archive());
        var route = Assert.Single(feed.Routes);
        Assert.Equal("R1", route.ExternalRouteId);
        Assert.Equal("S1", route.ExternalShapeId);
        Assert.Equal(25832, route.Geometry.SRID);
        Assert.InRange(route.Geometry.Coordinates[0].X, 600000, 800000);
        Assert.Equal(new DateOnly(2026, 10, 24), feed.CoverageStart);
        Assert.Equal(new DateOnly(2026, 10, 27), feed.CoverageEnd);
        Assert.Equal(new[] { new DateOnly(2026, 10, 24), new DateOnly(2026, 10, 25), new DateOnly(2026, 10, 27), new DateOnly(2026, 10, 28) },
            route.OperatingDates.Order().ToArray());
    }

    [Fact]
    public void CalendarWithOnlyAddedDatesDoesNotBecomeDailyOperation()
    {
        var feed = new GtfsScheduleParser().Parse(Archive(calendar: false));
        Assert.Equal(new[] { new DateOnly(2026, 10, 27), new DateOnly(2026, 10, 28) },
            Assert.Single(feed.Routes).OperatingDates.Order().ToArray());
    }

    [Fact]
    public void MissingShapesRejectsFeedWithoutInventingStopConnections()
    {
        var exception = Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(Archive(shapes: false)));
        Assert.Contains("shape", exception.Message, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void UnresolvedCalendarIsRejected()
    {
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(Archive(service: "unknown")));
    }

    [Fact]
    public void ReorderedPointsProduceSameCanonicalGeometry()
    {
        var parser = new GtfsScheduleParser();
        Assert.True(Assert.Single(parser.Parse(Archive()).Routes).Geometry.EqualsExact(
            Assert.Single(parser.Parse(Archive(reversePoints: true)).Routes).Geometry));
    }

    [Fact]
    public void DuplicatePointSequencesAndArchiveTraversalAreRejected()
    {
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(Archive(duplicatePoints: true)));
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(Archive(extraFile: "../routes.txt")));
    }

    [Fact]
    public void EmptyCalendarAndRemovalsRemainUnavailable()
    {
        var content = Rewrite(Archive(), "calendar_dates.txt", "service_id,date,exception_type\nD1,20261024,2\n");
        Assert.Empty(Assert.Single(new GtfsScheduleParser().Parse(content).Routes).OperatingDates);
    }

    [Fact]
    public void TimesBeyond48HoursIncludeOnlyTouchedCivilDates()
    {
        var content = Rewrite(Archive(calendar: false), "stop_times.txt",
            "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,47:55:00,47:55:00,P1,1\nT1,49:10:00,49:10:00,P2,2\n");
        Assert.Equal(new[] { new DateOnly(2026, 10, 28), new DateOnly(2026, 10, 29) },
            Assert.Single(new GtfsScheduleParser().Parse(content).Routes).OperatingDates.Order().ToArray());
    }

    [Fact]
    public void OversizedShapeIdsAndUtf16AreRejectedBeforePersistence()
    {
        var content = Rewrite(Archive(), "shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" + new string('s', 256) + ",49.0,12.1,1\n" + new string('s', 256) + ",49.01,12.11,2\n");
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(content));
        var utf16 = Rewrite(Archive(), "routes.txt", "route_id,route_short_name\nR1,42\n", Encoding.Unicode);
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(utf16));
    }

    [Fact]
    public void MissingEndpointTimesCannotSilentlyTruncateAvailability()
    {
        var endpoints = Rewrite(Archive(), "stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,,,P1,1\nT1,25:10:00,25:10:00,P2,2\n");
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(endpoints));
    }

    [Fact]
    public void UnsupportedFrequencyTemplatesCannotSilentlyTruncateAvailability()
    {
        var frequencies = Rewrite(Archive(), "frequencies.txt", "trip_id,start_time,end_time,headway_secs,exact_times\nT1,23:00:00,27:00:00,3600,1\n");
        var error = Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(frequencies));
        Assert.Contains("frequenc", error.Message, StringComparison.OrdinalIgnoreCase);
    }

    internal static byte[] Rewrite(byte[] content, string file, string value, Encoding? encoding = null)
    {
        using var input = new MemoryStream(content);
        using var original = new ZipArchive(input);
        using var output = new MemoryStream();
        using (var changed = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in original.Entries)
            {
                using var destination = changed.CreateEntry(entry.Name).Open();
                if (entry.Name == file)
                {
                    using var writer = new StreamWriter(destination, encoding ?? new UTF8Encoding(false));
                    writer.Write(value);
                }
                else
                {
                    using var source = entry.Open();
                    source.CopyTo(destination);
                }
            }
            if (original.Entries.All(entry => entry.Name != file))
            {
                using var writer = new StreamWriter(changed.CreateEntry(file).Open(), encoding ?? new UTF8Encoding(false));
                writer.Write(value);
            }
        }
        return output.ToArray();
    }

    internal static byte[] Archive(bool calendar = true, bool shapes = true, string service = "D1", bool reversePoints = false,
        bool duplicatePoints = false, string? extraFile = null, string direction = "0", string longitude = "12.10",
        string addedDate = "20261027", string coverageStart = "20261024", string coverageEnd = "20261027")
    {
        using var output = new MemoryStream();
        using (var archive = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            Add("agency.txt", "agency_id,agency_name,agency_url,agency_timezone\nA1,Test,https://example.invalid,Europe/Berlin\n");
            Add("routes.txt", "route_id,agency_id,route_short_name,route_long_name,route_type\nR1,A1,42,Test route,3\n");
            Add("trips.txt", $"route_id,service_id,trip_id,shape_id,direction_id\nR1,{service},T1,S1,{direction}\n");
            Add("stops.txt", "stop_id,stop_name,stop_lat,stop_lon\nP1,Start,49,12.1\nP2,End,49.01,12.11\n");
            Add("stop_times.txt", "trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,23:55:00,23:55:00,P1,1\nT1,25:10:00,25:10:00,P2,2\n");
            Add("feed_info.txt", $"feed_publisher_name,feed_publisher_url,feed_lang,feed_start_date,feed_end_date\nTest,https://example.invalid,de,{coverageStart},{coverageEnd}\n");
            if (calendar)
            {
                Add("calendar.txt", "service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\nD1,0,0,0,0,0,1,0,20261024,20261027\n");
            }
            Add("calendar_dates.txt", $"service_id,date,exception_type\nD1,{addedDate},1\n");
            if (shapes)
            {
                var points = new[] { $"S1,49.0,{longitude},1", $"S1,49.01,12.11,{(duplicatePoints ? 1 : 2)}" };
                Add("shapes.txt", "shape_id,shape_pt_lat,shape_pt_lon,shape_pt_sequence\n" + string.Join('\n', reversePoints ? points.Reverse() : points) + "\n");
            }
            if (extraFile is not null)
            {
                Add(extraFile, "bad");
            }
            void Add(string name, string value)
            {
                using var writer = new StreamWriter(archive.CreateEntry(name).Open(), new UTF8Encoding(false));
                writer.Write(value);
            }
        }
        return output.ToArray();
    }
}
