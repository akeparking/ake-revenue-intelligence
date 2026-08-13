#!/bin/sh
set -eu

backup_once() {
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  for database in revenue_crm chatwoot; do
    target="/backups/${database}-${stamp}.dump"
    pg_dump --format=custom --no-owner --no-acl --dbname="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${database}" --file="${target}"
    if [ -n "${S3_BACKUP_BUCKET:-}" ]; then
      aws --endpoint-url "${S3_ENDPOINT}" s3 cp "${target}" "s3://${S3_BACKUP_BUCKET}/postgres/${database}/${database}-${stamp}.dump"
    fi
  done
  find /backups -type f -name '*.dump' -mtime +30 -delete
}

backup_once
while true; do
  sleep 86400
  backup_once
done
