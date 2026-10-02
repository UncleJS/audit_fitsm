# Security model

![License: CC BY 4.0](https://img.shields.io/badge/License-CC_BY_4.0-lightgrey.svg)
![Security](https://img.shields.io/badge/security-model-blue)

How Audit FitSM authenticates browsers, authorizes org roles, and treats local-only secrets.

## Table of Contents

- [Session](#session)
- [Authorization](#authorization)
- [Limits and files](#limits-and-files)
- [Local defaults](#local-defaults)
- [License footer](#license-footer)

## Session

`POST /auth/login` verifies the password with argon2id, then sets an httpOnly `SameSite=Strict` cookie named `audit_fitsm_session`. The JSON body still includes `accessToken` so scripts and the integration suite can send `Authorization: Bearer`.

The web UI calls the API with `credentials: "include"` and does not store the token. Mutations authenticated by the cookie must send `x-audit-fitsm: 1`. Bearer requests do not need that header.

`POST /auth/logout` clears the cookie. `/logout` calls that endpoint before returning to `/login`.

[Go to TOC](#table-of-contents)

## Authorization

Each request checks the token version against `users.token_version`, then loads org roles from `org_user_roles`. Role changes and password resets increment the token version, so older tokens stop working even if they still contain a previous role list.

Non-system-admin users belong to one client. Completed audits stay locked for roles below lead auditor.

[Go to TOC](#table-of-contents)

## Limits and files

Login attempts are limited separately from the general API limit: 10 attempts per 15 minutes for each IP and email. `X-Forwarded-For` is used only when `TRUST_PROXY=1`.

PDF downloads resolve `file_path` under `EXPORTS_DIR` and reject `..`. CSV cells that look like spreadsheet formulas are prefixed with a quote.

The web, API, database, and phpMyAdmin ports are published on `127.0.0.1` only.

[Go to TOC](#table-of-contents)

## Local defaults

`JWT_SECRET=replace-with-strong-secret` and `DB_PASSWORD=change_me` are refused unless `ALLOW_INSECURE_DEFAULTS=1`. Production and staging refuse those values even when the flag is set. The local Quadlet units and CI set the flag because they are loopback development environments.

[Go to TOC](#table-of-contents)

## License footer

© Audit FitSM contributors. Licensed under [CC BY 4.0](../LICENSE.md).

[Go to TOC](#table-of-contents)
