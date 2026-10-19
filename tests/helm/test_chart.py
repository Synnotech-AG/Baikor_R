"""Render chart security settings with Helm; no Kubernetes connection is used.

Requires Python/PyYAML and Docker. HELM_CLI_IMAGE overrides the Helm image.
Run: python -m unittest discover -s tests/helm -v
"""

import os
from pathlib import Path
import subprocess
import unittest

import yaml


ROOT = Path(__file__).resolve().parents[2]
HELM_IMAGE = os.environ.get("HELM_CLI_IMAGE", "alpine/helm:3.19.0")
DEFAULT_RESOURCES = {
    "requests": {"cpu": "50m", "memory": "128Mi"},
    "limits": {"cpu": "500m", "memory": "512Mi"},
}


class HelmChartTests(unittest.TestCase):
    def render(self, values=None, release="chart-test"):
        result = subprocess.run(
            ["docker", "run", "--rm", "-i", "--volume", f"{ROOT}:/workspace:ro",
             "--workdir", "/workspace", HELM_IMAGE,
             "template", release, "deploy/helm/baikor-r", "--namespace", "baikor-test",
             "--values", "-"],
            input=yaml.safe_dump(values or {}), capture_output=True, text=True,
            timeout=60, check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return [document for document in yaml.safe_load_all(result.stdout) if document]

    def resource(self, manifests, kind):
        matches = [item for item in manifests if item["kind"] == kind]
        self.assertEqual(len(matches), 1, f"Expected one {kind}, found {len(matches)}")
        return matches[0]

    def test_default_chart_has_application_resources_without_policy_or_migration(self):
        manifests = self.render()
        deployment = self.resource(manifests, "Deployment")
        self.assertEqual(deployment["spec"]["template"]["spec"]["containers"][0]["resources"],
                         DEFAULT_RESOURCES)
        self.assertNotIn("NetworkPolicy", [item["kind"] for item in manifests])
        self.assertNotIn("Job", [item["kind"] for item in manifests])

    def test_migration_gets_resources_for_each_database_configuration(self):
        for database in ({"existingSecret": {"name": "runtime-database"}},
                         {"migrationExistingSecret": {"name": "owner-database"}},
                         {"connectionString": "Host=postgres;Database=baikor"}):
            with self.subTest(database=database):
                job = self.resource(self.render({"database": database}), "Job")
                self.assertEqual(job["spec"]["template"]["spec"]["containers"][0].get("resources"),
                                 DEFAULT_RESOURCES)
                self.assertEqual(job["metadata"]["annotations"]["helm.sh/hook"],
                                 "pre-install,pre-upgrade")

    def test_application_and_migration_resources_can_be_overridden_independently(self):
        app = {"requests": {"cpu": "100m", "memory": "256Mi"},
               "limits": {"cpu": "1", "memory": "1Gi"}}
        migration = {"requests": {"cpu": "200m", "memory": "384Mi"},
                     "limits": {"cpu": "2", "memory": "2Gi"}}
        manifests = self.render({"database": {"existingSecret": {"name": "database"}},
                                 "resources": app, "migrations": {"resources": migration}})
        for kind, expected in (("Deployment", app), ("Job", migration)):
            with self.subTest(kind=kind):
                container = self.resource(manifests, kind)["spec"]["template"]["spec"]["containers"][0]
                self.assertEqual(container.get("resources"), expected)

    def test_disabling_migrations_suppresses_the_hook_even_with_database_configured(self):
        manifests = self.render({"database": {"existingSecret": {"name": "database"}},
                                 "migrations": {"enabled": False}})
        self.assertNotIn("Job", [item["kind"] for item in manifests])

    def test_enabling_policy_without_rules_is_application_only_deny_all(self):
        manifests = self.render({"database": {"existingSecret": {"name": "database"}},
                                 "networkPolicy": {"enabled": True}})
        policy = self.resource(manifests, "NetworkPolicy")
        self.assertEqual(policy["apiVersion"], "networking.k8s.io/v1")
        self.assertEqual(policy["spec"]["policyTypes"], ["Ingress", "Egress"])
        self.assertEqual(policy["spec"]["ingress"], [])
        self.assertEqual(policy["spec"]["egress"], [])
        self.assertNotIn("helm.sh/hook", policy["metadata"].get("annotations", {}))
        expected_selector = {"app.kubernetes.io/name": "baikor-r",
                             "app.kubernetes.io/instance": "chart-test",
                             "app.kubernetes.io/component": "application"}
        self.assertEqual(policy["spec"]["podSelector"]["matchLabels"], expected_selector)
        deployment = self.resource(manifests, "Deployment")
        application_labels = deployment["spec"]["template"]["metadata"]["labels"]
        self.assertTrue(expected_selector.items() <= application_labels.items())
        migration_labels = self.resource(manifests, "Job")["spec"]["template"]["metadata"]["labels"]
        self.assertFalse(expected_selector.items() <= migration_labels.items())
        self.assertEqual(deployment["spec"]["selector"]["matchLabels"], {
            "app.kubernetes.io/name": "baikor-r", "app.kubernetes.io/instance": "chart-test",
        }, "The existing immutable Deployment selector must stay unchanged")

    def test_policy_preserves_explicit_peers_and_ports_and_release_scope(self):
        ingress = [{"from": [{"namespaceSelector": {"matchLabels": {"name": "ingress"}},
                              "podSelector": {"matchLabels": {"app": "gateway"}}}],
                    "ports": [{"protocol": "TCP", "port": 8081}]}]
        egress = [{"to": [{"namespaceSelector": {"matchLabels": {"name": "dns"}},
                           "podSelector": {"matchLabels": {"app": "resolver"}}}],
                   "ports": [{"protocol": "UDP", "port": 53}, {"protocol": "TCP", "port": 53}]},
                  {"to": [{"ipBlock": {"cidr": "192.0.2.7/32"}}],
                   "ports": [{"protocol": "TCP", "port": 5432}]}]
        manifests = self.render({"nameOverride": "custom-app", "fullnameOverride": "custom-name",
                                 "service": {"targetPort": 8081},
                                 "networkPolicy": {"enabled": True, "ingress": ingress, "egress": egress}},
                                release="second-release")
        policy = self.resource(manifests, "NetworkPolicy")
        self.assertEqual(policy["metadata"]["name"], "custom-name")
        self.assertEqual(policy["spec"]["ingress"], ingress)
        self.assertEqual(policy["spec"]["egress"], egress)
        self.assertEqual(policy["spec"]["podSelector"]["matchLabels"], {
            "app.kubernetes.io/name": "custom-app", "app.kubernetes.io/instance": "second-release",
            "app.kubernetes.io/component": "application",
        })

    def test_custom_pod_labels_cannot_exclude_application_from_the_policy(self):
        manifests = self.render({"networkPolicy": {"enabled": True},
                                 "podLabels": {"app.kubernetes.io/component": "custom", "team": "platform"}})
        labels = self.resource(manifests, "Deployment")["spec"]["template"]["metadata"]["labels"]
        self.assertEqual(labels["app.kubernetes.io/component"], "application")
        self.assertEqual(labels["team"], "platform")


if __name__ == "__main__":
    unittest.main()
