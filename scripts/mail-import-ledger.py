#!/usr/bin/env python3
"""Convert a quiesced Node-RED durable flow.json snapshot to mail-only receipts.

This tool never connects to a mailbox or database. Review and execute its SQL
using the database owner's normal protected connection after native migrations.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys


HASH = re.compile(r"[a-f0-9]{64}")


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Snapshot contains duplicate JSON properties.")
        result[key] = value
    return result


def read_receipts(path):
    if path.stat().st_size > 64 * 1024 * 1024:
        raise ValueError("Snapshot exceeds the 64 MiB limit.")
    try:
        ledger = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_object)
    except json.JSONDecodeError:
        raise ValueError("Snapshot is not valid JSON.") from None
    if not isinstance(ledger, dict):
        raise ValueError("Snapshot must be the durable flow.json object.")
    receipts = []
    for key, entry in ledger.items():
        if not key.startswith("mail_import_"):
            continue
        sha256 = key.removeprefix("mail_import_")
        if not HASH.fullmatch(sha256) or not isinstance(entry, dict) or entry.get("sha256") != sha256:
            raise ValueError("Snapshot contains an invalid or mismatched mail hash.")
        if entry.get("state") not in ("done", "duplicate"):
            raise ValueError("Snapshot contains unresolved mail entries. Reconcile them before cutover.")
        try:
            stamp = datetime.fromisoformat(entry["updatedAtUtc"].replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError()
            imported_at = stamp.astimezone(timezone.utc).isoformat()
        except (KeyError, TypeError, AttributeError, ValueError, OverflowError):
            raise ValueError("Snapshot contains a missing or invalid completion timestamp.") from None
        receipts.append((sha256, imported_at))
    if not receipts:
        raise ValueError("Snapshot contains no completed mail hashes; migration was not generated.")
    return sorted(receipts)


def make_sql(receipts):
    rows = ",\n".join(f"('{sha256}', '{stamp}'::timestamptz)" for sha256, stamp in receipts)
    return f'''-- Mail-only suppression receipts. Contains no credentials or message content.
-- Apply after native-mail migrations, with both mail workers paused.
BEGIN;
CREATE TEMP TABLE legacy_mail_snapshot (
    "Sha256" varchar(64) PRIMARY KEY,
    "ImportedAt" timestamptz NOT NULL
) ON COMMIT DROP;
INSERT INTO legacy_mail_snapshot ("Sha256", "ImportedAt") VALUES
{rows};
INSERT INTO baikor.mail_import_legacy_receipts ("Sha256", "ImportedAt")
SELECT "Sha256", "ImportedAt" FROM legacy_mail_snapshot
ON CONFLICT ("Sha256") DO NOTHING;
DO $$
BEGIN
    IF EXISTS (SELECT "Sha256" FROM legacy_mail_snapshot
               EXCEPT SELECT "Sha256" FROM baikor.mail_import_legacy_receipts) THEN
        RAISE EXCEPTION 'Legacy mail receipt verification failed';
    END IF;
END $$;
SELECT count(*) AS legacy_hashes_verified FROM legacy_mail_snapshot;
COMMIT;
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.snapshot.resolve() == args.output.resolve():
            raise ValueError("Output must differ from the source snapshot.")
        receipts = read_receipts(args.snapshot)
        args.output.write_text(make_sql(receipts), encoding="utf-8")
    except (OSError, UnicodeError, ValueError) as error:
        # Validation messages contain no snapshot values or mailbox details.
        print(f"Ledger migration stopped: {error}", file=sys.stderr)
        return 1
    fingerprint = hashlib.sha256("\n".join(row[0] for row in receipts).encode("ascii")).hexdigest()
    print(f"Generated {len(receipts)} completed hashes; set SHA-256: {fingerprint}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
