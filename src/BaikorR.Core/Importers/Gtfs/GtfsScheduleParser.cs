using System.Globalization;
using System.IO.Compression;
using System.Text;
using Microsoft.VisualBasic.FileIO;
using NetTopologySuite.Geometries;
using ProjNet.CoordinateSystems;
using ProjNet.CoordinateSystems.Transformations;

namespace BaikorR.Core.Importers.Gtfs;

public sealed record ParsedGtfsRoute(string ExternalRouteId, string ExternalShapeId, string Title,
    string? Description, MultiLineString Geometry, IReadOnlySet<DateOnly> OperatingDates)
{
    public IReadOnlyDictionary<DateOnly, int[]> ServiceDayOffsets { get; init; } = new Dictionary<DateOnly, int[]>();
    public string PathTitle { get; init; } = string.Empty;
}

public sealed record ParsedGtfsFeed(IReadOnlyList<ParsedGtfsRoute> Routes, int RouteCount, int TripCount,
    int ShapeCount, DateOnly CoverageStart, DateOnly CoverageEnd, IReadOnlyList<string> Warnings)
{
    public string? SourceIdentity { get; init; }
}

public sealed class GtfsScheduleParser
{
    public const int MaximumArchiveBytes = 25 * 1024 * 1024;
    private const long MaximumExpandedBytes = 256L * 1024 * 1024;
    private const int MaximumRows = 2_000_000;
    private static readonly GeometryFactory GeometryFactory = new(new PrecisionModel(), 25832);
    private static readonly TimeZoneInfo Berlin = TimeZoneInfo.FindSystemTimeZoneById("Europe/Berlin");

    public ParsedGtfsFeed Parse(byte[] content, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (content.Length == 0 || content.Length > MaximumArchiveBytes)
        {
            throw new InvalidDataException("The GTFS ZIP must contain between 1 byte and 25 MiB.");
        }

        using var memory = new MemoryStream(content, writable: false);
        using var archive = new ZipArchive(memory, ZipArchiveMode.Read);
        var entries = ReadEntries(archive, cancellationToken);
        var warnings = new List<string>();
        var agencies = Read(entries, "agency.txt", true, cancellationToken, "agency_timezone");
        if (agencies.Count == 0)
        {
            throw new InvalidDataException("A nonempty agency.txt with an explicit Europe/Berlin timezone is required.");
        }
        foreach (var row in agencies)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (row.Required("agency_timezone") != "Europe/Berlin")
            {
                throw new InvalidDataException("Only Europe/Berlin service-day calendars are supported.");
            }
        }

        var routes = Unique(Read(entries, "routes.txt", true, cancellationToken, "route_id"), "route_id", cancellationToken);
        var trips = Unique(Read(entries, "trips.txt", true, cancellationToken, "route_id", "service_id", "trip_id", "shape_id"), "trip_id", cancellationToken);
        if (Read(entries, "frequencies.txt", false, cancellationToken, "trip_id", "start_time", "end_time", "headway_secs").Count > 0)
        {
            throw new InvalidDataException("This GTFS feed uses frequency-based template trips. Frequency expansion is not supported for route-conflict import; supply explicit scheduled trips and endpoint times.");
        }
        var stops = Unique(Read(entries, "stops.txt", true, cancellationToken, "stop_id"), "stop_id", cancellationToken);
        if (routes.Count == 0 || trips.Count == 0)
        {
            throw new InvalidDataException("The feed has no trips with proven route availability.");
        }

        var shapeRows = Read(entries, "shapes.txt", true, cancellationToken, "shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence");
        var transform = new CoordinateTransformationFactory().CreateFromCoordinateSystems(
            GeographicCoordinateSystem.WGS84, ProjectedCoordinateSystem.WGS84_UTM(32, true)).MathTransform;
        var shapes = new Dictionary<string, MultiLineString>(StringComparer.Ordinal);
        foreach (var shape in shapeRows.GroupBy(row => row.Required("shape_id"), StringComparer.Ordinal))
        {
            cancellationToken.ThrowIfCancellationRequested();
            var ordered = shape.Select(row => (Sequence: row.NonnegativeInt("shape_pt_sequence"), Row: row)).OrderBy(row => row.Sequence).ToArray();
            if (ordered.Length < 2 || ordered.Select(row => row.Sequence).Distinct().Count() != ordered.Length)
            {
                throw new InvalidDataException("A shape must have at least two points with distinct sequence values.");
            }

            var points = ordered.Select(point =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var latitude = point.Row.Number("shape_pt_lat");
                var longitude = point.Row.Number("shape_pt_lon");
                // EPSG:25832's usable area is Europe, UTM zone 32. Reject unrelated feeds instead of silently projecting them.
                if (latitude < 35 || latitude > 84 || longitude < 6 || longitude > 12.5)
                {
                    throw new InvalidDataException("Shape coordinates are outside the supported EPSG:25832 area.");
                }
                var projected = transform.Transform([longitude, latitude]);
                return new Coordinate(projected[0], projected[1]);
            }).ToArray();
            var geometry = GeometryFactory.CreateMultiLineString([GeometryFactory.CreateLineString(points)]);
            if (geometry.IsEmpty || !geometry.IsValid || !double.IsFinite(geometry.Length) || geometry.Length <= 0)
            {
                throw new InvalidDataException("A GTFS shape must have a usable nonzero path.");
            }
            shapes.Add(shape.Key, geometry);
        }

        var calendars = Unique(Read(entries, "calendar.txt", false, cancellationToken, "service_id", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "start_date", "end_date"), "service_id", cancellationToken);
        var exceptions = Read(entries, "calendar_dates.txt", false, cancellationToken, "service_id", "date", "exception_type");
        if (calendars.Count == 0 && exceptions.Count == 0)
        {
            throw new InvalidDataException("The GTFS feed must include resolvable service calendars.");
        }

        var serviceDates = new Dictionary<string, HashSet<DateOnly>>(StringComparer.Ordinal);
        var coverageDates = new List<DateOnly>();
        string[] weekdays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        foreach (var (id, row) in calendars)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var start = row.Date("start_date");
            var end = row.Date("end_date");
            if (end < start || end.DayNumber - start.DayNumber > 3660)
            {
                throw new InvalidDataException("A service calendar must be ordered and cover at most ten years.");
            }
            var days = weekdays.Select(day => row.Flag(day)).ToArray();
            var dates = new HashSet<DateOnly>();
            for (var day = start; day <= end; day = day.AddDays(1))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (days[(int)day.DayOfWeek])
                {
                    dates.Add(day);
                }
            }
            serviceDates.Add(id, dates);
            coverageDates.Add(start);
            coverageDates.Add(end);
        }
        var exceptionKeys = new HashSet<(string, DateOnly)>();
        foreach (var row in exceptions)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var id = row.Required("service_id");
            var day = row.Date("date");
            if (!exceptionKeys.Add((id, day)))
            {
                throw new InvalidDataException("Duplicate service calendar exception.");
            }
            var type = row.Required("exception_type");
            if (type != "1" && type != "2")
            {
                throw new InvalidDataException("Calendar exception_type must be 1 or 2.");
            }
            if (!serviceDates.TryGetValue(id, out var dates))
            {
                dates = [];
                serviceDates.Add(id, dates);
            }
            if (type == "1")
            {
                dates.Add(day);
            }
            else
            {
                dates.Remove(day);
            }
            coverageDates.Add(day);
        }
        var coverageStart = coverageDates.Min();
        var coverageEnd = coverageDates.Max();
        var feedInfo = Read(entries, "feed_info.txt", false, cancellationToken);
        if (feedInfo.Count > 1)
        {
            throw new InvalidDataException("feed_info.txt must have at most one record.");
        }
        if (feedInfo.Count == 1)
        {
            var info = feedInfo[0];
            if (info.Optional("feed_start_date") is not null)
            {
                coverageStart = info.Date("feed_start_date");
            }
            if (info.Optional("feed_end_date") is not null)
            {
                coverageEnd = info.Date("feed_end_date");
            }
        }
        if (coverageEnd < coverageStart || coverageEnd.DayNumber - coverageStart.DayNumber > 3660)
        {
            throw new InvalidDataException("Feed coverage must be ordered and cover at most ten years.");
        }

        var stopTimes = Read(entries, "stop_times.txt", true, cancellationToken, "trip_id", "stop_id", "stop_sequence", "arrival_time", "departure_time");
        var tripTimes = new Dictionary<string, (int FirstSeconds, int LastSeconds)>(StringComparer.Ordinal);
        var tripEndpoints = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var group in stopTimes.GroupBy(row => row.Required("trip_id"), StringComparer.Ordinal))
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (!trips.ContainsKey(group.Key))
            {
                throw new InvalidDataException("A stop_times record references an unresolved trip.");
            }
            var ordered = group.Select(row => (Sequence: row.NonnegativeInt("stop_sequence"), Row: row)).OrderBy(row => row.Sequence).ToArray();
            if (ordered.Length < 2 || new[] { ordered[0].Row, ordered[^1].Row }.Any(row => row.Optional("arrival_time") is null || row.Optional("departure_time") is null))
            {
                throw new InvalidDataException("Each trip must have at least two stops and explicit arrival/departure times at both endpoints to establish civil-day availability.");
            }
            if (ordered.Select(row => row.Sequence).Distinct().Count() != ordered.Length)
            {
                throw new InvalidDataException("Duplicate stop_sequence in a trip.");
            }
            var times = new List<int>();
            foreach (var (_, row) in ordered)
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!stops.ContainsKey(row.Required("stop_id")))
                {
                    throw new InvalidDataException("A stop_times record references an unresolved stop.");
                }
                foreach (var field in new[] { "arrival_time", "departure_time" })
                {
                    if (row.Optional(field) is { } value)
                    {
                        var seconds = ParseTime(value);
                        if (times.Count > 0 && seconds < times[^1])
                        {
                            throw new InvalidDataException("Trip times must increase in stop sequence order; use hours above 24 for overnight service.");
                        }
                        times.Add(seconds);
                    }
                }
            }
            if (times.Count == 0)
            {
                throw new InvalidDataException("A trip must have times to establish civil-day availability.");
            }
            tripTimes.Add(group.Key, (times[0], times[^1]));
            var firstStop = stops[ordered[0].Row.Required("stop_id")];
            var lastStop = stops[ordered[^1].Row.Required("stop_id")];
            tripEndpoints.Add(group.Key, $"{firstStop.Optional("stop_name") ?? firstStop.Required("stop_id")} → {lastStop.Optional("stop_name") ?? lastStop.Required("stop_id")}");
        }

        var routeDates = new Dictionary<(string Route, string Shape), HashSet<DateOnly>>();
        var sourceDays = new Dictionary<(string Route, string Shape), Dictionary<DateOnly, HashSet<int>>>();
        var endpointLabels = new Dictionary<(string Route, string Shape), SortedSet<string>>();
        foreach (var (id, trip) in trips)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var routeId = trip.Required("route_id");
            var shapeId = trip.Required("shape_id");
            if (!routes.ContainsKey(routeId) || !shapes.ContainsKey(shapeId))
            {
                throw new InvalidDataException("A trip references an unresolved route or usable shape. No stop-connection fallback is used.");
            }
            if (!serviceDates.TryGetValue(trip.Required("service_id"), out var dates) || !tripTimes.TryGetValue(id, out var time))
            {
                throw new InvalidDataException("A trip references an unresolved service calendar or has no stop times.");
            }
            var key = (routeId, shapeId);
            if (!routeDates.TryGetValue(key, out var operatingDates))
            {
                operatingDates = [];
                routeDates.Add(key, operatingDates);
                sourceDays.Add(key, []);
                endpointLabels.Add(key, new SortedSet<string>(StringComparer.Ordinal));
            }
            endpointLabels[key].Add(tripEndpoints[id]);
            foreach (var day in dates.Where(day => day >= coverageStart && day <= coverageEnd))
            {
                cancellationToken.ThrowIfCancellationRequested();
                if (!sourceDays[key].TryGetValue(day, out var dayOffsets))
                {
                    dayOffsets = [];
                    sourceDays[key].Add(day, dayOffsets);
                }
                // GTFS counts elapsed seconds from local noon minus 12 elapsed hours. On a DST
                // transition this can differ from civil midnight and can touch the preceding date.
                var noonUtc = TimeZoneInfo.ConvertTimeToUtc(day.ToDateTime(new TimeOnly(12, 0)), Berlin);
                var originUtc = noonUtc.AddHours(-12);
                var first = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(originUtc.AddSeconds(time.FirstSeconds), Berlin));
                var last = DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(originUtc.AddSeconds(time.LastSeconds), Berlin));
                for (var civilDay = first; civilDay <= last; civilDay = civilDay.AddDays(1))
                {
                    operatingDates.Add(civilDay);
                    dayOffsets.Add(civilDay.DayNumber - day.DayNumber);
                }
            }
        }
        if (shapes.Count > routeDates.Keys.Select(key => key.Shape).Distinct().Count())
        {
            warnings.Add("Unreferenced shapes are excluded; paths without trips have no proven service.");
        }
        if (routes.Count > routeDates.Keys.Select(key => key.Route).Distinct().Count())
        {
            warnings.Add("Routes without trips are excluded; no daily availability is inferred.");
        }
        var labels = endpointLabels.ToDictionary(pair => pair.Key, pair => pair.Value.Min!);
        var duplicateLabels = labels.GroupBy(pair => (pair.Key.Route, pair.Value)).Where(group => group.Count() > 1)
            .SelectMany(group => group.Select(pair => pair.Key)).ToHashSet();
        var parsedRoutes = routeDates.OrderBy(pair => pair.Key.Route, StringComparer.Ordinal).ThenBy(pair => pair.Key.Shape, StringComparer.Ordinal)
            .Select(pair =>
            {
                cancellationToken.ThrowIfCancellationRequested();
                var row = routes[pair.Key.Route];
                var name = row.Optional("route_short_name") ?? row.Optional("route_long_name") ?? pair.Key.Route;
                if (name.Length > 200 || (row.Optional("route_desc")?.Length ?? 0) > 10000)
                {
                    throw new InvalidDataException("Route title or description exceeds the supported limit.");
                }
                return new ParsedGtfsRoute(pair.Key.Route, pair.Key.Shape, name, row.Optional("route_desc"), shapes[pair.Key.Shape], pair.Value)
                {
                    PathTitle = PathLabel(labels[pair.Key], duplicateLabels.Contains(pair.Key) ? pair.Key.Shape : null),
                    ServiceDayOffsets = sourceDays[pair.Key].OrderBy(item => item.Key).ToDictionary(item => item.Key, item => item.Value.Order().ToArray())
                };
            }).ToArray();
        return new ParsedGtfsFeed(parsedRoutes, routes.Count, trips.Count, shapes.Count, coverageStart, coverageEnd, warnings)
        {
            SourceIdentity = GtfsSourceIdentity.Create(agencies.Select(row => row.Optional("agency_url")))
        };
    }

    private static string PathLabel(string endpoints, string? shapeId)
    {
        var suffix = shapeId is null ? string.Empty : $" ({(shapeId.Length <= 64 ? shapeId : Convert.ToHexString(System.Security.Cryptography.SHA256.HashData(Encoding.UTF8.GetBytes(shapeId)))[..16])})";
        return endpoints[..Math.Min(endpoints.Length, 200 - suffix.Length)] + suffix;
    }

    private static Dictionary<string, ZipArchiveEntry> ReadEntries(ZipArchive archive, CancellationToken cancellationToken)
    {
        if (archive.Entries.Count > 100)
        {
            throw new InvalidDataException("The GTFS ZIP contains too many entries.");
        }
        long expanded = 0;
        var entries = new Dictionary<string, ZipArchiveEntry>(StringComparer.OrdinalIgnoreCase);
        foreach (var entry in archive.Entries)
        {
            cancellationToken.ThrowIfCancellationRequested();
            if (entry.FullName != entry.Name || entry.FullName.Contains(':') || entry.FullName.Contains('\\') || entry.Name is "" or "." or "..")
            {
                throw new InvalidDataException("GTFS ZIP entries must be files at the archive root; paths are not allowed.");
            }
            expanded = checked(expanded + entry.Length);
            if (expanded > MaximumExpandedBytes || entry.Length > 128L * 1024 * 1024)
            {
                throw new InvalidDataException("The expanded GTFS ZIP exceeds the supported limit.");
            }
            if (!entries.TryAdd(entry.Name, entry))
            {
                throw new InvalidDataException("The GTFS ZIP contains duplicate filenames.");
            }
        }
        return entries;
    }

    private static List<CsvRow> Read(Dictionary<string, ZipArchiveEntry> entries, string file, bool required,
        CancellationToken cancellationToken, params string[] columns)
    {
        cancellationToken.ThrowIfCancellationRequested();
        if (!entries.TryGetValue(file, out var entry))
        {
            if (required)
            {
                throw new InvalidDataException($"GTFS file {file} is required for a route-conflict import with supplied shapes.");
            }
            return [];
        }
        using var stream = new BoundedReadStream(entry.Open(), entry.Length, cancellationToken);
        try
        {
            using var parser = new TextFieldParser(stream, new UTF8Encoding(false, true), detectEncoding: false);
            parser.TextFieldType = FieldType.Delimited;
            parser.SetDelimiters(",");
            parser.HasFieldsEnclosedInQuotes = true;
            parser.TrimWhiteSpace = false;
            var header = parser.ReadFields();
            if (header is { Length: > 0 })
            {
                header[0] = header[0].TrimStart('\uFEFF');
            }
            if (header is null || header.Length == 0 || header.Any(string.IsNullOrWhiteSpace) || header.Distinct(StringComparer.Ordinal).Count() != header.Length || columns.Except(header).Any())
            {
                throw new InvalidDataException($"GTFS {file} has missing or duplicate CSV columns.");
            }
            var result = new List<CsvRow>();
            while (!parser.EndOfData)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var values = parser.ReadFields();
                if (values is null || values.Length != header.Length || values.Any(value => value.Length > 10000 || value.Contains('\0')))
                {
                    throw new InvalidDataException($"GTFS {file} contains an invalid CSV row.");
                }
                result.Add(new CsvRow(header.Zip(values).ToDictionary(pair => pair.First, pair => pair.Second, StringComparer.Ordinal)));
                if (result.Count > MaximumRows)
                {
                    throw new InvalidDataException($"GTFS {file} has too many rows.");
                }
            }
            return result;
        }
        catch (MalformedLineException)
        {
            throw new InvalidDataException($"GTFS {file} contains malformed CSV.");
        }
        catch (DecoderFallbackException)
        {
            throw new InvalidDataException($"GTFS {file} must use UTF-8 text.");
        }
    }

    private static Dictionary<string, CsvRow> Unique(List<CsvRow> rows, string field, CancellationToken cancellationToken)
    {
        var result = new Dictionary<string, CsvRow>(StringComparer.Ordinal);
        foreach (var row in rows)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var id = row.Required(field);
            if (id.Length > 255 || !result.TryAdd(id, row))
            {
                throw new InvalidDataException($"GTFS {field} values must be distinct and at most 255 characters.");
            }
        }
        return result;
    }

    private static int ParseTime(string value)
    {
        var fields = value.Split(':');
        if (fields.Length != 3 || fields.Any(field => !int.TryParse(field, NumberStyles.None, CultureInfo.InvariantCulture, out _)))
        {
            throw new InvalidDataException("GTFS times must use nonnegative HH:MM:SS, allowing hours above 24.");
        }
        var hour = int.Parse(fields[0], CultureInfo.InvariantCulture);
        var minute = int.Parse(fields[1], CultureInfo.InvariantCulture);
        var second = int.Parse(fields[2], CultureInfo.InvariantCulture);
        if (hour > 167 || minute > 59 || second > 59)
        {
            throw new InvalidDataException("GTFS times must be valid and shorter than seven days.");
        }
        return hour * 3600 + minute * 60 + second;
    }

    private sealed record CsvRow(Dictionary<string, string> Values)
    {
        public string? Optional(string key) => Values.TryGetValue(key, out var value) && !string.IsNullOrWhiteSpace(value) ? value : null;
        public string Required(string key)
        {
            var value = Optional(key) ?? throw new InvalidDataException($"GTFS {key} is required.");
            if (key.EndsWith("_id", StringComparison.Ordinal) && (value.Length > 255 || value.Any(char.IsControl)))
            {
                throw new InvalidDataException($"GTFS {key} must contain at most 255 characters without control characters.");
            }
            return value;
        }
        public DateOnly Date(string key) => DateOnly.TryParseExact(Required(key), "yyyyMMdd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var value) && value.Year is >= 1900 and < 9999
            ? value : throw new InvalidDataException($"GTFS {key} must be a valid YYYYMMDD date.");
        public double Number(string key) => double.TryParse(Required(key), NumberStyles.Float, CultureInfo.InvariantCulture, out var value) && double.IsFinite(value)
            ? value : throw new InvalidDataException($"GTFS {key} must be finite.");
        public int NonnegativeInt(string key) => int.TryParse(Required(key), NumberStyles.None, CultureInfo.InvariantCulture, out var value)
            ? value : throw new InvalidDataException($"GTFS {key} must be a nonnegative integer.");
        public bool Flag(string key) => Required(key) switch { "1" => true, "0" => false, _ => throw new InvalidDataException($"GTFS {key} must be 0 or 1.") };
    }

    private sealed class BoundedReadStream(Stream inner, long maximumBytes, CancellationToken cancellationToken) : Stream
    {
        private long consumed;
        public override bool CanRead => true;
        public override bool CanSeek => false;
        public override bool CanWrite => false;
        public override long Length => throw new NotSupportedException();
        public override long Position { get => consumed; set => throw new NotSupportedException(); }
        public override int Read(byte[] buffer, int offset, int count) => Read(buffer.AsSpan(offset, count));
        public override int Read(Span<byte> buffer)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var read = inner.Read(buffer);
            consumed += read;
            if (consumed > maximumBytes)
            {
                throw new InvalidDataException("The GTFS entry exceeds its declared expanded size.");
            }
            return read;
        }
        public override void Flush() => throw new NotSupportedException();
        public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException();
        public override void SetLength(long value) => throw new NotSupportedException();
        public override void Write(byte[] buffer, int offset, int count) => throw new NotSupportedException();
        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                inner.Dispose();
            }
            base.Dispose(disposing);
        }
    }
}
