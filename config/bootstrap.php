<?php
declare(strict_types=1);

$envFile = dirname(__DIR__) . DIRECTORY_SEPARATOR . '.env';
if (is_file($envFile) && is_readable($envFile)) {
    foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim(trim($value), "\"'");
        if ($key !== '' && getenv($key) === false) {
            putenv($key . '=' . $value);
            $_ENV[$key] = $value;
        }
    }
}

date_default_timezone_set(getenv('APP_TIMEZONE') ?: 'UTC');
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header_remove('X-Powered-By');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('X-Frame-Options: DENY');
if (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
    header('Strict-Transport-Security: max-age=31536000; includeSubDomains');
}

$isHttps = isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off';
ini_set('session.use_strict_mode', '1');
ini_set('session.use_only_cookies', '1');
session_set_cookie_params([
    'lifetime' => 0,
    'path' => '/',
    'secure' => $isHttps,
    'httponly' => true,
    'samesite' => 'Lax',
]);
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

function db(): PDO
{
    static $pdo;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $host = getenv('DB_HOST');
    $name = getenv('DB_NAME');
    $user = getenv('DB_USER');
    $password = getenv('DB_PASSWORD');
    if (!$host || !$name || $user === false || $password === false) {
        throw new RuntimeException('Database configuration is incomplete. Set DB_HOST, DB_NAME, DB_USER and DB_PASSWORD in .env.');
    }

    $charset = getenv('DB_CHARSET') ?: 'utf8mb4';
    $port = getenv('DB_PORT') ?: '3306';
    $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=%s', $host, $port, $name, $charset);
    $pdo = new PDO($dsn, $user, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);
    return $pdo;
}

function json_response(array $payload, int $status = 200): void
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function request_data(): array
{
    $contentType = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($contentType, 'application/json')) {
        $data = json_decode(file_get_contents('php://input') ?: '', true);
        return is_array($data) ? $data : [];
    }
    return $_POST;
}

function csrf_token(): string
{
    if (!isset($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

function require_csrf(): void
{
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? request_data()['_csrf'] ?? '';
    if (!is_string($sent) || !hash_equals(csrf_token(), $sent)) {
        json_response(['error' => 'Your session token expired. Refresh the page and try again.'], 419);
    }
}

function current_user(): ?array
{
    $sessionUser = $_SESSION['user'] ?? null;
    if (!$sessionUser) {
        return null;
    }
    $stmt = db()->prepare('SELECT id,name,email,role,status FROM users WHERE id=?');
    $stmt->execute([$sessionUser['id']]);
    $user = $stmt->fetch();
    if (!$user || $user['status'] !== 'active') {
        unset($_SESSION['user']);
        return null;
    }
    $_SESSION['user'] = [
        'id' => (int)$user['id'],
        'name' => $user['name'],
        'email' => $user['email'],
        'role' => $user['role'],
    ];
    return $_SESSION['user'];
}

function require_user(?string $role = null): array
{
    $user = current_user();
    if (!$user) {
        json_response(['error' => 'Sign in is required.'], 401);
    }
    if ($role !== null && $user['role'] !== $role && $user['role'] !== 'admin') {
        json_response(['error' => 'You are not allowed to perform this action.'], 403);
    }
    return $user;
}

function clean_text(mixed $value, int $maxLength, string $field): string
{
    if (!is_string($value)) {
        json_response(['error' => "$field is required."], 422);
    }
    $value = trim($value);
    if ($value === '' || mb_strlen($value) > $maxLength) {
        json_response(['error' => "$field must be between 1 and $maxLength characters."], 422);
    }
    return $value;
}

function optional_text(mixed $value, int $maxLength, string $field): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value)) {
        json_response(['error' => "$field must be text."], 422);
    }
    $value = trim($value);
    if (mb_strlen($value) > $maxLength) {
        json_response(['error' => "$field must not exceed $maxLength characters."], 422);
    }
    return $value === '' ? null : $value;
}

function parse_local_datetime(mixed $value): ?DateTimeImmutable
{
    if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/', $value)) {
        return null;
    }
    $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $value);
    $errors = DateTimeImmutable::getLastErrors();
    if (!$date || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0)) ||
        $date->format('Y-m-d\TH:i') !== $value) {
        return null;
    }
    return $date;
}

function valid_date(string $value, string $format): bool
{
    $date = DateTimeImmutable::createFromFormat('!' . $format, $value);
    return $date !== false && $date->format($format) === $value;
}

function log_error(Throwable $error): void
{
    $logPath = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage' . DIRECTORY_SEPARATOR . 'logs';
    if (!is_dir($logPath)) {
        mkdir($logPath, 0750, true);
    }
    error_log(sprintf("[%s] %s in %s:%d\n", date(DATE_ATOM), $error->getMessage(), $error->getFile(), $error->getLine()), 3, $logPath . DIRECTORY_SEPARATOR . 'app.log');
}
