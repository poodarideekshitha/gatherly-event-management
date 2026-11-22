<?php
declare(strict_types=1);

require dirname(__DIR__) . '/config/bootstrap.php';

if (PHP_SAPI !== 'cli') {
    fwrite(STDERR, "This setup tool must be run from the command line.\n");
    exit(1);
}

try {
    $pdo = db();
    $existing = (int)$pdo->query('SELECT COUNT(*) FROM users WHERE role="admin"')->fetchColumn();
    if ($existing > 0) {
        fwrite(STDERR, "An administrator already exists. No account was changed.\n");
        exit(1);
    }

    fwrite(STDOUT, "First administrator setup\nName: ");
    $name = trim((string)fgets(STDIN));
    fwrite(STDOUT, "Email: ");
    $email = strtolower(trim((string)fgets(STDIN)));
    $password = getenv('ADMIN_PASSWORD');

    if ($name === '' || strlen($name) > 120 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        throw new RuntimeException('Enter a name (up to 120 characters) and a valid email address.');
    }
    if (!is_string($password) || mb_strlen($password, 'UTF-8') < 6 || mb_strlen($password, 'UTF-8') > 200) {
        throw new RuntimeException('Set ADMIN_PASSWORD in the current terminal to a unique password of at least 6 characters.');
    }

    $stmt = $pdo->prepare('INSERT INTO users (name,email,password_hash,role,status) VALUES (?,?,?,"admin","active")');
    $stmt->execute([$name,$email,password_hash($password,PASSWORD_DEFAULT)]);
    fwrite(STDOUT, "Administrator account created. Sign in at your local Gatherly URL.\n");
} catch (Throwable $error) {
    fwrite(STDERR, "Administrator setup failed: " . $error->getMessage() . "\n");
    exit(1);
} finally {
    if (isset($password) && is_string($password)) {
        $password = str_repeat("\0", strlen($password));
    }
}
