# Hackathon / Evaluation Demo Script

Use a local database with test-only accounts and event data. Do not demonstrate with production personal information.

1. **Introduce the product (30 seconds):** Explain that Gatherly connects public event discovery, organizer workflows and participant registration.
2. **Show discovery (1 minute):** Open the home page, browse published events, search by title, filter by category/date, and open an event to show its venue, availability, schedule and reviews.
3. **Show organizer onboarding (1 minute):** Register an organizer account and explain that it remains pending until administrator approval. Sign in as the pre-provisioned demo admin and approve that request.
4. **Create and publish an event (2 minutes):** Sign in as the organizer, create an event with an available venue and capacity within the venue limit, optionally upload a poster, then publish it. Add a schedule session and show the overlap validation.
5. **Register as a participant (1 minute):** Create/sign in as a participant, register for the event and point out the generated reference and My Registrations page. Try the same registration again to demonstrate duplicate protection.
6. **Show organizer controls (1 minute):** View the attendee list, record attendance after the demo event, and open feedback.
7. **Show feedback and reports (1 minute):** Submit eligible feedback as the participant, then show its event review and the administrator registration report.
8. **Close (30 seconds):** Summarize role ownership, transaction-based capacity checks, and the schema/security safeguards.

For a short demo, seed the database with a future event and use separate admin, approved-organizer, and participant accounts created specifically for the demonstration. Do not add a default password or commit account credentials to the repository.
