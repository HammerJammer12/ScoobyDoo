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

  function showUser(user) {
    $('auth-dialog').close();
    $('landing-view').hidden = true;
    $('home-view').hidden = false;
    $('nav').hidden = false;
    $('nav-user').textContent = user.username;
    $('welcome').textContent = `Welcome, ${user.username}`;
  }

  function showLanding() {
    $('home-view').hidden = true;
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
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === next));
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
