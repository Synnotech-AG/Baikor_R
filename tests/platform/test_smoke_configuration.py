"""Check that the smoke CLI fails safely before contacting a platform."""

import os
from pathlib import Path
import subprocess
import sys
import unittest


SCRIPT = Path(__file__).with_name("test_keycloak_accounts.py")


class SmokeConfigurationTests(unittest.TestCase):
    def run_cli(self, *arguments, extra_environment=None):
        environment = dict(os.environ)
        environment.pop("BAIKOR_TEST_ADMIN_USERNAME", None)
        environment.pop("BAIKOR_TEST_ADMIN_PASSWORD", None)
        environment.update(extra_environment or {})
        return subprocess.run(
            [sys.executable, str(SCRIPT), *arguments],
            env=environment, capture_output=True, text=True, timeout=10,
        )

    def test_help_exposes_explicit_admin_source_and_kubernetes_context(self):
        result = self.run_cli("--help")
        self.assertEqual(result.returncode, 0)
        self.assertIn("--admin-source", result.stdout)
        self.assertIn("--kube-context", result.stdout)

    def test_environment_mode_requires_both_credentials_without_kubernetes_fallback(self):
        for environment in ({}, {"BAIKOR_TEST_ADMIN_USERNAME": "synthetic-user"},
                            {"BAIKOR_TEST_ADMIN_PASSWORD": "synthetic-password"}):
            with self.subTest(environment=list(environment)):
                result = self.run_cli("--admin-source", "environment", extra_environment=environment)
                self.assertEqual(result.returncode, 2)
                self.assertIn("Both BAIKOR_TEST_ADMIN_USERNAME and BAIKOR_TEST_ADMIN_PASSWORD", result.stderr)
                self.assertNotIn("Traceback", result.stderr)

    def test_plain_http_application_and_identity_urls_are_rejected(self):
        for option in ("--base-url", "--keycloak-url"):
            with self.subTest(option=option):
                result = self.run_cli(option, "http://localhost")
                self.assertEqual(result.returncode, 2)
                self.assertIn("HTTPS is required", result.stderr)


if __name__ == "__main__":
    unittest.main()
