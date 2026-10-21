"""Check real migrations only inside the disposable Compose fixture."""

import subprocess


def sql(compose, environment, statement):
    result = subprocess.run(
        [*compose, "exec", "-T", "postgis", "psql", "--username", "baikor_test",
         "--dbname", "baikor_test", "--no-psqlrc", "--tuples-only", "--no-align",
         "--set", "ON_ERROR_STOP=1"],
        input=statement, env=environment, capture_output=True, text=True, encoding="utf-8",
        check=True,
    )
    return result.stdout.strip()


def prepare_database(compose, environment):
    # An unrelated table must survive first-time application schema creation.
    sql(compose, environment, """
        CREATE SCHEMA baikor;
        CREATE TABLE baikor.platform_test_marker (value text NOT NULL);
        INSERT INTO baikor.platform_test_marker VALUES ('preserve-on-first-install');
    """)


def verify_database(compose, environment):
    lines = []

    def check(label, actual, expected):
        verdict = "PASS" if actual == expected else "FAIL"
        lines.append(f"{verdict} {label}: {actual!r} (expected {expected!r})")

    marker_exists = sql(compose, environment,
                        "SELECT to_regclass('baikor.platform_test_marker') IS NOT NULL;") == "t"
    marker = sql(compose, environment, "SELECT value FROM baikor.platform_test_marker;") if marker_exists else None
    check("initial migration preserves unrelated schema data", marker, "preserve-on-first-install")
    check("application tables created", sql(compose, environment, """
        SELECT count(*) FROM information_schema.tables
        WHERE table_schema = 'baikor' AND table_type = 'BASE TABLE'
        AND table_name IN ('construction_sites', 'construction_site_areas',
                           'construction_site_contacts', 'construction_site_attachments',
                           'construction_site_communications');
    """), "5")
    check("latest construction-site metadata column created", sql(compose, environment, """
        SELECT data_type FROM information_schema.columns
        WHERE table_schema = 'baikor' AND table_name = 'construction_sites' AND column_name = 'Metadata';
    """), "jsonb")
    check("public views created", sql(compose, environment, """
        SELECT count(*) FROM information_schema.views WHERE table_schema = 'baikor'
        AND table_name IN ('public_construction_site_areas', 'public_construction_sites');
    """), "2")
    check("current public search geometry created", sql(compose, environment, """
        SELECT type || ':' || srid FROM geometry_columns
        WHERE f_table_schema = 'baikor' AND f_table_name = 'public_construction_sites';
    """), "POINT:25832")
    return lines
