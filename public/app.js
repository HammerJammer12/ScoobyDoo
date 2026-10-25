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
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  function showUser(user) {
    $('auth-view').hidden = true;
    $('home-view').hidden = false;
    $('nav').hidden = false;
    $('nav-user').textContent = user.username;
    $('welcome').textContent = `Welcome, ${user.username}`;
  }

  function showAuth() {
    $('home-view').hidden = true;
    $('nav').hidden = true;
    $('auth-view').hidden = false;
  }

  function setMode(next) {
    mode = next;
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === next));
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('auth-submit').textContent = next === 'signup' ? 'Create account' : 'Log in';
    $('auth-error').hidden = true;
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('auth-submit');
    const err = $('auth-error');
    err.hidden = true;
    btn.disabled = true;
    try {
      const payload = { username: $('username').value.trim(), password: $('password').value };
      const { user } = await api('POST', mode === 'signup' ? '/api/signup' : '/api/login', payload);
      $('auth-form').reset();
      showUser(user);
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try { await api('POST', '/api/logout', {}); } finally { showAuth(); setMode('login'); }
  });

  api('GET', '/api/me').then(({ user }) => showUser(user)).catch(showAuth);
})();
