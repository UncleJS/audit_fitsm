# CI Runbook

![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)
![CI](https://img.shields.io/badge/ci-github_actions-2088FF)
![Runtime](https://img.shields.io/badge/runtime-podman_only-5C4EE5)

Troubleshooting guide for `.github/workflows/ci.yml` and `scripts/ci-strict.sh`.

## Table of Contents

- [Scope](#scope)
- [Fast triage](#fast-triage)
- [Common failures and fixes](#common-failures-and-fixes)
- [Collect diagnostics](#collect-diagnostics)
- [Re-run strategy](#re-run-strategy)
- [License footer](#license-footer)

## Scope

This runbook covers failures in the strict CI pipeline:

- UI date-input policy enforcement
- Podman install and build
- Pod creation and container startup
- MariaDB startup and connectivity
- API/web startup inside `audit-fitsm-dev-ci`
- strict readiness checks (`basic` + `extended` + integration suite)

Primary files:

- `.github/workflows/ci.yml`
- `scripts/ci-strict.sh`
- `scripts/health-readiness.sh`
- `apps/api/scripts/health-readiness.ts`

[Go to TOC](#table-of-contents)

## Fast triage

1. Open the failing job step and identify the first failed command.
2. Match the failing step to `scripts/ci-strict.sh`.
3. Use the failure class below:
   - date-input policy check failure
   - host port preflight failure
   - image build failure
   - pod startup failure
   - DB not ready
   - API/web not reachable
   - auth/readiness failure
   - integration-suite failure
4. Apply the fix and re-run CI.

[Go to TOC](#table-of-contents)

## Common failures and fixes

### 0) Date-input policy failure

- Symptom: CI fails in `scripts/check-ui-date-inputs.sh`.
- Typical causes:
  - raw `type="date"` added outside wrapper component
- Fix:
  - move usage to `apps/web/app/components/date-only-input.tsx`
  - re-run `scripts/check-ui-date-inputs.sh` locally

### 1) Image build failure (`podman build`)

- Symptom: CI fails during build stage.
- Typical causes:
  - package registry/transient network issue
  - invalid `Containerfile.dev` change
- Fix:
  - re-run job once to rule out transient pull/install errors
  - if persistent, verify `Containerfile.dev` locally with `podman build -f Containerfile.dev .`

### 2) Port preflight failure

- Symptom: CI/local strict script fails before build with host-port conflict.
- Typical causes:
  - local services already using `1260/1261/1262`
- Fix:
  - stop conflicting services, or run local CI with alternate ports:
  - inspect holders/mappings with `scripts/ports.sh 1260 1261 1262`

```bash
DB_PORT=2262 APP_PORT=2261 WEB_PORT=2260 bash ./scripts/ci-strict.sh
```

### 3) DB readiness timeout

- Symptom: failure around MariaDB wait loop.
- Typical causes:
  - bad DB env values
  - startup delay under runner load
- Fix:
  - confirm `DB_USER`, `DB_PASSWORD`, `DB_NAME` align between DB and dev container env
  - increase loop count/sleep in `scripts/ci-strict.sh` only if repeated under load

### 4) API `/health` or `/ready` failing

- Symptom: readiness script fails at API checks.
- Typical causes:
  - API process did not start
  - migration table unavailable
- Fix:
  - inspect `/tmp/api.log` from CI artifacts/log output path
  - verify migration step completed before API checks

### 5) Web check timeout

- Symptom: readiness fails at web HTTP check.
- Typical causes:
  - Next.js dev warm-up slower than expected
  - process startup error
- Fix:
  - inspect `/tmp/web.log`
  - if needed, tune readiness attempt count in `health-readiness.ts`

### 6) Strict integration-suite failure

- Symptom: readiness passes basic checks but fails on integration.
- Typical causes:
  - API contract/regression change
  - auth/role behavior regression
- Fix:
  - inspect failing endpoint from test output
  - reproduce inside dev container with:

```bash
podman exec audit-fitsm-dev-ci bun run --cwd /workspace/apps/api integration:test
```

[Go to TOC](#table-of-contents)

## Collect diagnostics

For local reproduction, run:

```bash
bash ./scripts/ci-strict.sh
```

If it fails, gather:

- container list and state
- dev logs (`/tmp/api.log`, `/tmp/web.log`)
- DB container logs
- exact failing command and exit code

When testing locally and you need to keep containers after failure:

```bash
KEEP_CONTAINERS=1 bash ./scripts/ci-strict.sh
```

[Go to TOC](#table-of-contents)

## Re-run strategy

- Re-run once for transient network/build failures.
- If repeated, fix in branch and re-run full workflow.
- Prefer changing one variable at a time (build, DB readiness, API readiness, integration behavior) to keep root-cause clear.

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY-NC-SA 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
