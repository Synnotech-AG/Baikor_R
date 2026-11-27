"""Native IMAP checks against disposable Dovecot, PostGIS and real OIDC cookies.

Invoked only by the baikor-ci Compose fixture. No production mailboxes or users.
"""

from email.message import EmailMessage
from email.policy import SMTP
import hashlib
import imaplib
import os
import time

from test_keycloak_accounts import Forms, Session
from test_keycloak_importer import trench_archive


BASE_PATH = "/api/settings/mail-import"


def settings_request(settings, **changes):
    fields = ("enabled", "host", "port", "security", "username", "folder",
              "pollIntervalSeconds", "bufferMetres", "version")
    return {**{key: settings[key] for key in fields}, **changes}


def verify_mail_import(base, sessions, marker, check, context):
    administrator = sessions["admin"]
    password = os.environ["BAIKOR_TEST_MAIL_PASSWORD"]
    deadline = time.monotonic() + 90
    while True:
        try:
            mailbox = imaplib.IMAP4_SSL("imap", 31993, ssl_context=context, timeout=10)
            mailbox.login("baikor-mail-fixture", password)
            mailbox.select("INBOX")
            break
        except (OSError, imaplib.IMAP4.error):
            if time.monotonic() >= deadline:
                raise RuntimeError("Disposable IMAP server did not become ready")
            time.sleep(1)

    messages = {}

    def append(attachments, seen=False):
        message = EmailMessage(policy=SMTP)
        message["From"] = "synthetic-sender@example.test"
        message["To"] = "synthetic-import@example.test"
        message["Subject"] = "Synthetic fixture mail, never persisted in Baikor"
        message.set_content("Synthetic body, never persisted in Baikor")
        for filename, data in attachments:
            message.add_attachment(data, maintype="application", subtype="octet-stream", filename=filename)
        raw = message.as_bytes()
        status, _ = mailbox.append("INBOX", "(\\Seen \\Flagged)" if seen else "(\\Flagged)", None, raw)
        if status != "OK":
            raise RuntimeError("Disposable IMAP message setup failed")
        mailbox.select("INBOX")
        status, data = mailbox.uid("SEARCH", None, "ALL")
        uid = max(int(value) for value in data[0].split())
        messages[uid] = (seen, hashlib.sha256(raw).hexdigest())
        return uid

    def history():
        status, result = administrator.api(base, BASE_PATH + "/history?page=1&pageSize=100")
        if status != 200:
            raise RuntimeError("Mail history could not be read")
        return result["items"]

    def wait_history(filename, expected, attempts=1):
        deadline = time.monotonic() + 60
        while True:
            item = next((item for item in history() if item["fileName"] == filename), None)
            if item and item["state"] == expected and item["attempts"] >= attempts:
                return item
            if time.monotonic() >= deadline:
                raise RuntimeError("Native mail work did not reach expected state")
            time.sleep(0.5)

    def read_settings():
        status, result = administrator.api(base, BASE_PATH)
        if status != 200:
            raise RuntimeError("Mail settings could not be read")
        return result

    def save(settings, **changes):
        status, result = administrator.api(base, BASE_PATH, "PUT", settings_request(settings, **changes))
        check("mail settings mutation succeeds", status, 200)
        if status != 200:
            raise RuntimeError("Cannot continue without saved mail settings")
        return result

    try:
        old_archive = trench_archive("R-MAIL-OLD-" + marker)
        append([("old-before-enable.zip", old_archive)], seen=True)

        anonymous_status, anonymous_body, _ = Session(context).request(base + BASE_PATH)
        check("anonymous mail settings request challenges for OIDC login", anonymous_status == 200
              and any("username" in form["fields"] for form in Forms(anonymous_body).forms), True)
        for role in ("none", "viewer", "editor", "approver"):
            for method, suffix in (("GET", ""), ("PUT", ""), ("POST", "/test"),
                                   ("POST", "/check"), ("GET", "/status"), ("GET", "/history"),
                                   ("POST", "/history/00000000-0000-0000-0000-000000000001/retry")):
                check(f"{role} cannot access mail {method} {suffix or 'settings'}",
                      sessions[role].api(base, BASE_PATH + suffix, method, {} if method == "PUT" else None)[0], 403)

        settings = read_settings()
        check("admin starts with an unconfigured mailbox", (settings["host"], settings["hasPassword"]), ("", False))
        configured = settings_request(settings, enabled=False, host="imap", port=31993,
                                      security="sslOnConnect", username="baikor-mail-fixture",
                                      folder="INBOX", pollIntervalSeconds=30, bufferMetres=1,
                                      password=password)
        for method, suffix in (("PUT", ""), ("POST", "/test"), ("POST", "/check"),
                               ("POST", "/history/00000000-0000-0000-0000-000000000001/retry")):
            check(f"mail {method} {suffix or 'settings'} requires cookie CSRF",
                  administrator.api(base, BASE_PATH + suffix, method, configured, csrf=False)[0], 400)
        settings = save(settings, **{key: value for key, value in configured.items() if key != "version"})
        check("mail settings indicate stored password", settings["hasPassword"], True)
        check("mail settings expose no password or encrypted credential",
              any("password" in key.lower() and key != "hasPassword" for key in settings), False)
        check("mail settings encryption key configured", settings["encryptionConfigured"], True)
        connection = {key: settings[key] for key in ("host", "port", "security", "username", "folder")}
        check("saved password connection test succeeds", administrator.api(base, BASE_PATH + "/test", "POST",
              {**connection, "useSavedPassword": True})[0], 200)
        starttls = {**connection, "port": 31143, "security": "startTls"}
        check("saved password stays bound to the configured mail connection", administrator.api(base, BASE_PATH + "/test", "POST",
              {**starttls, "useSavedPassword": True})[0], 400)
        check("required STARTTLS connection test succeeds with an explicit password", administrator.api(base, BASE_PATH + "/test", "POST",
              {**starttls, "password": password})[0], 200)
        check("connection test leaves saved version unchanged", read_settings()["version"], settings["version"])
        check("connection test does not activate baseline", administrator.api(base, BASE_PATH + "/status")[1]["activatedAt"], None)
        check("draft test does not silently reuse saved password", administrator.api(base, BASE_PATH + "/test", "POST", connection)[0], 400)

        settings = save(settings, enabled=True)
        check("first activation records new-mail baseline", administrator.api(base, BASE_PATH + "/status")[1]["activatedAt"] is not None, True)
        check("check now schedules promptly", administrator.api(base, BASE_PATH + "/check", "POST")[0], 202)
        first = trench_archive("R-MAIL-NEW-SEEN-" + marker)
        second = trench_archive("R-MAIL-NEW-UNSEEN-" + marker)
        append([("new-seen.ZIP", first), ("bad.zip", b"invalid-archive")], seen=True)
        append([("new-unseen.zip", second)], seen=False)
        append([("ignored.txt", b"not an archive")], seen=False)
        administrator.api(base, BASE_PATH + "/check", "POST")
        seen = wait_history("new-seen.ZIP", "imported")
        unseen = wait_history("new-unseen.zip", "imported")
        invalid = wait_history("bad.zip", "failed")
        check("seen new mail imports a construction site", seen["createdCount"], 1)
        check("unseen new mail imports a construction site", unseen["createdCount"], 1)
        check("invalid sibling ZIP does not prevent valid attachment", invalid["errorKey"], "mailImport.archiveInvalid")
        check("pre-activation archive never enters processing history", any(item["fileName"] == "old-before-enable.zip" for item in history()), False)
        check("non-ZIP attachment never enters importer", any(item["fileName"] == "ignored.txt" for item in history()), False)
        check("history excludes sender, recipients, subject and body",
              any(any(word in key.lower() for word in ("sender", "recipient", "subject", "body")) for item in history() for key in item), False)

        def hash_count(content):
            digest = hashlib.sha256(content).hexdigest()
            status, sites = administrator.api(base, "/api/construction-sites")
            if status != 200:
                raise RuntimeError("Imported construction sites could not be verified")
            return sum(site.get("metadata", {}).get("import.fileSha256") == digest for site in sites)

        check("old mail created no construction sites", hash_count(old_archive), 0)
        check("seen mail appears in construction-site workspace", hash_count(first), 1)
        check("unseen mail appears in construction-site workspace", hash_count(second), 1)
        append([("duplicate.zip", first)])
        administrator.api(base, BASE_PATH + "/check", "POST")
        duplicate = wait_history("duplicate.zip", "duplicate")
        check("mail without a ZIP leaves no history entry", any(item["state"] == "ignored" for item in history()), False)
        status, processed = administrator.api(base, BASE_PATH + "/history?processedOnly=true&pageSize=2")
        check("processed history can be read", status, 200)
        check("processed history counts only completed import attempts", processed["totalCount"], 3)
        check("processed history applies pagination after filtering", len(processed["items"]), 2)
        check("processed history includes a completion time and import outcome",
              all(item["completedAt"] and item["state"] in ("failed", "imported") for item in processed["items"]), True)
        check("duplicate mail cannot be retried", duplicate["canRetry"], False)
        check("duplicate mail creates no second site", hash_count(first), 1)
        check("successful mail cannot be retried", administrator.api(base, BASE_PATH + f"/history/{seen['id']}/retry", "POST")[0], 400)
        check("invalid mail can be explicitly retried", administrator.api(base, BASE_PATH + f"/history/{invalid['id']}/retry", "POST")[0], 202)
        retried = wait_history("bad.zip", "failed", attempts=2)
        check("retry attempt is durable and visible", retried["attempts"], 2)

        settings = save(read_settings(), enabled=False)
        paused = trench_archive("R-MAIL-PAUSED-" + marker)
        append([("during-pause.zip", paused)], seen=True)
        check("paused mail cannot schedule a check", administrator.api(base, BASE_PATH + "/check", "POST")[0], 400)
        settings = save(settings, enabled=True)
        administrator.api(base, BASE_PATH + "/check", "POST")
        wait_history("during-pause.zip", "imported")
        check("resume retains cursor and includes mail received while paused", hash_count(paused), 1)

        new_folder = "updated-" + marker
        check("disposable test folder can be created", mailbox.create(new_folder)[0], "OK")
        status, _ = administrator.api(base, BASE_PATH, "PUT", settings_request(settings, folder=new_folder + "-missing"))
        check("invalid folder is rejected while mail import is active", status, 503)
        after_failure = read_settings()
        check("failed active edit preserves mailbox and version", (after_failure["folder"], after_failure["version"]),
              (settings["folder"], settings["version"]))
        settings = save(settings, folder=new_folder)
        check("admin changes the active folder in one save", (settings["enabled"], settings["folder"]), (True, new_folder))

        for uid, (seen_flag, content_hash) in messages.items():
            status, parts = mailbox.uid("FETCH", str(uid), "(FLAGS BODY.PEEK[])")
            if status != "OK":
                raise RuntimeError("Disposable source mail disappeared")
            message_data = next(part for part in parts if isinstance(part, tuple))
            flags = imaplib.ParseFlags(message_data[0])
            check("mail processing preserves read/unread flag", b"\\Seen" in flags, seen_flag)
            check("mail processing preserves existing flagged flag", b"\\Flagged" in flags, True)
            check("mail processing preserves original message bytes", hashlib.sha256(message_data[1]).hexdigest(), content_hash)
        check("mail processing does not move or delete messages", int(mailbox.select("INBOX")[1][0]), len(messages))
    finally:
        try:
            settings = read_settings()
            administrator.api(base, BASE_PATH, "PUT", settings_request(settings, enabled=False))
        finally:
            mailbox.logout()
