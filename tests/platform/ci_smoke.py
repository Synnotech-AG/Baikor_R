"""Container entry point for the disposable fixture; never connects to Core."""

from pathlib import Path
import ssl
import subprocess
import sys
import time
import urllib.error
import urllib.request


def main():
    context = ssl.create_default_context(cafile="/certificates/server.crt")
    for name, url in (
        ("Keycloak", "https://keycloak:8443/realms/baikor-ci/.well-known/openid-configuration"),
        ("application", "https://app:8443/health/ready"),
    ):
        deadline = time.monotonic() + 180
        while True:
            try:
                with urllib.request.urlopen(url, context=context, timeout=5) as response:
                    if response.status == 200:
                        break
            except (urllib.error.URLError, TimeoutError):
                pass
            if time.monotonic() >= deadline:
                print(f"FAIL {name} did not become ready within 180 seconds", flush=True)
                return 1
            time.sleep(2)
    return subprocess.call([
        sys.executable, str(Path(__file__).with_name("test_keycloak_accounts.py")),
        "--base-url", "https://app:8443", "--keycloak-url", "https://keycloak:8443",
        "--realm", "baikor-ci", "--ca-file", "/certificates/server.crt",
        "--admin-source", "environment",
    ])


if __name__ == "__main__":
    raise SystemExit(main())
