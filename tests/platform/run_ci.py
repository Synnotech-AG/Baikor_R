"""Run the real OIDC smoke test in a fresh, isolated Docker Compose project."""

import argparse
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import tempfile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--image", help="Test an already built local application image instead of building it")
    parser.add_argument("--openssl", help="OpenSSL executable (also detects Git for Windows)")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    artifacts = root / "artifacts" / "platform-tests"
    artifacts.mkdir(parents=True, exist_ok=True)
    summary = artifacts / "summary.txt"
    summary.write_text("Platform test result: NOT RUN\n", encoding="utf-8")
    openssl = args.openssl or shutil.which("openssl")
    if not openssl and os.name == "nt":
        candidate = Path(os.environ.get("ProgramFiles", "C:/Program Files")) / "Git/usr/bin/openssl.exe"
        if candidate.is_file():
            openssl = str(candidate)
    if not openssl:
        parser.error("OpenSSL is required; install it or pass --openssl")

    project = "baikor-platform-" + secrets.token_hex(6)
    certificates = Path(tempfile.mkdtemp(prefix=project + "-", dir=artifacts)).resolve()
    # These ephemeral files are shared read-only with unprivileged application/Keycloak users.
    certificates.chmod(0o755)
    image = args.image or project + ":test"
    environment = dict(os.environ)
    environment.update(
        BAIKOR_TEST_ADMIN_USERNAME="baikor-ci-admin",
        BAIKOR_TEST_ADMIN_PASSWORD=secrets.token_urlsafe(32),
        BAIKOR_TEST_CLIENT_SECRET=secrets.token_urlsafe(32),
        BAIKOR_TEST_DB_PASSWORD=secrets.token_urlsafe(32),
        BAIKOR_TEST_CERTIFICATES=certificates.as_posix(),
        BAIKOR_TEST_APP_IMAGE=image,
    )
    compose = ["docker", "compose", "--project-name", project, "--file", str(Path(__file__).with_name("compose.yaml"))]
    stage = "certificate generation"
    result = 1
    lines = []
    cleanup_failed = False
    try:
        subprocess.run([
            openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
            "-subj", "/CN=Baikor disposable platform test",
            "-addext", "subjectAltName=DNS:app,DNS:keycloak",
            "-keyout", str(certificates / "server.key"),
            "-out", str(certificates / "server.crt"),
        ], check=True, capture_output=True)
        (certificates / "server.key").chmod(0o644)
        if not args.image:
            stage = "application image build"
            subprocess.run(["docker", "build", "--tag", image, str(root)], check=True)
        stage = "disposable services startup and database migration"
        subprocess.run([*compose, "up", "--detach", "app"], env=environment, check=True)
        stage = "real OIDC smoke test"
        smoke = subprocess.run([*compose, "run", "--rm", "--no-deps", "-T", "smoke"],
                               env=environment, capture_output=True, text=True, encoding="utf-8")
        # Persist only assertion results. Authentication response bodies, headers,
        # tokens, passwords and raw server logs never become uploaded artifacts.
        lines = [line for line in smoke.stdout.splitlines()
                 if line.startswith(("PASS ", "FAIL ", "Completed "))]
        for line in lines:
            print(line, flush=True)
        result = smoke.returncode
        if result and not any(line.startswith("FAIL ") for line in lines):
            lines.append("FAIL smoke process exited before completing assertions")
            print(lines[-1], flush=True)
        if result:
            # Traceback locations/types help diagnose fixtures without recording
            # exception messages that could contain authentication response data.
            for detail in smoke.stderr.splitlines():
                location = re.fullmatch(r'\s*File "(/tests/[A-Za-z0-9_./-]+)", line (\d+), in ([A-Za-z0-9_<>]+)', detail)
                exception = re.match(r'^([A-Za-z_][A-Za-z0-9_.]*(?:Error|Exception)|StopIteration):?', detail)
                if location:
                    lines.append(f"FAIL smoke traceback: {Path(location[1]).name}:{location[2]} in {location[3]}")
                    print(lines[-1], flush=True)
                elif exception:
                    lines.append(f"FAIL smoke exception type: {exception[1]}")
                    print(lines[-1], flush=True)
    except subprocess.CalledProcessError as error:
        lines.append(f"FAIL {stage}: command exited with status {error.returncode}")
        print(lines[-1], flush=True)
    except (OSError, KeyboardInterrupt) as error:
        lines.append(f"FAIL {stage}: {type(error).__name__}")
        print(lines[-1], flush=True)
    finally:
        cleanup = subprocess.run([*compose, "down", "--volumes", "--remove-orphans", "--timeout", "10"],
                                 env=environment, capture_output=True)
        if cleanup.returncode:
            cleanup_failed = True
            result = 1
            lines.append(f"FAIL cleanup for disposable Compose project {project}")
            print(lines[-1], flush=True)
        if not args.image:
            subprocess.run(["docker", "image", "rm", image], capture_output=True)
        # Verify the temporary directory is under this task's output before removal.
        if not cleanup_failed and certificates.is_relative_to(artifacts.resolve()):
            shutil.rmtree(certificates)
        verdict = "PASS" if result == 0 else "FAIL"
        summary.write_text(f"Platform test result: {verdict}\n" + "\n".join(lines) + "\n", encoding="utf-8")
        print(f"Sanitized summary: {summary}", flush=True)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
