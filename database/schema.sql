-- Select a new, empty database before importing this schema.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL,
  phone VARCHAR(30) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin','organizer','participant') NOT NULL,
  status ENUM('pending','active','suspended') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role_status (role, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  slug VARCHAR(90) NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  UNIQUE KEY uq_categories_slug (slug)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS venues (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  address VARCHAR(255) NOT NULL,
  city VARCHAR(100) NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  description TEXT NULL,
  facilities TEXT NULL,
  is_available TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_venues_city_available (city, is_available)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organizer_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  venue_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NOT NULL,
  poster_path VARCHAR(255) NULL,
  event_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  registration_opens_at DATETIME NOT NULL,
  registration_closes_at DATETIME NOT NULL,
  capacity INT UNSIGNED NOT NULL,
  status ENUM('draft','published','ongoing','completed','cancelled') NOT NULL DEFAULT 'draft',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_events_organizer FOREIGN KEY (organizer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
  CONSTRAINT fk_events_venue FOREIGN KEY (venue_id) REFERENCES venues(id) ON DELETE RESTRICT,
  KEY idx_events_listing (status, event_date, category_id),
  KEY idx_events_organizer (organizer_id, event_date),
  KEY idx_events_venue_time (venue_id, event_date, start_time, end_time)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(180) NOT NULL,
  description TEXT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  speaker VARCHAR(120) NULL,
  location VARCHAR(180) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_schedules_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  KEY idx_schedules_event_time (event_id, starts_at, ends_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS registrations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  participant_id BIGINT UNSIGNED NOT NULL,
  reference_code VARCHAR(24) NOT NULL,
  status ENUM('registered','cancelled','attended') NOT NULL DEFAULT 'registered',
  registered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_registrations_event_participant (event_id, participant_id),
  UNIQUE KEY uq_registrations_reference (reference_code),
  CONSTRAINT fk_registrations_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE RESTRICT,
  CONSTRAINT fk_registrations_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE RESTRICT,
  KEY idx_registrations_participant (participant_id, status),
  KEY idx_registrations_event_status (event_id, status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  event_id BIGINT UNSIGNED NOT NULL,
  participant_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT UNSIGNED NOT NULL,
  review TEXT NOT NULL,
  is_visible TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_feedback_event_participant (event_id, participant_id),
  CONSTRAINT chk_feedback_rating CHECK (rating BETWEEN 1 AND 5),
  CONSTRAINT fk_feedback_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT fk_feedback_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE RESTRICT,
  KEY idx_feedback_event_visibility (event_id, is_visible)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(500) NOT NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  KEY idx_notifications_user_date (user_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS login_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email_hash CHAR(64) NOT NULL,
  ip_hash CHAR(64) NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_login_attempts_email_time (email_hash, attempted_at),
  KEY idx_login_attempts_ip_time (ip_hash, attempted_at)
) ENGINE=InnoDB;

INSERT IGNORE INTO categories (name, slug) VALUES
  ('Technology', 'technology'),
  ('Education', 'education'),
  ('Arts & Culture', 'arts-culture'),
  ('Business', 'business'),
  ('Community', 'community'),
  ('Other', 'other');
