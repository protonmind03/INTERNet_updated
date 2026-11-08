# The nightly database backup service, not the API.
#
# Railway's "backup" service has the repository root as its Root Directory,
# so it reads railway.json beside this file on its own (no config-file path
# to set, which Railway's dashboard would not keep), while the API service
# keeps /backend and its own backend/railway.json. This builds from the
# repository root, so the backend's files are copied from backend/.
#
# Node to run backend/src/scripts/backup-cron.ts, and PostgreSQL's own client
# tools for pg_dump: version 18 from the PostgreSQL project's repository,
# since pg_dump must be as new as the database or newer.
FROM node:22-bookworm-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl \
 && install -d /usr/share/postgresql-common/pgdg \
 && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
 && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
 && apt-get update \
 && apt-get install -y --no-install-recommends postgresql-client-18 \
 && apt-get purge -y curl \
 && apt-get autoremove -y \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/src ./src

# Runs once and exits: Railway starts it again at the next cron time.
CMD ["npm", "run", "backup:database"]
