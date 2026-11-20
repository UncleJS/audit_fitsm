# Development Runtime Guide

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Podman: rootless](https://img.shields.io/badge/Podman-rootless_+_Quadlet-892CA0?logo=podman)](https://podman.io) [![MariaDB 12.3 LTS](https://img.shields.io/badge/MariaDB-12.3_LTS-003545?logo=mariadb)](https://mariadb.org)

Container-first workflow for the local Audit FitSM stack. The lifecycle scripts are described in the [root README](../README.md#lifecycle-scripts).

## Table of Contents

- [Runtime model](#runtime-model)
- [Units and services](#units-and-services)
- [Install and start](#install-and-start)
- [Daily commands](#daily-commands)
- [When code changes do not appear](#when-code-changes-do-not-appear)
- [Inspecting runtime state](#inspecting-runtime-state)

## Runtime model

- rootless Podman only, managed with Quadlet units and `systemctl --user`; no Docker, no `sudo`
- no bind mounts: the `Containerfile` copies the repo into `/workspace` at build time; data lives in named volumes
- the dev image (`localhost/audit-fitsm-dev:latest`, UBI 10 minimal + Bun 1.2.22) runs as the non-root user `app`
- the API and the web UI both run in the `audit-fitsm-dev` container, started by `scripts/dev-entrypoint.sh`; if either exits, the container exits and systemd reports it
- MariaDB 12.3 runs in `audit-fitsm-db` in the same pod and is reached on `127.0.0.1:3306`; its port is never published
- phpMyAdmin is opt-in (`scripts/install.sh --with-phpmyadmin`), added through the drop-in `quadlet/audit-fitsm-pod.pod.d/phpmyadmin.conf`

Local source edits are not visible in the running container until the image is rebuilt and the container restarted.

[↑ Back to TOC](#table-of-contents)

## Units and services

The repo's `quadlet/` directory is the source of truth. `scripts/install.sh` copies the units to `~/.config/containers/systemd/` (rendering the repo path into `audit-fitsm-dev.build`) and runs `systemctl --user daemon-reload`.

| Unit file | systemd user service | Purpose |
|-----------|----------------------|---------|
| `audit-fitsm-pod.pod` | `audit-fitsm-pod-pod.service` | pod `audit-fitsm`, publishes `127.0.0.1:1260` and `127.0.0.1:1261` |
| `audit-fitsm-db.container` | `audit-fitsm-db.service` | MariaDB, UTC, health-checked |
| `audit-fitsm-dev.build` | `audit-fitsm-dev-build.service` | builds the dev image from `Containerfile` |
| `audit-fitsm-dev.container` | `audit-fitsm-dev.service` | API + web |
| `audit-fitsm-phpmyadmin.container` | `audit-fitsm-phpmyadmin.service` | opt-in, `127.0.0.1:1263` |
| `audit-fitsm-*.volume` | `audit-fitsm-*-volume.service` | named volumes `dev`, `db`, `bun-cache`, `exports`, `backups` |

[↑ Back to TOC](#table-of-contents)

## Install and start

```bash
scripts/install.sh --start          # add --with-phpmyadmin for phpMyAdmin
scripts/migrate.sh
scripts/bootstrap-admin.sh admin@example.com
```

`bootstrap-admin.sh` reads the password from `BOOTSTRAP_ADMIN_PASSWORD` or prompts for it (at least 12 characters).

Regular lifecycle:

```bash
scripts/start.sh
scripts/stop.sh
scripts/restart.sh
```

[↑ Back to TOC](#table-of-contents)

## Daily commands

```bash
scripts/status.sh
scripts/logs.sh dev          # API and web output
scripts/logs.sh db
scripts/logs.sh all --no-follow
scripts/integration-test.sh
scripts/health-readiness.sh strict
```

[↑ Back to TOC](#table-of-contents)

## When code changes do not appear

This is the most common local surprise. If the browser or API still shows old behavior after a code change, rebuild the image and restart:

```bash
scripts/build.sh            # add --no-cache to ignore the layer cache
scripts/restart.sh
```

Then hard refresh the browser. Typical symptoms of a stale container: the old layout still renders, new buttons or text are missing, or new API behavior is not visible.

[↑ Back to TOC](#table-of-contents)

## Inspecting runtime state

```bash
podman pod ps --filter label=io.audit-fitsm.project=audit-fitsm
podman ps --filter label=io.audit-fitsm.project=audit-fitsm --format '{{.Names}} {{.Status}}'
systemctl --user status audit-fitsm-pod-pod.service audit-fitsm-db.service audit-fitsm-dev.service --no-pager
scripts/ports.sh
```

Local entry points:

- `http://127.0.0.1:1260/login`
- `http://127.0.0.1:1261/docs` and `http://127.0.0.1:1261/openapi.json` (need a session; sign in through the web UI first)
- `http://127.0.0.1:1263/` (only with phpMyAdmin installed)

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
