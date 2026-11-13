# SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
#
# SPDX-License-Identifier: MPL-2.0

FROM rust:1.95-bookworm AS realtime-builder
WORKDIR /build
COPY tools/realtime-rust/ ./
RUN cargo build --release --locked

FROM ghcr.io/astral-sh/uv:python3.14-trixie-slim AS builder


USER root

ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy
ENV UV_NO_DEV=1
ENV UV_PYTHON_DOWNLOADS=0

RUN apt update && \
    apt install -y gcc libpq5 libpq-dev libmagic1 zlib1g-dev libjpeg-dev

WORKDIR /app/

COPY gunicorn_conf.py /app/
COPY image_cleanup.py /app/image_cleanup.py
COPY alembic.ini /app/
COPY migrations/ /app/migrations/
COPY pyproject.toml uv.lock /app/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-install-project


COPY classquiz/ /app/classquiz/

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked




FROM python:3.14-slim-trixie

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libjpeg62-turbo \
        libmagic1 \
        libpq5 \
        zlib1g \
    && rm -rf /var/lib/apt/lists/*
# The image ships the standard library without bytecode, and the app runs as
# nonroot, which can't write __pycache__ there: every new Python process (the
# health checks run one every few seconds) recompiled it. Precompile once.
RUN python -c "import compileall, sysconfig; compileall.compile_dir(sysconfig.get_path('stdlib'), quiet=1, workers=0)"
WORKDIR /app


RUN groupadd --system --gid 9999 nonroot \
	&& useradd --system --gid 9999 --uid 9999 --create-home nonroot

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONUNBUFFERED=1
COPY *start.sh /app/
# Checkouts on Windows may have CRLF line endings.
RUN sed -i 's/\r$//' /app/*start.sh && chmod +x start.sh
COPY --from=realtime-builder /build/target/release/classquiz-realtime /usr/local/bin/classquiz-realtime
USER nonroot



COPY --from=builder --chown=nonroot:nonroot /app /app

# Fork: the API keeps listening on 80 (upstream moved to 8000) so the existing
# deploy files (gateway, health checks, frontend API_URL) work unchanged.
# Docker lets non-root processes bind low ports inside the container.
ENV PORT=80
EXPOSE 80
ENV PYTHONPATH=/app

ENV APP_MODULE=classquiz:app
CMD ["./start.sh"]
