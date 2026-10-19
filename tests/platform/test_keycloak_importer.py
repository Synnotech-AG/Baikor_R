"""Real service-account checks for the disposable Compose fixture only."""
import base64
import io
import json
import os
import ssl
import struct
import zipfile

from test_keycloak_accounts import Session


def trench_archive():
    """One WGS84 polyline with the three source fields consumed by the importer."""
    bounds = (12.1, 49.01, 12.1001, 49.01)
    record = struct.pack("<i4d2ii4d", 3, *bounds, 1, 2, 0, *bounds)

    def header(length):
        return struct.pack(">7i", 9994, 0, 0, 0, 0, 0, length // 2) + struct.pack(
            "<2i8d", 1000, 3, *bounds, 0, 0, 0, 0)

    fields = [("executio_1", 24, "Plan released"), ("name", 32, "Asphalt Str."),
              ("externalID", 24, "service-account-segment")]
    dbf_header_length = 32 + 32 * len(fields) + 1
    dbf_record_length = 1 + sum(size for _, size, _ in fields)
    dbf = bytearray(struct.pack("<4BIHH20x", 3, 126, 10, 19, 1, dbf_header_length, dbf_record_length))
    for name, size, _ in fields:
        dbf.extend(struct.pack("<11sc4xBB14x", name.encode(), b"C", size, 0))
    dbf.extend(b"\r " + b"".join(value.encode().ljust(size) for _, size, value in fields) + b"\x1a")
    files = {
        "shp": header(108 + len(record)) + struct.pack(">2i", 1, len(record) // 2) + record,
        "shx": header(108) + struct.pack(">2i", 50, len(record) // 2),
        "dbf": bytes(dbf),
        "prj": b'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.0174532925199433]]',
    }
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as archive:
        for extension, content in files.items():
            archive.writestr("R-AUTH_Trenches." + extension, content)
    return output.getvalue()


def main():
    context = ssl.create_default_context(cafile="/certificates/server.crt")
    session = Session(context)
    keycloak, app = "https://keycloak:8443", "https://app:8443"
    realm = keycloak + "/admin/realms/baikor-ci"
    status, body, _ = session.request(keycloak + "/realms/master/protocol/openid-connect/token", "POST", form={
        "grant_type": "password", "client_id": "admin-cli",
        "username": os.environ["BAIKOR_TEST_ADMIN_USERNAME"],
        "password": os.environ["BAIKOR_TEST_ADMIN_PASSWORD"],
    })
    if status != 200:
        raise RuntimeError("Disposable fixture administrator login failed")
    admin_headers = {"Authorization": "Bearer " + json.loads(body)["access_token"]}
    checks, failures = 0, 0

    def check(label, actual, expected):
        nonlocal checks, failures
        checks += 1
        passed = actual == expected
        failures += not passed
        print(f"{'PASS' if passed else 'FAIL'} {label}: {actual!r} (expected {expected!r})", flush=True)

    def read(path):
        status, body, _ = session.request(realm + path, headers=admin_headers)
        if status != 200:
            raise RuntimeError("Disposable fixture configuration lookup failed")
        return json.loads(body)

    browser = read("/clients?clientId=baikor-r")[0]
    importer = read("/clients?clientId=baikor-r-import")[0]
    check("browser full scope disabled", browser["fullScopeAllowed"], False)
    browser_scopes = read(f"/clients/{browser['id']}/scope-mappings/clients/{browser['id']}")
    check("explicit browser role scopes", sorted(role["name"] for role in browser_scopes),
          ["baikor_admin", "baikor_approver", "baikor_editor", "baikor_viewer"])
    check("machine full scope disabled", importer["fullScopeAllowed"], False)
    secret = read(f"/clients/{importer['id']}/client-secret")["value"]
    status, body, _ = session.request(keycloak + "/realms/baikor-ci/protocol/openid-connect/token", "POST", form={
        "grant_type": "client_credentials", "client_id": "baikor-r-import", "client_secret": secret,
    })
    check("real client credentials token", status, 200)
    if status != 200:
        return 1
    token = json.loads(body)["access_token"]
    claims = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    check("machine token contains only importer role", claims.get("roles"), ["baikor_importer"])
    audience = claims.get("aud", [])
    check("machine token targets Baikor API", "baikor-r" in ([audience] if isinstance(audience, str) else audience), True)
    headers = {"Authorization": "Bearer " + token}
    boundary = "baikor-fixture-import-boundary"
    upload = (f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="R-AUTH_Trenches.zip"\r\n'
              'Content-Type: application/zip\r\n\r\n').encode() + trench_archive() + f"\r\n--{boundary}--\r\n".encode()
    status, body, _ = session.request(app + "/api/construction-sites/imports/trenches", "POST", upload,
                                    {**headers, "Content-Type": "multipart/form-data; boundary=" + boundary})
    check("machine token imports without browser CSRF", status, 200)
    if status == 200:
        check("machine import creates a site", json.loads(body)["createdCount"], 1)
    site_path = "/api/construction-sites/00000000-0000-0000-0000-000000000001"
    for label, method, path in (
        ("list", "GET", "/api/construction-sites"),
        ("create", "POST", "/api/construction-sites"),
        ("update", "PUT", site_path),
        ("delete", "DELETE", site_path),
        ("bulk delete", "POST", "/api/construction-sites/bulk-delete"),
        ("status", "POST", site_path + "/status"),
    ):
        status, _, _ = session.request(app + path, method, headers=headers)
        check("machine token cannot " + label, status, 403)
    print(f"Completed {checks} machine-permission checks with {failures} failures", flush=True)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
