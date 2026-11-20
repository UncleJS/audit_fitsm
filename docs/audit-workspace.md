# Audit Workspace Guide

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](../LICENSE) [![CI](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/UncleJS/audit_fitsm/actions/workflows/ci.yml) [![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs)](https://nextjs.org)

Guide for the `/audits/:auditId` workspace used to carry out an audit.

## Table of Contents

- [Purpose](#purpose)
- [Workspace areas](#workspace-areas)
- [Saving behavior](#saving-behavior)
- [Permissions and lock rules](#permissions-and-lock-rules)
- [Exports and activity](#exports-and-activity)
- [Troubleshooting](#troubleshooting)

## Purpose

The audit workspace puts scoring, evidence capture, notes and history, audit details, the conclusion and export generation on one page. The browser reaches it with the `HttpOnly` session cookie described in [security-model.md](security-model.md). Manual saves appear in the top save block and the sticky save bar.

[↑ Back to TOC](#table-of-contents)

## Workspace areas

1. overview cards with client, date, process count and export count
2. audit status panel with allowed transitions
3. manual save buttons near the top of the page
4. sticky save controls while scrolling
5. process panels for scope, targets and requirement scoring
6. exports section for PDF and CSV output
7. audit activity section for audit-level history
8. audit details section
9. conclusion section

Dates show as `yyyy-MM-dd` and timestamps as local `yyyy-MM-dd HH:mm:ss` (see [ui-date-formatting.md](ui-date-formatting.md)).

[↑ Back to TOC](#table-of-contents)

## Saving behavior

- autosave runs after a short idle delay while editing
- autosave also runs when a field loses focus
- manual save buttons stay visible for explicit checkpoints
- save-state messages show whether the workspace is saving, saved or failed

Manual save actions:

- `Save scope & targets`
- `Save assessments`
- `Save details`
- `Save conclusion`
- `Save all`
- `Save status`

`Save status` stays manual because status changes are workflow transitions, not background field edits. While the user is active, the page keeps the session alive with `POST /auth/refresh`.

[↑ Back to TOC](#table-of-contents)

## Permissions and lock rules

- `Save all` and conclusion editing need lead auditor or org admin rights
- scope and certification targets are editable only while the audit is `draft`
- non-lead users become read-only when the audit reaches `completed`
- notes and history follow the same write permissions as assessment editing

[↑ Back to TOC](#table-of-contents)

## Exports and activity

- PDF exports can be generated, stored, listed and downloaded from the workspace
- CSV exports are available for `all`, `certification` and `gaps`
- the activity section shows status changes, saved detail and conclusion changes, and archive/restore events

[↑ Back to TOC](#table-of-contents)

## Troubleshooting

If save controls or recent UI changes do not appear in the running app, rebuild the image, restart the stack and hard refresh the browser:

```bash
scripts/build.sh
scripts/restart.sh
scripts/logs.sh dev
```

The project uses no bind mounts, so the running dev container does not see source changes until the image is rebuilt.

[↑ Back to TOC](#table-of-contents)

---

© 2026 UncleJS — Licensed under [AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.txt)
