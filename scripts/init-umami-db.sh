#!/bin/bash
set -e

# Create umami database if it doesn't exist
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    SELECT 'CREATE DATABASE umami'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'umami')\gexec
EOSQL

echo "Umami database initialized successfully"
