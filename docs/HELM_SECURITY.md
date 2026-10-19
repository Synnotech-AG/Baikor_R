# Helm resources and network policy

Both the application and migration Job request `50m` CPU / `128Mi` memory and
limit usage to `500m` CPU / `512Mi` memory by default. Set application `resources`
and `migrations.resources` independently. These are starting values: size them
for actual traffic and migration data volume, and check the namespace's
ResourceQuota and LimitRange before installation.

The CIVITAS add-on forwards `inv_addons.baikor_r.helm_values` through a recursive
merge. The same values work in a Helm values file. For example, this inventory
override gives migrations more CPU and memory without changing the application:

```yaml
inv_addons:
  baikor_r:
    helm_values:
      migrations:
        resources:
          requests:
            cpu: 100m
            memory: 256Mi
          limits:
            cpu: "1"
            memory: 1Gi
```

## Policy scope and migration ordering

`networkPolicy.enabled` defaults to `false`. Set it to `true` only after supplying
rules for your environment. **With empty `ingress` and `egress` lists, the policy
allows no application traffic in either direction.** It adds no automatic DNS,
database, identity-provider, ingress-controller, or metrics exceptions.

The policy selects the release's application pods using the chart name, release
name, and reserved `app.kubernetes.io/component: application` label. Custom
`podLabels` cannot override that component label. The existing Deployment
selector remains unchanged, so upgrades do not change an immutable field.

The migration Job is deliberately outside this policy. It runs as a
`pre-install,pre-upgrade` hook, before ordinary Helm resources are created or
updated. A policy covering the hook would therefore have different behavior on
first installation and upgrades. Namespace policies must separately permit
migration pods to resolve DNS and reach PostgreSQL **before Helm starts**. The
hook pods carry the chart's `app.kubernetes.io/name` and
`app.kubernetes.io/instance` labels but no application component label. This chart
does not provide migration network isolation. See the
[Helm hook lifecycle](https://helm.sh/docs/topics/charts_hooks/).

The application policy is a normal Helm resource and is removed when disabled or
the release is uninstalled. On an upgrade that introduces the component label,
old application pods are outside its scope until they are replaced; use an
existing namespace policy if isolation is required throughout the rollout.

## Configure dependency access

Rules use native Kubernetes `NetworkPolicyIngressRule` and
`NetworkPolicyEgressRule` lists. They are passed through as supplied, so numeric
or named ports, `namespaceSelector`, `podSelector`, and `ipBlock` are supported.
The following is an **illustrative values file**, not a CIVITAS preset. Replace
every namespace, pod label, and port with the verified deployment topology;
then put its `networkPolicy` block under `inv_addons.baikor_r.helm_values` when
using the add-on.

```yaml
networkPolicy:
  enabled: true
  ingress:
    # Ingress controller -> application pod (not the Service's port 80).
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: ingress-system
          podSelector:
            matchLabels:
              app.kubernetes.io/name: ingress-controller
      ports:
        - protocol: TCP
          port: 8080
    # Prometheus -> application metrics; omit if metrics are unused.
    - from:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: monitoring
          podSelector:
            matchLabels:
              app.kubernetes.io/name: prometheus
      ports:
        - protocol: TCP
          port: 9464
  egress:
    # Cluster DNS needs UDP and TCP. Check the actual resolver's labels.
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: kube-system
          podSelector:
            matchLabels:
              k8s-app: kube-dns
      ports:
        - protocol: UDP
          port: 53
        - protocol: TCP
          port: 53
    # PostgreSQL pod endpoint; change for your database operator's labels.
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: database
          podSelector:
            matchLabels:
              app.kubernetes.io/name: postgresql
      ports:
        - protocol: TCP
          port: 5432
    # Direct Keycloak HTTPS endpoint, only if the authority resolves here.
    - to:
        - namespaceSelector:
            matchLabels:
              kubernetes.io/metadata.name: identity
          podSelector:
            matchLabels:
              app.kubernetes.io/name: keycloak
      ports:
        - protocol: TCP
          port: 8443
```

Check these dependencies when adapting the example:

- Keep `namespaceSelector` and `podSelector` inside the same peer entry to require
  both. Separate entries allow either peer. A pod selector without a namespace
  selector selects within Baikor's namespace.
- Use the application's `service.targetPort` and `telemetry.metrics.port` for
  inbound traffic. Enabling a ServiceMonitor does not grant network access.
  Add peers for direct API clients if they bypass the ingress controller.
- Permit the actual DNS path. NodeLocal DNS, host-network resolvers, and ingress
  controllers may require CNI-specific configuration instead of pod selectors.
- Match the database endpoint and port from the configured connection string.
  External databases need explicit, narrow `ipBlock` entries as appropriate for
  your network plugin; a namespace selector cannot identify an external server.
- Keycloak discovery, key retrieval, and token exchange use
  `authentication.authority`. In CIVITAS this often uses the platform HTTPS
  ingress. Permit that ingress endpoint and destination port rather than assuming
  the request reaches the Keycloak pod directly. Check Service DNAT/SNAT behavior
  with the chosen CNI. Native NetworkPolicy has no FQDN selector; external
  authorities need maintained address rules or a platform-specific egress policy.

Enforcement requires a network plugin supporting NetworkPolicy. Policies are
additive: another policy may permit traffic this policy omits. An empty rule
object (`- {}`), omitted peers, or omitted ports can grant broad access; the chart
does not rewrite operator-supplied rules. See the
[Kubernetes NetworkPolicy documentation](https://kubernetes.io/docs/concepts/services-networking/network-policies/).

## Verification

Run the rendering regression tests using Python with PyYAML and Docker:

```bash
python -m unittest discover -s tests/helm -v
```

They use `alpine/helm:3.19.0` by default; `HELM_CLI_IMAGE` can select another image.
They verify default and overridden resource budgets, migration conditions,
disabled/enabled policy rendering, explicit peers and ports, application-only
selection, and the unchanged Deployment selector without contacting a cluster.
Render your own values and validate them with the target Kubernetes API before
rollout; runtime connectivity and CNI enforcement still need an environment test.
