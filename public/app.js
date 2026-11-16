(() => {
  const $ = (id) => document.getElementById(id);
  let mode = 'login';

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  const workoutView = window.createWorkoutView(api);
  const feedView = window.createFeedView(api);
  const dailyLiftView = window.createWorkoutView(api, { daily: true });
  const plannerView = window.createPlannerView(api);
  const dashboardView = window.createDashboardView(api);
  let currentUser = null;
  let sessionVersion = 0;
  let feedLoaded = false;

  function showView(view, focus = true) {
    if (!currentUser) return;
    document.body.dataset.currentView = view;
    for (const name of ['dashboard', 'planner', 'community', 'profile']) {
      $(`${name}-view`).hidden = name !== view;
    }
    document.querySelectorAll('[data-view]').forEach((button) => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $('create-post-floating').hidden = !['community', 'profile'].includes(view);
    if (view === 'planner') plannerView.load();
    if (view === 'dashboard') dashboardView.load();
    if (view === 'community' && !feedLoaded) {
      feedLoaded = true;
      const activeVersion = sessionVersion;
      feedView.load(currentUser).then((slots) => {
        if (activeVersion === sessionVersion) workoutView.load(slots);
      });
    }
    if (view === 'profile') {
      $('profile-username').textContent = `@${currentUser.username}`;
      const today = new Date();
      $('profile-day').textContent = today.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
      $('profile-day').dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      feedView.renderProfile();
      dailyLiftView.load([$('profile-recommendation')]);
    }
    if (!wideNavigation.matches) setNavigation(false);
    if (focus) $(`${view}-title`).focus();
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });
  const wideNavigation = window.matchMedia('(min-width: 513px)');
  function setNavigation(open) {
    document.body.classList.toggle('nav-open', open);
    for (const id of ['nav-toggle', 'dashboard-menu']) $(id).setAttribute('aria-expanded', String(open));
  }
  for (const id of ['nav-toggle', 'dashboard-menu']) $(id).addEventListener('click', () => setNavigation(!document.body.classList.contains('nav-open')));
  wideNavigation.addEventListener('change', () => setNavigation(wideNavigation.matches));
  $('view-progress').addEventListener('click', () => dashboardView.showProgress());
  $('view-achievements').addEventListener('click', () => {
    showView('dashboard', false);
    $('dashboard-achievements-card').focus();
  });

  function showUser(user) {
    currentUser = user;
    sessionVersion += 1;
    feedLoaded = false;
    $('auth-dialog').close();
    document.body.classList.add('signed-in');
    $('nav-toggle').hidden = false;
    setNavigation(wideNavigation.matches);
    $('landing-view').hidden = true;
    $('nav').hidden = false;
    $('nav-user').textContent = user.username;
    $('welcome').textContent = `Welcome, ${user.username}. Here’s your training at a glance.`;
    feedView.initialize(user);
    showView('dashboard', false);
  }

  function showLanding() {
    currentUser = null;
    document.body.classList.remove('signed-in', 'nav-open');
    $('nav-toggle').hidden = true;
    sessionVersion += 1;
    feedLoaded = false;
    dashboardView.clear();
    plannerView.clear();
    dailyLiftView.clear();
    workoutView.clear();
    feedView.clear();
    for (const name of ['dashboard', 'planner', 'community', 'profile']) $(`${name}-view`).hidden = true;
    $('create-post-floating').hidden = true;
    $('nav').hidden = true;
    $('landing-view').hidden = false;
  }

  function setMode(next) {
    mode = next;
    const signingUp = next === 'signup';
    $('signup-fields').hidden = !signingUp;
    $('confirm-password').required = signingUp;
    $('confirm-password').value = '';
    $('password').value = '';
    $('password').minLength = signingUp ? 8 : 1;
    $('username').pattern = signingUp ? '[A-Za-z0-9_]{3,30}' : '.*';
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t.dataset.mode === next;
      t.classList.toggle('active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('auth-submit').textContent = next === 'signup' ? 'Create account' : 'Log in';
    $('auth-error').hidden = true;
  }

  $('open-auth').addEventListener('click', () => {
    setMode('login');
    $('auth-dialog').showModal();
    $('username').focus();
  });

  $('close-auth').addEventListener('click', () => {
    $('auth-dialog').close();
  });

  $('auth-dialog').addEventListener('close', () => {
    $('auth-form').reset();
    $('auth-error').hidden = true;
  });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('auth-submit');
    const err = $('auth-error');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    document.querySelectorAll('.tab').forEach((tab) => { tab.disabled = true; });
    try {
      const payload = { username: $('username').value.trim(), password: $('password').value };
      if (mode === 'signup') {
        payload.confirmPassword = $('confirm-password').value;
        if (payload.password !== payload.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
      }
      const { user } = await api('POST', mode === 'signup' ? '/api/signup' : '/api/login', payload);
      $('auth-form').reset();
      showUser(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'Create account' : 'Log in';
      document.querySelectorAll('.tab').forEach((tab) => { tab.disabled = false; });
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try {
      await api('POST', '/api/logout', {});
      showLanding();
      setMode('login');
    } catch (error) {
      alert('Could not log out. Please try again.');
    }
  });

  setMode('login');
  api('GET', '/api/me').then(({ user }) => showUser(user)).catch(showLanding);
})();
