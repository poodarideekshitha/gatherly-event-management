<?php
declare(strict_types=1);
require dirname(__DIR__) . '/config/bootstrap.php';
header("Content-Security-Policy: default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
?>
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#111a3a">
  <title>Gatherly — Events worth showing up for</title>
  <link rel="stylesheet" href="/assets/styles.css">
  <meta name="csrf-token" content="<?= htmlspecialchars(csrf_token(), ENT_QUOTES, 'UTF-8') ?>">
  <meta name="support-email" content="<?= htmlspecialchars(getenv('SUPPORT_EMAIL') ?: '', ENT_QUOTES, 'UTF-8') ?>">
  <script src="/assets/app.js" defer></script>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="#/" aria-label="Gatherly home"><span class="brand-mark">g</span> gatherly<span class="brand-dot">.</span></a>
    <button class="menu-toggle" type="button" aria-label="Toggle navigation" aria-expanded="false">☰</button>
    <nav id="navigation" aria-label="Main navigation">
      <a href="#/events">Explore events</a>
      <a href="#/about">About</a>
      <span id="account-nav"><a class="button button-small button-outline" href="#/login">Log in</a><a class="button button-small" href="#/register">Get started</a></span>
    </nav>
  </header>
  <main id="app" tabindex="-1">
    <div class="page-loading"><span class="spinner"></span><span>Getting things ready…</span></div>
  </main>
  <footer class="footer">
    <div><a class="brand brand-light" href="#/">gatherly<span class="brand-dot">.</span></a><p>Bring people together, beautifully.</p></div>
    <div class="footer-links"><a href="#/events">Discover events</a><a href="#/about">About</a><a href="#/contact">Contact</a></div>
    <small>© <?= date('Y') ?> Gatherly. Made for moments that matter.</small>
  </footer>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
</body>
</html>
