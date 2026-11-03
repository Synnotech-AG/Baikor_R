using System.IO.Compression;
using BaikorR.Core.Importers.Gtfs;

namespace BaikorR.Api.Tests;

public sealed class GtfsDstTests
{
    [Fact]
    public void SpringNoonOriginPreservesPreviousCivilDateAndSignedSourceOffsets()
    {
        var content = Feed("20260329", "00:30:00", "01:30:00");
        var feed = new GtfsScheduleParser().Parse(content);
        var route = Assert.Single(feed.Routes);

        Assert.Equal([new DateOnly(2026, 3, 28), new DateOnly(2026, 3, 29)], route.OperatingDates.Order());
        Assert.Equal([-1, 0], route.ServiceDayOffsets[new(2026, 3, 29)]);
        Assert.Equal(new DateOnly(2026, 3, 29), feed.CoverageStart);
        Assert.Equal(new DateOnly(2026, 3, 29), feed.CoverageEnd);
    }

    [Fact]
    public void AutumnRepeatedHourRemainsOneCivilDate()
    {
        var route = Assert.Single(new GtfsScheduleParser().Parse(Feed("20261025", "00:30:00", "02:30:00")).Routes);

        Assert.Equal([new DateOnly(2026, 10, 25)], route.OperatingDates.Order());
        Assert.Equal([0], route.ServiceDayOffsets[new(2026, 10, 25)]);
    }

    [Fact]
    public void LongTripAcrossAutumnChangeUsesElapsedHoursBeforeClassifyingCivilDates()
    {
        var route = Assert.Single(new GtfsScheduleParser().Parse(Feed("20261024", "47:55:00", "48:10:00")).Routes);

        Assert.Equal([new DateOnly(2026, 10, 25)], route.OperatingDates.Order());
        Assert.Equal([1], route.ServiceDayOffsets[new(2026, 10, 24)]);
    }

    [Fact]
    public void MissingEmptyAndUnsupportedAgencyTimezonesCannotImplyBerlinAvailability()
    {
        var original = Feed("20260329", "00:30:00", "01:30:00");
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(Remove(original, "agency.txt")));
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(GtfsRouteTests.Rewrite(original, "agency.txt", "agency_id,agency_timezone\n")));
        Assert.Throws<InvalidDataException>(() => new GtfsScheduleParser().Parse(GtfsRouteTests.Rewrite(original, "agency.txt", "agency_id,agency_timezone\nA1,UTC\n")));
    }

    private static byte[] Feed(string serviceDate, string first, string last) => GtfsRouteTests.Rewrite(
        GtfsRouteTests.Archive(calendar: false, addedDate: serviceDate, coverageStart: serviceDate, coverageEnd: serviceDate),
        "stop_times.txt", $"trip_id,arrival_time,departure_time,stop_id,stop_sequence\nT1,{first},{first},P1,1\nT1,{last},{last},P2,2\n");

    private static byte[] Remove(byte[] content, string file)
    {
        using var input = new MemoryStream(content);
        using var original = new ZipArchive(input);
        using var output = new MemoryStream();
        using (var changed = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true))
        {
            foreach (var entry in original.Entries.Where(entry => entry.Name != file))
            {
                using var source = entry.Open();
                using var destination = changed.CreateEntry(entry.Name).Open();
                source.CopyTo(destination);
            }
        }
        return output.ToArray();
    }
}
