(() => {
  const $ = (id) => document.getElementById(id);

  // Equipment the user can pick (bodyweight is always allowed by the server)
  const EQUIPMENT = ['barbell', 'dumbbell', 'cable', 'machine', 'kettlebells', 'bands', 'medicine ball',
    'exercise ball', 'e-z curl bar', 'foam roll', 'other'];

  let plan = null; // the previewed plan, edited in place
  let planName = 'My Plan'; // kept across re-renders

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

  // Same sets and reps rules the server uses (lib/recommend.js GOALS), so a swap keeps the plan consistent
  const GOALS = {
    strength: { compound: [5, 3, 6], isolation: [3, 6, 10], holdSecs: 30 },
    hypertrophy: { compound: [4, 6, 10], isolation: [3, 10, 15], holdSecs: 45 },
    endurance: { compound: [3, 12, 15], isolation: [2, 15, 20], holdSecs: 60 },
  };

  function prescribe(e, fallbackMechanic) {
    const g = GOALS[plan.goal];
    const heavy = (e.mechanic ?? fallbackMechanic) === 'compound' && e.tracking_type !== 'reps_only';
    const [sets, repMin, repMax] = heavy ? g.compound : g.isolation;
    const timed = e.tracking_type === 'duration';
    return {
      sets,
      rep_min: timed ? null : repMin,
      rep_max: timed ? null : repMax,
      duration_secs: timed ? g.holdSecs : null,
    };
  }

  function swap(day, index, alt) {
    const old = day.exercises[index];
    day.exercises[index] = {
      exercise_id: alt.id,
      name: alt.name,
      primary_muscle: alt.primary_muscle,
      equipment: alt.equipment,
      mechanic: alt.mechanic,
      tracking_type: alt.tracking_type,
      ...prescribe(alt, old.mechanic),
    };
    render();
  }

  async function toggleAlternatives(li, day, index, btn) {
    const open = li.querySelector('.alts');
    if (open) { open.remove(); return; }

    const usedIds = plan.days.flatMap((d) => d.exercises.map((x) => x.exercise_id));
    const params = new URLSearchParams({ level: plan.level, exclude: usedIds.join(','), limit: '8' });
    if (plan.equipment) params.set('equipment', plan.equipment.join(','));

    btn.disabled = true;
    try {
      const { alternatives } = await api('GET', `/api/exercises/${day.exercises[index].exercise_id}/alternatives?${params}`);
      const list = el('ul', { className: 'alts' });
      if (!alternatives.length) list.append(el('li', { className: 'meta', textContent: 'No other options for this muscle.' }));
      for (const alt of alternatives) {
        list.append(el('li', {},
          el('div', {},
            el('div', { textContent: alt.name }),
            el('div', { className: 'meta', textContent: meta(alt) })),
          el('button', { type: 'button', className: 'small', textContent: 'Use', onclick: () => swap(day, index, alt) })));
      }
      li.append(list);
    } catch (ex) {
      li.append(el('ul', { className: 'alts' }, el('li', { className: 'msg error', textContent: ex.message })));
    } finally {
      btn.disabled = false;
    }
  }

  function renderExercise(day, e, index) {
    const li = el('li', { className: 'exercise' });
    const swapBtn = el('button', { type: 'button', className: 'small', textContent: 'Swap' });
    swapBtn.onclick = () => toggleAlternatives(li, day, index, swapBtn);
    const removeBtn = el('button', {
      type: 'button',
      className: 'small',
      textContent: 'Remove',
      disabled: day.exercises.length === 1, // every day needs at least one exercise
      onclick: () => { day.exercises.splice(index, 1); render(); },
    });
    li.append(el('div', { className: 'row' },
      el('div', { className: 'info' },
        el('div', { className: 'name', textContent: e.name }),
        el('div', { className: 'meta', textContent: meta(e) })),
      el('span', { className: 'rx', textContent: prescription(e) }),
      el('div', { className: 'actions' }, swapBtn, removeBtn)));
    return li;
  }

  function renderDay(day) {
    return el('section', { className: 'card day' },
      el('h2', {}, day.name, el('small', { textContent: `${day.exercises.length} exercises` })),
      el('ul', { className: 'exercises' }, ...day.exercises.map((e, i) => renderExercise(day, e, i))));
  }

  function renderSave() {
    const nameInput = el('input', {
      type: 'text', maxLength: 100, value: planName, autocomplete: 'off',
      oninput: () => { planName = nameInput.value; },
    });
    const btn = el('button', { type: 'submit', className: 'primary', textContent: 'Save plan' });
    const msg = el('p', { className: 'msg', role: 'status', hidden: true });
    const form = el('form', {},
      el('div', { className: 'save-row' }, el('label', {}, 'Plan name', nameInput), btn),
      el('p', { className: 'hint', textContent: 'Each day is saved as a workout template you can start later.' }),
      msg);

    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      showMsg(msg, '');
      btn.disabled = true;
      try {
        const { plan: saved } = await api('POST', '/api/recommendations/save', { name: nameInput.value.trim(), days: plan.days });
        showMsg(msg, `Saved ${saved.templates.length} workouts: ${saved.templates.map((t) => t.name).join(', ')}.`, true);
      } catch (ex) {
        showMsg(msg, ex.message, false);
      } finally {
        btn.disabled = false;
      }
    });
    return el('section', { className: 'card' }, el('h2', { textContent: 'Save this plan' }), form);
  }

  function render() {
    $('plan').replaceChildren(...(plan ? [...plan.days.map(renderDay), renderSave()] : []));
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
