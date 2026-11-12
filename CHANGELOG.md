# Changelog

## Unreleased

- Size ingress-nginx response buffers for OIDC authentication cookies, preventing
  a 502 at `/signin-oidc` with standard controller settings. Keep the per-Ingress
  defaults configurable and document overrides for other controllers.

## 0.2.0

- Reduce duplicate route parsing and alert queries; run the PostGIS regression suite in CI.
- Add a daily alert-map timeline with a proportional draggable viewing window, free day counts and adjustable playback speed.
- Add compact filter popovers and removable active-filter tags for construction sites and alerts; give side-by-side site details more room.
- Archive and restore construction sites while retaining attachments and alert references; combine their filters, list and details in one widget.
- Add private route authoring and GTFS imports, durable potential-conflict alerts, retained evidence and coordinator review.
- Support deletion and restoration of routes and individual paths while retaining import identities and historical conflict evidence.
- Group routes into compact, selectable named paths with separate calendars, clear import counts and linked conflict histories.
- Simplify route editing and show precise timestamps in readable alert histories.
- Add remembered map layers, faster route rendering and direct GTFS import with automatic source recognition.
- Fix the construction-site import result layout and show only relevant GTFS import warnings.
- Add a remembered alert map layer with visible warning signs and site-only conflict selection.
- Synchronize alert table/map filters and add an optional inclusive date range.
- Redesign the interface with R_next branding and a consistent, centrally configurable theme.
- Add movable, resizable and collapsible panels with live drag previews and remembered layouts that stay unchanged during navigation.
- Improve filtering, table readability and persistent actions; preserve map center and zoom when selecting objects on the map.
- Enforce kebab-case frontend paths, braced conditionals and consistent formatting in local and CI checks.

## 0.1.0

- Initial construction-site management with map editing, contacts, attachments and Trenches import.
- Integrate Keycloak permissions, PostGIS persistence and CIVITAS Geoportal publication.
