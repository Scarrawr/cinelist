FROM postgres:16-alpine
# Schema + seed run automatically the first time the data volume is empty.
COPY init.sql /docker-entrypoint-initdb.d/init.sql
