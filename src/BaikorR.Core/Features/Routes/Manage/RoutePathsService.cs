using BaikorR.Core.Persistence.Sessions;
using BaikorR.Core.Persistence.Entities;
using BaikorR.Core.Shared.Results;
using FluentResults;
using NetTopologySuite.Geometries;

namespace BaikorR.Core.Features.Routes.Manage;

public interface IRoutePathsService
{
    Task<Result<RoutePathsPage>> ListAsync(string? search, bool includeSuppressed, int page, int pageSize, CancellationToken cancellationToken);
    Task<Result<RoutePathResponse>> GetAsync(Guid id, CancellationToken cancellationToken, bool includeSuppressed = false);
    Task<Result<RoutePathResponse>> CreateAsync(RoutePathWriteRequest request, CancellationToken cancellationToken);
    Task<Result<RoutePathResponse>> UpdateAsync(Guid id, RoutePathWriteRequest request, CancellationToken cancellationToken);
    Task<Result> SuppressAsync(Guid id, CancellationToken cancellationToken);
    Task<Result<RoutePathResponse>> SuppressPathAsync(Guid id, Guid pathId, RoutePathDeleteRequest request, CancellationToken cancellationToken);
    Task<Result<RoutePathResponse>> RestoreAsync(Guid id, RoutePathRestoreRequest request, CancellationToken cancellationToken);
    Task<Result<RoutePathResponse>> RestorePathAsync(Guid id, Guid pathId, RoutePathRestoreRequest request, CancellationToken cancellationToken);
}

public sealed class RoutePathsService(IRoutePathsSession session, TimeProvider timeProvider) : IRoutePathsService
{
    public async Task<Result<RoutePathsPage>> ListAsync(string? search, bool includeSuppressed, int page, int pageSize, CancellationToken cancellationToken)
    {
        if (page < 1 || page > 1000000 || pageSize < 1 || pageSize > 100 || (search?.Length ?? 0) > 200)
        {
            return ApiError.Validation("routes.list.invalid", "Page must be positive, pageSize must be 1–100 and search at most 200 characters.", "page");
        }
        var (items, total) = await session.ListAsync(search, includeSuppressed, page, pageSize, cancellationToken);
        return new RoutePathsPage(items.Select(RoutePathResponse.Create).ToArray(), total, page, pageSize);
    }

    public async Task<Result<RoutePathResponse>> GetAsync(Guid id, CancellationToken cancellationToken, bool includeSuppressed = false)
    {
        var route = await session.GetAsync(id, false, cancellationToken);
        return route is null || (route.IsSuppressed && !includeSuppressed) ? NotFound() : RoutePathResponse.Create(route);
    }

    public async Task<Result<RoutePathResponse>> CreateAsync(RoutePathWriteRequest request, CancellationToken cancellationToken)
    {
        var validation = Parse(request, false);
        if (validation.IsFailed)
        {
            return Result.Fail<RoutePathResponse>(validation.Errors);
        }
        var input = validation.Value;
        var now = timeProvider.GetUtcNow();
        var route = new RouteDefinition
        {
            Id = Guid.NewGuid(),
            Title = input.Title,
            Description = input.Description,
            CreatedAt = now,
            UpdatedAt = now
        };
        foreach (var path in input.Paths)
        {
            route.Paths.Add(CreatePath(route, path, now));
        }
        session.Add(route);
        return await session.SaveChangesAsync(cancellationToken) ? RoutePathResponse.Create(route) : Conflict();
    }

    public async Task<Result<RoutePathResponse>> UpdateAsync(Guid id, RoutePathWriteRequest request, CancellationToken cancellationToken)
    {
        var validation = Parse(request, true);
        if (validation.IsFailed)
        {
            return Result.Fail<RoutePathResponse>(validation.Errors);
        }
        var input = validation.Value;
        var route = await session.GetAsync(id, true, cancellationToken);
        if (route is null)
        {
            return NotFound();
        }
        if (route.SourceId is not null)
        {
            return ApiError.Conflict("routes.sourceManaged", "Imported paths and calendars are managed by their source. Create an independent manual route to edit the path.");
        }
        if (route.IsSuppressed)
        {
            return ApiError.Conflict("routes.suppressed", "A suppressed route cannot be edited.");
        }
        var paths = input.Paths;
        if (request.Paths is null)
        {
            if (route.Paths.Count != 1)
            {
                return ApiError.Validation("routes.paths.required", "Provide paths when editing a route with multiple paths.", "paths");
            }
            paths = [paths[0] with { Id = route.Paths[0].Id }];
        }
        var existingPaths = route.Paths.ToDictionary(path => path.Id);
        if (paths.Any(path => path.Id is { } pathId && !existingPaths.ContainsKey(pathId)))
        {
            return ApiError.Validation("routes.paths.id.invalid", "A path ID must belong to the edited route.", "paths");
        }
        var submittedPathIds = paths.Where(path => path.Id.HasValue).Select(path => path.Id.GetValueOrDefault()).ToHashSet();
        session.SetExpectedVersion(route, input.Version);
        route.Title = input.Title;
        route.Description = input.Description;
        route.UpdatedAt = timeProvider.GetUtcNow();
        foreach (var old in route.Paths.Where(existing => !existing.IsSuppressed && !submittedPathIds.Contains(existing.Id)).ToArray())
        {
            session.RemovePath(route, old);
        }
        foreach (var pathInput in paths)
        {
            var path = pathInput.Id is { } pathId ? existingPaths[pathId] : null;
            if (path is null)
            {
                session.AddPath(route, CreatePath(route, pathInput, route.UpdatedAt));
                continue;
            }
            path.Title = pathInput.Title;
            path.UpdatedAt = route.UpdatedAt;
            foreach (var old in path.Versions.ToArray())
            {
                session.RemoveVersion(path, old);
            }
            session.AddVersion(path, CreateVersion(path, pathInput));
        }
        return await session.SaveChangesAsync(cancellationToken) ? RoutePathResponse.Create(route) : Conflict();
    }

    public async Task<Result> SuppressAsync(Guid id, CancellationToken cancellationToken)
    {
        var route = await session.GetAsync(id, true, cancellationToken);
        if (route is null)
        {
            return Result.Fail(NotFound());
        }
        if (route.IsSuppressed)
        {
            return Result.Ok();
        }
        route.IsSuppressed = true;
        route.UpdatedAt = timeProvider.GetUtcNow();
        return await session.SaveChangesAsync(cancellationToken) ? Result.Ok() : Result.Fail(Conflict());
    }

    public async Task<Result<RoutePathResponse>> SuppressPathAsync(Guid id, Guid pathId, RoutePathDeleteRequest request, CancellationToken cancellationToken)
    {
        if (request.Version is null)
        {
            return ApiError.Validation("routes.version.required", "The current route version is required.", "version");
        }
        var route = await session.GetAsync(id, true, cancellationToken);
        var path = route?.Paths.SingleOrDefault(item => item.Id == pathId);
        if (route is null || path is null)
        {
            return ApiError.NotFound("routes.paths.notFound", "The route path was not found.");
        }
        if (route.Version != request.Version.Value)
        {
            return Conflict();
        }
        if (route.IsSuppressed)
        {
            return ApiError.Conflict("routes.suppressed", "Restore the route before deleting one of its paths.");
        }
        if (path.IsSuppressed)
        {
            return RoutePathResponse.Create(route);
        }
        session.SetExpectedVersion(route, request.Version.Value);
        path.IsSuppressed = true;
        path.UpdatedAt = timeProvider.GetUtcNow();
        route.UpdatedAt = path.UpdatedAt;
        return await session.SaveChangesAsync(cancellationToken) ? RoutePathResponse.Create(route) : Conflict();
    }

    public async Task<Result<RoutePathResponse>> RestoreAsync(Guid id, RoutePathRestoreRequest request, CancellationToken cancellationToken)
    {
        if (request.Version is null)
        {
            return ApiError.Validation("routes.version.required", "The current route version is required.", "version");
        }
        var route = await session.GetAsync(id, true, cancellationToken);
        if (route is null)
        {
            return NotFound();
        }
        if (route.Version != request.Version.Value)
        {
            return Conflict();
        }
        if (!route.IsSuppressed)
        {
            return RoutePathResponse.Create(route);
        }
        session.SetExpectedVersion(route, request.Version.Value);
        route.IsSuppressed = false;
        route.UpdatedAt = timeProvider.GetUtcNow();
        return await session.SaveChangesAsync(cancellationToken) ? RoutePathResponse.Create(route) : Conflict();
    }

    public async Task<Result<RoutePathResponse>> RestorePathAsync(Guid id, Guid pathId, RoutePathRestoreRequest request, CancellationToken cancellationToken)
    {
        if (request.Version is null)
        {
            return ApiError.Validation("routes.version.required", "The current route version is required.", "version");
        }
        var route = await session.GetAsync(id, true, cancellationToken);
        var path = route?.Paths.SingleOrDefault(item => item.Id == pathId);
        if (route is null || path is null)
        {
            return ApiError.NotFound("routes.paths.notFound", "The route path was not found.");
        }
        if (route.Version != request.Version.Value)
        {
            return Conflict();
        }
        if (route.IsSuppressed)
        {
            return ApiError.Conflict("routes.suppressed", "Restore the route before restoring one of its paths.");
        }
        if (!path.IsSuppressed)
        {
            return RoutePathResponse.Create(route);
        }
        session.SetExpectedVersion(route, request.Version.Value);
        path.IsSuppressed = false;
        path.UpdatedAt = timeProvider.GetUtcNow();
        route.UpdatedAt = path.UpdatedAt;
        return await session.SaveChangesAsync(cancellationToken) ? RoutePathResponse.Create(route) : Conflict();
    }

    private static RoutePath CreatePath(RouteDefinition route, ParsedRoutePath input, DateTimeOffset now)
    {
        var path = new RoutePath
        {
            Id = Guid.NewGuid(),
            RouteDefinitionId = route.Id,
            RouteDefinition = route,
            Title = input.Title,
            CreatedAt = now,
            UpdatedAt = now
        };
        path.Versions.Add(CreateVersion(path, input));
        return path;
    }

    private static RoutePathVersion CreateVersion(RoutePath path, ParsedRoutePath input) => new()
    {
        Id = Guid.NewGuid(),
        RoutePathId = path.Id,
        RoutePath = path,
        Geometry = input.Geometry,
        ValidFrom = input.ValidFrom,
        ValidTo = input.ValidTo
    };

    private static Result<ParsedRouteWriteRequest> Parse(RoutePathWriteRequest request, bool update)
    {
        var errors = new List<IError>();
        if (string.IsNullOrWhiteSpace(request.Title) || request.Title.Length > 200)
        {
            errors.Add(ApiError.Validation("routes.title.invalid", "A title with at most 200 characters is required.", "title"));
        }
        if (request.Description?.Length > 10000)
        {
            errors.Add(ApiError.Validation("routes.description.invalid", "Description must be at most 10000 characters.", "description"));
        }
        if (request.Paths is not null && request.Geometry is not null)
        {
            errors.Add(ApiError.Validation("routes.paths.ambiguous", "Provide paths or a single geometry.", "paths"));
        }
        var paths = request.Paths;
        if (paths is { Count: 0 })
        {
            errors.Add(ApiError.Validation("routes.paths.required", "At least one path is required.", "paths"));
        }
        if (paths?.Any(path => path is null) == true)
        {
            errors.Add(ApiError.Validation("routes.paths.invalid", "Every path must be provided.", "paths"));
            return Result.Fail<ParsedRouteWriteRequest>(errors);
        }
        if (paths is not null && (paths.Where(path => path.Id.HasValue).Select(path => path.Id).Distinct().Count() != paths.Count(path => path.Id.HasValue)
            || paths.Any(path => path.Id == Guid.Empty || (!update && path.Id.HasValue))))
        {
            errors.Add(ApiError.Validation("routes.paths.id.invalid", "Path IDs must be unique and may only identify an existing path when editing.", "paths"));
        }
        var parsedPaths = new List<ParsedRoutePath>();
        if (paths is null)
        {
            ParsePath(null, request.Title, request.ValidFrom, request.ValidTo, request.Geometry);
        }
        else
        {
            foreach (var path in paths)
            {
                ParsePath(path.Id, path.Title, path.ValidFrom, path.ValidTo, path.Geometry);
            }
        }
        if (update && request.Version is null)
        {
            errors.Add(ApiError.Validation("routes.version.required", "The current route version is required.", "version"));
        }
        if (errors.Count > 0)
        {
            return Result.Fail<ParsedRouteWriteRequest>(errors);
        }
        return new ParsedRouteWriteRequest(request.Title.Trim(), Normalize(request.Description), request.Version.GetValueOrDefault(), parsedPaths);

        void ParsePath(Guid? id, string title, DateOnly? validFrom, DateOnly? validTo, RouteLineGeometry? geometryInput)
        {
            if (string.IsNullOrWhiteSpace(title) || title.Length > 200)
            {
                errors.Add(ApiError.Validation("routes.paths.title.invalid", "A path title with at most 200 characters is required.", "paths"));
            }
            if (validFrom > validTo)
            {
                errors.Add(ApiError.Validation("routes.dates.invalid", "Valid from must be on or before valid to.", "validTo"));
            }
            if (!RouteGeometry.TryCreate(geometryInput, out var geometry) || geometry is null)
            {
                errors.Add(ApiError.Validation("routes.geometry.invalid", "Provide nonempty, usable MultiLineString geometry with finite EPSG:25832 coordinates.", "geometry"));
                return;
            }
            parsedPaths.Add(new ParsedRoutePath(id, title?.Trim() ?? string.Empty, validFrom, validTo, geometry));
        }
    }

    private sealed record ParsedRouteWriteRequest(string Title, string? Description, uint Version, IReadOnlyList<ParsedRoutePath> Paths);
    private sealed record ParsedRoutePath(Guid? Id, string Title, DateOnly? ValidFrom, DateOnly? ValidTo, MultiLineString Geometry);

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
    private static ApiError NotFound() => ApiError.NotFound("routes.notFound", "The route was not found.");
    private static ApiError Conflict() => ApiError.Conflict("routes.conflict", "The route changed. Reload it and try again.");
}
