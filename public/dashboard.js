window.createDashboardView = (api) => {
  const $ = (id) => document.getElementById(id);
  const status = $('dashboard-status');
  const recent = $('dashboard-recent');
  const empty = $('dashboard-recent-empty');
  const retry = $('dashboard-retry');
  const suggestion = window.createWorkoutView(api, { daily: true, prefix: 'dashboard' });
  let version = 0;

  function clear() {
    version += 1;
    suggestion.clear();
    recent.replaceChildren();
    empty.hidden = true;
    retry.hidden = true;
    status.textContent = '';
    $('dashboard-achievements').replaceChildren();
    $('dashboard-achievements-empty').hidden = false;
    $('dashboard-notifications').textContent = 'No notifications to show.';
    $('progress-dialog').close();
    $('workout-history-dialog').close();
    for (const key of ['workout', 'set', 'pr']) $(`dashboard-${key}-count`).textContent = '—';
  }

  function renderRecent(workout, activeVersion) {
    const item = document.createElement('li');
    const heading = document.createElement('h3');
    heading.textContent = workout.name;
    const summary = document.createElement('p');
    summary.className = 'muted';
    summary.textContent = `${workout.exercise_count} exercise${workout.exercise_count === 1 ? '' : 's'} · ${workout.set_count} sets recorded`;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'View details';
    button.setAttribute('aria-expanded', 'false');
    const details = document.createElement('p');
    details.id = `recent-workout-${workout.id}`;
    details.className = 'muted';
    details.hidden = true;
    details.setAttribute('aria-live', 'polite');
    button.setAttribute('aria-controls', details.id);
    let request = 0;
    button.addEventListener('click', async () => {
      const currentRequest = ++request;
      details.hidden = !details.hidden;
      button.setAttribute('aria-expanded', String(!details.hidden));
      button.textContent = details.hidden ? 'View details' : 'Hide details';
      if (details.hidden) return;
      details.textContent = 'Loading workout…';
      try {
        const { workout: selected } = await api('GET', `/api/workouts/${encodeURIComponent(workout.id)}`);
        if (activeVersion !== version || request !== currentRequest) return;
        details.textContent = `Primary muscle: ${selected.primary_muscle}. Also active: ${selected.secondary_muscles.join(', ') || 'Not specified'}.`;
      } catch (error) {
        if (activeVersion === version && request === currentRequest) details.textContent = `Could not load details: ${error.message}`;
      }
    });
    item.append(heading, summary, button, details);
    return item;
  }

  async function load() {
    clear();
    const activeVersion = version;
    const today = new Date();
    $('dashboard-date').textContent = today.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    $('dashboard-date').dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    suggestion.load([$('dashboard-suggestion')]);
    status.textContent = 'Loading your dashboard…';
    try {
      const { summary, recentWorkouts, recentAchievements } = await api('GET', '/api/dashboard');
      if (activeVersion !== version) return;
      $('dashboard-workout-count').textContent = summary.saved_workouts;
      $('dashboard-set-count').textContent = summary.logged_sets;
      $('dashboard-pr-count').textContent = summary.personal_records;
      recent.replaceChildren(...recentWorkouts.map(workout => renderRecent(workout, activeVersion)));
      empty.hidden = recentWorkouts.length > 0;
      const records = recentAchievements || [];
      $('dashboard-achievements-empty').hidden = records.length > 0;
      for (const record of records) {
        const item = document.createElement('li');
        const badge = document.createElement('span');
        badge.className = 'pr-badge';
        badge.textContent = 'PR';
        const text = document.createElement('span');
        const units = record.record_type === 'max_reps' ? 'reps' : record.record_type === 'max_set_volume' ? 'kg total' : 'kg';
        text.textContent = `${record.exercise_name}: ${record.value} ${units}`;
        item.append(badge, text);
        $('dashboard-achievements').appendChild(item);
      }
      if (records.length) $('dashboard-notifications').textContent = `Latest personal record: ${records[0].exercise_name}`;
      status.textContent = '';
    } catch (error) {
      if (activeVersion !== version) return;
      status.textContent = `Could not load your dashboard: ${error.message}`;
      retry.hidden = false;
    }
  }
  function showProgress() {
    $('progress-dialog').showModal();
  }
  $('dashboard-check-progress').addEventListener('click', showProgress);
  $('close-progress').addEventListener('click', () => $('progress-dialog').close());
  $('close-workout-history').addEventListener('click', () => $('workout-history-dialog').close());
  $('dashboard-view-all').addEventListener('click', async () => {
    const activeVersion = version;
    const history = $('workout-history-list');
    const historyStatus = $('workout-history-status');
    history.replaceChildren();
    historyStatus.textContent = 'Loading saved workouts…';
    $('workout-history-dialog').showModal();
    try {
      const { workouts } = await api('GET', '/api/workouts');
      if (activeVersion !== version) return;
      for (const workout of [...workouts].reverse()) {
        const item = document.createElement('li');
        item.textContent = `${workout.name} · ${workout.primary_muscle}`;
        history.appendChild(item);
      }
      historyStatus.textContent = workouts.length ? 'Shown in save order.' : 'No saved workouts yet.';
    } catch (error) {
      if (activeVersion === version) historyStatus.textContent = `Could not load workouts: ${error.message}`;
    }
  });
  retry.addEventListener('click', load);
  return { load, clear, showProgress };
};
