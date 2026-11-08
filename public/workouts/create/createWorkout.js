(() => {
  const $ = (id) => document.getElementById(id);
  const FIELDS = {
    weight_and_reps: [
      { key: 'weightKgs', label: 'kg', step: '0.25' },
      { key: 'reps', label: 'reps', step: '1' },
    ],
    reps_only: [{ key: 'reps', label: 'reps', step: '1' }],
    duration: [{ key: 'durationSecs', label: 'seconds', step: '1' }],
    distance: [
      { key: 'distanceMeters', label: 'meters', step: '1' },
      { key: 'durationSecs', label: 'seconds (optional)', step: '1', optional: true },
    ],
  };

  let exercises = []; // TODO connect to exercises api

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

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function renumberSets(sets) {
    [...sets.children].forEach((row, i) => { row.querySelector('.num').textContent = i + 1; });
  }

  function addSetRow(ex) {
    const type = ex.querySelector('select').selectedOptions[0]?.dataset.type;
    const fields = FIELDS[type] || [];
    const setsEl = ex.querySelector('.sets');
    const row = document.createElement('div');
    row.className = 'set-row';

    const num = document.createElement('span');
    num.className = 'num';
    row.appendChild(num);

    for (const f of fields) {
      const input = document.createElement('input');
      input.type = 'number';
      input.inputMode = 'decimal';
      input.min = '0';
      input.step = f.step;
      input.placeholder = f.label;
      input.setAttribute('aria-label', f.label);
      input.dataset.key = f.key;
      if (!f.optional) input.required = true;
      row.appendChild(input);
    }

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'danger';
    del.textContent = '×';
    del.setAttribute('aria-label', 'Remove set');
    del.addEventListener('click', () => {
      if (setsEl.children.length > 1) { row.remove(); renumberSets(setsEl); }
    });
    row.appendChild(del);

    setsEl.appendChild(row);
    renumberSets(setsEl);
  }

  function addExercise() {
    const exEl = document.createElement('div');
    exEl.className = 'card exercise';

    const head = document.createElement('div');
    head.className = 'ex-head';

    const pick = document.createElement('div');
    const lbl = document.createElement('label');
    lbl.textContent = 'Exercise';
    const select = document.createElement('select');
    for (const e of exercises) {
      const opt = document.createElement('option');
      opt.value = e.id;
      opt.textContent = e.name;
      opt.dataset.type = e.tracking_type;
      select.appendChild(opt);
    }
    pick.append(lbl, select);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => exEl.remove());

    head.append(pick, remove);

    const setsEl = document.createElement('div');
    setsEl.className = 'sets';

    const addSet = document.createElement('button');
    addSet.type = 'button';
    addSet.textContent = '+ Add set';
    addSet.addEventListener('click', () => addSetRow(exEl));

    select.addEventListener('change', () => {
      setsEl.innerHTML = '';
      addSetRow(exEl);
    });

    exEl.append(head, setsEl, addSet);
    $('exercises').appendChild(exEl);
    addSetRow(exEl);
  }

  function collect() {
    const out = [];
    for (const exEl of $('exercises').querySelectorAll('.exercise')) {
      const sets = [];
      for (const row of exEl.querySelectorAll('.set-row')) {
        const set = {};
        for (const input of row.querySelectorAll('input')) {
          if (input.value !== '') set[input.dataset.key] = Number(input.value);
        }
        sets.push(set);
      }
      out.push({ exerciseId: Number(exEl.querySelector('select').value), sets });
    }
    return out;
  }

  $('add-exercise').addEventListener('click', addExercise);

  $('workout-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('');
    const form = $('workout-form');
    if (!form.reportValidity()) return;
    if (!$('exercises').children.length) return showError('Add at least one exercise.');

    const btn = $('save');
    btn.disabled = true;
    try {
      await api('POST', '/api/workouts', {
        name: $('w-name').value.trim(),
        startedAt: new Date().toISOString(),
        exercises: collect(),
      });
      $('status').textContent = 'Workout saved.';
      $('status').hidden = false;
      form.reset();
      $('exercises').innerHTML = '';
      addExercise();
    } catch (ex) {
      if (ex.status === 401) { window.location.href = '/'; return; }
      showError(ex.message);
    } finally {
      btn.disabled = false;
    }
  });

  (async () => {
    try {
      ({ exercises } = await api('GET', '/api/exercises'));
      if (!exercises.length) return showError('No exercises in database');
      addExercise();
    } catch (ex) {
      if (ex.status === 401) window.location.href = '/';
      else showError(ex.message);
    }
  })();
})();