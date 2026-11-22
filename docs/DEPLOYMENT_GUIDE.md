# Deployment Guide

## 1. Prepare and review

1. Create a GitHub repository and push source only after checking `.gitignore`; verify `.env`, logs, local database dumps, and test account credentials are not tracked.
2. Select a PHP-compatible host that explicitly supports PHP 8+, MySQL 8-compatible InnoDB, PDO MySQL, Fileinfo, HTTPS certificates, cron/CLI access for setup, and configurable environment variables.
3. Back up any existing database. Do not import this schema over a live database without comparing schemas and preparing a migration/rollback plan.

## 2. Production database and environment

1. Create a dedicated production database and a least-privilege database user. Grant access only to that database.
2. Import `database/schema.sql` into the new database using the provider's control panel or phpMyAdmin. The schema file expects the new database to be selected and does not create, drop, or select a database itself.
3. Configure `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_CHARSET`, `DB_USER`, `DB_PASSWORD`, `APP_ENV=production`, `APP_TIMEZONE`, and optionally `SUPPORT_EMAIL` in the host's private environment settings. Never commit `.env` or paste credentials into public issue trackers.
4. Disable public PHP error display and configure protected error logging. Restrict log access and rotate logs.

## 3. Upload and domain

1. Upload the project while keeping the web document root pointed only at `public/`. Keep `config/`, `database/`, `docs/`, `scripts/`, `.env` and logs outside the document root.
2. Ensure `public/uploads/events/` is writable by the PHP worker but not executable. Keep its file-type restrictions enabled.
3. Point the domain's DNS records to the hosting provider. Configure the provider's Apache/Nginx virtual host with `public/` as document root.
4. Enable and force HTTPS at the host. Verify secure cookies are set on HTTPS, and use current TLS configuration.

## 4. First administrator and smoke test

1. Run `php scripts/create_admin.php` using the host's protected CLI/terminal after database configuration. Supply a unique strong `ADMIN_PASSWORD` through a secure process environment; do not put it in a source file or shell history. Remove it from the process environment after setup.
2. Sign in as admin, approve a test organizer, create a venue, and verify an event can be created and published.
3. Create a participant test account; register, cancel, and verify capacity/registration history. Remove test accounts and test data according to the host's procedures.
4. Check browser console, HTTP responses, PHP/web server logs, and a database backup/restore test before announcing release.

## 5. GitHub and ongoing operations

- Keep secrets in provider-managed environment configuration.
- Protect the default branch and review dependency/code changes before deployment.
- Back up the database on a schedule; encrypt backups, limit access, and periodically test restore.
- Monitor storage usage for uploaded posters and log growth.
- Apply PHP/MySQL security updates and review account privileges regularly.
- Use a staging database for schema changes. Write forward and rollback migration scripts; avoid running destructive SQL against production.

Hosting provider features vary. Verify the chosen plan's PHP version, database engine, document-root controls, uploads, environment-variable support, HTTPS, backup retention, and CLI access before purchase.
