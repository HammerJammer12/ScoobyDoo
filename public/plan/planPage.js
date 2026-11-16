(() => {
  const $ = (id) => document.getElementById(id);

  // Equipment the user can pick (bodyweight is always allowed by the server)
  const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebells', 'bands', 'medicine ball',
    'exercise ball', 'e-z curl bar', 'foam roll', 'other'];

  let plan = null; // the previewed plan, edited in place

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) window.location.href = '/';
    if (!res.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    return data;
  }

  function showMsg(el, text, ok) {
    el.textContent = text;
    el.className = ok ? 'msg ok' : 'msg error';
    el.hidden = !text;
  }

  // Small helper for building elements without innerHTML
  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function prescription(e) {
    if (e.duration_secs) return `${e.sets} × ${e.duration_secs}s`;
    const reps = e.rep_min === e.rep_max ? e.rep_min : `${e.rep_min}–${e.rep_max}`;
    return `${e.sets} × ${reps}`;
  }

  function meta(e) {
    return [e.primary_muscle, e.equipment].filter(Boolean).join(' · ');
  }

  function renderExercise(e) {
    return el('li', { className: 'exercise' },
      el('div', { className: 'row' },
        el('div', { className: 'info' },
          el('div', { className: 'name', textContent: e.name }),
          el('div', { className: 'meta', textContent: meta(e) })),
        el('span', { className: 'rx', textContent: prescription(e) })));
  }

  function renderDay(day) {
    return el('section', { className: 'card day' },
      el('h2', {}, day.name, el('small', { textContent: `${day.exercises.length} exercises` })),
      el('ul', { className: 'exercises' }, ...day.exercises.map(renderExercise)));
  }

  function render() {
    $('plan').replaceChildren(...(plan ? plan.days.map(renderDay) : []));
  }

  function readPrefs() {
    const equipment = $('full-gym').checked
      ? null
      : [...document.querySelectorAll('#equipment-list input:checked')].map((c) => c.value);
    return {
      goal: $('goal').value,
      daysPerWeek: Number($('days').value),
      minutesPerSession: Number($('minutes').value),
      level: $('level').value,
      equipment,
    };
  }

  $('equipment-list').append(...EQUIPMENT.map((name) => el('label', { className: 'check' },
    el('input', { type: 'checkbox', value: name, checked: name === 'dumbbell' }),
    name[0].toUpperCase() + name.slice(1))));
  $('full-gym').addEventListener('change', () => { $('equipment-list').hidden = $('full-gym').checked; });

  $('prefs-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const form = ev.target;
    const btn = form.querySelector('button[type="submit"]');
    const msg = form.querySelector('.msg');
    showMsg(msg, '');
    btn.disabled = true;
    try {
      ({ plan } = await api('POST', '/api/recommendations/plan', readPrefs()));
      render();
      btn.textContent = 'Regenerate plan';
    } catch (ex) {
      showMsg(msg, ex.message, false);
    } finally {
      btn.disabled = false;
    }
  });

  // Send logged-out visitors to the login page
  api('GET', '/api/me').catch(() => {});
})();
