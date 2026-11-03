"""Routes/alerts checks for the disposable baikor-ci fixture only.

Historical alert cases intentionally survive source removal, so this module must
not be invoked against an existing operator environment.
"""

import time


def verify_routes_alerts(base, sessions, marker, check):
    editor, viewer, administrator = (sessions[name] for name in ("editor", "viewer", "admin"))
    route_id = site_id = None

    def wait_for(label, predicate):
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            value = predicate()
            if value:
                return value
            time.sleep(0.5)
        check(label, "timed out", "completed")
        raise RuntimeError("Disposable routes/alerts evaluation did not complete")

    def route_payload(offset=0, version=None, path_ids=None):
        paths = [
            {"title": "Affected path", "validFrom": "2040-01-01", "validTo": "2040-01-10", "geometry": {
                "type": "MultiLineString", "coordinates": [[[725000, 5432050 + offset], [725100, 5432050 + offset]]]}},
            {"title": "Other service period", "validFrom": "2039-01-01", "validTo": "2039-01-02", "geometry": {
                "type": "MultiLineString", "coordinates": [[[725000, 5432050 + offset], [725100, 5432050 + offset]]]}}
        ]
        if path_ids is not None:
            for path, path_id in zip(paths, path_ids, strict=True):
                path["id"] = path_id
        payload = {"title": marker + " route", "description": "Synthetic platform fixture", "paths": paths}
        if version is not None:
            payload["version"] = version
        return payload

    def alerts():
        status, result = viewer.api(base, "/api/alerts?search=" + marker + "&pageSize=100")
        if status != 200:
            return []
        return result["items"]

    def current_alert(condition="present", handling=None):
        return next((item for item in alerts() if item["condition"] == condition
                     and (handling is None or item["handling"] == handling)), None)

    def settled():
        status, result = viewer.api(base, "/api/alerts/detection-status")
        return status == 200 and result["pendingCount"] == 0 and result["failedCount"] == 0

    try:
        check("viewer reads routes", viewer.api(base, "/api/routes")[0], 200)
        check("viewer reads alerts", viewer.api(base, "/api/alerts")[0], 200)
        check("viewer reads rules", viewer.api(base, "/api/alerts/rules/route-conflict")[0], 200)
        check("viewer cannot author route", viewer.api(base, "/api/routes", "POST", route_payload())[0], 403)
        check("route authoring requires CSRF", editor.api(base, "/api/routes", "POST", route_payload(), csrf=False)[0], 400)
        status, rule = administrator.api(base, "/api/alerts/rules/route-conflict")
        check("administrator reads rule", status, 200)
        check("editor cannot configure rule", editor.api(base, "/api/alerts/rules/route-conflict", "PUT", rule)[0], 403)
        check("administrator can save current rule", administrator.api(base, "/api/alerts/rules/route-conflict", "PUT", rule)[0], 200)
        check("editor cannot request full scan", editor.api(base, "/api/alerts/scans", "POST", {})[0], 403)

        status, route = editor.api(base, "/api/routes", "POST", route_payload())
        check("editor creates synthetic route", status, 201)
        if status != 201:
            raise RuntimeError("Synthetic route creation failed")
        route_id = route["id"]
        check("one route contains two named paths", len(route["paths"]), 2)
        path_ids = [path["id"] for path in route["paths"]]
        restore_child = "/api/routes/" + route_id + "/paths/" + path_ids[0] + "/restore"
        check("viewer cannot restore child path", viewer.api(base, restore_child, "POST", {"version": route["version"]})[0], 403)
        check("child restoration requires CSRF", editor.api(base, restore_child, "POST", {"version": route["version"]}, csrf=False)[0], 400)
        check("legacy path link resolves its grouped parent", viewer.api(base, "/api/routes/" + path_ids[0])[1]["id"], route_id)
        site = {"title": marker + " site", "status": "planned", "plannedStart": "2040-01-05",
                "plannedEnd": "2040-01-15", "areas": [{"name": "Synthetic overlap", "geometry": {
                    "type": "Polygon", "coordinates": [[[725020, 5432040], [725030, 5432040],
                        [725030, 5432060], [725020, 5432060], [725020, 5432040]]]}}]}
        status, created_site = editor.api(base, "/api/construction-sites", "POST", site)
        check("editor creates overlapping synthetic site", status, 201)
        if status != 201:
            raise RuntimeError("Synthetic construction-site creation failed")
        site_id = created_site["id"]
        alert = wait_for("future overlap detected", current_alert)
        wait_for("initial detection work settles", settled)
        alert_path = "/api/alerts/" + alert["id"]
        status, detail = viewer.api(base, alert_path)
        check("viewer reads immutable typed evidence", status, 200)
        check("same route and site produce one current alert", len(alerts()), 1)
        check("evidence includes only the path with matching dates", [path["pathTitle"] for path in detail["details"]["paths"]], ["Affected path"])
        check("evidence retains child identity", detail["details"]["paths"][0]["pathId"], path_ids[0])
        check("evidence preserves future inclusive overlap", detail["details"]["periods"],
              [{"from": "2040-01-05", "to": "2040-01-10"}])
        check("map target lies on affected route", detail["location"]["coordinates"][1], 5432050)
        status, upcoming = viewer.api(base, "/api/alerts?period=upcoming&search=" + marker)
        check("upcoming period filter includes future case", status == 200 and alert["id"] in [item["id"] for item in upcoming["items"]], True)
        decision = {"handling": "handled", "note": "Synthetic coordinator review",
                    "evidenceRevision": detail["evidenceRevision"], "version": detail["version"]}
        check("viewer cannot handle alert", viewer.api(base, alert_path + "/handling", "POST", decision)[0], 403)
        check("handling requires CSRF", editor.api(base, alert_path + "/handling", "POST", decision, csrf=False)[0], 400)
        stale = {**decision, "evidenceRevision": 0}
        check("unseen evidence cannot be handled", editor.api(base, alert_path + "/handling", "POST", stale)[0], 409)
        check("editor handles exact evidence", editor.api(base, alert_path + "/handling", "POST", decision)[0], 200)

        status, scan = administrator.api(base, "/api/alerts/scans", "POST", {})
        check("administrator requests tracked full scan", status in (200, 201, 202), True)
        if status not in (200, 201, 202):
            raise RuntimeError("Synthetic full scan request failed")
        scan_id = scan["id"]
        wait_for("full scan completes", lambda: viewer.api(base, "/api/alerts/scans/" + scan_id)[1].get("state") == "completed")
        wait_for("full scan work settles", settled)
        _, unchanged = viewer.api(base, alert_path)
        check("unchanged scan retains human handling", unchanged["handling"], "handled")
        check("unchanged scan retains evidence revision", unchanged["evidenceRevision"], detail["evidenceRevision"])

        _, before_pause = viewer.api(base, "/api/alerts/detection-status")
        _, current_rule = administrator.api(base, "/api/alerts/rules/route-conflict")
        check("administrator pauses route-conflict evaluation", administrator.api(base, "/api/alerts/rules/route-conflict", "PUT", {**current_rule, "enabled": False})[0], 200)
        try:
            wait_for("paused queue work settles", settled)
            _, paused = viewer.api(base, "/api/alerts/detection-status")
            check("paused type is explicit", "routeConflict" in paused["pausedTypes"], True)
            check("paused completion retains actual evaluation time", paused["lastEvaluatedAt"], before_pause["lastEvaluatedAt"])
            check("paused rule retains review handling", viewer.api(base, alert_path)[1]["handling"], "handled")
        finally:
            _, paused_rule = administrator.api(base, "/api/alerts/rules/route-conflict")
            check("administrator resumes route-conflict evaluation", administrator.api(base, "/api/alerts/rules/route-conflict", "PUT", {**paused_rule, "enabled": True})[0], 200)
        wait_for("resumed evaluation settles", settled)

        status, updated_route = editor.api(base, "/api/routes/" + route_id, "PUT", route_payload(1, route["version"], path_ids))
        check("editor changes relevant route geometry", status, 200)
        reopened = wait_for("material geometry change reopens", lambda: current_alert(handling="open"))
        check("material change preserves case identity", reopened["id"], alert["id"])
        check("material change advances evidence", reopened["evidenceRevision"] > detail["evidenceRevision"], True)
        check("editor removes route", editor.api(base, "/api/routes/" + route_id, "DELETE")[0], 204)
        wait_for("removed route clears condition", lambda: current_alert("cleared"))
        _, historical = viewer.api(base, alert_path)
        check("cleared history retains route label", historical["details"]["routeTitle"], marker + " route")
        check("cleared history retains journal", len(historical["events"]) >= 4, True)
        revision_path = alert_path + "/evidence/" + str(detail["evidenceRevision"])
        status, old_evidence = viewer.api(base, revision_path)
        check("viewer reads retained historical evidence", status, 200)
        check("historical geometry retains original route", old_evidence["details"]["routeGeometry"]["coordinates"][0][0][1], 5432050)
        check("historical evidence exposes no handling state", "handling" in old_evidence, False)
        check("retained revision appears in journal availability", detail["evidenceRevision"] in historical["evidenceRevisions"], True)
        check("missing historical evidence returns not found", viewer.api(base, alert_path + "/evidence/999999")[0], 404)
        status, hidden = viewer.api(base, "/api/routes/" + route_id + "?includeSuppressed=true")
        check("viewer can inspect removed route", status == 200 and hidden["isSuppressed"], True)
        restore_path = "/api/routes/" + route_id + "/restore"
        restore_body = {"version": hidden["version"]}
        check("viewer cannot restore route", viewer.api(base, restore_path, "POST", restore_body)[0], 403)
        check("restoration requires CSRF", editor.api(base, restore_path, "POST", restore_body, csrf=False)[0], 400)
        check("restoration rejects stale route version", editor.api(base, restore_path, "POST", {"version": updated_route["version"]})[0], 409)
        status, restored = editor.api(base, restore_path, "POST", restore_body)
        check("editor explicitly restores same route", status == 200 and restored["id"] == route_id and not restored["isSuppressed"], True)
        recurrence = wait_for("restored route reevaluates retained case", current_alert)
        check("restoration preserves alert case identity", recurrence["id"], alert["id"])
        check("restoration starts recurrence", recurrence["occurrence"], historical["occurrence"] + 1)
        check("restoration retains old evidence", viewer.api(base, revision_path)[1]["details"], old_evidence["details"])
        check("editor removes restored synthetic route", editor.api(base, "/api/routes/" + route_id, "DELETE")[0], 204)
        route_id = None
    finally:
        if route_id is not None:
            check("remove synthetic route", editor.api(base, "/api/routes/" + route_id, "DELETE")[0], 204)
        if site_id is not None:
            check("remove synthetic overlap site", administrator.api(base, "/api/construction-sites/" + site_id, "DELETE")[0], 204)
