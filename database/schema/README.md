# VIP Number World database schema

This directory contains one schema-only SQL file for each application table. No file contains seed data. The application does not create, alter, migrate, or seed tables during startup.

For a new empty database, run `mysql --database=<database_name> < apply_all.sql` from this directory. For an existing production database, review and apply individual files through the normal database-change process; `CREATE TABLE IF NOT EXISTS` deliberately preserves existing tables and rows.

Table order is recorded in `apply_all.sql`.

Reviewed change scripts for existing installations live in `../migrations`. Apply each script once through the normal database-change process before deploying application code that depends on the new columns or tables.
