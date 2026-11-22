<?php
declare(strict_types=1);

require dirname(__DIR__) . '/config/bootstrap.php';

function event_row(int $id): array
{
    $stmt = db()->prepare(
        'SELECT e.*, c.name AS category, v.name AS venue_name, v.address AS venue_address,
                v.city AS venue_city, v.capacity AS venue_capacity,
                u.name AS organizer_name
         FROM events e
         JOIN categories c ON c.id = e.category_id
         JOIN venues v ON v.id = e.venue_id
         JOIN users u ON u.id = e.organizer_id
         WHERE e.id = ?'
    );
    $stmt->execute([$id]);
    $event = $stmt->fetch();
    if (!$event) {
        json_response(['error' => 'Event not found.'], 404);
    }
    $count = db()->prepare('SELECT COUNT(*) FROM registrations WHERE event_id=? AND status IN ("registered","attended")');
    $count->execute([$id]);
    $event['registered_count'] = (int)$count->fetchColumn();
    return $event;
}

function authorize_event(array $event): array
{
    $user = require_user();
    if ($user['role'] !== 'admin' && (int)$event['organizer_id'] !== (int)$user['id']) {
        json_response(['error' => 'You can only manage events assigned to your account.'], 403);
    }
    return $user;
}

function venue_has_conflict(int $venueId, string $date, string $start, string $end, ?int $exceptId = null): bool
{
    $query = 'SELECT COUNT(*) FROM events
              WHERE venue_id = ? AND event_date = ?
                AND status IN ("published","ongoing")
                AND start_time < ? AND end_time > ?';
    $params = [$venueId, $date, $end, $start];
    if ($exceptId !== null) {
        $query .= ' AND id <> ?';
        $params[] = $exceptId;
    }
    $stmt = db()->prepare($query);
    $stmt->execute($params);
    return (int)$stmt->fetchColumn() > 0;
}

function validated_event_data(array $data): array
{
    $title = clean_text($data['title'] ?? null, 180, 'Title');
    $description = clean_text($data['description'] ?? null, 10000, 'Description');
    $date = $data['event_date'] ?? null;
    $start = $data['start_time'] ?? null;
    $end = $data['end_time'] ?? null;
    $opens = $data['registration_opens_at'] ?? null;
    $closes = $data['registration_closes_at'] ?? null;
    if (!is_string($date) || !is_string($start) || !is_string($end) || !is_string($opens) || !is_string($closes)) {
        json_response(['error' => 'Event date and time fields must be valid text values.'], 422);
    }
    if (!valid_date($date, 'Y-m-d') || !valid_date($start, 'H:i') || !valid_date($end, 'H:i') || $end <= $start ||
        new DateTimeImmutable($date . ' ' . $start) <= new DateTimeImmutable()) {
        json_response(['error' => 'Enter a valid event date and a start time earlier than the end time.'], 422);
    }
    $opensAt = parse_local_datetime($opens);
    $closesAt = parse_local_datetime($closes);
    if (!$opensAt || !$closesAt || $closesAt <= $opensAt || $closesAt->format('Y-m-d') > $date ||
        $date < date('Y-m-d') || $closesAt > new DateTimeImmutable($date . ' ' . $start)) {
        json_response(['error' => 'Choose a future event date and valid registration dates that close before the event starts.'], 422);
    }
    $venueId = filter_var($data['venue_id'] ?? null, FILTER_VALIDATE_INT);
    $categoryId = filter_var($data['category_id'] ?? null, FILTER_VALIDATE_INT);
    $capacity = filter_var($data['capacity'] ?? null, FILTER_VALIDATE_INT);
    $status = $data['status'] ?? 'draft';
    if (!is_int($venueId) || !is_int($categoryId) || !is_int($capacity) || $capacity < 1 || !in_array($status, ['draft', 'published'], true)) {
        json_response(['error' => 'Select a valid category, venue, capacity, and event status.'], 422);
    }
    $category = db()->prepare('SELECT COUNT(*) FROM categories WHERE id=?');
    $category->execute([$categoryId]);
    if ((int)$category->fetchColumn() === 0) {
        json_response(['error' => 'Choose a valid event category.'], 422);
    }
    return [$title, $description, $date, $start, $end, $opensAt->format('Y-m-d H:i:s'), $closesAt->format('Y-m-d H:i:s'), $venueId, $categoryId, $capacity, $status];
}

function maybe_save_poster(?string $current = null): ?string
{
    if (!isset($_FILES['poster']) || $_FILES['poster']['error'] === UPLOAD_ERR_NO_FILE) {
        return $current;
    }
    $file = $_FILES['poster'];
    if ($file['error'] !== UPLOAD_ERR_OK || $file['size'] > 5 * 1024 * 1024 || !is_uploaded_file($file['tmp_name'])) {
        json_response(['error' => 'Poster uploads must be valid images no larger than 5 MB.'], 422);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!isset($extensions[$mime]) || getimagesize($file['tmp_name']) === false) {
        json_response(['error' => 'Use a JPEG, PNG, or WebP image for the event poster.'], 422);
    }
    $directory = __DIR__ . '/uploads/events';
    if (!is_dir($directory) && !mkdir($directory, 0750, true) && !is_dir($directory)) {
        throw new RuntimeException('Unable to create the event upload directory.');
    }
    $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($file['tmp_name'], $directory . DIRECTORY_SEPARATOR . $filename)) {
        throw new RuntimeException('Unable to save the uploaded event poster.');
    }
    return '/uploads/events/' . $filename;
}

function route_request(): void
{
    $segments = array_values(array_filter(explode('/', trim(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '', '/'))));
    $apiIndex = array_search('api.php', $segments, true);
    $route = isset($_GET['path'])
        ? array_values(array_filter(explode('/', trim((string)$_GET['path'], '/'))))
        : ($apiIndex === false ? [] : array_slice($segments, $apiIndex + 1));
    $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
    $data = request_data();
    $resource = $route[0] ?? '';
    $id = isset($route[1]) ? filter_var($route[1], FILTER_VALIDATE_INT) : null;
    if ($id === false) {
        $id = null;
    }
    $action = $route[2] ?? '';

    if ($method !== 'GET' && $method !== 'HEAD') {
        require_csrf();
    }

    if ($resource === 'auth') {
        if ($method === 'GET' && ($route[1] ?? '') === 'me') {
            $user = current_user();
            if ($user) {
                $profile = db()->prepare('SELECT phone FROM users WHERE id=?');
                $profile->execute([$user['id']]);
                $user['phone'] = $profile->fetchColumn() ?: '';
            }
            json_response(['user' => $user, 'csrf' => csrf_token()]);
        }
        if ($method === 'POST' && ($route[1] ?? '') === 'register') {
            $name = clean_text($data['name'] ?? null, 120, 'Name');
            $emailInput = $data['email'] ?? '';
            $email = is_string($emailInput) ? filter_var(trim($emailInput), FILTER_VALIDATE_EMAIL) : false;
            $password = $data['password'] ?? '';
            $role = $data['role'] ?? 'participant';
            if (!$email || !is_string($password) || mb_strlen($password, 'UTF-8') < 6 || mb_strlen($password, 'UTF-8') > 200) {
                json_response(['error' => 'Enter a valid email and a password between 6 and 200 characters.'], 422);
            }
            if (!in_array($role, ['participant', 'organizer'], true)) {
                json_response(['error' => 'Public accounts may only be participants or organizers.'], 422);
            }
            if (!isset($data['password_confirmation']) || !is_string($data['password_confirmation']) || $password !== $data['password_confirmation']) {
                json_response(['error' => 'Password confirmation does not match.'], 422);
            }
            $phone = isset($data['phone']) && $data['phone'] !== '' ? clean_text($data['phone'], 30, 'Phone') : null;
            $status = $role === 'organizer' ? 'pending' : 'active';
            try {
                $stmt = db()->prepare('INSERT INTO users (name,email,phone,password_hash,role,status) VALUES (?,?,?,?,?,?)');
                $stmt->execute([$name, strtolower($email), $phone, password_hash($password, PASSWORD_DEFAULT), $role, $status]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    json_response(['error' => 'An account with this email already exists.'], 409);
                }
                throw $error;
            }
            json_response(['message' => $role === 'organizer' ? 'Organizer request submitted. An administrator must approve your account.' : 'Account created. You may now sign in.'], 201);
        }
        if ($method === 'POST' && ($route[1] ?? '') === 'login') {
            $emailInput = $data['email'] ?? '';
            $email = is_string($emailInput) ? strtolower(trim($emailInput)) : '';
            $password = $data['password'] ?? '';
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || !is_string($password)) {
                json_response(['error' => 'Enter a valid email and password.'], 422);
            }
            $pdo = db();
            $emailHash = hash('sha256', $email);
            $ipHash = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'unknown');
            $pdo->exec('DELETE FROM login_attempts WHERE attempted_at < NOW() - INTERVAL 1 DAY');
            $limiter = $pdo->prepare('SELECT COUNT(*) FROM login_attempts WHERE attempted_at > NOW() - INTERVAL 15 MINUTE AND (email_hash = ? OR ip_hash = ?)');
            $limiter->execute([$emailHash, $ipHash]);
            if ((int)$limiter->fetchColumn() >= 10) {
                json_response(['error' => 'Too many sign-in attempts. Please wait 15 minutes and try again.'], 429);
            }
            $stmt = $pdo->prepare('SELECT id,name,email,role,status,password_hash FROM users WHERE email = ? LIMIT 1');
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            if (!$user || !password_verify($password, $user['password_hash']) || $user['status'] !== 'active') {
                $insert = $pdo->prepare('INSERT INTO login_attempts (email_hash,ip_hash) VALUES (?,?)');
                $insert->execute([$emailHash, $ipHash]);
                json_response(['error' => 'The email or password is incorrect, or the account is not approved.'], 401);
            }
            $pdo->prepare('DELETE FROM login_attempts WHERE email_hash = ? OR ip_hash = ?')->execute([$emailHash, $ipHash]);
            session_regenerate_id(true);
            $_SESSION['user'] = ['id' => (int)$user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']];
            $_SESSION['csrf'] = bin2hex(random_bytes(32));
            json_response(['user' => $_SESSION['user'], 'csrf' => csrf_token()]);
        }
        if ($method === 'POST' && ($route[1] ?? '') === 'logout') {
            $_SESSION = [];
            if (ini_get('session.use_cookies')) {
                $params = session_get_cookie_params();
                setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
            }
            session_destroy();
            json_response(['message' => 'You have signed out.']);
        }
        if ($method === 'PATCH' && ($route[1] ?? '') === 'profile') {
            $user = require_user();
            $name = clean_text($data['name'] ?? null, 120, 'Name');
            $phone = isset($data['phone']) && $data['phone'] !== '' ? clean_text($data['phone'],30,'Phone') : null;
            if (isset($data['new_password']) && $data['new_password'] !== '') {
                $currentPassword = $data['current_password'] ?? '';
                if (!is_string($currentPassword) || !is_string($data['new_password']) || mb_strlen($data['new_password'], 'UTF-8') < 6 || mb_strlen($data['new_password'], 'UTF-8') > 200) {
                    json_response(['error' => 'A new password must be between 6 and 200 characters.'], 422);
                }
                $stmt = db()->prepare('SELECT password_hash FROM users WHERE id=?');
                $stmt->execute([$user['id']]);
                if (!password_verify($currentPassword, (string)$stmt->fetchColumn())) {
                    json_response(['error' => 'Current password is incorrect.'], 403);
                }
                db()->prepare('UPDATE users SET name=?,phone=?,password_hash=? WHERE id=?')->execute([$name,$phone,password_hash($data['new_password'],PASSWORD_DEFAULT),$user['id']]);
            } else {
                db()->prepare('UPDATE users SET name=?,phone=? WHERE id=?')->execute([$name,$phone,$user['id']]);
            }
            $_SESSION['user']['name'] = $name;
            json_response(['user' => $_SESSION['user'], 'message' => 'Profile updated.']);
        }
        json_response(['error' => 'Authentication endpoint not found.'], 404);
    }

    if ($resource === 'categories' && $method === 'GET') {
        json_response(['items' => db()->query('SELECT id,name FROM categories ORDER BY name')->fetchAll()]);
    }

    if ($resource === 'events') {
        if ($method === 'GET' && ($route[1] ?? '') === 'mine') {
            $user = require_user();
            $query = 'SELECT e.id,e.title,e.event_date,e.start_time,e.end_time,e.capacity,e.status,c.name AS category,v.name AS venue_name,
                             (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.status IN ("registered","attended")) AS registered_count
                      FROM events e JOIN categories c ON c.id=e.category_id JOIN venues v ON v.id=e.venue_id';
            $params = [];
            if ($user['role'] !== 'admin') {
                $query .= ' WHERE e.organizer_id=?';
                $params[] = $user['id'];
            }
            $query .= ' ORDER BY e.event_date DESC LIMIT 200';
            $stmt = db()->prepare($query);
            $stmt->execute($params);
            json_response(['items' => $stmt->fetchAll()]);
        }
        if ($method === 'GET' && $id === null) {
            $filters = ['e.status = "published"', '(e.event_date > CURRENT_DATE OR (e.event_date = CURRENT_DATE AND e.end_time > CURRENT_TIME))'];
            $params = [];
            if (isset($_GET['q']) && is_string($_GET['q']) && trim($_GET['q']) !== '') {
                $filters[] = '(e.title LIKE ? OR e.description LIKE ?)';
                $search = '%' . trim($_GET['q']) . '%';
                $params[] = $search;
                $params[] = $search;
            }
            if (isset($_GET['category']) && is_string($_GET['category']) && ctype_digit($_GET['category'])) {
                $filters[] = 'e.category_id = ?';
                $params[] = (int)$_GET['category'];
            }
            if (isset($_GET['date']) && is_string($_GET['date']) && valid_date($_GET['date'], 'Y-m-d')) {
                $filters[] = 'e.event_date >= ?';
                $params[] = $_GET['date'];
            }
            $sql = 'SELECT e.id,e.title,e.description,e.poster_path,e.event_date,e.start_time,e.end_time,e.capacity,
                           c.name AS category,v.name AS venue_name,v.city AS venue_city,u.name AS organizer_name,
                           (SELECT COUNT(*) FROM registrations r WHERE r.event_id=e.id AND r.status IN ("registered","attended")) AS registered_count,
                           (SELECT ROUND(AVG(f.rating),1) FROM feedback f WHERE f.event_id=e.id AND f.is_visible=1) AS average_rating
                    FROM events e JOIN categories c ON c.id=e.category_id JOIN venues v ON v.id=e.venue_id JOIN users u ON u.id=e.organizer_id
                    WHERE ' . implode(' AND ', $filters) . ' ORDER BY e.event_date,e.start_time LIMIT 100';
            $stmt = db()->prepare($sql);
            $stmt->execute($params);
            json_response(['items' => $stmt->fetchAll()]);
        }
        if ($method === 'GET' && $id !== null) {
            $event = event_row($id);
            if ($action === 'report') {
                authorize_event($event);
                $byStatus = db()->prepare('SELECT status,COUNT(*) AS total FROM registrations WHERE event_id=? GROUP BY status');
                $byStatus->execute([$id]);
                $ratings = db()->prepare('SELECT ROUND(AVG(rating),1) AS average_rating,COUNT(*) AS feedback_count FROM feedback WHERE event_id=?');
                $ratings->execute([$id]);
                json_response([
                    'event' => ['id'=>(int)$event['id'],'title'=>$event['title'],'event_date'=>$event['event_date'],'capacity'=>(int)$event['capacity']],
                    'registrations_by_status' => $byStatus->fetchAll(),
                    'feedback' => $ratings->fetch(),
                ]);
            }
            $user = current_user();
            if (!in_array($event['status'], ['published','ongoing','completed'], true) &&
                (!$user || ($user['role'] !== 'admin' && (int)$event['organizer_id'] !== (int)$user['id']))) {
                json_response(['error' => 'Event not found.'], 404);
            }
            $event['schedules'] = db()->prepare('SELECT id,title,description,starts_at,ends_at,speaker,location FROM schedules WHERE event_id=? ORDER BY starts_at');
            $event['schedules']->execute([$id]);
            $event['schedules'] = $event['schedules']->fetchAll();
            $rating = db()->prepare('SELECT ROUND(AVG(rating),1) AS average_rating, COUNT(*) AS feedback_count FROM feedback WHERE event_id=? AND is_visible=1');
            $rating->execute([$id]);
            $event['rating'] = $rating->fetch();
            $reviews = db()->prepare('SELECT f.rating,f.review,f.created_at,u.name AS participant_name FROM feedback f JOIN users u ON u.id=f.participant_id WHERE f.event_id=? AND f.is_visible=1 ORDER BY f.created_at DESC LIMIT 20');
            $reviews->execute([$id]);
            $event['feedback'] = $reviews->fetchAll();
            json_response(['event' => $event]);
        }
        if ($method === 'POST' && $id === null) {
            $user = require_user('organizer');
            if ($user['role'] === 'organizer') {
                $check = db()->prepare('SELECT status FROM users WHERE id=?');
                $check->execute([$user['id']]);
                if ($check->fetchColumn() !== 'active') {
                    json_response(['error' => 'Your organizer account is awaiting approval.'], 403);
                }
            }
            [$title,$description,$date,$start,$end,$opens,$closes,$venueId,$categoryId,$capacity,$status] = validated_event_data($data);
            $poster = maybe_save_poster();
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $venue = $pdo->prepare('SELECT capacity,is_available FROM venues WHERE id=? FOR UPDATE');
                $venue->execute([$venueId]);
                $venueRow = $venue->fetch();
                if (!$venueRow || !(int)$venueRow['is_available'] || $capacity > (int)$venueRow['capacity']) {
                    $pdo->rollBack();
                    json_response(['error' => 'Choose an available venue with enough capacity.'], 422);
                }
                if ($status === 'published' && venue_has_conflict($venueId,$date,$start,$end)) {
                    $pdo->rollBack();
                    json_response(['error' => 'This venue already has an event scheduled during that time.'], 409);
                }
                $stmt = $pdo->prepare('INSERT INTO events (organizer_id,category_id,venue_id,title,description,poster_path,event_date,start_time,end_time,registration_opens_at,registration_closes_at,capacity,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
                $stmt->execute([$user['id'],$categoryId,$venueId,$title,$description,$poster,$date,$start,$end,$opens,$closes,$capacity,$status]);
                $eventId = (int)$pdo->lastInsertId();
                $pdo->commit();
                json_response(['message' => 'Event created.', 'id' => $eventId], 201);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        if ($id !== null && ($method === 'PATCH' || $method === 'POST') && ($action === '' || $action === 'publish')) {
            $event = event_row($id);
            authorize_event($event);
            if ($action === 'publish') {
                if (!in_array($event['status'], ['draft','published'], true)) {
                    json_response(['error' => 'This event can no longer be published.'], 409);
                }
                $pdo = db();
                $pdo->beginTransaction();
                try {
                    $lockedEventQuery = $pdo->prepare('SELECT * FROM events WHERE id=? FOR UPDATE');
                    $lockedEventQuery->execute([$id]);
                    $lockedEvent = $lockedEventQuery->fetch();
                    if (!$lockedEvent || !in_array($lockedEvent['status'], ['draft','published'], true)) {
                        $pdo->rollBack();
                        json_response(['error' => 'This event can no longer be published.'], 409);
                    }
                    $pdo->prepare('SELECT id FROM venues WHERE id=? FOR UPDATE')->execute([$lockedEvent['venue_id']]);
                    if (venue_has_conflict((int)$lockedEvent['venue_id'],$lockedEvent['event_date'],$lockedEvent['start_time'],$lockedEvent['end_time'],$id)) {
                        $pdo->rollBack();
                        json_response(['error' => 'This venue already has an event scheduled during that time.'], 409);
                    }
                    $pdo->prepare('UPDATE events SET status="published" WHERE id=?')->execute([$id]);
                    $pdo->commit();
                    json_response(['message' => 'Event published.']);
                } catch (Throwable $error) {
                    if ($pdo->inTransaction()) $pdo->rollBack();
                    throw $error;
                }
            }
            if (!in_array($event['status'], ['draft','published'], true)) {
                json_response(['error' => 'Only draft or published events can be edited.'], 409);
            }
            [$title,$description,$date,$start,$end,$opens,$closes,$venueId,$categoryId,$capacity,$status] = validated_event_data($data);
            $poster = maybe_save_poster($event['poster_path']);
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('SELECT id FROM events WHERE id=? FOR UPDATE')->execute([$id]);
                $count = $pdo->prepare('SELECT COUNT(*) FROM registrations WHERE event_id=? AND status IN ("registered","attended")');
                $count->execute([$id]);
                if ($capacity < (int)$count->fetchColumn()) {
                    $pdo->rollBack();
                    json_response(['error' => 'Capacity cannot be lower than the number of active registrations.'], 409);
                }
                $venue = $pdo->prepare('SELECT capacity,is_available FROM venues WHERE id=? FOR UPDATE');
                $venue->execute([$venueId]);
                $venueRow = $venue->fetch();
                if (!$venueRow || !(int)$venueRow['is_available'] || $capacity > (int)$venueRow['capacity']) {
                    $pdo->rollBack();
                    json_response(['error' => 'Choose an available venue with enough capacity.'], 422);
                }
                if ($status === 'published' && venue_has_conflict($venueId,$date,$start,$end,$id)) {
                    $pdo->rollBack();
                    json_response(['error' => 'This venue already has an event scheduled during that time.'], 409);
                }
                $stmt = $pdo->prepare('UPDATE events SET category_id=?,venue_id=?,title=?,description=?,poster_path=?,event_date=?,start_time=?,end_time=?,registration_opens_at=?,registration_closes_at=?,capacity=?,status=? WHERE id=?');
                $stmt->execute([$categoryId,$venueId,$title,$description,$poster,$date,$start,$end,$opens,$closes,$capacity,$status,$id]);
                $pdo->commit();
                json_response(['message' => 'Event updated.']);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        if ($method === 'POST' && $id !== null && $action === 'status') {
            require_user('admin');
            $nextStatus = $data['status'] ?? '';
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare('SELECT status,event_date,start_time,end_time FROM events WHERE id=? FOR UPDATE');
                $stmt->execute([$id]);
                $event = $stmt->fetch();
                if (!$event) {
                    $pdo->rollBack();
                    json_response(['error' => 'Event not found.'], 404);
                }
                $now = new DateTimeImmutable();
                if ($nextStatus === 'ongoing' && $event['status'] === 'published') {
                    $startsAt = new DateTimeImmutable($event['event_date'] . ' ' . $event['start_time']);
                    $endsAt = new DateTimeImmutable($event['event_date'] . ' ' . $event['end_time']);
                    if ($startsAt > $now || $endsAt <= $now) {
                        $pdo->rollBack();
                        json_response(['error' => 'An event can be marked ongoing only during its scheduled time.'], 409);
                    }
                } elseif ($nextStatus === 'completed' && $event['status'] === 'ongoing') {
                    if (new DateTimeImmutable($event['event_date'] . ' ' . $event['end_time']) > $now) {
                        $pdo->rollBack();
                        json_response(['error' => 'An event can be completed only after its scheduled end.'], 409);
                    }
                } else {
                    $pdo->rollBack();
                    json_response(['error' => 'Invalid event status transition.'], 409);
                }
                $pdo->prepare('UPDATE events SET status=? WHERE id=?')->execute([$nextStatus,$id]);
                $pdo->commit();
                json_response(['message' => 'Event marked ' . $nextStatus . '.']);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        if ($method === 'DELETE' && $id !== null) {
            $event = event_row($id);
            authorize_event($event);
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('SELECT id FROM events WHERE id=? FOR UPDATE')->execute([$id]);
                $pdo->prepare('UPDATE events SET status="cancelled" WHERE id=?')->execute([$id]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            json_response(['message' => 'Event cancelled.']);
        }
    }

    if ($resource === 'venues') {
        if ($method === 'GET') {
            $items = db()->query('SELECT id,name,address,city,capacity,description,facilities,is_available FROM venues ORDER BY city,name')->fetchAll();
            json_response(['items' => $items]);
        }
        require_user('admin');
        if ($method === 'POST' && $id === null) {
            $name = clean_text($data['name'] ?? null, 150, 'Venue name');
            $address = clean_text($data['address'] ?? null, 255, 'Address');
            $city = clean_text($data['city'] ?? null, 100, 'City');
            $capacity = filter_var($data['capacity'] ?? null, FILTER_VALIDATE_INT);
            if (!$capacity || $capacity < 1) {
                json_response(['error' => 'Venue capacity must be a positive number.'], 422);
            }
            $stmt = db()->prepare('INSERT INTO venues (name,address,city,capacity,description,facilities,is_available) VALUES (?,?,?,?,?,?,?)');
            $available = filter_var($data['is_available'] ?? 1, FILTER_VALIDATE_INT);
            if (!in_array($available, [0,1], true)) {
                json_response(['error' => 'Venue availability must be enabled or disabled.'], 422);
            }
            $stmt->execute([$name,$address,$city,$capacity,optional_text($data['description'] ?? null,5000,'Description'),optional_text($data['facilities'] ?? null,1500,'Facilities'),$available]);
            json_response(['message' => 'Venue created.', 'id' => (int)db()->lastInsertId()], 201);
        }
        if ($id !== null && in_array($method, ['PATCH','POST'], true)) {
            $capacity = filter_var($data['capacity'] ?? null, FILTER_VALIDATE_INT);
            if (!$capacity || $capacity < 1) {
                json_response(['error' => 'Venue capacity must be a positive number.'], 422);
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('SELECT id FROM venues WHERE id=? FOR UPDATE')->execute([$id]);
                $overCapacity = $pdo->prepare('SELECT COUNT(*) FROM events WHERE venue_id=? AND capacity>? AND status IN ("published","ongoing")');
                $overCapacity->execute([$id,$capacity]);
                if ((int)$overCapacity->fetchColumn() > 0) {
                    $pdo->rollBack();
                    json_response(['error' => 'Venue capacity cannot be lower than an active event capacity.'], 409);
                }
                $available = filter_var($data['is_available'] ?? 1, FILTER_VALIDATE_INT);
                if (!in_array($available, [0,1], true)) {
                    $pdo->rollBack();
                    json_response(['error' => 'Venue availability must be enabled or disabled.'], 422);
                }
                $stmt = $pdo->prepare('UPDATE venues SET name=?,address=?,city=?,capacity=?,description=?,facilities=?,is_available=? WHERE id=?');
                $stmt->execute([clean_text($data['name'] ?? null,150,'Venue name'),clean_text($data['address'] ?? null,255,'Address'),clean_text($data['city'] ?? null,100,'City'),$capacity,optional_text($data['description'] ?? null,5000,'Description'),optional_text($data['facilities'] ?? null,1500,'Facilities'),$available,$id]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
            json_response(['message' => 'Venue updated.']);
        }
        if ($method === 'DELETE' && $id !== null) {
            try {
                db()->prepare('DELETE FROM venues WHERE id=?')->execute([$id]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    json_response(['error' => 'This venue is assigned to an event and cannot be deleted.'], 409);
                }
                throw $error;
            }
            json_response(['message' => 'Venue deleted.']);
        }
    }

    if ($resource === 'registrations') {
        if ($method === 'POST' && $id !== null && $action === '') {
            $user = require_user('participant');
            if ($user['role'] !== 'participant') {
                json_response(['error' => 'Only participants can register for events.'], 403);
            }
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $stmt = $pdo->prepare('SELECT id,status,event_date,registration_opens_at,registration_closes_at,capacity FROM events WHERE id=? FOR UPDATE');
                $stmt->execute([$id]);
                $event = $stmt->fetch();
                if (!$event || $event['status'] !== 'published') {
                    $pdo->rollBack();
                    json_response(['error' => 'This event is not open for registration.'], 409);
                }
                $now = new DateTimeImmutable();
                if ($now < new DateTimeImmutable($event['registration_opens_at']) || $now > new DateTimeImmutable($event['registration_closes_at']) || $event['event_date'] < date('Y-m-d')) {
                    $pdo->rollBack();
                    json_response(['error' => 'Registration is not open for this event.'], 409);
                }
                $existing = $pdo->prepare('SELECT id,status FROM registrations WHERE event_id=? AND participant_id=? FOR UPDATE');
                $existing->execute([$id,$user['id']]);
                $prior = $existing->fetch();
                if ($prior && $prior['status'] !== 'cancelled') {
                    $pdo->rollBack();
                    json_response(['error' => 'You are already registered for this event.'], 409);
                }
                $count = $pdo->prepare('SELECT COUNT(*) FROM registrations WHERE event_id=? AND status IN ("registered","attended")');
                $count->execute([$id]);
                if ((int)$count->fetchColumn() >= (int)$event['capacity']) {
                    $pdo->rollBack();
                    json_response(['error' => 'This event has reached its participant capacity.'], 409);
                }
                $reference = strtoupper(bin2hex(random_bytes(6)));
                if ($prior) {
                    $save = $pdo->prepare('UPDATE registrations SET reference_code=?,status="registered",registered_at=NOW(),cancelled_at=NULL WHERE id=?');
                    $save->execute([$reference,$prior['id']]);
                } else {
                    $save = $pdo->prepare('INSERT INTO registrations (event_id,participant_id,reference_code) VALUES (?,?,?)');
                    $save->execute([$id,$user['id'],$reference]);
                }
                $pdo->commit();
                json_response(['message' => 'Registration confirmed.', 'reference' => $reference], 201);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
        }
        if ($method === 'GET') {
            $user = require_user();
            if ($user['role'] === 'participant') {
                $stmt = db()->prepare('SELECT r.id,r.reference_code,r.status,r.registered_at,e.id AS event_id,e.title,e.poster_path,e.event_date,e.start_time,e.end_time,v.name AS venue_name,v.city FROM registrations r JOIN events e ON e.id=r.event_id JOIN venues v ON v.id=e.venue_id WHERE r.participant_id=? ORDER BY e.event_date DESC');
                $stmt->execute([$user['id']]);
                json_response(['items' => $stmt->fetchAll()]);
            }
            if ($user['role'] === 'admin') {
                $stmt = db()->prepare('SELECT r.id,r.reference_code,r.status,r.registered_at,r.cancelled_at,e.id AS event_id,e.title,e.event_date,v.name AS venue_name,u.name,u.email,u.phone FROM registrations r JOIN events e ON e.id=r.event_id JOIN venues v ON v.id=e.venue_id JOIN users u ON u.id=r.participant_id ORDER BY r.registered_at DESC');
                $stmt->execute();
                json_response(['items' => $stmt->fetchAll()]);
            }
            $eventId = filter_var($_GET['event_id'] ?? null, FILTER_VALIDATE_INT);
            if (!$eventId) {
                json_response(['error' => 'event_id is required.'], 422);
            }
            $event = event_row($eventId);
            authorize_event($event);
            $stmt = db()->prepare('SELECT r.id,r.reference_code,r.status,r.registered_at,u.name,u.email,u.phone FROM registrations r JOIN users u ON u.id=r.participant_id WHERE r.event_id=? ORDER BY r.registered_at');
            $stmt->execute([$eventId]);
            json_response(['items' => $stmt->fetchAll()]);
        }
        if ($method === 'POST' && $id !== null && $action === 'cancel') {
            $user = require_user();
            $params = [$id];
            $where = '';
            if ($user['role'] === 'participant') {
                $where = ' AND participant_id=?';
                $params[] = $user['id'];
            } elseif ($user['role'] !== 'admin') {
                json_response(['error' => 'You are not allowed to cancel this registration.'], 403);
            }
            $stmt = db()->prepare('SELECT id,event_id,status FROM registrations WHERE id=?' . $where);
            $stmt->execute($params);
            $registration = $stmt->fetch();
            if (!$registration) {
                json_response(['error' => 'Registration not found.'], 404);
            }
            $event = event_row((int)$registration['event_id']);
            if ($user['role'] !== 'participant') {
                authorize_event($event);
            }
            if ($registration['status'] !== 'registered' || $event['event_date'] < date('Y-m-d')) {
                json_response(['error' => 'This registration can no longer be cancelled.'], 409);
            }
            db()->prepare('UPDATE registrations SET status="cancelled",cancelled_at=NOW() WHERE id=?')->execute([$id]);
            json_response(['message' => 'Registration cancelled.']);
        }
        if ($method === 'PATCH' && $id !== null && $action === 'attendance') {
            $eventId = filter_var($data['event_id'] ?? null, FILTER_VALIDATE_INT);
            $event = $eventId ? event_row($eventId) : null;
            if (!$event) {
                json_response(['error' => 'event_id is required.'], 422);
            }
            authorize_event($event);
            $status = $data['status'] ?? '';
            if (!in_array($status, ['registered','attended','cancelled'], true)) {
                json_response(['error' => 'Invalid registration status.'], 422);
            }
            if ($status === 'attended' && new DateTimeImmutable($event['event_date'] . ' ' . $event['end_time']) > new DateTimeImmutable()) {
                json_response(['error' => 'Attendance can only be recorded after the event has ended.'], 409);
            }
            $stmt = db()->prepare('UPDATE registrations SET status=? WHERE id=? AND event_id=?');
            $stmt->execute([$status,$id,$eventId]);
            if ($stmt->rowCount() === 0) {
                $exists = db()->prepare('SELECT COUNT(*) FROM registrations WHERE id=? AND event_id=?');
                $exists->execute([$id,$eventId]);
                if ((int)$exists->fetchColumn() === 0) {
                    json_response(['error' => 'Registration not found.'], 404);
                }
            }
            json_response(['message' => 'Registration status updated.']);
        }
    }

    if ($resource === 'schedules' && $id !== null) {
        if ($method === 'GET') {
            $event = event_row($id);
            authorize_event($event);
            $stmt = db()->prepare('SELECT id,event_id,title,description,starts_at,ends_at,speaker,location FROM schedules WHERE event_id=? ORDER BY starts_at');
            $stmt->execute([$id]);
            json_response(['items' => $stmt->fetchAll()]);
        }
        $event = event_row((int)($data['event_id'] ?? $route[1]));
        authorize_event($event);
        if (in_array($method, ['POST','PATCH'], true)) {
            $sessionId = $method === 'PATCH' ? filter_var($route[2] ?? null, FILTER_VALIDATE_INT) : null;
            if ($method === 'PATCH' && (!is_int($sessionId) || $sessionId < 1)) {
            json_response(['error' => 'A valid schedule session ID is required.'], 422);
            }
            $title = clean_text($data['title'] ?? null, 180, 'Session title');
            $start = $data['starts_at'] ?? null;
            $end = $data['ends_at'] ?? null;
            if (!is_string($start) || !is_string($end)) {
                json_response(['error' => 'Schedule times must be valid text values.'], 422);
            }
            $startAt = parse_local_datetime($start);
            $endAt = parse_local_datetime($end);
            $eventStartsAt = new DateTimeImmutable($event['event_date'] . ' ' . $event['start_time']);
            $eventEndsAt = new DateTimeImmutable($event['event_date'] . ' ' . $event['end_time']);
            if (!$startAt || !$endAt || $endAt <= $startAt ||
                $startAt->format('Y-m-d') !== $event['event_date'] || $endAt->format('Y-m-d') !== $event['event_date'] ||
                $startAt < $eventStartsAt || $endAt > $eventEndsAt) {
                json_response(['error' => 'Schedule times must be valid and fall on the event date.'], 422);
            }
            $values = [$title,optional_text($data['description'] ?? null,3000,'Description'),$startAt->format('Y-m-d H:i:s'),$endAt->format('Y-m-d H:i:s'),optional_text($data['speaker'] ?? null,120,'Speaker'),optional_text($data['location'] ?? null,180,'Location')];
            $pdo = db();
            $pdo->beginTransaction();
            try {
                $pdo->prepare('SELECT id FROM events WHERE id=? FOR UPDATE')->execute([$id]);
                if ($sessionId) {
                    $existingSession = $pdo->prepare('SELECT id FROM schedules WHERE id=? AND event_id=? FOR UPDATE');
                    $existingSession->execute([$sessionId,$id]);
                    if (!$existingSession->fetch()) {
                        $pdo->rollBack();
                        json_response(['error' => 'Schedule session not found.'], 404);
                    }
                }
                $overlap = $pdo->prepare('SELECT COUNT(*) FROM schedules WHERE event_id=? AND starts_at < ? AND ends_at > ?' . ($sessionId ? ' AND id<>?' : ''));
                $overlapParams = [$id,$endAt->format('Y-m-d H:i:s'),$startAt->format('Y-m-d H:i:s')];
                if ($sessionId) $overlapParams[] = $sessionId;
                $overlap->execute($overlapParams);
                if ((int)$overlap->fetchColumn() > 0) {
                    $pdo->rollBack();
                    json_response(['error' => 'This session overlaps another session in the event schedule.'], 409);
                }
                if ($sessionId) {
                    $stmt = $pdo->prepare('UPDATE schedules SET title=?,description=?,starts_at=?,ends_at=?,speaker=?,location=? WHERE id=? AND event_id=?');
                    $stmt->execute([...$values,$sessionId,$id]);
                    $pdo->commit();
                    json_response(['message' => 'Schedule session updated.']);
                }
                $stmt = $pdo->prepare('INSERT INTO schedules (event_id,title,description,starts_at,ends_at,speaker,location) VALUES (?,?,?,?,?,?,?)');
                $stmt->execute([$id,...$values]);
                $scheduleId = (int)$pdo->lastInsertId();
                $pdo->commit();
                json_response(['message' => 'Schedule session created.','id'=>$scheduleId],201);
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                throw $error;
            }
        }
        if ($method === 'DELETE' && isset($route[2])) {
            $sessionId = filter_var($route[2], FILTER_VALIDATE_INT);
            if (!is_int($sessionId) || $sessionId < 1) {
                json_response(['error' => 'A valid schedule session ID is required.'], 422);
            }
            $stmt = db()->prepare('DELETE FROM schedules WHERE id=? AND event_id=?');
            $stmt->execute([$sessionId,$id]);
            if ($stmt->rowCount() === 0) {
                json_response(['error' => 'Schedule session not found.'], 404);
            }
            json_response(['message' => 'Schedule session deleted.']);
        }
    }

    if ($resource === 'feedback') {
        if ($method === 'POST' && $id !== null) {
            $user = require_user('participant');
            $rating = filter_var($data['rating'] ?? null, FILTER_VALIDATE_INT);
            if (!$rating || $rating < 1 || $rating > 5) {
                json_response(['error' => 'Rating must be a number from 1 to 5.'], 422);
            }
            $review = clean_text($data['review'] ?? null, 3000, 'Review');
            $eligibility = db()->prepare('SELECT r.status,e.status AS event_status,e.event_date FROM registrations r JOIN events e ON e.id=r.event_id WHERE r.event_id=? AND r.participant_id=?');
            $eligibility->execute([$id,$user['id']]);
            $record = $eligibility->fetch();
            if (!$record || !($record['status'] === 'attended' || ($record['status'] === 'registered' && ($record['event_status'] === 'completed' || ($record['event_status'] !== 'cancelled' && $record['event_date'] < date('Y-m-d')))))) {
                json_response(['error' => 'Feedback is available only after attending or completing a registered event.'], 403);
            }
            try {
                db()->prepare('INSERT INTO feedback (event_id,participant_id,rating,review) VALUES (?,?,?,?)')->execute([$id,$user['id'],$rating,$review]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    json_response(['error' => 'You have already submitted feedback for this event.'], 409);
                }
                throw $error;
            }
            json_response(['message' => 'Thank you for your feedback.'], 201);
        }
        if ($method === 'GET' && $id !== null) {
            $event = event_row($id);
            $user = require_user();
            if ($user['role'] !== 'admin' && (int)$event['organizer_id'] !== (int)$user['id']) {
                json_response(['error' => 'You are not allowed to view private feedback.'], 403);
            }
            $stmt = db()->prepare('SELECT f.id,f.rating,f.review,f.is_visible,f.created_at,u.name AS participant_name FROM feedback f JOIN users u ON u.id=f.participant_id WHERE f.event_id=? ORDER BY f.created_at DESC');
            $stmt->execute([$id]);
            json_response(['items' => $stmt->fetchAll()]);
        }
        if ($method === 'PATCH' && $id !== null && $action === 'moderate') {
            require_user('admin');
            $visible = filter_var($data['is_visible'] ?? null, FILTER_VALIDATE_INT);
            if (!in_array($visible, [0,1], true)) {
                json_response(['error' => 'is_visible must be 0 or 1.'], 422);
            }
            db()->prepare('UPDATE feedback SET is_visible=? WHERE id=?')->execute([$visible,$id]);
            json_response(['message' => 'Feedback moderation saved.']);
        }
    }

    if ($resource === 'admin') {
        require_user('admin');
        if ($method === 'GET' && ($route[1] ?? '') === 'stats') {
            $stats = [];
            foreach (['users','events','registrations','venues'] as $table) {
                $stats[$table] = (int)db()->query("SELECT COUNT(*) FROM `$table`")->fetchColumn();
            }
            $stats['participants'] = (int)db()->query('SELECT COUNT(*) FROM users WHERE role="participant"')->fetchColumn();
            $stats['pending_organizers'] = (int)db()->query('SELECT COUNT(*) FROM users WHERE role="organizer" AND status="pending"')->fetchColumn();
            $stats['popular_events'] = db()->query('SELECT e.id,e.title,COUNT(r.id) AS registrations FROM events e LEFT JOIN registrations r ON r.event_id=e.id AND r.status IN ("registered","attended") GROUP BY e.id ORDER BY registrations DESC LIMIT 5')->fetchAll();
            $stats['recent_events'] = db()->query('SELECT e.id,e.title,e.event_date,e.status,v.name AS venue_name FROM events e JOIN venues v ON v.id=e.venue_id ORDER BY e.created_at DESC,e.id DESC LIMIT 5')->fetchAll();
            $stats['recent_registrations'] = db()->query('SELECT r.id,r.status,r.registered_at,e.title AS event_title,u.name AS participant_name FROM registrations r JOIN events e ON e.id=r.event_id JOIN users u ON u.id=r.participant_id ORDER BY r.registered_at DESC,r.id DESC LIMIT 5')->fetchAll();
            json_response(['stats' => $stats]);
        }
        if ($method === 'GET' && ($route[1] ?? '') === 'users') {
            json_response(['items' => db()->query('SELECT id,name,email,phone,role,status,created_at FROM users ORDER BY created_at DESC LIMIT 500')->fetchAll()]);
        }
        if ($method === 'GET' && ($route[1] ?? '') === 'feedback') {
            $items = db()->query('SELECT f.id,f.event_id,f.rating,f.review,f.is_visible,f.created_at,e.title AS event_title,u.name AS participant_name FROM feedback f JOIN events e ON e.id=f.event_id JOIN users u ON u.id=f.participant_id ORDER BY f.created_at DESC LIMIT 500')->fetchAll();
            json_response(['items' => $items]);
        }
        $adminTargetId = isset($route[2]) ? filter_var($route[2], FILTER_VALIDATE_INT) : null;
        if ($adminTargetId === false) $adminTargetId = null;
        if ($method === 'PATCH' && ($route[1] ?? '') === 'users' && $adminTargetId !== null) {
            $status = $data['status'] ?? '';
            if (!in_array($status, ['active','suspended'], true)) {
                json_response(['error' => 'Status must be active or suspended.'], 422);
            }
            db()->prepare('UPDATE users SET status=? WHERE id=? AND role<>"admin"')->execute([$status,$adminTargetId]);
            json_response(['message' => 'Account status updated.']);
        }
        if ($method === 'POST' && ($route[1] ?? '') === 'organizers' && $adminTargetId !== null) {
            $decision = $data['decision'] ?? '';
            if (!in_array($decision, ['approve','reject'], true)) {
                json_response(['error' => 'Decision must be approve or reject.'], 422);
            }
            $status = $decision === 'approve' ? 'active' : 'suspended';
            $stmt = db()->prepare('UPDATE users SET status=? WHERE id=? AND role="organizer" AND status="pending"');
            $stmt->execute([$status,$adminTargetId]);
            if ($stmt->rowCount() === 0) {
                json_response(['error' => 'No pending organizer account was found.'], 404);
            }
            json_response(['message' => 'Organizer request ' . ($decision === 'approve' ? 'approved.' : 'rejected.')]);
        }
        if ($method === 'GET' && ($route[1] ?? '') === 'reports') {
            $monthly = db()->query('SELECT DATE_FORMAT(registered_at,"%Y-%m") AS month,COUNT(*) AS registrations FROM registrations WHERE status IN ("registered","attended") GROUP BY month ORDER BY month DESC LIMIT 12')->fetchAll();
            json_response(['registrations_by_month' => $monthly]);
        }
    }

    json_response(['error' => 'API route not found.'], 404);
}

try {
    route_request();
} catch (Throwable $error) {
    log_error($error);
    $message = getenv('APP_ENV') === 'development' ? $error->getMessage() : 'An unexpected server error occurred. Please try again later.';
    json_response(['error' => $message], 500);
}
