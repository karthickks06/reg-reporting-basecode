#!/bin/sh
set -e

echo "Waiting for database to be ready..."
sleep 5

echo "Running database migrations..."
alembic upgrade head

echo "Starting application..."
exec "$@"
