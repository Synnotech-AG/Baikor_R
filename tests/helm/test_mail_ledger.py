"""Exercise legacy ledger conversion without reading a real mailbox or database."""
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
import uuid


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/mail-import-ledger.py"
HASH_A = "a" * 64
HASH_B = "b" * 64


class MailLedgerTests(unittest.TestCase):
    def convert(self, ledger):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / "ledger.json", Path(directory) / "receipts.sql"
            source.write_text(json.dumps(ledger))
            result = subprocess.run([sys.executable, str(SCRIPT), str(source), "--output", str(output)],
                                    capture_output=True, text=True, check=False)
            return result, output.read_text() if output.exists() else None

    def record(self, sha256, state="done"):
        return {"sha256": sha256, "state": state, "updatedAtUtc": "2026-11-26T10:00:00.000Z"}

    def test_all_completed_hashes_generate_mail_only_idempotent_receipts(self):
        result, sql = self.convert({"mail_import_" + HASH_A: self.record(HASH_A),
                                    "mail_import_" + HASH_B: self.record(HASH_B, "duplicate"),
                                    "unrelated_setting": "sensitive-unrelated-value"})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn(HASH_A, sql)
        self.assertIn(HASH_B, sql)
        self.assertIn('baikor.mail_import_legacy_receipts', sql)
        self.assertIn('ON CONFLICT ("Sha256") DO NOTHING', sql)
        self.assertNotIn("archive_import_receipts", sql)
        self.assertNotIn("sensitive-unrelated-value", sql + result.stdout + result.stderr)
        self.assertIn("2 completed hashes", result.stdout)

    def test_unresolved_entry_rejects_entire_snapshot_without_partial_output(self):
        for state in ("processing", "failed", "uncertain", "unknown"):
            with self.subTest(state=state):
                result, sql = self.convert({"mail_import_" + HASH_A: self.record(HASH_A),
                                            "mail_import_" + HASH_B: self.record(HASH_B, state)})
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(sql)

    def test_mismatched_or_invalid_hash_is_rejected(self):
        for record in (self.record(HASH_B), self.record("bad'; SELECT 1; --")):
            with self.subTest(record=record):
                result, sql = self.convert({"mail_import_" + HASH_A: record})
                self.assertNotEqual(result.returncode, 0)
                self.assertIsNone(sql)

    def test_empty_snapshot_does_not_silently_confirm_migration(self):
        result, sql = self.convert({"unrelated": True})
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(sql)

    def test_invalid_completion_timestamp_does_not_create_sql(self):
        entry = self.record(HASH_A)
        entry["updatedAtUtc"] = "not-a-timestamp'; SELECT 1; --"
        result, sql = self.convert({"mail_import_" + HASH_A: entry})
        self.assertNotEqual(result.returncode, 0)
        self.assertIsNone(sql)

    def test_generated_sql_can_be_applied_twice_without_affecting_manual_receipts(self):
        result, sql = self.convert({"mail_import_" + HASH_A: self.record(HASH_A),
                                    "mail_import_" + HASH_B: self.record(HASH_B)})
        self.assertEqual(result.returncode, 0, result.stderr)
        name = "baikor-ledger-test-" + uuid.uuid4().hex[:12]
        image = os.environ.get("POSTGIS_TEST_IMAGE", "postgis/postgis:16-3.4")
        started = subprocess.run(["docker", "run", "--detach", "--rm", "--network", "none",
                                  "--name", name, "--env", "POSTGRES_PASSWORD=disposable-ledger-test", image],
                                 capture_output=True, text=True, check=False, timeout=60)
        self.assertEqual(started.returncode, 0, started.stderr)
        try:
            deadline = time.monotonic() + 45
            while True:
                ready = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"],
                                       capture_output=True, check=False)
                if ready.returncode == 0:
                    break
                self.assertLess(time.monotonic(), deadline, "Disposable PostgreSQL did not become ready")
                time.sleep(0.2)
            schema = '''CREATE SCHEMA baikor;
CREATE TABLE baikor.mail_import_legacy_receipts ("Sha256" varchar(64) PRIMARY KEY, "ImportedAt" timestamptz NOT NULL);
CREATE TABLE baikor.archive_import_receipts ("Sha256" varchar(64) PRIMARY KEY);'''
            applied = subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
                                     input=schema + sql + sql, capture_output=True, text=True, check=False)
            self.assertEqual(applied.returncode, 0, applied.stderr)
            counts = subprocess.run(["docker", "exec", name, "psql", "-U", "postgres", "-Atc",
                                     "SELECT count(*) FROM baikor.mail_import_legacy_receipts; SELECT count(*) FROM baikor.archive_import_receipts;"],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(counts.returncode, 0, counts.stderr)
            self.assertEqual(counts.stdout.strip().splitlines(), ["2", "0"])
        finally:
            subprocess.run(["docker", "rm", "--force", name], capture_output=True, check=False)


if __name__ == "__main__":
    unittest.main()
