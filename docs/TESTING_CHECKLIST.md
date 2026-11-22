# Testing Checklist

## Environment preflight

- [ ] PHP 8+ and PDO MySQL are enabled.
- [ ] MySQL 8 is available and the local test database is backed up/isolated.
- [ ] Import `database/schema.sql` into a new, empty test database selected in MySQL.
- [ ] Configure `.env`; verify the application reports database connection failures without exposing credentials.
- [ ] Open the site at desktop and mobile viewport sizes.

## Accounts and authorization

- [ ] Create the first admin using `scripts/create_admin.php`; rerun and confirm it refuses a second admin.
- [ ] Sign in with valid admin credentials; confirm the session rotates.
- [ ] Invalid login fails; repeated attempts are throttled.
- [ ] Participant registration succeeds; duplicate email is rejected.
- [ ] Organizer registration is pending and cannot create events.
- [ ] Admin approves/rejects an organizer; only approved organizers can manage events.
- [ ] Public admin registration is rejected.
- [ ] Participant cannot call organizer/admin actions; one organizer cannot modify another organizer's event.
- [ ] Logout ends the session; missing/invalid CSRF token rejects state-changing requests.

## Events, venues and schedules

- [ ] Create, edit, publish, and cancel an event.
- [ ] Invalid date/time, capacity, category or venue is rejected server-side.
- [ ] Event capacity cannot exceed venue capacity.
- [ ] An unavailable venue cannot be assigned.
- [ ] Publishing overlapping events at the same venue is rejected; different venues or non-overlapping times work.
- [ ] Poster upload accepts valid JPEG/PNG/WebP under 5 MB; rejects oversized or non-image content.
- [ ] Add, delete and display schedule sessions; overlapping sessions are rejected.
- [ ] Edit a schedule session; invalid or non-existent session IDs return an error.
- [ ] Admin can move a published event to ongoing only during its scheduled window and mark an ongoing event completed only after it ends.
- [ ] Event-specific registration and feedback reports are restricted to the event owner or admin.
- [ ] Search and category/date filters return matching published events.

## Registration and feedback

- [ ] Anonymous registration is rejected.
- [ ] A participant can register in the registration window and receives a unique confirmation reference.
- [ ] Duplicate active registration is rejected; cancellation releases capacity; re-registration creates a new reference.
- [ ] Concurrent attempts for the last place never exceed event capacity.
- [ ] Registration after deadline and for a cancelled event is rejected.
- [ ] A participant can cancel an eligible upcoming registration; another participant's registration cannot be cancelled by them.
- [ ] Only an eligible registered participant can submit one 1–5-star review; duplicate feedback is rejected.
- [ ] Hidden/moderated feedback does not appear on public event pages.

## Admin and UI

- [ ] Admin dashboard totals and popular-event counts match database rows.
- [ ] Admin can manage user account status, venues and organizer approvals.
- [ ] Event and participant tables remain usable on narrow/mobile screens.
- [ ] Forms show success/error notifications; empty lists have a clear state.
- [ ] Inspect browser console, PHP/Apache error logs and application logs after the test run.

## Verification record

No runtime test results are recorded in this repository yet. Check boxes only after running the corresponding tests against a configured local environment. The implementation workspace initially had no PHP runtime on PATH and MySQL rejected local root access without a password, so those checks must be completed in the configured XAMPP/local environment.
