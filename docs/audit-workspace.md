# Audit Workspace Guide

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Workspace](https://img.shields.io/badge/workspace-audit-blue)

Guide for the `/audits/:auditId` workspace used to perform audit execution.

## Table of Contents

- [Purpose](#purpose)
- [Workspace areas](#workspace-areas)
- [Saving behavior](#saving-behavior)
- [Permissions and lock rules](#permissions-and-lock-rules)
- [Exports and activity](#exports-and-activity)
- [Troubleshooting](#troubleshooting)
- [License footer](#license-footer)

## Purpose

The audit workspace groups the audit into one page for scoring, evidence capture, notes/history, audit details, conclusion, and export generation.

[Go to TOC](#table-of-contents)

## Workspace areas

1. overview cards with client, date, process count, and export count
2. audit status panel with allowed transition handling
3. manual save buttons near the top of the page
4. sticky save controls while scrolling
5. process panels for scope, targets, and requirement scoring
6. exports section for PDF and CSV output
7. audit activity section for audit-level history
8. audit details section
9. conclusion section

[Go to TOC](#table-of-contents)

## Saving behavior

The workspace uses both autosave and manual save controls.

- autosave runs after a short idle delay while editing
- autosave also triggers when a field loses focus
- manual save buttons remain visible for explicit checkpoints
- save-state messaging shows whether the workspace is saving, saved, or failed

Manual save actions:

- `Save scope & targets`
- `Save assessments`
- `Save details`
- `Save conclusion`
- `Save all`
- `Save status`

`Save status` remains a manual action because status changes are workflow transitions, not background field edits.

[Go to TOC](#table-of-contents)

## Permissions and lock rules

- `Save all` and conclusion editing require lead auditor or org admin access
- scope and certification target edits are allowed only while the audit is `draft`
- non-lead users become read-only when the audit reaches `completed`
- notes/history follow the same write permission model as assessment editing

[Go to TOC](#table-of-contents)

## Exports and activity

- PDF exports can be generated, stored, listed, and downloaded from the workspace
- CSV exports are available for `all`, `certification`, and `gaps`
- the activity section shows status changes plus saved detail/conclusion changes and archive/restore events

[Go to TOC](#table-of-contents)

## Troubleshooting

If save controls or recent UI changes do not appear in the running app:

1. rebuild the dev image
2. restart the dev container
3. hard refresh the browser

Commands:

```bash
systemctl --user restart audit-fitsm-dev-build.service
systemctl --user restart audit-fitsm-dev.service
scripts/logs.sh web
scripts/logs.sh api
```

Because the project avoids bind mounts, the running dev container does not automatically see source changes made on the host until the image/container is refreshed.

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
