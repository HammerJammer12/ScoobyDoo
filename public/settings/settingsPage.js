(() => {
  const $ = (id) => document.getElementById(id);

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

  function showMsg(form, text, ok) {
    const el = form.querySelector('.msg');
    el.textContent = text;
    el.className = ok ? 'msg ok' : 'msg error';
    el.hidden = !text;
  }

  // Wires up one settings form: disables its button while saving and shows the result under it.
  function onSubmit(form, handler) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const btn = form.querySelector('button[type="submit"]');
      showMsg(form, '');
      btn.disabled = true;
      try {
        showMsg(form, await handler(), true);
      } catch (ex) {
        showMsg(form, ex.message, false);
      } finally {
        btn.disabled = false;
      }
    });
  }

  function fill(settings) {
    $('username').value = settings.username;
    const appearance = settings.appearance;
    document.querySelector(`input[name="palette"][value="${appearance.palette}"]`).checked = true;
    $('appearance-mode').value = appearance.mode;
    $('appearance-text-size').value = appearance.textSize;
    window.appAppearance.apply(appearance, true);
    $('appearance-options').disabled = false;
    $('appearance-save').disabled = false;
    showMsg($('appearance-form'), '');
    const since = new Date(settings.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
    $('member-since').textContent = `Member since ${since}.`;
    const value = settings.isPrivate ? 'private' : 'public';
    document.querySelector(`input[name="privacy"][value="${value}"]`).checked = true;
  }

  for (const [key, palette] of Object.entries(window.appAppearance.palettes)) {
    const label = document.createElement('label');
    label.className = 'palette-choice';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'palette'; radio.value = key; radio.required = true;
    const name = document.createElement('span'); name.textContent = `${key.toUpperCase()} · ${palette.name}`;
    const swatches = document.createElement('span'); swatches.className = 'palette-swatches'; swatches.setAttribute('aria-hidden', 'true');
    for (const color of palette.colors) {
      const swatch = document.createElement('span');
      swatch.style.backgroundColor = color;
      swatches.append(swatch);
    }
    label.append(radio, name, swatches);
    $('palette-options').append(label);
  }
  $('appearance-form').addEventListener('change', () => {
    const palette = document.querySelector('input[name="palette"]:checked')?.value;
    window.appAppearance.apply({ palette, mode: $('appearance-mode').value, textSize: $('appearance-text-size').value });
    showMsg($('appearance-form'), 'Preview only. Save to keep this appearance.', true);
  });
  onSubmit($('appearance-form'), async () => {
    const palette = document.querySelector('input[name="palette"]:checked').value;
    const mode = $('appearance-mode').value;
    const textSize = $('appearance-text-size').value;
    $('appearance-options').disabled = true;
    try {
      const { appearance } = await api('PATCH', '/api/settings/appearance', { palette, mode, textSize });
      window.appAppearance.apply(appearance, true);
      return 'Appearance saved.';
    } finally {
      $('appearance-options').disabled = false;
    }
  });

  onSubmit($('username-form'), async () => {
    const { username } = await api('PATCH', '/api/settings/username', { username: $('username').value.trim() });
    $('username').value = username;
    return 'Username saved.';
  });

  onSubmit($('password-form'), async () => {
    const form = $('password-form');
    if ($('new-password').value !== $('confirm-password').value) throw new Error('Passwords do not match.');
    await api('PATCH', '/api/settings/password', {
      currentPassword: $('current-password').value,
      newPassword: $('new-password').value,
      confirmPassword: $('confirm-password').value,
    });
    form.reset();
    return 'Password changed.';
  });

  onSubmit($('privacy-form'), async () => {
    const choice = document.querySelector('input[name="privacy"]:checked');
    if (!choice) throw new Error('Pick an option.');
    await api('PATCH', '/api/settings/privacy', { isPrivate: choice.value === 'private' });
    return 'Privacy saved.';
  });

  onSubmit($('sessions-form'), async () => {
    const { removed } = await api('POST', '/api/settings/logout-others', {});
    return removed === 0 ? 'No other devices were logged in.' : `Logged out ${removed} other device${removed === 1 ? '' : 's'}.`;
  });

  $('open-delete').addEventListener('click', () => {
    $('delete-form').reset();
    showMsg($('delete-form'), '');
    $('delete-dialog').showModal();
  });
  $('cancel-delete').addEventListener('click', () => $('delete-dialog').close());

  onSubmit($('delete-form'), async () => {
    await api('DELETE', '/api/settings/account', { password: $('delete-password').value });
    window.location.href = '/';
    return 'Account deleted.';
  });

  api('GET', '/api/settings')
    .then(fill)
    .catch((ex) => {
      if (ex.status === 401) window.location.href = '/';
      else showMsg($('appearance-form'), `Could not load settings: ${ex.message}. Reload to retry.`, false);
    });
})();
