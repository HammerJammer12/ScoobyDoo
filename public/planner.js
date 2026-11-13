window.createPlannerView = (api) => {
  const $ = id => document.getElementById(id);
  const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const parseDate = text => new Date(`${text}T12:00:00`);
  let plan, workouts = [], dirty = false, version = 0, loaded = false, saving = false;
  const colors = workout => {
    const muscle = `${workout?.primary_muscle || ''} ${workout?.name || ''}`.toLowerCase();
    if (/bicep|tricep|curl|arm/.test(muscle)) return 'arms';
    if (/quad|glute|hamstring|calf|leg|squat/.test(muscle) && !/deadlift/.test(muscle)) return 'legs';
    if (/back|lat|deadlift|row/.test(muscle)) return 'back';
    return /chest|pectoral|bench/.test(muscle) ? 'chest' : 'other';
  };
  function changed() { dirty = true; $('planner-dirty').textContent = 'Unsaved changes'; }
  function dayDate(index) { const date = parseDate(plan.startDate); date.setDate(date.getDate() + index); return date; }
  function reset(type = 'weekly', date = new Date()) {
    if (type === 'monthly') date.setDate(1);
    else date.setDate(date.getDate() - (date.getDay() + 6) % 7);
    const length = type === 'weekly' ? 7 : new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    plan = { name: '', type, startDate: dateString(date), days: Array.from({ length }, () => []) };
    dirty = false;
    render();
  }
  function render() {
    if (!plan) return;
    $('planner-name').value = plan.name;
    $('planner-type').value = plan.type;
    $('planner-date').value = plan.startDate;
    $('planner-dirty').textContent = dirty ? 'Unsaved changes' : plan.id ? 'Saved plan' : 'New plan';
    const monthly = plan.type === 'monthly';
    $('planner-period').textContent = monthly ? dayDate(0).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : `${dayDate(0).toLocaleDateString(undefined, {month:'short', day:'numeric'})} – ${dayDate(6).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'})}`;
    const calendar = $('planner-calendar');
    calendar.className = monthly ? 'planner-calendar monthly' : 'planner-calendar weekly';
    calendar.replaceChildren();
    $('planner-day').replaceChildren();
    if (monthly) {
      for (const text of ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']) {
        const label = document.createElement('div'); label.className = 'calendar-weekday'; label.textContent = text; calendar.append(label);
      }
      for (let i = 0; i < (dayDate(0).getDay() + 6) % 7; i++) {
        const blank = document.createElement('div'); blank.className = 'calendar-blank'; blank.setAttribute('aria-hidden', 'true'); calendar.append(blank);
      }
    }
    plan.days.forEach((ids, index) => {
      const date = dayDate(index);
      const label = date.toLocaleDateString(undefined, { weekday:'long', month:'short', day:'numeric' });
      const option = document.createElement('option'); option.value = index; option.textContent = label; $('planner-day').append(option);
      const cell = document.createElement('section'); cell.className = 'planner-day'; cell.setAttribute('aria-label', label);
      if (dateString(date) === dateString(new Date())) cell.classList.add('is-today');
      const heading = document.createElement('h3'); heading.textContent = monthly ? date.getDate() : date.toLocaleDateString(undefined, {weekday:'short', day:'numeric'});
      const list = document.createElement('ul');
      ids.forEach((id, position) => {
        const workout = workouts.find(w => String(w.id) === String(id));
        const item = document.createElement('li'); item.className = `plan-${colors(workout)}`;
        const dot = document.createElement('span'); dot.textContent = '●'; dot.setAttribute('aria-hidden','true');
        const name = document.createElement('span'); name.textContent = workout?.name || 'Workout unavailable';
        const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${name.textContent} from ${label}`);
        remove.addEventListener('click', () => { if (saving) return; plan.days[index].splice(position,1); changed(); render(); });
        item.append(dot, name, remove); list.append(item);
      });
      const add = document.createElement('button'); add.type = 'button'; add.className = 'planner-day-add'; add.textContent = '+'; add.setAttribute('aria-label', `Add workout to ${label}`); add.addEventListener('click', () => openAdd(index));
      cell.append(heading, list, add); calendar.append(cell);
    });
    if (monthly) {
      const occupied = (dayDate(0).getDay() + 6) % 7 + plan.days.length;
      for (let i = occupied; i % 7; i++) {
        const blank = document.createElement('div'); blank.className = 'calendar-blank'; blank.setAttribute('aria-hidden', 'true'); calendar.append(blank);
      }
    }
  }
  function openAdd(index = 0) {
    $('planner-day').value = index;
    $('planner-add-error').textContent = workouts.length ? '' : 'No saved workouts yet. Save a workout before adding it to a plan.';
    $('planner-add-submit').disabled = !workouts.length || saving;
    $('planner-add-dialog').showModal();
  }
  function clear() {
    version++; loaded = false; workouts = []; plan = null; dirty = false;
    $('planner-calendar').replaceChildren(); $('planner-saved-list').replaceChildren();
    $('planner-add-dialog').close(); $('planner-load-dialog').close(); $('planner-discard-dialog').close();
  }
  async function load() {
    if (loaded) return;
    reset();
    const active = ++version;
    $('planner-status').textContent = 'Loading your saved workouts…';
    try {
      const result = await api('GET','/api/workouts');
      if (active !== version) return;
      workouts = result.workouts; loaded = true;
      $('planner-workout').replaceChildren(...workouts.map(w => { const option = document.createElement('option'); option.value = w.id; option.textContent = w.name; return option; }));
      $('planner-status').textContent = workouts.length ? 'Add saved workouts to any day. Empty days are rest days.' : 'No saved workouts yet. You can still save an empty plan.';
      render();
    } catch (error) { if (active === version) $('planner-status').textContent = `Could not load workouts: ${error.message}. Reopen Planner to retry.`; }
  }
  async function canReplace() {
    if (saving) return false;
    if (!dirty) return true;
    const active = version;
    return new Promise(resolve => {
      const dialog = $('planner-discard-dialog');
      dialog.returnValue = '';
      dialog.addEventListener('close', () => resolve(dialog.returnValue === 'discard' && active === version), { once:true });
      dialog.showModal();
    });
  }
  $('planner-keep').addEventListener('click', () => $('planner-discard-dialog').close('keep'));
  $('planner-discard').addEventListener('click', () => $('planner-discard-dialog').close('discard'));
  $('planner-add').addEventListener('click', () => openAdd());
  $('planner-add-close').addEventListener('click', () => $('planner-add-dialog').close());
  $('planner-add-form').addEventListener('submit', event => {
    event.preventDefault(); if (saving) return;
    const day = plan.days[Number($('planner-day').value)];
    if (day.length >= 10) { $('planner-add-error').textContent = 'You can add up to 10 workouts per day.'; return; }
    if (!workouts.some(w => String(w.id) === $('planner-workout').value)) return;
    day.push($('planner-workout').value); changed(); render(); $('planner-add-dialog').close();
  });
  $('planner-name').addEventListener('input', () => { plan.name = $('planner-name').value; changed(); });
  $('planner-new').addEventListener('click', async () => { if (await canReplace()) { reset(plan.type); $('planner-status').textContent = 'New empty plan.'; } });
  for (const id of ['planner-type', 'planner-date']) $(id).addEventListener('change', async () => {
    const type = $('planner-type').value, date = parseDate($('planner-date').value);
    if (!Number.isFinite(date.getTime()) || !(await canReplace())) { render(); return; }
    reset(type, date); changed(); $('planner-status').textContent = 'New plan. Weekly plans start Monday; monthly plans start on day 1.';
  });
  $('planner-save').addEventListener('click', async () => {
    if (saving) return;
    if (!plan.name.trim()) { $('planner-status').textContent = 'Enter a plan name before saving.'; $('planner-name').focus(); return; }
    const active = version, payload = JSON.parse(JSON.stringify(plan)); saving = true;
    $('planner-save').disabled = true;
    try {
      const { id } = await api(payload.id ? 'PUT' : 'POST', `/api/plans${payload.id ? `/${payload.id}` : ''}`, payload);
      if (active !== version) return;
      plan.id = id;
      // An edit made while the request was in flight still needs saving.
      dirty = JSON.stringify({...plan, id: undefined}) !== JSON.stringify({...payload, id: undefined});
      render(); $('planner-status').textContent = dirty ? 'Previous version saved. Save again to keep your latest edits.' : 'Plan saved.';
    } catch (error) { if (active === version) $('planner-status').textContent = `Could not save plan: ${error.message}`; }
    finally { saving = false; $('planner-save').disabled = false; }
  });
  $('planner-load-close').addEventListener('click', () => $('planner-load-dialog').close());
  $('planner-load').addEventListener('click', async () => {
    const active = version;
    $('planner-load-dialog').showModal(); $('planner-load-status').textContent = 'Loading saved plans…'; $('planner-saved-list').replaceChildren();
    try {
      const { plans } = await api('GET','/api/plans'); if (active !== version) return;
      $('planner-load-status').textContent = plans.length ? 'Choose a plan to reopen.' : 'No saved plans yet.';
      for (const saved of plans) {
        const item = document.createElement('li'); const button = document.createElement('button'); button.type = 'button'; button.textContent = `${saved.name} · ${saved.type} · ${saved.startDate}`;
        button.addEventListener('click', async () => {
          if (!(await canReplace())) return;
          button.disabled = true;
          try {
            const result = await api('GET', `/api/plans/${saved.id}`); if (active !== version) return;
            plan = result.plan; dirty = false; render(); $('planner-load-dialog').close(); $('planner-status').textContent = 'Saved plan loaded.';
          } catch (error) { if (active === version) $('planner-load-status').textContent = error.message; }
          finally { button.disabled = false; }
        }); item.append(button);
        if (saved.type === 'weekly' && plan.type === 'monthly') {
          const repeat = document.createElement('button'); repeat.type = 'button'; repeat.textContent = 'Repeat week in this month';
          repeat.addEventListener('click', async () => {
            if (!(await canReplace())) return;
            repeat.disabled = true;
            try {
              const { plan: weekly } = await api('GET', `/api/plans/${saved.id}`); if (active !== version) return;
              plan = { name: `${weekly.name} · month`.slice(0,80), type:'monthly', startDate:plan.startDate,
                days:plan.days.map((_, index) => [...weekly.days[(dayDate(index).getDay() + 6) % 7]]) };
              changed(); render(); $('planner-load-dialog').close(); $('planner-status').textContent = 'Weekly pattern repeated across this month. Save to keep the new monthly plan.';
            } catch (error) { if (active === version) $('planner-load-status').textContent = error.message; }
            finally { repeat.disabled = false; }
          });
          item.append(repeat);
        }
        $('planner-saved-list').append(item);
      }
    } catch (error) { if (active === version) $('planner-load-status').textContent = error.message; }
  });
  return { load, clear };
};
