# SPDX-FileCopyrightText: 2023 Marlon W (Mawoka)
#
# SPDX-License-Identifier: MPL-2.0

FROM rust:1.95-bookworm AS realtime-builder
WORKDIR /build
COPY tools/realtime-rust/ ./
RUN cargo build --release --locked

FROM python:3.13-slim

COPY Pipfile* /app/
WORKDIR /app/
RUN apt update && \
    apt install -y jq gcc libpq5 libpq-dev libmagic1 && \
    jq -r '.default | to_entries[] | .key + .value.version' Pipfile.lock > requirements.txt && \
    sed -i "s/psycopg2-binary/psycopg2/g" requirements.txt

RUN pip install -r requirements.txt && \
    apt remove -y jq gcc

COPY classquiz/ /app/classquiz/
COPY image_cleanup.py /app/image_cleanup.py
COPY alembic.ini /app/
COPY migrations/ /app/migrations/
COPY *start.sh /app/
COPY gunicorn_conf.py /app/
COPY --from=realtime-builder /build/target/release/classquiz-realtime /usr/local/bin/classquiz-realtime


EXPOSE 80
ENV PYTHONPATH=/app
RUN sed -i 's/\r$//' /app/*start.sh && chmod +x start.sh
ENV APP_MODULE=classquiz:app
CMD ["./start.sh"]
