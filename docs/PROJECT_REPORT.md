# Gatherly — Project Report

## Introduction and problem statement

Event information is often spread across forms, messages and spreadsheets. That makes it harder for organizers to control capacity and schedules and for participants to discover events or keep a record of registrations. Gatherly provides a shared web application for those workflows.

## Objectives

- Let the public discover published events and read venue and schedule details.
- Give approved organizers tools to create and manage their own events.
- Give participants a secure registration reference and registration history.
- Give administrators controls over organizer approval, venues, accounts and system reports.
- Keep account, ownership, capacity and feedback rules on the server as well as in the interface.

## Roles and core workflows

1. A participant signs up, finds a published event and registers. A database transaction protects capacity; a unique reference is returned for confirmation. The participant can cancel before the event date and submit feedback when eligible.
2. An organizer submits an account request. An administrator approves it. The organizer then creates an event, chooses an available venue, adds schedule sessions and reviews registrations and feedback.
3. An administrator is provisioned out-of-band by a CLI script. Admin screens show usage metrics, pending organizers, users, venues and registration reports.

## Technology and architecture

- Presentation: accessible HTML, responsive CSS, vanilla JavaScript.
- Application: PHP endpoints using PDO, PHP sessions, server-side validation and role checks.
- Persistence: MySQL 8 with normalized tables, foreign keys, indexes and unique constraints.
- Web root: `public/`; shared bootstrap/configuration, schema and CLI tools remain outside the document root.

The browser sends same-origin JSON or form requests to `public/api.php`. The API translates the requested resource to a parameterized database operation and returns JSON. `config/bootstrap.php` centralizes environment loading, session policy, PDO setup and reusable guards.

## Database design

`users` represents all roles; `events` references its organizer, category and venue; `schedules` and `registrations` belong to an event; `feedback` links an event and participant; `notifications` belongs to a user. See [`../database/ER_DIAGRAM.md`](../database/ER_DIAGRAM.md) and [`../database/schema.sql`](../database/schema.sql).

Unique email, event-participant registration, feedback-per-event-participant and registration-reference keys prevent duplicate records. The API handles rules that span rows (capacity and venue/session overlaps) with validation and transactions where concurrency matters.

## Security considerations

- Password hashes only; no default/public admin password.
- PDO native prepared statements, backend validation and escaped UI output.
- Session ID rotation on login, HttpOnly/SameSite cookies, CSRF token validation, login throttling and explicit role/owner checks.
- Image MIME/content/size checks and randomized upload filenames.
- Configuration and uploads are excluded from source control. Apache should serve only `public/`.
- Production requires HTTPS, private environment configuration, error-display disabled, least-privilege DB credentials and tested backups.

## Scope and known deployment prerequisites

The project provides core event, account, venue, schedule, registration, feedback and reporting workflows. Production email delivery is not configured, so emailed password resets and outbound notifications require an email provider and additional token/queue handling. Authentication/database behavior and cross-browser responsiveness still need to be verified in the target PHP/MySQL environment before a production claim can be made.

## Future enhancements

- Verified email, expiring password reset links and event notifications.
- Pagination and exportable reports for large datasets.
- Audited moderation history, accessibility testing and automated integration tests.
- Payment integration, calendar export and QR-based attendance.
