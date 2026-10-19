"""Real Keycloak account smoke test (Python standard library only).

Creates disposable users in the existing local realm, exercises authorization-code
login and application cookies, then removes only its own users and records.
Run: python tests/platform/test_keycloak_accounts.py
"""

import argparse
import base64
import http.cookiejar
import json
import os
import secrets
import ssl
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


class Forms(HTMLParser):
    def __init__(self, text):
        super().__init__()
        self.forms = []
        self.current = None
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "form":
            self.current = {"action": attrs.get("action", ""), "fields": {}}
            self.forms.append(self.current)
        if tag == "input" and self.current is not None and attrs.get("name"):
            self.current["fields"][attrs["name"]] = attrs.get("value", "")

    def handle_endtag(self, tag):
        if tag == "form":
            self.current = None


class Session:
    def __init__(self, context):
        self.cookies = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPSHandler(context=context),
            urllib.request.HTTPCookieProcessor(self.cookies),
        )
        self.csrf = None

    def request(self, url, method="GET", data=None, headers=None, form=None):
        headers = dict(headers or {})
        if form is not None:
            data = urllib.parse.urlencode(form).encode()
            headers["Content-Type"] = "application/x-www-form-urlencoded"
        elif data is not None and not isinstance(data, bytes):
            data = json.dumps(data).encode()
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            response = self.opener.open(request, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        return response.status, response.read().decode(), response.url

    def login(self, base, username, password):
        status, body, url = self.request(base + "/")
        form = next(f for f in Forms(body).forms if "username" in f["fields"])
        form["fields"].update(username=username, password=password)
        status, body, url = self.request(
            urllib.parse.urljoin(url, form["action"]), "POST", form=form["fields"]
        )
        # Keycloak returns the authorization code through OIDC response_mode=form_post.
        for _ in range(3):
            callbacks = [f for f in Forms(body).forms if "code" in f["fields"] and "state" in f["fields"]]
            if not callbacks:
                break
            callback = callbacks[0]
            status, body, url = self.request(
                urllib.parse.urljoin(url, callback["action"]), "POST", form=callback["fields"]
            )
        return status, body, url

    def get_csrf(self, base):
        status, body, _ = self.request(base + "/api/antiforgery")
        if status == 200:
            self.csrf = json.loads(body)["token"]
        return status

    def api(self, base, path, method="GET", data=None, csrf=True):
        headers = {"Accept": "application/json"}
        if csrf and self.csrf:
            headers["X-CSRF-TOKEN"] = self.csrf
        status, body, _ = self.request(base + path, method, data, headers)
        return status, json.loads(body) if body and body.startswith(("{", "[")) else body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--core-path", type=Path, help="Local Core checkout; defaults to the application's sibling civitas-core")
    parser.add_argument("--base-url", default="https://baikor-r.civitas.test")
    parser.add_argument("--keycloak-url", default="https://idm.civitas.test")
    parser.add_argument("--realm", default="tst")
    parser.add_argument("--client-id", default="baikor-r")
    parser.add_argument("--ca-file", type=Path, help="Trusted HTTPS CA; defaults to the local Core CA")
    parser.add_argument("--admin-source", choices=("kubernetes", "environment"), default="kubernetes")
    parser.add_argument("--kube-context", default="k3d-civitas-local")
    parser.add_argument("--kube-namespace", default="tst-access-stack")
    parser.add_argument("--kube-secret", default="tst-keycloak-admin")
    args = parser.parse_args()
    for url in (args.base_url, args.keycloak_url):
        parsed = urllib.parse.urlsplit(url)
        if parsed.scheme != "https" or not parsed.hostname:
            parser.error("HTTPS is required for application and Keycloak URLs")
    if args.admin_source == "environment":
        username = os.environ.get("BAIKOR_TEST_ADMIN_USERNAME")
        admin_password = os.environ.get("BAIKOR_TEST_ADMIN_PASSWORD")
        if not username or not admin_password:
            parser.error("Both BAIKOR_TEST_ADMIN_USERNAME and BAIKOR_TEST_ADMIN_PASSWORD are required")
    else:
        secret = json.loads(subprocess.check_output([
            "kubectl", "--context", args.kube_context, "-n", args.kube_namespace,
            "get", "secret", args.kube_secret, "-o", "json",
        ]))["data"]
        username = base64.b64decode(secret["MASTER_USERNAME"]).decode()
        admin_password = base64.b64decode(secret["MASTER_PASSWORD"]).decode()
    ca_file = args.ca_file
    if ca_file is None:
        core_path = args.core_path or Path(__file__).resolve().parents[3] / "civitas-core"
        ca_file = core_path / "local_deployment/.ssl/civitas.crt"
    context = ssl.create_default_context(cafile=str(ca_file))
    keycloak = args.keycloak_url.rstrip("/")
    admin = Session(context)
    status, body, _ = admin.request(
        keycloak + "/realms/master/protocol/openid-connect/token", "POST",
        form={"client_id": "admin-cli", "grant_type": "password",
              "username": username, "password": admin_password},
    )
    if status != 200:
        raise RuntimeError(f"Keycloak administrator login failed: HTTP {status}")
    headers = {"Authorization": "Bearer " + json.loads(body)["access_token"]}
    realm = keycloak + "/admin/realms/" + urllib.parse.quote(args.realm, safe="")
    base = args.base_url.rstrip("/")
    status, body, _ = admin.request(realm + "/clients?clientId=" + urllib.parse.quote(args.client_id, safe=""), headers=headers)
    if status != 200 or not json.loads(body):
        raise RuntimeError(f"Could not find the configured Keycloak client: HTTP {status}")
    client_id = json.loads(body)[0]["id"]
    _, body, _ = admin.request(realm + f"/clients/{client_id}/roles", headers=headers)
    roles = {role["name"]: role for role in json.loads(body)}
    marker = "baikor-e2e-" + secrets.token_hex(5)
    password = secrets.token_urlsafe(24) + "!aA1"
    users, sessions, records = {}, {}, []
    failures = []
    checks = 0

    def check(label, actual, expected):
        nonlocal checks
        checks += 1
        passed = actual == expected
        print(f"{'PASS' if passed else 'FAIL'} {label}: {actual!r} (expected {expected!r})", flush=True)
        if not passed:
            failures.append(label)

    def payload(title, status="draft", version=None):
        value = {"title": title, "status": status, "plannedStart": "2026-10-10",
                 "plannedEnd": "2026-10-12", "areas": [{"name": "Test area", "geometry": {
                     "type": "Polygon", "coordinates": [[[725000, 5432000], [725100, 5432000],
                         [725100, 5432100], [725000, 5432100], [725000, 5432000]]]}}]}
        if version is not None:
            value["version"] = version
        return value

    try:
        for kind in ("none", "viewer", "editor", "editor2", "approver", "admin"):
            role = "baikor_editor" if kind == "editor2" else "baikor_" + kind
            username = f"{marker}-{kind}@civitas.test"
            status, _, _ = admin.request(realm + "/users", "POST", data={
                "username": username, "email": username, "enabled": True,
                "emailVerified": True, "firstName": "Baikor test", "lastName": kind,
                "credentials": [{"type": "password", "value": password, "temporary": False}],
                "requiredActions": [],
            }, headers=headers)
            if status != 201:
                raise RuntimeError(f"Could not create disposable {kind} user: HTTP {status}")
            _, body, _ = admin.request(realm + "/users?username=" + urllib.parse.quote(username) + "&exact=true", headers=headers)
            users[kind] = json.loads(body)[0]["id"]
            if kind != "none":
                status, _, _ = admin.request(
                    realm + f"/users/{users[kind]}/role-mappings/clients/{client_id}", "POST",
                    data=[roles[role]], headers=headers)
                if status != 204:
                    raise RuntimeError(f"Could not assign {kind} role: HTTP {status}")
            session = sessions[kind] = Session(context)
            status, page, _ = session.login(base, username, password)
            check(f"{kind} real OIDC login", status, 403 if kind == "none" else 200)
            status, me = session.api(base, "/api/me")
            check(f"{kind} session endpoint", status, 403 if kind == "none" else 200)
            if status == 200:
                check(f"{kind} distinct identity", me["name"], username)
                check(f"{kind} mapped client role", me["roles"], [role])
            csrf_status = session.get_csrf(base)
            check(f"{kind} can obtain logout CSRF token", csrf_status, 200)
            if kind == "none":
                check("access-denied page offers logout", 'action="/auth/logout"' in page, True)

        editor, viewer, approver = sessions["editor"], sessions["viewer"], sessions["approver"]
        status, record = editor.api(base, "/api/construction-sites", "POST", payload(marker))
        check("editor creates record", status, 201)
        if status != 201:
            raise RuntimeError("Cannot continue record tests without fixture")
        records.append(record["id"])
        path = "/api/construction-sites/" + record["id"]
        check("viewer reads another account's shared record", viewer.api(base, path)[0], 200)
        check("record appears in another account's list", record["id"] in [r["id"] for r in viewer.api(base, "/api/construction-sites")[1]], True)
        check("no-role account cannot read record", sessions["none"].api(base, path)[0], 403)
        status, viewer_creation = viewer.api(base, "/api/construction-sites", "POST", payload(marker))
        if status == 201:
            records.append(viewer_creation["id"])
        check("viewer cannot create", status, 403)
        check("viewer cannot update", viewer.api(base, path, "PUT", payload(marker, version=record["version"]))[0], 403)
        check("viewer cannot delete", viewer.api(base, path, "DELETE")[0], 403)
        check("editor cannot call approver status endpoint", editor.api(base, path + "/status", "POST", {"status": "approved"})[0], 403)
        check("write requires antiforgery", editor.api(base, path, "PUT", payload(marker, version=record["version"]), csrf=False)[0], 400)
        original_csrf = editor.csrf
        editor.csrf = viewer.csrf
        check("another user's antiforgery token rejected", editor.api(base, path, "PUT", payload(marker, version=record["version"]))[0], 400)
        editor.csrf = original_csrf
        status, updated = editor.api(base, path, "PUT", payload(marker + " updated", "approved", record["version"]))
        check("editor retains deliberate unrestricted status editing", status, 200)
        check("viewer sees another user's update", viewer.api(base, path)[1]["title"], marker + " updated")
        check("second editor's stale concurrent edit rejected", sessions["editor2"].api(base, path, "PUT", payload(marker, version=record["version"]))[0], 409)
        check("approver status endpoint", approver.api(base, path + "/status", "POST", {"status": "active"})[0], 200)
        check("admin reads shared record", sessions["admin"].api(base, path)[0], 200)

        boundary = "baikor-test-" + secrets.token_hex(8)
        attachment_data = (
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"test.txt\"\r\n"
            f"Content-Type: text/plain\r\n\r\n{marker}\r\n--{boundary}--\r\n"
        ).encode()
        upload_headers = {"Content-Type": "multipart/form-data; boundary=" + boundary, "X-CSRF-TOKEN": viewer.csrf}
        check("viewer cannot upload attachment", viewer.request(base + path + "/attachments", "POST", attachment_data, upload_headers)[0], 403)
        upload_headers["X-CSRF-TOKEN"] = editor.csrf
        status, body, _ = editor.request(base + path + "/attachments", "POST", attachment_data, upload_headers)
        check("editor uploads attachment", status, 200)
        if status == 200:
            attachment_id = json.loads(body)["id"]
            attachment_path = path + "/attachments/" + attachment_id
            check("viewer lists another account's attachment", attachment_id in [a["id"] for a in viewer.api(base, path + "/attachments")[1]], True)
            check("viewer downloads another account's attachment", viewer.api(base, attachment_path)[1], marker)
            check("viewer cannot delete attachment", viewer.api(base, attachment_path, "DELETE")[0], 403)
            check("second editor can delete shared attachment", sessions["editor2"].api(base, attachment_path, "DELETE")[0], 204)

        for kind, session in sessions.items():
            if session.csrf is None:
                continue
            status, page, _ = session.request(base + "/auth/logout", "POST", form={"__RequestVerificationToken": session.csrf})
            check(f"{kind} Keycloak logout reaches confirmation", status, 200)
            check(f"{kind} signed out confirmation", "Erfolgreich abgemeldet" in page, True)
            _, login_page, _ = session.request(base + "/")
            check(f"{kind} logout ends SSO session", any("username" in f["fields"] for f in Forms(login_page).forms), True)

        # Reuse the denied user's browser cookie jar to sign in with a permitted account.
        recovered = sessions["none"]
        if recovered.csrf:
            username = f"{marker}-viewer@civitas.test"
            status, _, _ = recovered.login(base, username, password)
            check("denied account can switch to viewer", status, 200)
            check("switched account has viewer identity", recovered.api(base, "/api/me")[1]["name"], username)
    finally:
        # An independent authorized login keeps cleanup possible after the logout tests.
        try:
            if records and "admin" in users:
                cleanup = Session(context)
                cleanup.login(base, f"{marker}-admin@civitas.test", password)
                cleanup.get_csrf(base)
                for record_id in records:
                    try:
                        status, _ = cleanup.api(base, "/api/construction-sites/" + record_id, "DELETE")
                        check("remove disposable record", status, 204)
                    except Exception as error:
                        check("remove disposable record", type(error).__name__, "HTTP 204")
        except Exception as error:
            check("record cleanup login", type(error).__name__, "successful login")
        finally:
            for kind, user_id in users.items():
                try:
                    status, _, _ = admin.request(realm + "/users/" + user_id, "DELETE", headers=headers)
                    check(f"remove disposable {kind} account", status, 204)
                except Exception as error:
                    check(f"remove disposable {kind} account", type(error).__name__, "HTTP 204")

    print(f"Completed {checks} checks with {len(failures)} failures", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
