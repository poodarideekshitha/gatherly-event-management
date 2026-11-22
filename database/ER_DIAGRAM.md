# Event Management System — ER Diagram

```mermaid
erDiagram
    USERS ||--o{ EVENTS : organizes
    CATEGORIES ||--o{ EVENTS : classifies
    VENUES ||--o{ EVENTS : hosts
    EVENTS ||--o{ SCHEDULES : contains
    EVENTS ||--o{ REGISTRATIONS : receives
    USERS ||--o{ REGISTRATIONS : makes
    EVENTS ||--o{ FEEDBACK : receives
    USERS ||--o{ FEEDBACK : writes
    USERS ||--o{ NOTIFICATIONS : receives

    USERS {
      bigint id PK
      varchar name
      varchar email UK
      varchar password_hash
      enum role
      enum status
    }
    CATEGORIES {
      bigint id PK
      varchar name UK
      varchar slug UK
    }
    VENUES {
      bigint id PK
      varchar name
      varchar address
      varchar city
      int capacity
      boolean is_available
    }
    EVENTS {
      bigint id PK
      bigint organizer_id FK
      bigint category_id FK
      bigint venue_id FK
      varchar title
      date event_date
      time start_time
      time end_time
      int capacity
      enum status
    }
    SCHEDULES {
      bigint id PK
      bigint event_id FK
      varchar title
      datetime starts_at
      datetime ends_at
      varchar speaker
    }
    REGISTRATIONS {
      bigint id PK
      bigint event_id FK
      bigint participant_id FK
      varchar reference_code UK
      enum status
    }
    FEEDBACK {
      bigint id PK
      bigint event_id FK
      bigint participant_id FK
      tinyint rating
      text review
      boolean is_visible
    }
    NOTIFICATIONS {
      bigint id PK
      bigint user_id FK
      varchar message
      timestamp read_at
    }
```

Registration and feedback each have a unique `(event_id, participant_id)` constraint. Event capacity and venue time conflicts are checked by transactional/application validation; MySQL does not provide a simple cross-row constraint for either rule.
