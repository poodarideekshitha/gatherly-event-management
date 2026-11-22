(() => {
  const app = document.querySelector('#app');
  const nav = document.querySelector('#navigation');
  const accountNav = document.querySelector('#account-nav');
  const toastNode = document.querySelector('#toast');
  const supportEmail = document.querySelector('meta[name="support-email"]')?.content || '';
  let user = null;
  let toastTimer;

  const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const apiUrl = path => {
    const separator = path.search(/[?&]/);
    const route = separator < 0 ? path : path.slice(0, separator);
    const query = separator < 0 ? '' : path.slice(separator + 1);
    return `/api.php?path=${encodeURIComponent(route)}${query ? `&${query}` : ''}`;
  };
  window.APP_CSRF = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const api = async (path, options = {}) => {
    const headers = new Headers(options.headers || {});
    headers.set('X-CSRF-Token', window.APP_CSRF || '');
    if (options.body && !(options.body instanceof FormData)) headers.set('Content-Type', 'application/json');
    const response = await fetch(apiUrl(path), { credentials: 'same-origin', ...options, headers });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    if (result.csrf) window.APP_CSRF = result.csrf;
    return result;
  };
  const toast = (message, error = false) => {
    toastNode.textContent = message;
    toastNode.classList.toggle('error', error);
    toastNode.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastNode.classList.remove('show'), 3600);
  };
  const button = (label, action, style = '') =>
    `<button class="button ${style}" type="button" data-action="${escapeHtml(action)}">${escapeHtml(label)}</button>`;
  const empty = (icon, title, detail) =>
    `<div class="empty-state"><div class="empty-icon">${icon}</div><h3>${escapeHtml(title)}</h3><p>${escapeHtml(detail)}</p></div>`;
  const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  const timeLabel = value => value ? new Date(`2000-01-01T${value}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
  const eventCard = event => `
    <article class="event-card">
      <a href="#/event/${Number(event.id)}" aria-label="View ${escapeHtml(event.title)}">
        <div class="event-cover">${event.poster_path ? `<img src="${escapeHtml(event.poster_path)}" alt="">` : `<span class="cover-label">${escapeHtml(event.category || 'Gather')}</span>`}</div>
      </a>
      <div class="event-content">
        <div class="event-meta"><span class="tag">${escapeHtml(event.category || 'Event')}</span><span>${dateLabel(event.event_date)}</span></div>
        <h3><a href="#/event/${Number(event.id)}">${escapeHtml(event.title)}</a></h3>
        <p>${escapeHtml(event.description || '')}</p>
        <div class="event-foot"><span>${escapeHtml(event.venue_name || 'Venue to be announced')}${event.venue_city ? ` · ${escapeHtml(event.venue_city)}` : ''}</span><a class="button" href="#/event/${Number(event.id)}">View Details</a></div>
      </div>
    </article>`;
  const pageHero = (title, subtitle) => `<section class="page-hero"><div class="page-hero-inner"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(subtitle)}</p></div></section>`;
  const formField = (label, name, type = 'text', required = true, attrs = '') =>
    `<div class="field"><label for="${escapeHtml(name)}">${escapeHtml(label)}</label><input class="input" id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="${type}" ${required ? 'required' : ''} ${attrs}></div>`;
  const setupTableSearch = (inputId, tableId) => {
    const input = document.querySelector(inputId);
    const table = document.querySelector(tableId);
    if (!input || !table) return;
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      table.querySelectorAll('tbody tr').forEach(row => {
        row.hidden = query !== '' && !row.textContent.toLowerCase().includes(query);
      });
    });
  };

  function updateNav() {
    accountNav.innerHTML = user
      ? `<a href="#/dashboard">Hi, ${escapeHtml(user.name.split(' ')[0])}</a><button type="button" class="button button-small button-outline" data-action="logout">Log out</button>`
      : '<a class="button button-small button-outline" href="#/login">Log in</a><a class="button button-small" href="#/register">Get started</a>';
  }

  async function renderProfile(target) {
    const { user: profile } = await api('auth/me');
    target.innerHTML = `<div class="eyebrow">Account settings</div><h1>My profile</h1><p>Update your account name, phone number, or password.</p><div class="panel"><form id="profile-form">${formField('Full name','name')}${formField('Email address','email','email',true,'readonly')}${formField('Phone number','phone','tel',false)}<hr><h3>Change password (optional)</h3>${formField('Current password','current_password','password',false)}${formField('New password (6+ characters)','new_password','password',false,'minlength="6"')}<button class="button">Save changes</button></form></div>`;
    const form = document.querySelector('#profile-form');
    form.elements.name.value = profile.name || '';
    form.elements.email.value = profile.email || '';
    form.elements.phone.value = profile.phone || '';
    form.addEventListener('submit',async event => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(event.currentTarget));
      if (!payload.new_password) {
        delete payload.new_password;
        delete payload.current_password;
      }
      try {
        const result = await api('auth/profile',{method:'PATCH',body:JSON.stringify(payload)});
        user = result.user;
        updateNav();
        toast(result.message);
        renderDashboard();
      } catch (error) { toast(error.message,true); }
    });
  }

  async function loadEvents(query = '') {
    const result = await api(`events${query ? `&${query}` : ''}`);
    return result.items || [];
  }

  async function renderHome() {
    app.innerHTML = `
      <section class="hero"><div class="hero-inner">
        <div class="hero-copy"><div class="eyebrow">Good things happen together</div><h1>Find your people.<br>Make a day of it.</h1>
          <p>Discover gatherings that spark ideas, bring people closer, and give you something to look forward to.</p>
          <div class="hero-actions"><a class="button" href="#/events">Explore events <span aria-hidden="true">→</span></a><a class="button button-outline" href="#/register?role=organizer">Host an event</a></div>
          <div class="trust-row"><span>Easy registration</span><span>Real communities</span><span>Memorable moments</span></div>
        </div><div class="hero-art"><div class="hero-photo-frame"><img src="https://images.unsplash.com/photo-1511795409834-ef04bbd61622?auto=format&amp;fit=crop&amp;w=1200&amp;q=85" alt="A warmly lit event table decorated with flowers and place settings" fetchpriority="high"><div class="hero-photo-caption"><span class="hero-caption-icon" aria-hidden="true">✦</span><span>Make room for what’s next<strong>Good moments start together.</strong></span></div></div><div class="hero-photo-note" aria-hidden="true"><span>✦</span> Find your next favorite</div></div>
      </div></section>
      <section class="section featured-section"><div class="section-head"><div><div class="eyebrow">Made for your kind of curious</div><h2>Explore what’s happening</h2><p>Find an event that feels like your kind of thing.</p></div><a class="button button-quiet" href="#/events">Browse All Events →</a></div><div id="featured-events" class="event-grid"><div class="page-loading"><span class="spinner"></span>Loading events…</div></div></section>
      <section class="section home-host"><div class="home-host-inner"><div><div class="eyebrow">Bring your people together</div><h2>Have something worth sharing?</h2><p>Create an event, welcome your community, and manage it all in one place.</p></div><a class="button" href="${user ? '#/create-event' : '#/register?role=organizer'}">Start organizing <span aria-hidden="true">→</span></a></div></section>`;
    try {
      const featuredEvents = document.querySelector('#featured-events');
      const events = (await loadEvents()).slice(0, 4);
      featuredEvents.classList.toggle('has-four-events', events.length === 4);
      featuredEvents.innerHTML = events.length
        ? events.map(eventCard).join('')
        : empty('✦', 'No upcoming events just yet', 'New gatherings will appear here as soon as they’re published.');
    } catch (error) {
      document.querySelector('#featured-events').innerHTML = empty('!', 'Events are temporarily unavailable', error.message);
    }
  }

  async function renderEvents() {
    app.innerHTML = `${pageHero('Discover Events', 'Find your next gathering, meet your community, and make time for something memorable.')}
      <section class="page-body events-listing">
        <form id="event-search" class="events-search">
          <label class="sr-only" for="event-query">Search events by name</label>
          <input class="input" id="event-query" name="q" placeholder="Search events by name" aria-label="Search events by name">
          <input class="input" name="date" type="date" aria-label="Events from date">
          <button class="button" type="submit">Search</button>
        </form>
        <div id="event-categories" class="category-filters" role="group" aria-label="Filter events by category">
          <button class="category-filter is-active" type="button" data-category="" aria-pressed="true">All events</button>
        </div>
        <div id="event-results" class="event-grid" aria-live="polite" aria-busy="true"><div class="page-loading"><span class="spinner"></span><span>Loading events…</span></div></div>
      </section>`;
    const categories = await api('categories');
    const categoryFilters = document.querySelector('#event-categories');
    categoryFilters.insertAdjacentHTML('beforeend', (categories.items || []).map(category =>
      `<button class="category-filter" type="button" data-category="${Number(category.id)}" aria-pressed="false">${escapeHtml(category.name)}</button>`
    ).join(''));
    const searchForm = document.querySelector('#event-search');
    const results = document.querySelector('#event-results');
    let selectedCategory = '';
    const load = async () => {
      const params = new URLSearchParams(new FormData(searchForm));
      if (selectedCategory) params.set('category', selectedCategory);
      results.setAttribute('aria-busy', 'true');
      results.innerHTML = '<div class="page-loading"><span class="spinner"></span><span>Loading events…</span></div>';
      try {
        const items = await loadEvents(params.toString());
        results.innerHTML = items.length
          ? items.map(eventCard).join('')
          : empty('⌕', 'No events match your filters', 'Try another search or category, or check back soon for new events.');
      } catch (error) {
        results.innerHTML = empty('!', 'Events could not be loaded', error.message);
        throw error;
      } finally {
        results.setAttribute('aria-busy', 'false');
      }
    };
    searchForm.addEventListener('submit', event => { event.preventDefault(); load().catch(error => toast(error.message, true)); });
    categoryFilters.addEventListener('click', event => {
      const button = event.target.closest('.category-filter');
      if (!button) return;
      selectedCategory = button.dataset.category || '';
      categoryFilters.querySelectorAll('.category-filter').forEach(filter => {
        const active = filter === button;
        filter.classList.toggle('is-active', active);
        filter.setAttribute('aria-pressed', String(active));
      });
      load().catch(error => toast(error.message, true));
    });
    await load().catch(error => toast(error.message, true));
  }

  async function renderEvent(id, registrationResult = null) {
    const { event } = await api(`events/${id}`);
    let existingRegistration = null;
    if (user?.role === 'participant') {
      try {
        const { items } = await api('registrations');
        existingRegistration = items.find(item => Number(item.event_id) === Number(event.id) && item.status !== 'cancelled') || null;
      } catch (error) {
        toast(`We couldn't check your registration status. ${error.message}`, true);
      }
    }

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const eventDate = new Date(`${event.event_date}T00:00:00`);
    const opensAt = new Date(event.registration_opens_at.replace(' ', 'T'));
    const closesAt = new Date(event.registration_closes_at.replace(' ', 'T'));
    const placesRemaining = Math.max(0, Number(event.capacity) - Number(event.registered_count || 0));
    const isFull = placesRemaining === 0;
    const isRegistrationOpen = event.status === 'published' && eventDate >= today && now >= opensAt && now <= closesAt;
    const registrationStatus = isFull
      ? '<span class="registration-status is-full">Event full</span>'
      : isRegistrationOpen
        ? '<span class="registration-status is-open">Registration open</span>'
        : '<span class="registration-status is-closed">Registration closed</span>';
    const confirmation = registrationResult
      ? `<div class="registration-success" role="status"><strong>You're registered!</strong><p>${escapeHtml(registrationResult.message)} Your reference is <strong>${escapeHtml(registrationResult.reference)}</strong>.</p></div>`
      : existingRegistration
        ? `<div class="registration-success" role="status"><strong>You're already registered.</strong><p>Your reference is <strong>${escapeHtml(existingRegistration.reference_code)}</strong>.</p></div>`
        : '';
    const registrationAction = confirmation
      ? ''
      : isFull
        ? '<button class="button" type="button" disabled>Event full</button>'
        : !isRegistrationOpen
          ? '<button class="button" type="button" disabled>Registration closed</button>'
          : user?.role === 'participant'
            ? button('Register Now', `register:${event.id}`)
            : user
              ? '<p class="muted">Participant accounts can register for events.</p>'
              : '<a class="button" href="#/login">Log in to Register</a>';
    const venueDetails = [event.venue_city, event.venue_address].filter(Boolean).map(escapeHtml).join(' · ');
    const schedule = event.schedules.length
      ? event.schedules.map(item => `<div class="schedule-item"><div class="schedule-time">${new Date(item.starts_at.replace(' ', 'T')).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})} – ${new Date(item.ends_at.replace(' ', 'T')).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.description || '')}${item.speaker ? `<br>With ${escapeHtml(item.speaker)}` : ''}</p></div></div>`).join('')
      : '<p>Schedule details will be shared by the organizer.</p>';

    app.innerHTML = `
      <section class="event-detail-banner">
        <div class="event-detail-cover">
          ${event.poster_path
            ? `<img src="${escapeHtml(event.poster_path)}" alt="${escapeHtml(event.title)} event cover" fetchpriority="high">`
            : '<div class="event-detail-cover-placeholder" aria-hidden="true"></div>'}
          <div class="event-detail-cover-shade"></div>
          <div class="event-detail-heading">
            <span class="event-detail-category">${escapeHtml(event.category)}</span>
            <h1>${escapeHtml(event.title)}</h1>
            <p>Hosted by ${escapeHtml(event.organizer_name)}</p>
            ${event.rating?.average_rating ? `<span class="event-detail-rating">★ ${escapeHtml(event.rating.average_rating)} · ${Number(event.rating.feedback_count)} reviews</span>` : ''}
          </div>
        </div>
      </section>
      <section class="page-body event-details-page">
        <div class="event-facts-grid">
          <div class="event-fact-card"><span>Date</span><strong>${dateLabel(event.event_date)}</strong></div>
          <div class="event-fact-card"><span>Time</span><strong>${timeLabel(event.start_time)} – ${timeLabel(event.end_time)}</strong></div>
          <div class="event-fact-card"><span>Venue</span><strong>${escapeHtml(event.venue_name || 'Venue to be announced')}</strong><small>${venueDetails || 'Venue details coming soon'}</small></div>
        </div>
        <div class="detail-layout event-detail-layout">
          <div class="event-detail-main">
            <section class="panel"><h2>About this event</h2><p>${escapeHtml(event.description)}</p></section>
            <section class="panel"><h2>Event schedule</h2>${schedule}</section>
            <section class="panel"><h2>Attendee reviews</h2>${event.feedback.length ? event.feedback.map(review => `<div class="review"><div class="stars">${'★'.repeat(Number(review.rating))}${'☆'.repeat(5 - Number(review.rating))}</div><p>${escapeHtml(review.review)}</p><small>${escapeHtml(review.participant_name)} · ${dateLabel(review.created_at.slice(0,10))}</small></div>`).join('') : '<p>Be among the first to share your experience.</p>'}</section>
          </div>
          <aside class="detail-side registration-card">
            <h2>Save your spot</h2>
            ${registrationStatus}
            <div class="detail-row"><strong>Places remaining</strong>${placesRemaining} of ${Number(event.capacity)}</div>
            ${confirmation}
            ${registrationAction ? `<div class="registration-action">${registrationAction}</div>` : ''}
          </aside>
        </div>
      </section>`;
  }

  function renderAbout() {
    app.innerHTML = `${pageHero('More than a calendar', 'A simple home for communities to gather, share ideas, and make meaningful things happen.')}
      <section class="page-body"><div class="panel"><h2>Events are better together</h2><p>Gatherly helps organizers bring people together and gives participants one clear place to discover events, reserve a spot, follow a schedule, and share feedback.</p><p>Whether you are hosting a campus workshop, a neighborhood meetup, or a creative conference, the right gathering can create something that lasts far beyond the day.</p><a class="button" href="#/events">Explore events</a></div></section>`;
  }

  function renderContact() {
    app.innerHTML = `${pageHero('Get in touch', 'Questions about an event or your account? Reach the team that manages this Gatherly installation.')}
      <section class="page-body"><div class="panel">${supportEmail
        ? `<h2>Contact support</h2><p>Send a note to the Gatherly support team.</p><a class="button" href="mailto:${escapeHtml(supportEmail)}">Email ${escapeHtml(supportEmail)}</a>`
        : '<h2>Contact your event administrator</h2><p>A support email has not been configured for this installation yet. Please contact the organization that hosts this event platform.</p>'}
      </div></section>`;
  }

  async function renderAuth(mode) {
    const isRegister = mode === 'register';
    const params = new URLSearchParams(location.hash.split('?')[1] || '');
    const requestedRole = params.get('role') === 'organizer' ? 'organizer' : 'participant';
    const passwordField = (label, name, autocomplete, constrainRegistrationPassword = false) => `
      <div class="field">
        <label for="${escapeHtml(name)}">${escapeHtml(label)}</label>
        <div class="password-control">
          <input class="input" id="${escapeHtml(name)}" name="${escapeHtml(name)}" type="password" autocomplete="${autocomplete}" required${constrainRegistrationPassword ? ' minlength="6" maxlength="200"' : ''}>
          <button class="password-toggle" type="button" data-password-toggle="${escapeHtml(name)}" data-password-label="${escapeHtml(label.toLowerCase())}" aria-label="Show ${escapeHtml(label.toLowerCase())}" aria-controls="${escapeHtml(name)}" aria-pressed="false">Show</button>
        </div>
      </div>`;
    const submitLabel = isRegister ? 'Create account' : 'Log in';
    app.innerHTML = `
      <section class="auth-screen">
        <div class="form-card auth-card">
          <a class="brand auth-brand" href="#/" aria-label="Gatherly home"><span class="brand-mark">g</span> gatherly<span class="brand-dot">.</span></a>
          <div class="eyebrow">${isRegister ? 'Join the community' : 'Welcome back'}</div>
          <h1>${isRegister ? 'Create your account' : 'Good to see you again'}</h1>
          <p>${isRegister ? 'A new event experience starts here.' : 'Sign in to pick up where you left off.'}</p>
          <form id="auth-form" autocomplete="on">
            <div class="auth-message" id="auth-message" role="alert" aria-live="polite" hidden></div>
            ${isRegister ? `${formField('Full name','name','text',true,'autocomplete="name" maxlength="120"')}${formField('Email address','email','email',true,'autocomplete="email" maxlength="254"')}${formField('Phone number (optional)','phone','tel',false,'autocomplete="tel" maxlength="30"')}<div class="field"><label for="role">I want to</label><select class="select" name="role" id="role"><option value="participant" ${requestedRole === 'participant' ? 'selected' : ''}>Attend events</option><option value="organizer" ${requestedRole === 'organizer' ? 'selected' : ''}>Organize events</option></select></div>${passwordField('Password','password','new-password',true)}${passwordField('Confirm password','password_confirmation','new-password',true)}` : `${formField('Email address','email','email',true,'autocomplete="username" maxlength="254"')}${passwordField('Password','password','current-password')}`}
            <button class="button auth-submit" type="submit">${submitLabel}</button>
          </form>
          <p class="auth-switch">${isRegister ? 'Already have an account?' : 'New to Gatherly?'} <a class="link-button" href="#/${isRegister ? 'login' : 'register'}">${isRegister ? 'Log in' : 'Create an account'}</a></p>
        </div>
      </section>`;
    const formNode = document.querySelector('#auth-form');
    const messageNode = document.querySelector('#auth-message');
    const showMessage = (message, type = 'error') => {
      messageNode.textContent = message;
      messageNode.className = `auth-message ${type === 'success' ? 'is-success' : 'is-error'}`;
      messageNode.hidden = !message;
    };
    formNode.addEventListener('click', event => {
      const toggle = event.target.closest('[data-password-toggle]');
      if (!toggle) return;
      const input = formNode.elements.namedItem(toggle.dataset.passwordToggle);
      const showPassword = input.type === 'password';
      input.type = showPassword ? 'text' : 'password';
      toggle.textContent = showPassword ? 'Hide' : 'Show';
      toggle.setAttribute('aria-label', `${showPassword ? 'Hide' : 'Show'} ${toggle.dataset.passwordLabel}`);
      toggle.setAttribute('aria-pressed', String(showPassword));
    });
    formNode.addEventListener('submit', async event => {
      event.preventDefault();
      const payload = Object.fromEntries(new FormData(formNode).entries());
      showMessage('');
      if (isRegister && payload.password !== payload.password_confirmation) {
        showMessage('Passwords do not match. Please confirm your password.');
        formNode.elements.password_confirmation.focus();
        return;
      }
      const submitButton = formNode.querySelector('.auth-submit');
      submitButton.disabled = true;
      submitButton.textContent = isRegister ? 'Creating account…' : 'Signing in…';
      try {
        const result = await api(`auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(payload) });
        if (!isRegister) {
          user = result.user;
          updateNav();
          toast(`Welcome back, ${user.name.split(' ')[0]}!`);
          location.hash = '#/dashboard';
        } else {
          if (payload.role === 'organizer') {
            toast(result.message);
            location.hash = '#/login';
          } else {
            formNode.reset();
            formNode.querySelectorAll('[data-password-toggle]').forEach(toggle => {
              const input = formNode.elements.namedItem(toggle.dataset.passwordToggle);
              input.type = 'password';
              toggle.textContent = 'Show';
              toggle.setAttribute('aria-label', `Show ${toggle.dataset.passwordLabel}`);
              toggle.setAttribute('aria-pressed', 'false');
            });
            showMessage(result.message, 'success');
          }
        }
      } catch (error) {
        showMessage(error.message);
      } finally {
        if (submitButton.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = submitLabel;
        }
      }
    });
  }

  async function renderDashboard() {
    if (!user) { location.hash = '#/login'; return; }
    const links = user.role === 'admin'
      ? [['overview','Overview','⌂'],['organizers','Organizer approvals','✓'],['users','Participants','♙'],['registrations','Registrations','✓'],['venues','Venues','⌖'],['events','Events','◇'],['feedback','Feedback','★'],['reports','Reports','▥']]
      : user.role === 'organizer'
        ? [['overview','Overview'],['events','My events'],['create-event','Create event']]
        : [['overview','Overview'],['registrations','My registrations'],['events','Discover events']];
    if (user.role !== 'admin') links.push(['profile','My profile']);
    const route = location.hash.replace('#/', '').split(/[/?]/)[1] || 'overview';
    app.innerHTML = user.role === 'admin'
      ? `<div class="dashboard-layout admin-dashboard-layout">
          <aside class="sidebar admin-sidebar">
            <div class="admin-sidebar-brand"><span class="admin-sidebar-mark">g</span><div><strong>gatherly.</strong><span>Admin workspace</span></div></div>
            <nav class="admin-sidebar-nav" aria-label="Admin navigation">
              <span class="admin-nav-label">Workspace</span>
              ${links.map(([key,label,icon]) => `<a class="${route === key ? 'active' : ''}" href="#/dashboard/${key}"${route === key ? ' aria-current="page"' : ''}><span class="admin-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('')}
            </nav>
            <a class="admin-sidebar-profile" href="#/dashboard/profile"><span class="admin-avatar">${escapeHtml(user.name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase())}</span><span><strong>${escapeHtml(user.name)}</strong><small>Administrator</small></span></a>
          </aside>
          <section id="dashboard-content" class="dashboard-main"><div class="page-loading"><span class="spinner"></span>Loading your workspace…</div></section>
        </div>`
      : `<div class="dashboard-layout"><aside class="sidebar"><h3>Your workspace</h3>${links.map(([key,label]) => `<a class="${route === key ? 'active' : ''}" href="#/dashboard/${key}">${label}</a>`).join('')}</aside><section id="dashboard-content" class="dashboard-main"><div class="page-loading"><span class="spinner"></span>Loading your workspace…</div></section></div>`;
    const page = route;
    if (user.role === 'admin') return renderAdminPage(page);
    if (user.role === 'organizer') return renderOrganizerPage(page);
    return renderParticipantPage(page);
  }

  async function renderAdminPage(page) {
    const target = document.querySelector('#dashboard-content');
    if (page === 'overview') {
      const { stats } = await api('admin/stats');
      const recentEvents = stats.recent_events.map(event => `
        <div class="admin-record-row">
          <div class="admin-record-copy"><strong>${escapeHtml(event.title)}</strong><span>${dateLabel(event.event_date)} · ${escapeHtml(event.venue_name)}</span></div>
          <span class="pill ${escapeHtml(event.status)}">${escapeHtml(event.status)}</span>
        </div>`).join('');
      const recentRegistrations = stats.recent_registrations.map(registration => `
        <div class="admin-record-row">
          <div class="admin-record-copy"><strong>${escapeHtml(registration.event_title)}</strong><span>${escapeHtml(registration.participant_name)} · ${dateLabel(registration.registered_at)}</span></div>
          <span class="pill ${escapeHtml(registration.status)}">${escapeHtml(registration.status)}</span>
        </div>`).join('');
      target.innerHTML = `
        <div class="admin-dashboard">
          <header class="admin-welcome">
            <div>
              <div class="eyebrow">Administrator overview</div>
              <h1>Welcome back, ${escapeHtml(user.name.split(' ')[0])}</h1>
              <p class="admin-welcome-copy">Here’s what’s happening across your event community.</p>
            </div>
            <span class="admin-live-status"><span></span> System active</span>
          </header>
          <div class="admin-summary-grid">
            ${[
              ['events','Total Events','E','◇'],
              ['participants','Total Participants','P','♙'],
              ['registrations','Total Registrations','R','✓'],
              ['venues','Total Venues','V','⌖']
            ].map(([key,label,short,icon]) => `
              <article class="admin-summary-card">
                <div class="admin-summary-icon" aria-hidden="true">${icon}</div>
                <div><span>${label}</span><strong>${Number(stats[key])}</strong></div>
              </article>`).join('')}
          </div>
          <section class="panel admin-quick-actions">
            <div class="admin-quick-copy"><div class="eyebrow">Quick actions</div><h2>Manage Gathery</h2><p>Add events, update venues, or manage event schedules.</p></div>
            <div class="admin-action-buttons">
              <a class="button" href="#/dashboard/create-event">Add event</a>
              <a class="button button-outline" href="#/dashboard/venues">Manage venues</a>
              <a class="button button-outline" href="#/dashboard/events">Manage schedules</a>
            </div>
          </section>
          <div class="admin-recent-grid">
            <section class="panel admin-list-panel">
              <div class="admin-panel-heading"><h2>Recent Events</h2><a class="link-button" href="#/dashboard/events">View all</a></div>
              <div class="admin-record-list">${recentEvents || '<p class="admin-list-empty">No events yet.</p>'}</div>
            </section>
            <section class="panel admin-list-panel">
              <div class="admin-panel-heading"><h2>Recent Registrations</h2><a class="link-button" href="#/dashboard/events">Manage events</a></div>
              <div class="admin-record-list">${recentRegistrations || '<p class="admin-list-empty">No registrations yet.</p>'}</div>
            </section>
          </div>
          <section class="panel admin-popular-panel">
            <h2>Popular events</h2>
            ${stats.popular_events.length ? `<div class="table-wrap"><table><thead><tr><th>Event</th><th>Registrations</th></tr></thead><tbody>${stats.popular_events.map(row => `<tr><td>${escapeHtml(row.title)}</td><td>${Number(row.registrations)}</td></tr>`).join('')}</tbody></table></div>` : '<p>No event activity yet.</p>'}
          </section>
        </div>`;
    } else if (page === 'organizers' || page === 'users') {
      const { items } = await api('admin/users');
      const filtered = page === 'organizers'
        ? items.filter(item => item.role === 'organizer' && item.status === 'pending')
        : items.filter(item => item.role === 'participant');
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Administration</div><h1>${page === 'organizers' ? 'Organizer approvals' : 'Participant management'}</h1><p>${page === 'organizers' ? 'Review organizer applications before they can publish events.' : 'View and manage participant accounts.'}</p></div></header>
        <section class="management-toolbar"><label class="management-search"><span>Search</span><input id="${page}-search" class="input" type="search" placeholder="Search name or email"></label></section>
        <section class="panel management-panel"><div class="table-wrap"><table id="${page}-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>${filtered.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.email)}</td><td><span class="role-label">${escapeHtml(item.role)}</span></td><td><span class="pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td>${item.role === 'organizer' && item.status === 'pending' ? `<div class="table-actions">${button('Approve',`approve:${item.id}`,'button-small')}${button('Reject',`reject:${item.id}`,'button-small button-danger')}</div>` : item.role !== 'admin' ? `<button class="button button-small ${item.status === 'active' ? 'button-outline' : ''}" type="button" data-action="toggle-user:${item.id}:${item.status}">${item.status === 'active' ? 'Suspend' : 'Activate'}</button>` : '<span class="muted">Protected</span>'}</td></tr>`).join('') || '<tr><td colspan="5">No accounts to show.</td></tr>'}</tbody></table></div></section>`;
      setupTableSearch(`#${page}-search`, `#${page}-table`);
    } else if (page === 'venues') {
      const { items } = await api('venues');
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Locations</div><h1>Venue management</h1><p>Add, edit and review event locations.</p></div></header>
        <div class="management-venues-grid">
          <section class="panel management-form-panel"><h3 id="venue-form-title">Add a venue</h3><form id="venue-form"><input type="hidden" name="is_available" value="1"><div class="form-row">${formField('Venue name','name')}${formField('City','city')}</div>${formField('Address','address')}<div class="form-row">${formField('Capacity','capacity','number')}${formField('Facilities','facilities','text',false)}</div><div class="field"><label for="venue-description">Description</label><textarea id="venue-description" name="description"></textarea></div><button class="button" id="venue-submit">Save venue</button></form></section>
          <section class="panel management-panel"><div class="management-table-heading"><h3>Venues</h3><label class="management-search"><span>Search</span><input id="venue-search" class="input" type="search" placeholder="Search venues"></label></div><div class="table-wrap"><table id="venue-table"><thead><tr><th>Name</th><th>City</th><th>Capacity</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(v => `<tr><td><strong>${escapeHtml(v.name)}</strong></td><td>${escapeHtml(v.city)}</td><td>${Number(v.capacity)}</td><td><span class="pill ${Number(v.is_available) ? 'registered' : 'suspended'}">${Number(v.is_available) ? 'Available' : 'Unavailable'}</span></td><td><div class="table-actions"><button class="button button-small button-outline" type="button" data-action="venue-edit:${Number(v.id)}">Edit</button><button class="button button-small button-quiet" type="button" data-action="venue-toggle:${Number(v.id)}:${Number(v.is_available)}">${Number(v.is_available) ? 'Disable' : 'Enable'}</button><button class="button button-small button-danger" type="button" data-action="venue-delete:${Number(v.id)}">Delete</button></div></td></tr>`).join('') || '<tr><td colspan="5">No venues yet.</td></tr>'}</tbody></table></div></section>
        </div>`;
      document.querySelector('#venue-form').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          const form = event.currentTarget;
          const id = form.dataset.venueId;
          await api(id ? `venues/${id}` : 'venues', { method:id ? 'PATCH' : 'POST', body:JSON.stringify(Object.fromEntries(new FormData(form))) });
          toast(id ? 'Venue updated.' : 'Venue created.');
          renderDashboard();
        }
        catch (error) { toast(error.message,true); }
      });
      setupTableSearch('#venue-search', '#venue-table');
    } else if (page === 'events') {
      await renderManageEvents(target, true);
    } else if (page === 'registrations') {
      const { items } = await api('registrations');
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Event operations</div><h1>Registration management</h1><p>Review participant registrations and event status.</p></div></header>
        <section class="management-toolbar"><label class="management-search"><span>Search</span><input id="registration-search" class="input" type="search" placeholder="Search participant, event or reference"></label></section>
        <section class="panel management-panel"><div class="table-wrap"><table id="registration-table"><thead><tr><th>Participant</th><th>Event</th><th>Date</th><th>Venue</th><th>Reference</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(row => `<tr><td><strong>${escapeHtml(row.name)}</strong><span class="table-secondary">${escapeHtml(row.email)}</span></td><td>${escapeHtml(row.title)}</td><td>${dateLabel(row.event_date)}</td><td>${escapeHtml(row.venue_name)}</td><td><code>${escapeHtml(row.reference_code)}</code></td><td><span class="pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${row.status === 'registered' ? `<button class="button button-small button-outline" type="button" data-action="cancel-registration:${Number(row.id)}">Cancel</button>` : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="7">No registrations yet.</td></tr>'}</tbody></table></div></section>`;
      setupTableSearch('#registration-search', '#registration-table');
    } else if (page === 'create-event') {
      return renderEventForm(target);
    } else if (page === 'profile') {
      await renderProfile(target);
    } else if (page === 'reports') {
      const report = await api('admin/reports');
      target.innerHTML = `<div class="eyebrow">Insights</div><h1>Registration reports</h1><div class="panel"><h3>Registrations by month</h3><div class="table-wrap"><table><thead><tr><th>Month</th><th>Registrations</th></tr></thead><tbody>${report.registrations_by_month.map(row => `<tr><td>${escapeHtml(row.month)}</td><td>${Number(row.registrations)}</td></tr>`).join('') || '<tr><td colspan="2">No registrations yet.</td></tr>'}</tbody></table></div></div>`;
    } else if (page === 'feedback') {
      const { items } = await api('admin/feedback');
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Moderation</div><h1>Feedback management</h1><p>Review participant ratings and control public visibility.</p></div></header>
        <section class="management-toolbar"><label class="management-search"><span>Search</span><input id="feedback-search" class="input" type="search" placeholder="Search event or participant"></label></section>
        <section class="panel management-panel"><div class="table-wrap"><table id="feedback-table"><thead><tr><th>Event</th><th>Participant</th><th>Rating</th><th>Review</th><th>Visibility</th><th>Actions</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.event_title)}</strong></td><td>${escapeHtml(item.participant_name)}</td><td><span class="rating-stars">${'★'.repeat(Number(item.rating))}<span>${'★'.repeat(5 - Number(item.rating))}</span></span></td><td class="review-cell">${escapeHtml(item.review)}</td><td><span class="pill ${Number(item.is_visible) ? 'registered' : 'suspended'}">${Number(item.is_visible) ? 'Visible' : 'Hidden'}</span></td><td><button class="button button-small ${Number(item.is_visible) ? 'button-outline' : 'button-quiet'}" type="button" data-action="moderate-feedback:${Number(item.id)}:${Number(item.is_visible)}">${Number(item.is_visible) ? 'Hide' : 'Show'}</button></td></tr>`).join('') || '<tr><td colspan="6">No feedback to moderate.</td></tr>'}</tbody></table></div></section>`;
      setupTableSearch('#feedback-search', '#feedback-table');
    } else {
      target.innerHTML = empty('✦','Welcome to your workspace','Choose a section from the menu to get started.');
    }
  }

  async function renderManageEvents(target, isAdmin = false) {
    const { items } = await api('events/mine');
    target.innerHTML = `
      <header class="management-header"><div><div class="eyebrow">${isAdmin ? 'Administration' : 'Organizer workspace'}</div><h1>${isAdmin ? 'Event management' : 'Your events'}</h1><p>Manage event details, schedules, attendees and feedback.</p></div>${button(isAdmin ? 'Add event' : 'Create event','go-create')}</header>
      <section class="management-toolbar"><label class="management-search"><span>Search</span><input id="event-search" class="input" type="search" placeholder="Search events"></label></section>
      <section class="panel management-panel"><div class="table-wrap"><table id="event-table"><thead><tr><th>Event</th><th>Date</th><th>Registrations</th><th>Status</th><th>Actions</th></tr></thead><tbody>${items.map(event => `<tr><td><strong>${escapeHtml(event.title)}</strong></td><td>${dateLabel(event.event_date)}</td><td>${Number(event.registered_count)} / ${Number(event.capacity)}</td><td><span class="pill ${escapeHtml(event.status)}">${escapeHtml(event.status)}</span></td><td><div class="table-actions">${['draft','published'].includes(event.status) ? `<a class="button button-small button-outline" href="#/edit-event/${Number(event.id)}">Edit</a>` : ''}<a class="button button-small button-quiet" href="#/schedule/${Number(event.id)}">Schedule</a><a class="button button-small button-quiet" href="#/participants/${Number(event.id)}">Participants</a><a class="button button-small button-quiet" href="#/feedback/${Number(event.id)}">Feedback</a><a class="button button-small button-quiet" href="#/event-report/${Number(event.id)}">Report</a>${event.status === 'draft' ? `<button class="button button-small" type="button" data-action="publish:${Number(event.id)}">Publish</button>` : ''}${event.status !== 'cancelled' && event.status !== 'completed' ? `<button class="button button-small button-danger" type="button" data-action="cancel-event:${Number(event.id)}">Cancel</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5">No events yet. Create your first event to get started.</td></tr>'}</tbody></table></div></section>`;
    setupTableSearch('#event-search', '#event-table');
  }

  async function renderOrganizerPage(page) {
    const target = document.querySelector('#dashboard-content');
    if (page === 'overview' || page === 'events') return renderManageEvents(target);
    if (page === 'create-event') return renderEventForm(target);
    if (page === 'profile') return renderProfile(target);
    target.innerHTML = empty('✦','Your event workspace','Choose a section from the menu to get started.');
  }

  async function renderEventForm(target, eventId = null) {
    const [categories, venues, existing] = await Promise.all([
      api('categories'), api('venues'), eventId ? api(`events/${eventId}`) : Promise.resolve(null)
    ]);
    const event = existing?.event;
    target.innerHTML = `<div class="eyebrow">Event setup</div><h1>${event ? 'Edit event' : 'Create an event'}</h1><p>Share the details and make it easy for your community to join.</p>
      <form id="event-form" class="panel" enctype="multipart/form-data">
        ${formField('Event title','title','text',true,'maxlength="180"')}
        <div class="field"><label for="description">Description</label><textarea id="description" name="description" required maxlength="10000"></textarea></div>
        <div class="form-row"><div class="field"><label for="category_id">Category</label><select class="select" id="category_id" name="category_id" required>${categories.items.map(c => `<option value="${Number(c.id)}">${escapeHtml(c.name)}</option>`).join('')}</select></div><div class="field"><label for="venue_id">Venue</label><select class="select" id="venue_id" name="venue_id" required>${venues.items.filter(v => Number(v.is_available)).map(v => `<option value="${Number(v.id)}">${escapeHtml(v.name)} · ${escapeHtml(v.city)} (cap. ${Number(v.capacity)})</option>`).join('')}</select></div></div>
        <div class="form-row">${formField('Event date','event_date','date')}${formField('Participant capacity','capacity','number',true,'min="1"')}</div>
        <div class="form-row">${formField('Start time','start_time','time')}${formField('End time','end_time','time')}</div>
        <div class="form-row">${formField('Registration opens','registration_opens_at','datetime-local')}${formField('Registration closes','registration_closes_at','datetime-local')}</div>
        <div class="field"><label for="poster">Event poster (JPEG, PNG or WebP; up to 5 MB)</label><input class="input" id="poster" name="poster" type="file" accept="image/jpeg,image/png,image/webp"></div>
        <div class="field"><label for="status">Status</label><select class="select" id="status" name="status"><option value="draft">Draft</option><option value="published">Published</option></select></div>
        <button class="button">${event ? 'Save changes' : 'Create event'}</button></form>`;
    if (event) {
      const form = document.querySelector('#event-form');
      ['title','description','event_date','capacity','start_time','end_time','registration_opens_at','registration_closes_at','category_id','venue_id','status'].forEach(key => {
        const input = form.elements[key];
        if (!input) return;
        const value = event[key];
        input.value = key === 'registration_opens_at' || key === 'registration_closes_at' ? value.replace(' ','T').slice(0,16) : value;
      });
    }
    const eventForm = document.querySelector('#event-form');
    if (eventForm) eventForm.addEventListener('submit', async submitEvent => {
      submitEvent.preventDefault();
      const form = submitEvent.currentTarget;
      const values = Object.fromEntries(new FormData(form));
      const body = new FormData();
      Object.entries(values).forEach(([key,value]) => body.append(key,value));
      try {
        if (eventId) {
          delete values.poster;
          await api(`events/${eventId}`, { method:'PATCH', body:JSON.stringify(values) });
        } else {
          await api('events', { method:'POST', body });
        }
        toast(eventId ? 'Event updated.' : 'Event created.');
        location.hash = '#/dashboard/events';
      } catch (error) { toast(error.message,true); }
    });
  }

  async function renderParticipantPage(page) {
    const target = document.querySelector('#dashboard-content');
    if (page === 'profile') return renderProfile(target);
    if (page === 'overview' || page === 'registrations') {
      const { items } = await api('registrations');
      if (page === 'overview') {
        const now = new Date();
        const upcoming = items
          .filter(row => row.status === 'registered' && new Date(`${row.event_date}T${row.start_time || '00:00:00'}`) >= now)
          .sort((a, b) => new Date(`${a.event_date}T${a.start_time || '00:00:00'}`) - new Date(`${b.event_date}T${b.start_time || '00:00:00'}`));
        const statusCounts = [['registered','Registered'],['attended','Attended'],['cancelled','Cancelled']]
          .map(([status,label]) => `<div class="participant-status-count"><span class="pill ${status}">${label}</span><strong>${items.filter(row => row.status === status).length}</strong></div>`)
          .join('');
        const eventCards = upcoming.map(row => `
          <article class="participant-event-card">
            <a class="participant-event-cover" href="#/event/${Number(row.event_id)}" aria-label="View ${escapeHtml(row.title)}">
              ${row.poster_path ? `<img src="${escapeHtml(row.poster_path)}" alt="${escapeHtml(row.title)} event cover" loading="lazy">` : '<span class="participant-event-placeholder" aria-hidden="true"></span>'}
              <span class="pill ${escapeHtml(row.status)} participant-event-status">${escapeHtml(row.status)}</span>
            </a>
            <div class="participant-event-content">
              <h3><a href="#/event/${Number(row.event_id)}">${escapeHtml(row.title)}</a></h3>
              <div class="participant-event-facts">
                <div><span>Date</span><strong>${dateLabel(row.event_date)}</strong></div>
                <div><span>Time</span><strong>${timeLabel(row.start_time)}</strong></div>
                <div><span>Venue</span><strong>${escapeHtml([row.venue_name, row.city].filter(Boolean).join(', '))}</strong></div>
              </div>
              <a class="participant-event-link" href="#/event/${Number(row.event_id)}">View event details</a>
            </div>
          </article>`).join('');
        const emptyMessage = items.length
          ? empty('✦','No upcoming events','Your future registered events will appear here.')
          : empty('✦','No registrations yet','Find an event you love and it will appear here once you register.');
        target.innerHTML = `
          <div class="participant-dashboard">
            <div class="eyebrow">Participant dashboard</div>
            <h1>Welcome back, ${escapeHtml(user.name.split(' ')[0])}</h1>
            <p class="participant-welcome-copy">Your event plans and registrations, all in one place.</p>
            <div class="participant-summary-grid">
              <article class="participant-summary-card"><span>Total registrations</span><strong>${items.length}</strong></article>
              <article class="participant-summary-card"><span>Upcoming events</span><strong>${upcoming.length}</strong></article>
            </div>
            <section class="participant-upcoming-section">
              <div class="participant-section-heading"><div><div class="eyebrow">Coming up</div><h2>My Upcoming Events</h2></div><a class="button" href="#/events">Explore More Events</a></div>
              <div class="participant-event-grid">${eventCards || emptyMessage}</div>
            </section>
            <section class="participant-status-section">
              <h2>Registration status</h2>
              <div class="participant-status-list">${statusCounts}</div>
            </section>
          </div>`;
      } else {
        target.innerHTML = `<div class="eyebrow">Your Gatherly</div><h1>My registrations</h1><p>All the events you have saved a spot for.</p><div class="panel"><div class="table-wrap"><table><thead><tr><th>Event</th><th>Date</th><th>Venue</th><th>Reference</th><th>Status</th><th></th></tr></thead><tbody>${items.map(row => `<tr><td><a href="#/event/${Number(row.event_id)}">${escapeHtml(row.title)}</a></td><td>${dateLabel(row.event_date)}</td><td>${escapeHtml(row.venue_name)}, ${escapeHtml(row.city)}</td><td>${escapeHtml(row.reference_code)}</td><td><span class="pill ${escapeHtml(row.status)}">${escapeHtml(row.status)}</span></td><td>${row.status === 'registered' && row.event_date >= new Date().toISOString().slice(0,10) ? `<button class="link-button" data-action="cancel-registration:${Number(row.id)}">Cancel</button>` : ''} ${(row.status === 'attended' || row.event_date < new Date().toISOString().slice(0,10)) && row.status !== 'cancelled' ? `<a class="link-button" href="#/submit-feedback/${Number(row.event_id)}">Leave feedback</a>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">You have not registered for an event yet. <a class="link-button" href="#/events">Explore events</a></td></tr>'}</tbody></table></div></div>`;
      }
    } else if (page === 'events') {
      const items = await loadEvents();
      target.innerHTML = `<div class="eyebrow">Discover</div><h1>Explore events</h1><p>Find a community and save your seat.</p><div class="event-grid">${items.map(eventCard).join('') || empty('✦','No events published yet','Check back soon for upcoming gatherings.')}</div>`;
    } else {
      target.innerHTML = empty('✦','Your Gatherly','Choose a section from the menu to get started.');
    }
  }

  async function renderSpecial(route) {
    const [kind, id] = route.split('/');
    if (!user) { location.hash = '#/login'; return; }
    if (kind === 'submit-feedback' && user.role !== 'participant') {
      toast('Feedback can only be submitted by a participant.');
      location.hash = '#/dashboard';
      return;
    }
    if (['schedule','participants','feedback','edit-event','event-report'].includes(kind) &&
        !['organizer','admin'].includes(user.role)) {
      toast('This page is available to event organizers and administrators.');
      location.hash = '#/dashboard';
      return;
    }
    app.innerHTML = user.role === 'admin'
      ? `<div class="dashboard-layout admin-dashboard-layout">
          <aside class="sidebar admin-sidebar">
            <div class="admin-sidebar-brand"><span class="admin-sidebar-mark">g</span><div><strong>gatherly.</strong><span>Admin workspace</span></div></div>
            <nav class="admin-sidebar-nav" aria-label="Admin navigation">
              <span class="admin-nav-label">Workspace</span>
              ${[['overview','Overview','⌂'],['organizers','Organizer approvals','✓'],['users','Participants','♙'],['registrations','Registrations','✓'],['venues','Venues','⌖'],['events','Events','◇'],['feedback','Feedback','★'],['reports','Reports','▥']].map(([key,label,icon]) => `<a class="${key === 'events' ? 'active' : ''}" href="#/dashboard/${key}"><span class="admin-nav-icon" aria-hidden="true">${icon}</span><span>${label}</span></a>`).join('')}
            </nav>
            <a class="admin-sidebar-profile" href="#/dashboard/profile"><span class="admin-avatar">${escapeHtml(user.name.split(' ').map(part => part[0]).join('').slice(0,2).toUpperCase())}</span><span><strong>${escapeHtml(user.name)}</strong><small>Administrator</small></span></a>
          </aside>
          <section id="dashboard-content" class="dashboard-main"><div class="page-loading"><span class="spinner"></span>Loading…</div></section>
        </div>`
      : `<div class="dashboard-layout"><aside class="sidebar"><h3>Workspace</h3><a href="#/dashboard/events">← Back to events</a></aside><section id="dashboard-content" class="dashboard-main"><div class="page-loading"><span class="spinner"></span>Loading…</div></section></div>`;
    const target = document.querySelector('#dashboard-content');
    if (kind === 'schedule') {
      const { items } = await api(`schedules/${id}`);
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Event operations</div><h1>Manage schedule</h1><p>Create and organize sessions for this event.</p></div><a class="button button-outline" href="#/dashboard/events">Back to events</a></header>
        <div class="management-schedule-grid">
          <section class="panel management-form-panel"><h3 id="schedule-form-title">Add a session</h3><form id="schedule-form"><div class="form-row">${formField('Session title','title')}${formField('Speaker','speaker','text',false)}</div><div class="field"><label for="description">Description</label><textarea id="description" name="description"></textarea></div><div class="form-row">${formField('Starts at','starts_at','datetime-local')}${formField('Ends at','ends_at','datetime-local')}</div>${formField('Location','location','text',false)}<div class="form-actions"><button class="button" id="schedule-submit">Add session</button><button class="button button-outline" id="schedule-cancel-edit" type="button" hidden>Cancel edit</button></div></form></section>
          <section class="panel management-panel"><div class="management-table-heading"><h3>Current sessions</h3><label class="management-search"><span>Search</span><input id="schedule-search" class="input" type="search" placeholder="Search sessions"></label></div><div id="schedule-list">${items.map(item => `<article class="schedule-item" data-search-item><div class="schedule-time">${escapeHtml(item.starts_at)}<small>${escapeHtml(item.location || '')}</small></div><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.description || '')}</p><div class="table-actions"><button class="button button-small button-outline" type="button" data-action="edit-schedule:${Number(id)}:${Number(item.id)}">Edit</button><button class="button button-small button-danger" type="button" data-action="delete-schedule:${Number(id)}:${Number(item.id)}">Delete</button></div></div></article>`).join('') || '<p class="admin-list-empty">No sessions yet.</p>'}</div></section>
        </div>`;
      document.querySelector('#schedule-form').addEventListener('submit', async event => {
        event.preventDefault();
        const payload = Object.fromEntries(new FormData(event.currentTarget));
        try {
          const sessionId = event.currentTarget.dataset.sessionId;
          await api(`schedules/${id}${sessionId ? `/${sessionId}` : ''}`,{method:sessionId ? 'PATCH' : 'POST',body:JSON.stringify(payload)});
          toast(sessionId ? 'Session updated.' : 'Session added.'); renderSpecial(route);
        }
        catch (error) { toast(error.message,true); }
      });
      document.querySelector('#schedule-cancel-edit').addEventListener('click',() => renderSpecial(route));
      document.querySelector('#schedule-search')?.addEventListener('input', event => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll('[data-search-item]').forEach(item => { item.hidden = query !== '' && !item.textContent.toLowerCase().includes(query); });
      });
    } else if (kind === 'participants') {
      const { items } = await api(`registrations?event_id=${encodeURIComponent(id)}`);
      target.innerHTML = `
        <header class="management-header"><div><div class="eyebrow">Attendee management</div><h1>Registered participants</h1><p>Review registrations and record attendance after the event.</p></div><a class="button button-outline" href="#/dashboard/events">Back to events</a></header>
        <section class="management-toolbar"><label class="management-search"><span>Search</span><input id="participant-search" class="input" type="search" placeholder="Search participant or reference"></label></section>
        <section class="panel management-panel"><div class="table-wrap"><table id="participant-table"><thead><tr><th>Name</th><th>Email</th><th>Reference</th><th>Status</th><th>Attendance</th></tr></thead><tbody>${items.map(item => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td>${escapeHtml(item.email)}</td><td><code>${escapeHtml(item.reference_code)}</code></td><td><span class="pill ${escapeHtml(item.status)}">${escapeHtml(item.status)}</span></td><td>${item.status === 'registered' ? `<button class="button button-small" type="button" data-action="attend:${Number(id)}:${Number(item.id)}">Mark attended</button>` : '<span class="muted">—</span>'}</td></tr>`).join('') || '<tr><td colspan="5">No registrations yet.</td></tr>'}</tbody></table></div></section>`;
      setupTableSearch('#participant-search', '#participant-table');
    } else if (kind === 'feedback') {
      const { items } = await api(`feedback/${id}`);
      target.innerHTML = `<header class="management-header"><div><div class="eyebrow">Attendee feedback</div><h1>Event reviews</h1><p>View the feedback submitted for this event.</p></div><a class="button button-outline" href="#/dashboard/events">Back to events</a></header><section class="panel management-panel"><div class="management-table-heading"><h3>Reviews</h3><label class="management-search"><span>Search</span><input id="event-feedback-search" class="input" type="search" placeholder="Search reviews"></label></div><div id="event-feedback-list">${items.map(item => `<article class="review" data-search-item><span class="stars">${'★'.repeat(Number(item.rating))}${'☆'.repeat(5 - Number(item.rating))}</span><p>${escapeHtml(item.review)}</p><small>${escapeHtml(item.participant_name)}</small></article>`).join('') || '<p class="admin-list-empty">No feedback has been submitted yet.</p>'}</div></section>`;
      document.querySelector('#event-feedback-search')?.addEventListener('input', event => {
        const query = event.target.value.trim().toLowerCase();
        document.querySelectorAll('#event-feedback-list [data-search-item]').forEach(item => { item.hidden = query !== '' && !item.textContent.toLowerCase().includes(query); });
      });
    } else if (kind === 'edit-event') {
      return renderEventForm(target,id);
    } else if (kind === 'submit-feedback') {
      target.innerHTML = `<div class="eyebrow">Share your experience</div><h1>Event feedback</h1><div class="panel"><form id="feedback-form"><div class="field"><label for="rating">Rating</label><select class="select" name="rating" id="rating" required><option value="5">★★★★★ — Loved it</option><option value="4">★★★★ — Great</option><option value="3">★★★ — Good</option><option value="2">★★ — Could be better</option><option value="1">★ — Disappointing</option></select></div><div class="field"><label for="review">Your review</label><textarea id="review" name="review" required maxlength="3000"></textarea></div><button class="button">Submit feedback</button></form></div>`;
      document.querySelector('#feedback-form').addEventListener('submit', async event => {
        event.preventDefault();
        try {
          await api(`feedback/${id}`,{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(event.currentTarget)))});
          toast('Thank you for sharing your feedback.'); location.hash = '#/dashboard/registrations';
        } catch (error) { toast(error.message,true); }
      });
    } else if (kind === 'event-report') {
      const report = await api(`events/${id}/report`);
      target.innerHTML = `<div class="eyebrow">Event analytics</div><h1>${escapeHtml(report.event.title)} report</h1><div class="stat-grid"><div class="stat-card"><span>Capacity</span><strong>${Number(report.event.capacity)}</strong></div><div class="stat-card"><span>Feedback average</span><strong>${escapeHtml(report.feedback.average_rating || '—')}</strong></div><div class="stat-card"><span>Reviews</span><strong>${Number(report.feedback.feedback_count)}</strong></div></div><div class="panel"><h3>Registration status</h3><div class="table-wrap"><table><thead><tr><th>Status</th><th>Participants</th></tr></thead><tbody>${report.registrations_by_status.map(item => `<tr><td>${escapeHtml(item.status)}</td><td>${Number(item.total)}</td></tr>`).join('') || '<tr><td colspan="2">No registrations yet.</td></tr>'}</tbody></table></div></div>`;
    }
  }

  document.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    try {
      if (action === 'logout') {
        await api('auth/logout',{method:'POST',body:JSON.stringify({})});
        user = null; updateNav(); toast('You have signed out.'); location.hash = '#/';
      } else if (action.startsWith('register:')) {
        const id = action.split(':')[1];
        const registerButton = event.target.closest('[data-action]');
        if (registerButton) {
          registerButton.disabled = true;
          registerButton.textContent = 'Registering…';
        }
        let result;
        try {
          result = await api(`registrations/${id}`,{method:'POST',body:JSON.stringify({})});
        } catch (error) {
          if (registerButton?.isConnected) {
            registerButton.disabled = false;
            registerButton.textContent = 'Register Now';
          }
          throw error;
        }
        toast(`You're registered! Your reference is ${result.reference}.`);
        await renderEvent(id, result);
      } else if (action.startsWith('approve:') || action.startsWith('reject:')) {
        const [decision,id] = action.split(':');
        await api(`admin/organizers/${id}`,{method:'POST',body:JSON.stringify({decision})});
        toast(`Organizer request ${decision === 'approve' ? 'approved' : 'rejected'}.`); renderDashboard();
      } else if (action.startsWith('toggle-user:')) {
        const [,id,status] = action.split(':');
        await api(`admin/users/${id}`,{method:'PATCH',body:JSON.stringify({status:status === 'active' ? 'suspended' : 'active'})});
        toast('Account status updated.'); renderDashboard();
      } else if (action.startsWith('publish:')) {
        const id = action.split(':')[1];
        await api(`events/${id}/publish`,{method:'POST',body:JSON.stringify({})});
        toast('Event published.'); renderDashboard();
      } else if (action.startsWith('event-status:')) {
        const [,id,status] = action.split(':');
        await api(`events/${id}/status`,{method:'POST',body:JSON.stringify({status})});
        toast(`Event marked ${status}.`); renderDashboard();
      } else if (action.startsWith('cancel-event:')) {
        if (!confirm('Cancel this event? Participants will no longer be able to register.')) return;
        const id = action.split(':')[1];
        await api(`events/${id}`,{method:'DELETE'});
        toast('Event cancelled.'); renderDashboard();
      } else if (action.startsWith('cancel-registration:')) {
        if (!confirm('Cancel your registration?')) return;
        const id = action.split(':')[1];
        await api(`registrations/${id}/cancel`,{method:'POST',body:JSON.stringify({})});
        toast('Registration cancelled.'); renderDashboard();
      } else if (action.startsWith('delete-schedule:')) {
        const [,eventId,sessionId] = action.split(':');
        if (!confirm('Delete this schedule session?')) return;
        await api(`schedules/${eventId}/${sessionId}`,{method:'DELETE'});
        toast('Session deleted.'); renderSpecial(`schedule/${eventId}`);
      } else if (action.startsWith('edit-schedule:')) {
        const [,eventId,sessionId] = action.split(':');
        const { items } = await api(`schedules/${eventId}`);
        const item = items.find(row => Number(row.id) === Number(sessionId));
        if (!item) throw new Error('Schedule session not found.');
        const form = document.querySelector('#schedule-form');
        form.dataset.sessionId = String(item.id);
        ['title','description','speaker','location'].forEach(key => { form.elements[key].value = item[key] || ''; });
        ['starts_at','ends_at'].forEach(key => { form.elements[key].value = item[key].replace(' ','T').slice(0,16); });
        document.querySelector('#schedule-submit').textContent = 'Save session';
        document.querySelector('#schedule-cancel-edit').hidden = false;
        form.scrollIntoView({ behavior:'smooth', block:'start' });
      } else if (action.startsWith('attend:')) {
        const [,eventId,registrationId] = action.split(':');
        await api(`registrations/${registrationId}/attendance`,{method:'PATCH',body:JSON.stringify({event_id:eventId,status:'attended'})});
        toast('Attendance recorded.'); renderSpecial(`participants/${eventId}`);
      } else if (action.startsWith('venue-toggle:')) {
        const [,id,available] = action.split(':');
        const { items } = await api('venues');
        const venue = items.find(item => Number(item.id) === Number(id));
        if (!venue) throw new Error('Venue not found.');
        await api(`venues/${id}`,{method:'PATCH',body:JSON.stringify({...venue,is_available:Number(available) ? 0 : 1})});
        toast('Venue availability updated.'); renderDashboard();
      } else if (action.startsWith('venue-edit:')) {
        const id = action.split(':')[1];
        const { items } = await api('venues');
        const venue = items.find(item => Number(item.id) === Number(id));
        if (!venue) throw new Error('Venue not found.');
        const form = document.querySelector('#venue-form');
        form.dataset.venueId = String(venue.id);
        ['name','city','address','capacity','facilities','description','is_available'].forEach(key => {
          if (form.elements[key]) form.elements[key].value = venue[key] ?? '';
        });
        document.querySelector('#venue-form-title').textContent = 'Edit venue';
        document.querySelector('#venue-submit').textContent = 'Save changes';
        form.scrollIntoView({ behavior:'smooth', block:'start' });
      } else if (action.startsWith('venue-delete:')) {
        if (!confirm('Delete this venue? Venues assigned to events cannot be deleted.')) return;
        const id = action.split(':')[1];
        await api(`venues/${id}`,{method:'DELETE'});
        toast('Venue deleted.'); renderDashboard();
      } else if (action.startsWith('moderate-feedback:')) {
        const [,id,visible] = action.split(':');
        await api(`feedback/${id}/moderate`,{method:'PATCH',body:JSON.stringify({is_visible:Number(visible) ? 0 : 1})});
        toast('Feedback visibility updated.'); renderDashboard();
      } else if (action === 'go-create') {
        location.hash = '#/dashboard/create-event';
      }
    } catch (error) { toast(error.message,true); }
  });

  const render = async () => {
    const route = location.hash.replace(/^#\/?/, '');
    if (!route) return renderHome();
    const [page, param] = route.split(/[/?]/);
    if (page === 'events') return renderEvents();
    if (page === 'event' && param) return renderEvent(param);
    if (page === 'login' || page === 'register') return renderAuth(page);
    if (page === 'dashboard') return renderDashboard();
    if (['schedule','participants','feedback','edit-event','submit-feedback','event-report'].includes(page) && param) return renderSpecial(route);
    if (page === 'create-event') {
      if (!user || !['organizer','admin'].includes(user.role)) { location.hash = '#/login'; return; }
      app.innerHTML = '<div class="dashboard-layout"><section id="dashboard-content" class="dashboard-main"></section></div>';
      return renderEventForm(document.querySelector('#dashboard-content'));
    }
    if (page === 'edit-event' && param) {
      if (!user || !['organizer','admin'].includes(user.role)) { location.hash = '#/login'; return; }
      app.innerHTML = '<div class="dashboard-layout"><section id="dashboard-content" class="dashboard-main"></section></div>';
      return renderEventForm(document.querySelector('#dashboard-content'),param);
    }
    if (page === 'about') return renderAbout();
    if (page === 'contact') return renderContact();
    return renderHome();
  };

  document.querySelector('.menu-toggle').addEventListener('click', event => {
    const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
    event.currentTarget.setAttribute('aria-expanded', String(!expanded));
    nav.classList.toggle('open', !expanded);
  });
  nav.addEventListener('click', event => {
    if (event.target.closest('a')) {
      nav.classList.remove('open');
      document.querySelector('.menu-toggle').setAttribute('aria-expanded','false');
    }
  });
  window.addEventListener('hashchange', () => render().catch(error => {
    app.innerHTML = `<section class="page-body">${empty('!', 'We could not load this page', escapeHtml(error.message))}</section>`;
  }));
  (async () => {
    try {
      const result = await api('auth/me');
      user = result.user;
      updateNav();
    } catch (_) {
      user = null;
    }
    render().catch(error => {
      app.innerHTML = `<section class="page-body">${empty('!', 'We could not load this page', escapeHtml(error.message))}</section>`;
    });
  })();
})();
