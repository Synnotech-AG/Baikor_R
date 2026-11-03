using BaikorR.Core.Features.Alerts.Detection;
using BaikorR.Core.Persistence.Detection;
using BaikorR.Core.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;

namespace BaikorR.Api.Tests;

public sealed class AlertDetectionLoggingPostgisTests
{
    [PostgisFact]
    public async Task FailuresLogQueueMetadataWithoutExceptionMessagesOrPayloads()
    {
        await using var database = await PostgisTestDatabase.CreateAsync();
        await using var context = database.CreateContext();
        await context.AlertDetectionWork.ExecuteDeleteAsync();
        var now = DateTimeOffset.UtcNow;
        var retry = new AlertDetectionWork
        {
            Kind = "testSubject", DetectorType = "testDetector", SubjectId = Guid.NewGuid(),
            CreatedAt = now, AvailableAt = now
        };
        var terminal = new AlertDetectionWork
        {
            Kind = "testSubject", DetectorType = "testDetector", SubjectId = Guid.NewGuid(),
            CreatedAt = now, AvailableAt = now, Attempts = 4
        };
        context.AlertDetectionWork.AddRange(retry, terminal);
        await context.SaveChangesAsync();
        var retryId = retry.Id;
        var terminalId = terminal.Id;
        var logger = new CapturingLogger();
        var processor = new AlertDetectionProcessor(context, [new FailingHandler()], new FixedTimeProvider(now), logger);

        Assert.True(await processor.ProcessNextAsync(default));
        Assert.True(await processor.ProcessNextAsync(default));

        Assert.Equal(2, logger.Entries.Count);
        var retryLog = logger.Entries[0];
        Assert.Equal(LogLevel.Information, retryLog.Level);
        Assert.Equal(retryId, retryLog.Values["WorkId"]);
        Assert.Equal(1, retryLog.Values["Attempt"]);
        var terminalLog = logger.Entries[1];
        Assert.Equal(LogLevel.Warning, terminalLog.Level);
        Assert.Equal(terminalId, terminalLog.Values["WorkId"]);
        Assert.Equal(5, terminalLog.Values["Attempt"]);
        Assert.All(logger.Entries, entry =>
        {
            Assert.Equal("testSubject", entry.Values["WorkKind"]);
            Assert.Equal("testDetector", entry.Values["DetectorType"]);
            Assert.Equal(nameof(InvalidOperationException), entry.Values["FailureType"]);
            Assert.Null(entry.Exception);
            Assert.DoesNotContain(FailingHandler.PrivatePayload, entry.Message);
            Assert.DoesNotContain(entry.Values.Values, value => value?.ToString()?.Contains(FailingHandler.PrivatePayload) == true);
        });
        Assert.Equal(1, (await context.AlertDetectionWork.SingleAsync(item => item.Id == retryId)).Attempts);
        var failed = await context.AlertDetectionWork.SingleAsync(item => item.Id == terminalId);
        Assert.Equal(5, failed.Attempts);
        Assert.Equal("evaluationFailed", failed.FailureCode);
        Assert.Null(failed.CompletedAt);
    }

    private sealed class FailingHandler : IAlertDetectionHandler
    {
        public const string PrivatePayload = "source-payload-must-stay-private";
        public string Type => "testDetector";
        public IReadOnlyCollection<string> SupportedTriggerKinds => ["testSubject"];
        public Task<DetectionProcessOutcome> ProcessAsync(AlertDetectionWork work, DateTimeOffset now, CancellationToken cancellationToken) =>
            throw new InvalidOperationException(PrivatePayload);
        public Task<DetectionScanPage> ScanPageAsync(Guid cursor, int pageSize, CancellationToken cancellationToken) =>
            Task.FromResult(new DetectionScanPage([], null));
    }

    private sealed record LogEntry(LogLevel Level, string Message, Exception? Exception, IReadOnlyDictionary<string, object?> Values);

    private sealed class CapturingLogger : ILogger<AlertDetectionProcessor>
    {
        public List<LogEntry> Entries { get; } = [];
        public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
        public bool IsEnabled(LogLevel logLevel) => true;
        public void Log<TState>(LogLevel logLevel, EventId eventId, TState state, Exception? exception, Func<TState, Exception?, string> formatter) =>
            Entries.Add(new(logLevel, formatter(state, exception), exception,
                ((IEnumerable<KeyValuePair<string, object?>>)state!).ToDictionary(pair => pair.Key, pair => pair.Value)));
    }
}
