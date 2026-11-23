(() => {
  const $ = (id) => document.getElementById(id);
  const SEPARATOR = ' - '; // plans saved from /plan/ name each day "<plan> - <day>"

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

  // Small helper for building elements without innerHTML
  function el(tag, props = {}, ...children) {
    const node = Object.assign(document.createElement(tag), props);
    node.append(...children.filter((c) => c != null));
    return node;
  }

  function prescription(e) {
    if (e.target_duration) return `${e.target_sets} × ${e.target_duration}s`;
    if (e.target_reps) return `${e.target_sets} × ${e.target_reps}`;
    return e.target_sets ? `${e.target_sets} sets` : '';
  }

  // "Winter Strength - Push" -> plan "Winter Strength", day "Push"; other templates stand alone
  function groupByPlan(templates) {
    const plans = new Map();
    for (const t of templates) {
      const cut = t.name.lastIndexOf(SEPARATOR);
      const plan = cut > 0 ? t.name.slice(0, cut) : t.name;
      const day = cut > 0 ? t.name.slice(cut + SEPARATOR.length) : t.name;
      if (!plans.has(plan)) plans.set(plan, []);
      plans.get(plan).push({ ...t, day });
    }
    return plans;
  }

  function renderDay(t) {
    const start = el('a', {
      className: 'button primary',
      href: `/workouts/create/?template=${encodeURIComponent(t.id)}`,
      textContent: 'Start',
    });

    // Two clicks to delete, so a stray tap doesn't remove a day
    const del = el('button', { type: 'button', textContent: 'Delete' });
    del.addEventListener('click', async () => {
      if (!del.classList.contains('danger')) {
        del.classList.add('danger');
        del.textContent = 'Confirm delete';
        return;
      }
      del.disabled = true;
      try {
        await api('DELETE', `/api/templates/${encodeURIComponent(t.id)}`, {});
        await load();
      } catch (ex) {
        del.disabled = false;
        del.textContent = ex.message;
      }
    });

    return el('div', { className: 'day' },
      el('div', { className: 'day-head' }, el('h3', { textContent: t.day }), start, del),
      el('ul', { className: 'exercises' }, ...t.exercises.map((e) => el('li', {},
        `${e.name} `,
        el('span', { className: 'rx', textContent: prescription(e) }),
        el('div', { className: 'meta', textContent: [e.primary_muscle, e.equipment].filter(Boolean).join(' · ') })))));
  }

  async function load() {
    try {
      const { templates } = await api('GET', '/api/templates');
      const plans = groupByPlan(templates);
      $('status').textContent = templates.length ? '' : 'No saved plans yet.';
      $('status').hidden = Boolean(templates.length);
      $('plans').replaceChildren(...[...plans].map(([name, days]) => el('section', { className: 'card' },
        el('h2', { textContent: name }),
        ...days.map(renderDay))));
    } catch (ex) {
      $('status').textContent = ex.message;
      $('status').className = 'msg error';
      $('status').hidden = false;
    }
  }

  load();
})();
