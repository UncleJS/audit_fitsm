# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 UncleJS
FROM docker.io/oven/bun:1.2.22 AS bunbin

FROM registry.access.redhat.com/ubi10/ubi-minimal:10.3-1795196920

LABEL io.audit-fitsm.project="audit-fitsm"

ENV TZ=UTC \
    HOME=/home/app \
    BUN_INSTALL_CACHE_DIR=/home/app/.bun/install/cache

RUN microdnf install -y \
    ca-certificates \
    git \
    gzip \
    tar \
    shadow-utils \
    mariadb \
    && microdnf clean all \
    && groupadd --gid 1000 app \
    && useradd --uid 1000 --gid app --create-home --home-dir /home/app --shell /bin/bash app \
    && mkdir -p /workspace/.dev-volume /workspace/data/exports /workspace/data/backups /home/app/.bun/install/cache \
    && chown -R app:app /workspace /home/app

COPY --from=bunbin /usr/local/bin/bun /usr/local/bin/bun
COPY --from=bunbin /usr/local/bin/bunx /usr/local/bin/bunx

USER app
WORKDIR /workspace

# Dependency layer: only manifests and the lockfile, so source edits keep the cache.
COPY --chown=app:app package.json bun.lock ./
COPY --chown=app:app apps/api/package.json apps/api/package.json
COPY --chown=app:app apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

COPY --chown=app:app . .

CMD ["bash"]
