# Routes and potential conflicts

Routes and alerts are private application data. They are not published through
GeoServer or the public construction-site SQL views. Apply the normal application
migrations before starting the application. The additive migration creates route
paths/calendars, retained alert cases/evidence/events, the default route-conflict
rule and durable detection work. The construction-site archive migration additionally
excludes archived sites from both existing public projections.

## Construction-site archive

Construction sites are archived rather than physically deleted. Existing single and
bulk DELETE endpoints retain the site, child records, attachments and identifiers.
Archived sites remain readable by UUID, including from historical alert links, but
cannot be edited or receive attachment changes. They are excluded from conflict
detection and public views. Existing conflict cases and evidence remain retained.

The construction-site widget contains filters, list and details together. Its
Active / Archived / All filter defaults to Active. Editors can restore an archived
site with its observed version; restoration preserves its identifier and queues
conflict detection again. See the [archive API contract](openapi/construction-site-archive.openapi.json)
for permissions, concurrency and CSRF requirements. Trenches duplicate-import checks
include archived sites; restore the existing records instead of importing duplicates.
Saved layouts merge the former list/detail panels while preserving other panels
and their visibility. The combined widget has a remembered resizable divider and
switches between list and details when narrow. Side-by-side mode starts at 1100px
of widget width and preserves at least 560px for the list and 400px for details.
The period column is optional in the list's Columns menu.

Construction-site and alert toolbars keep free-text search visible. Add filters
opens a popover; edits there affect the list and map only after Apply. Cancel or
closing the popover discards its draft. Active restrictions appear as removable
tags, including the default non-archived site scope and present/open alert scope.
Removing a tag clears just that restriction; it preserves search and other filters.

Sites physically deleted before archiving was introduced cannot be reconstructed
in full. Links from retained alerts show a read-only view of their recorded title,
affected areas and overlapping periods, with access to the retained map evidence.
This view does not offer editing or restoration of the missing original record.

## Roles and API

| Operation | Required existing role |
| --- | --- |
| Read routes, alerts, evidence, rules and detection status | Viewer or a role with its existing read permissions |
| Author/remove/restore routes, import GTFS, handle alerts | Editor or a role with its existing edit permissions |
| Change conflict settings or request a full scan | Administrator |

The dedicated `baikor_importer` machine client remains limited to the existing
Trenches import. It has no route/alert read, write, GTFS import or scan permission.
No new Keycloak scopes or broad client role mappings are needed. Browser writes
require the existing antiforgery cookie and `X-CSRF-TOKEN`; valid API bearer
tokens retain the existing bearer authentication behavior.

The [routes and alerts OpenAPI contract](openapi/routes-alerts.openapi.json)
documents the endpoints. Paginated lists accept at most 100 items per page.
Alert queries support search, type, condition, handling, inclusive `from`/`to`
date bounds and `period=current|upcoming|past`. Period views use the civil date in
Europe/Berlin. The application image includes timezone data for these filters and
GTFS daylight-saving conversion. Custom runtime images must retain that data.
Period filters do not limit detector scope or defer future conflicts.

## Route ownership and import

Each route is a stable parent with one or more separately named paths. Route
lists return parents; each response has `paths[]`, with an ID, title, optional
`externalShapeId`, suppression flag and geometry/calendar `versions[]` per child.
There is no combined parent geometry or calendar. Selecting a parent shows all
active paths on the map; selecting a path card focuses that path.
Clicking a route or construction site on the map opens its details without
changing map center or zoom. List selections and explicit map-focus actions
still navigate to the corresponding geometry.
These actions never restore or activate a collapsed panel. Panel visibility and
placement change only through the workspace's panel controls, including the
right-hand restore toolbar; selections remain available when a panel is restored.

Manual paths use MultiLineString geometry in EPSG:25832. Optional validity dates
are inclusive; a missing bound is unbounded. Manual create/update requests accept
`paths: [{ id?, title, validFrom?, validTo?, geometry }]`. The parent `version`
protects the whole update. Include existing child IDs to retain them; omitted
children are removed, while historical alert evidence remains retained. New
children omit `id`; duplicate or foreign IDs are rejected. The older flat
`geometry`, `validFrom` and `validTo` input remains a single-path convenience.
Do not send both `paths` and `geometry`; a multi-path route must use `paths` when
updated. Imported routes and their child geometry/calendars are source managed.
Use an independent manual route for local changes.

The interface calls removal "Delete". It retains identities and evidence while
excluding deleted routes/paths from the map and conflict detection; later GTFS
imports cannot silently restore them. Deleting a parent does not change its
children's individual deletion flags. Deleted rows/cards are hidden by default;
"Show deleted" in the route toolbar's filter menu includes them for restoration. Editors
can restore a route using `POST /api/routes/{id}/restore` with its observed parent
`version`. Restoration retains UUIDs, source bindings and calendars and queues
conflict evaluation; individually hidden children remain hidden. Restore such a
child explicitly with `POST /api/routes/{id}/paths/{pathId}/restore`, again using
the parent `version`, after restoring its parent. Both restore endpoints return the
parent response and require Editor access and browser CSRF protection. A stale
version returns 409; reload the parent before retrying. Never remove suppression
records manually. Stored links using a legacy child UUID can still resolve to
its parent, but lists and new writes use parent UUIDs.

Route details keep parent deletion under "More actions". Each active path card
offers its own confirmed delete action, including imported paths. The additive
`DELETE /api/routes/{id}/paths/{pathId}` requires Editor access, browser CSRF and
JSON `{ "version": <observed parent version> }`. It returns the updated parent
(200). Missing version gives 400, a missing/wrong-parent path 404, and a stale
parent version or deleted parent 409. Deleting an already deleted child with
the current version is idempotent. Deleting the last active path leaves the
parent available for restoration, with zero paths on the map and no conflicts.

The route toolbar uses a split create button; its menu offers GTFS import.
Local writes refresh the list automatically. Deletion is independent of timetable
dates; an old operating period alone never marks a route or path deleted.
Route search matches parent titles, descriptions and path names case-insensitively.
Percent signs, underscores and backslashes in a search term are treated literally.

Manual editing uses the whole route widget. Compact path selectors retain each
draft while showing one path editor at a time; validity dates remain optional.
The description is expandable and geometry can be drawn or uploaded as GeoJSON.

The map's Layers control toggles construction-site polygons, dashed route
lines and alert warning signs independently and remembers visibility in this browser.
The optional Alerts layer starts hidden and uses the same search, type, condition,
handling and period filters as the Alerts table. It reads every matching page,
including cleared alerts when that condition is selected; superseded cases stay
excluded. Filter choices remain in the workspace when the Alerts panel is collapsed.
The optional From/To date range matches any inclusive overlap with an affected
period, including open-ended bounds, and combines with the quick period filter.
Changing filters clears old map results and selection until matching data arrives;
late requests cannot restore a marker from the previous filter selection.
Alerts without a location remain available in the table. Detection polling refreshes
the layer even when the Alerts panel is collapsed. Clicking a warning selects it
without moving the map or opening hidden panels. Selecting an alert highlights
only its warning sign and affected construction-site evidence, never its route.
Changed, removed or cleared current evidence removes a stale map selection;
explicitly selected historical evidence remains a snapshot until filters change.

When the Alerts layer is enabled, Live mode adds a daily map timeline. It starts
paused, from today's civil date in Europe/Berlin through the same date next year
(February 29 ends on February 28). The floating panel opens at the same bottom-right
anchor as its entry button. Settings accept any positive whole number of viewing
days and a playback speed from 0.25× to 4× (default 1×, one day per second).
The draggable block represents both dates: ten of thirty inclusive days occupy
one third of the track. Dragging shifts the whole window; arrows move it daily,
Page Up/Down weekly, and Home/End jump to its boundaries. The window retains its
length and playback stops when its end reaches the configured end date. A window
larger than the total range covers that entire range and cannot be moved.
Actual dates remain visible above the track. Keyboard or pointer seeking pauses
playback, including grabbing the block before it has moved.
Seeking or opening settings pauses playback; hidden maps/tabs pause it too.
Disabling the layer or leaving Live mode stops playback and removes the day filter.
Entering Live mode again starts a fresh default year.

The existing alert filters select the input cases; Live mode shows only cases
whose recorded periods overlap the displayed window. Open ends are unbounded and
cases without a period remain visible. Disjoint operating periods retain their
gaps. It displays known conflicts from available data, not predictions beyond
an imported timetable's coverage. Playback changes neither alert handling nor
the list filters, never moves the map and performs no database writes or new
per-day detection scans. Day changes clear selected warning/evidence geometry
and cancel pending selections so markers from an earlier day cannot reappear.

Saved, selected
and retained-evidence geometry follow the same source switch. Explicit map focus
or drawing reveals the relevant source; a source cannot be hidden while drawing
or editing its geometry. Layer visibility is presentation only: it does not affect
alert evaluation, stored data or calendars. The map shows known geometry without
asserting that service operates today. Detection uses each path's own operating
days, including future days, and aggregates affected paths into one route/site case.
The dense background network uses a cached image layer with one stroke while
panning and zooming. Shared segments are drawn once, with a small display-scale
overlap tolerance and continuous dash phases. Selected routes are thicker and solid.
The display is rebuilt when data or resolution changes. Selection, evidence and
editing retain original projected geometry; picking identities and conflict
calculations remain unchanged.

GTFS import accepts a ZIP file up to 25 MiB, within a 26 MiB complete HTTP request.
The default application ingress allowance is already 26 MiB; other proxies may
need their equivalent request-body limit. The `file` multipart field is required.
The browser offers a direct import; the optional API `preview=true` still validates
and reports changes without saving. Preview and failed imports never create a
provider binding or modify route data.
The result dialog shows change counts and actionable warnings. Routine retention,
suppression and unused-route/shape policies are omitted from the warning list;
unrecognized warnings and import errors remain visible.

Without `sourceId`, the importer identifies the provider from the sorted distinct
canonical agency URL set in `agency.txt`. HTTP/HTTPS, `www.` and trailing slash
differences are normalized. Agency names, optional agency IDs, optional publisher
metadata, dates, feed versions, archive names and record order do not change this
identity. A private `gtfs_import_sources` binding retains its namespace for later
geometry/calendar updates. New namespaces use `gtfs-<identity digest>`.

Before the first binding, an existing namespace is adopted only when its complete
route/shape binding set and stored geometries exactly match the incoming data.
Every parent/path UUID, suppression state and retained alert link is preserved.
Multiple matching legacy sources produce a 409 response rather than guessing.
Missing or invalid agency URLs prevent automatic identification with a validation
error. No filename-based identity or arbitrary single-source fallback is used.

Operators can reconcile an ambiguous legacy source through an explicit API
`sourceId` of 1–100 lowercase letters, digits, dots, underscores or hyphens.
An explicit import can establish a binding when both provider identity and chosen
namespace are unbound; it never redirects an explicit namespace or rebinds an
existing identity. Explicit-source imports retain their existing behavior even
when automatic identification metadata is unavailable. Intentionally independent
feeds sharing the same agency URL set need explicit namespaces: agency metadata
does not provide a universal unique GTFS feed identifier.

Parent identity is `(sourceId, route_id)`; child identity is
`(sourceId, route_id, shape_id)`. The uploaded filename, feed hash, path title,
headsign and direction label are not identity keys. Equal display names do not
merge different source identities. Regenerated shape IDs create separate children
and require explicit provider reconciliation. Path labels use stop endpoints
with deterministic differentiation where needed; each child retains its own
geometry, source windows and operating calendar.

Import results count parents in `createdCount`, `updatedCount`, `unchangedCount`
and `suppressedCount`, and children in `createdPathCount`, `updatedPathCount`,
`unchangedPathCount` and `suppressedPathCount`. `routeCount` is the number of
supplied parent route identities; `pathCount` is the number of supplied eligible
route/shape bindings. `shapeCount` and `tripCount` describe feed records rather
than stored route totals. Preview returns the same counters without persistence.

Only populated shapes referenced by trips with valid service calendars can be
imported for conflict analysis. Missing/unresolved shape or service references
are reported rather than replaced with stop-to-stop approximations. A feed may
be valid GTFS while lacking the paths required for this operation. The parser
validates the complete feed before persisting changes. Failed parsing does not
replace verified paths, change calendars or clear existing alerts.

Calendar weekdays and exceptions are preserved as concrete operating periods.
Times beyond 24:00 include the next civil date touched by an overnight trip.
Results have calendar-date precision, not an inferred crossing time. Source
service coverage remains separate from overnight civil-day spillover. Overlapping
coverage imports replace their declared windows while preserving disjoint prior
windows and gaps. Missing source routes are not treated as authoritative deletions
by this import endpoint.

Civil-date conversion follows the GTFS service-time origin and Europe/Berlin
daylight-saving transitions. A service date can therefore contribute availability
on a different civil date, including the preceding date near the spring change.
The importer requires an explicit supported agency timezone rather than assuming
one for a missing agency record.

Frequency-based template trips are currently unsupported. Such feeds and trips
without explicit endpoint arrival/departure times are rejected for this import
operation instead of assigning incomplete civil-date availability.

## Conflict evidence and review

The current detail view prioritizes linked construction-site and route names,
overlap dates, affected areas/paths and handling. Technical evidence revisions and
events remain available through the collapsed history and read-only snapshots.
Journal rows show a localized date and time including seconds; actor identifiers
and evidence revision numbers are omitted from these rows.
The alert toolbar refreshes automatically and keeps filter widths stable.
Manual reload is offered only for failed requests or stale details; map focus
uses a labelled icon in the detail footer.

The default rule includes Planned, Approved and Active sites and uses 10 metres.
Administrators can choose the eligible statuses and a sensitivity from 0 to
1,000 metres. Zero includes touching/intersecting geometry. These settings are
starting values for potential-conflict review, not operational safety approval.

A conflict needs both route/site proximity and inclusive availability overlap.
Missing manual date bounds are unbounded. An explicit empty operating calendar
has no operation. The detector aggregates all matching areas and precise disjoint
overlap periods into one case per rule, parent route and construction site. Each
active child version is evaluated with its own availability; only matching paths
enter the evidence. A weekday path cannot inherit a weekend path's calendar.
Snapshot `paths[]` entries include `pathId` and `pathTitle` alongside their own
geometry and periods. These fields are optional when reading legacy snapshots,
which remain unchanged. The map target lies on the affected route with local
focus; it is not a site centroid.

Repeated equivalent evaluations retain the evidence revision and human handling.
Relevant geometry, affected areas, overlap periods or meaningful rule-input
changes append immutable evidence and reopen review. Source timestamps, labels
and equivalent geometry/calendar ordering do not reopen a case. A condition that
clears retains its evidence and review history. A later recurrence retains the
case identity and starts a new occurrence. Source removal clears its current
conditions without cascading deletion into history.

Geometry comparison includes matched site areas and the route portions within
each area's sensitivity-expanded envelope. Distant path edits outside every
possible conflict location do not reopen a case. Historical snapshots retain the
full source path for explanation.

Handling requests include the evidence revision and alert version that the user
observed. A stale decision returns 409 and requires refreshing the detail. Server
identity supplies the reviewer; clients cannot select another actor. Evidence
snapshots exclude contacts, attachments and unrelated personal data. Historical
geometry and labels intentionally survive later source edits and removals.
The event journal offers "View evidence" for retained revisions. Viewer access
to `GET /api/alerts/{id}/evidence/{revision}` returns that immutable snapshot in a
generic envelope, including historical geometry and map focus when available.
The historical modal is read-only; decisions continue to use the current case's
evidence revision and concurrency version. Revision availability comes from the
retained evidence records rather than inferred event numbers.

When legacy path cases consolidate, one existing case becomes the canonical
parent case. Other cases retain immutable evidence, events and reviewer decisions
and become linked, read-only histories. The normal alert list excludes them.
Alert detail exposes `supersededByAlertId` for a retired case and `relatedAlerts`
entries with `id`, `summary`, `handling` and `evidenceRevision`. Their detail and
evidence endpoints remain readable; handling a superseded case returns 409.
Review the canonical case's current evidence when consolidation changes the
material result. Conflicting historical decisions are never merged into a new
decision.

## Grouped-route upgrade and recovery

The additive `GroupRouteDefinitions` migration backfills parent relations while
preserving existing path UUIDs, geometry versions, calendars and suppression
provenance. It links retired cases to a deterministic existing canonical case
without rewriting historical evidence or events, then queues reconciliation.
Pending work with old path identities resolves to the parent. No public SQL view
or permission boundary changes.

Take a consistent backup and test the migration on a duplicate or synthetic
PostGIS fixture before upgrading a populated environment. Treat a populated
grouped-route database as a forward-only upgrade: do not downgrade it to the
flat-route schema. For rollback, restore a consistent pre-upgrade database backup
together with its matching application version. A deployment rollback alone
does not restore the prior data model.

## Evaluation operation and recovery

Source writes and rule changes save durable invalidation work in the same database
transaction. The in-process worker consumes committed work, coalesces changes,
retries failures and resumes pending work after restart. Replicas claim work
through database coordination. No external broker or periodic whole-database scan
is required. A short PostgreSQL advisory transaction gate orders source writes,
reviews and detector partitions; a full scan does not hold the gate globally.

Saving returns before asynchronous detection finishes. Use detection status and
tracked scan runs to distinguish pending/failed evaluation from an empty alert
list. Initial reconciliation is queued by the migration. A disabled rule pauses
evaluation and preserves existing cases. Invalid/unavailable source inputs or
transient failures preserve the last successful condition; they do not imply an
all-clear. The detector evaluates all stored dates, including future periods.

Detection status exposes `pausedTypes` for disabled rule types. Queue completion
alone does not refresh `lastEvaluatedAt`: that timestamp records an actual
successful detector evaluation, including an assessed partition with no matches.
Paused or discovery-only work preserves the prior timestamp. Historical work
completed before evaluation tracking was introduced has no inferred timestamp.
The evaluation-tracking migration queues reconciliation for enabled rules so an
upgrade establishes fresh evaluation through the normal worker.

`POST /api/alerts/scans` requests a tracked full reconciliation. Duplicate active
scan requests are coalesced. It uses dedicated spatial/availability queries and
the same reconciliation engine, not the 2,000-row construction-site UI list.
The normal UI relies on automatic change-triggered detection. Healthy evaluation
timestamps and completed scan counts are hidden; pending, failed, paused, unknown
and incomplete-coverage warnings remain visible. Administrators can request a
manual recheck from conflict settings when needed.
Source changes during a scan queue their own incremental work. Monitor pending,
failed and scan progress fields before relying on an evaluation result. Keep
worker failure logs private; do not put credentials or source feed contents into
operator reports.

A later successful evaluation or full scan retires superseded failed work from
current health. Earlier failed scan runs retain their historical state and
counters so the failure remains explainable.

## Verification

Run the Release backend suite, the frontend checks in `AGENTS.md`, and OpenAPI lint
from CI. `python tests/platform/run_ci.py` creates a disposable PostGIS/Keycloak
fixture and verifies actual OIDC permissions, CSRF, future conflict detection,
review preservation, material reopen and source-removal history. Route/alert
history checks run only for the disposable `baikor-ci` realm with environment
administrator credentials; the existing local Core profile is not modified.

These technical checks do not provide business or privacy approval for publishing
free text, provider feeds or derived results. Publication remains outside this
feature.
