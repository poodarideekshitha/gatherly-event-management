# Gatherly — Event Management System

Gatherly is a responsive PHP and MySQL application for publishing events, approving organizers, managing venues and schedules, registering participants, and collecting post-event feedback.

## What is included

- Public landing page, event search/filtering, event details, schedule and reviews.
- Participant and organizer registration; organizer accounts require administrator approval.
- Password-hashed login, PHP sessions, CSRF token checks, login throttling, and role/ownership checks.
- Event create/edit/publish/cancel, image poster validation, capacity and venue conflict checks.
- Registration confirmation references, duplicate prevention, cancellation and transactional capacity enforcement.
- Venue, schedule, attendee, feedback moderation and basic registration reporting endpoints.
- Responsive layouts for public pages and role dashboards, using HTML, CSS and vanilla JavaScript.
- MySQL schema, protected administrator bootstrap command, and setup/deployment documentation.

## Technology

- PHP 8.0+ (PDO MySQL, Fileinfo, and mbstring extensions)
- MySQL 8.0+
- Apache/XAMPP for a local Windows setup; the PHP built-in server is suitable for local development only
- HTML5, CSS3 and vanilla JavaScript; no Node.js backend or frontend framework

## Project layout

```text
config/bootstrap.php        Environment loading, sessions, PDO and shared guards
database/schema.sql         Non-destructive schema creation and starter categories
database/ER_DIAGRAM.md      Entity relationship diagram
docs/                       Project report, demo, testing and deployment guides
public/index.php            Web application entry point
public/api.php              JSON API entry point
public/assets/              Responsive CSS and browser JavaScript
public/uploads/events/      Validated event poster uploads
scripts/create_admin.php    CLI-only first administrator setup
```

## Local setup (Windows, standalone PHP)

The project can run with standalone PHP and the MySQL Server already installed on the computer; XAMPP is not required.

1. Make sure PHP is extracted to `C:\php`, its `php.ini` enables `fileinfo`, `mbstring`, and `pdo_mysql`, and the MySQL Server service is running.
2. The example configuration uses a separate database named `gatherly_event_management`. This intentionally avoids changing an existing database named `event_management`.
3. Create that new database and import [`database/schema.sql`](database/schema.sql) into it. The schema file does not create, drop, or select a database; select the new database before importing. If the target database already exists, inspect it and back it up before proceeding.
4. Create a dedicated MySQL account with access limited to `gatherly_event_management` and `SELECT`, `INSERT`, `UPDATE`, and `DELETE` privileges. Do not use an administrator account for the application.
5. Copy `.env.example` to `.env`; set the database user/password locally and optionally configure a support email. Keep `.env` out of Git and do not share credentials.
6. From the project folder, start PHP's local development server:

   ```powershell
   & 'C:\php\php.exe' -S 127.0.0.1:8000 -t 'D:\WTMP\event management system\public'
   ```

   Open `http://127.0.0.1:8000`. Keep the PowerShell window open while using the site. The PHP built-in server is for local development only.
7. Create the first admin from a separate terminal after the schema and `.env` are configured. Example PowerShell:

   ```powershell
   $secure = Read-Host "Choose a unique administrator password (6+ characters)" -AsSecureString
   $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
   try {
     $env:ADMIN_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
     & 'C:\php\php.exe' .\scripts\create_admin.php
   } finally {
     [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
     Remove-Item Env:ADMIN_PASSWORD -ErrorAction SilentlyContinue
   }
   ```

   Enter the name and email at the prompts. The setup command refuses to create another admin when one already exists. The password is supplied only through the current process environment and is never written to a project file.
7. Sign in with that admin account. Create venues, then review organizer requests. Participants can register directly; organizers can create events after approval.

## Accounts and roles

- **Admin:** Created only with the CLI tool. Can review organizer applications, manage user status and venues, see system metrics/reports, and manage events.
- **Organizer:** Register at the public registration page and wait for admin approval. After approval, create and manage only events owned by that account.
- **Participant:** Register directly, browse published events, reserve/cancel a place, and provide feedback after attending or after a registered event has ended.

Passwords require at least 6 characters and are stored using `password_hash()`. There is no email delivery provider configured, so self-service email password-reset links are not enabled. Users who lose access should contact an administrator; production deployments should add a verified email provider and expiring, single-use reset tokens.

## API overview

The JSON API is served by `public/api.php`; paths are passed using the `path` query parameter. Mutating requests require the session CSRF token in `X-CSRF-Token`.

| Method | API path | Access |
|---|---|---|
| GET | `auth/me` | Public/session |
| POST | `auth/register`, `auth/login`, `auth/logout` | Public/session |
| PATCH | `auth/profile` | Signed-in user |
| GET | `categories`, `events`, `events/{id}` | Public published events |
| GET | `events/{id}/report` | Event owner or admin |
| POST/PATCH/DELETE | `events`, `events/{id}`, `events/{id}/publish` | Approved owner or admin |
| POST | `events/{id}/status` | Admin; scheduled status transitions |
| GET/POST/PATCH/DELETE | `venues`, `venues/{id}` | Admin writes; venue listing is public |
| GET/POST | `registrations`, `registrations/{eventId}` | Participant; organizer attendee list |
| POST | `registrations/{registrationId}/cancel` | Participant owner or authorized admin/organizer |
| GET/POST/PATCH/DELETE | `schedules/{eventId}[/{scheduleId}]` | Event owner/admin writes |
| GET/POST | `feedback/{eventId}` | Eligible participant submit; event owner/admin read |
| GET/PATCH/POST | `admin/stats`, `admin/users`, `admin/organizers/{id}`, `admin/reports` | Admin |

Successful responses and errors are JSON with appropriate HTTP status codes. See `public/api.php` for payload fields and validation rules.

## Database and concurrency

The schema is normalized around users, categories, venues, events, schedules, registrations, feedback, and notifications, with foreign keys, unique constraints and lookup indexes. Registrations lock the event row inside a transaction before counting active registrations and inserting/reactivating a reservation. The application rejects venue overlaps for published events and refuses event capacity above venue capacity.

## Testing

Use the checklist in [`docs/TESTING_CHECKLIST.md`](docs/TESTING_CHECKLIST.md). Database-backed verification requires a configured PHP 8+ runtime, MySQL credentials, and a test database. Do not run destructive tests against production data.

## Deployment

Follow [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md). In production, serve only `public/`, use HTTPS, use a least-privilege database account, disable PHP error display, restrict uploads, keep `.env` and logs outside the document root, and maintain backups. Never use the PHP built-in server for a public deployment.

## Project materials

- [`database/ER_DIAGRAM.md`](database/ER_DIAGRAM.md)
- [`docs/PROJECT_REPORT.md`](docs/PROJECT_REPORT.md)
- [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md)
- [`docs/TESTING_CHECKLIST.md`](docs/TESTING_CHECKLIST.md)
- [`docs/DEPLOYMENT_GUIDE.md`](docs/DEPLOYMENT_GUIDE.md)
