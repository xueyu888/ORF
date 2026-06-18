#!/bin/sh
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE SCHEMA IF NOT EXISTS orf_current AUTHORIZATION "$POSTGRES_USER";
ALTER ROLE "$POSTGRES_USER" IN DATABASE "$POSTGRES_DB" SET search_path = orf_current, public;
SQL
