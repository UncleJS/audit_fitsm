# Development Runtime Guide

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Runtime](https://img.shields.io/badge/runtime-podman_only-5C4EE5)

Container-first development workflow for the local Audit FitSM stack.

## Table of Contents

- [Runtime model](#runtime-model)
- [Install and start](#install-and-start)
- [Daily commands](#daily-commands)
- [When code changes do not appear](#when-code-changes-do-not-appear)
- [Inspecting runtime state](#inspecting-runtime-state)
- [License footer](#license-footer)

## Runtime model

- rootless Podman only
- no Docker
- no bind mounts for project source
- the dev image copies the repo into `/workspace` during build
- API and web services run inside the `audit-fitsm-dev` container

That means local source edits are not live inside the running container until the image/container is refreshed.

[Go to TOC](#table-of-contents)

## Install and start

```bash
scripts/install.sh
scripts/migrate.sh
scripts/bootstrap-admin.sh admin@example.com 'ChangeMe123!'
```

Regular lifecycle:

```bash
scripts/start.sh
scripts/stop.sh
scripts/restart.sh
```

[Go to TOC](#table-of-contents)

## Daily commands

Service and log inspection:

```bash
scripts/status.sh
scripts/logs.sh web
scripts/logs.sh api
scripts/logs.sh all
```

Run API integration tests in the dev container:

```bash
scripts/integration-test.sh
```

Run strict readiness checks:

```bash
scripts/health-readiness.sh strict
```

[Go to TOC](#table-of-contents)

## When code changes do not appear

This is the most common local development surprise in this repo.

If the browser or API still shows old behavior after a code change, rebuild and restart the dev runtime:

```bash
systemctl --user restart audit-fitsm-dev-build.service
systemctl --user restart audit-fitsm-dev.service
```

Then hard refresh the browser.

Typical symptoms of a stale dev container:

- old page layout still renders
- new buttons or text are missing
- new API behavior is not visible even though the repo files changed

[Go to TOC](#table-of-contents)

## Inspecting runtime state

Useful commands:

```bash
podman ps --format '{{.Names}}'
systemctl --user status audit-fitsm-dev-build.service audit-fitsm-dev.service audit-fitsm-api.service audit-fitsm-web.service --no-pager
scripts/logs.sh web
scripts/logs.sh api
```

API docs and local entrypoints:

- `http://localhost:1260/login`
- `http://localhost:1261/docs`
- `http://localhost:1261/openapi.json`
- `http://localhost:1263/`

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
