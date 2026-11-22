// Goals & achievements page.
//
// Data sources:
//  - Personal records and totals come from GET /api/dashboard (the same call dashboard.js makes).
//    If that endpoint caps `recentAchievements`, swap load()'s fetch for a dedicated "all records" call.
//  - Goals are stored in localStorage per username for now (there is no goals API yet).
//
// Things to confirm against your backend are in the CONFIG block below.

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
// Exercise catalog, the same endpoint the workout logger uses: { exercises: [{ id, name, tracking_type }] }.
const EXERCISE_API = '/api/exercises?limit=100';

// Endpoint returning every set the user has logged, so goals update themselves:
//   { sets: [{ exercise_id, exercise_name, weight_kgs, reps, duration_secs, distance_meters, created_at }] }
// (camelCase keys such as weightKgs are accepted too.) Leave null until that endpoint exists; goals then only
// move when the user taps "Log result".
const SETS_API = '/api/workouts/sets';

// Which goal metrics make sense for each tracking_type the workout logger uses.
const TRACKING_METRICS = {
  weight_and_reps: ['weight', 'reps', 'volume'],
  reps_only: ['reps'],
  duration: ['duration'],
  distance: ['distance', 'time', 'pace', 'speed'],
};

// ---------------------------------------------------------------------------
// Pure helpers (no DOM), kept on window.GoalMath so they can be tested on their own.
// Base units: weight kg, distance metres, duration seconds, pace seconds per metre, speed metres per second.
// ---------------------------------------------------------------------------
window.GoalMath = (() => {
  const DIST = { m: 1, km: 1000, mi: 1609.344 };
  const KG_PER_LB = 0.45359237;

  // better: which direction is an improvement. qualifier: optional extra that makes a result comparable.
  const METRICS = {
    weight: { label: 'Weight', kind: 'weight', better: 'higher', qualifier: 'reps', qualifierLabel: 'For at least this many reps (optional)' },
    reps: { label: 'Reps', kind: 'count', better: 'higher', qualifier: 'weight', qualifierLabel: 'At this weight (optional)' },
    volume: { label: 'Set volume', kind: 'weight', better: 'higher' },
    distance: { label: 'Distance', kind: 'distance', better: 'higher' },
    duration: { label: 'Duration / hold', kind: 'duration', better: 'higher' },
    time: { label: 'Time', kind: 'duration', better: 'lower', qualifier: 'distance', qualifierRequired: true, qualifierLabel: 'Over this distance' },
    pace: { label: 'Pace', kind: 'pace', better: 'lower', qualifier: 'distance', qualifierLabel: 'Over this distance (optional)' },
    speed: { label: 'Speed', kind: 'speed', better: 'higher', qualifier: 'distance', qualifierLabel: 'Over this distance (optional)' },
  };

  function fmtNumber(n) {
    return String(Number(n.toFixed(2)));
  }

  // "1:05:00", "25:30" or a plain number of seconds. Returns NaN for anything else.
  function parseDuration(text) {
    const parts = String(text).trim().split(':');
    if (parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p.trim()))) return NaN;
    return parts.reduce((total, p) => total * 60 + Number(p), 0);
  }

  function formatDuration(total) {
    const s = Math.round(total);
    const pad = (n) => String(n).padStart(2, '0');
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
  }

  // opts: { distUnit: 'm'|'km'|'mi', weightUnit: 'kg'|'lb' }
  function parseKind(kind, raw, opts) {
    const text = String(raw).trim();
    const n = Number(text);
    const unit = opts.distUnit || 'km';
    const positive = text !== '' && Number.isFinite(n) && n > 0;
    switch (kind) {
      case 'weight': return positive ? (opts.weightUnit === 'lb' ? n * KG_PER_LB : n) : NaN;
      case 'count': return positive && Number.isInteger(n) ? n : NaN;
      case 'distance': return positive ? n * DIST[unit] : NaN;
      case 'duration': { const d = parseDuration(text); return d > 0 ? d : NaN; }
      case 'pace': { const d = parseDuration(text); return d > 0 ? d / DIST[unit] : NaN; }
      case 'speed': return positive ? (unit === 'm' ? n : (n * DIST[unit]) / 3600) : NaN;
      default: return NaN;
    }
  }

  // opts also takes formatWeight(kg) so the page can reuse Units.formatWeight.
  function formatKind(kind, value, opts) {
    const unit = opts.distUnit || 'km';
    switch (kind) {
      case 'weight': return opts.formatWeight ? opts.formatWeight(value) : `${fmtNumber(value)} kg`;
      case 'count': return `${value} reps`;
      case 'distance': return `${fmtNumber(value / DIST[unit])} ${unit}`;
      case 'duration': return formatDuration(value);
      case 'pace': return `${formatDuration(value * DIST[unit])} /${unit}`;
      case 'speed': return unit === 'm' ? `${fmtNumber(value)} m/s` : `${fmtNumber((value * 3600) / DIST[unit])} ${unit === 'mi' ? 'mph' : 'km/h'}`;
      default: return String(value);
    }
  }

  // Fraction of the way from the starting result to the target, 0..1.
  // With no starting result it falls back to a ratio (current/target, or target/current when lower is better).
  function progress(metric, current, start, target) {
    if (current == null) return 0;
    const higher = METRICS[metric].better === 'higher';
    if (higher ? current >= target : current <= target) return 1;
    let pct;
    if (start != null && start !== target) pct = (current - start) / (target - start);
    else pct = higher ? current / target : target / current;
    return Math.max(0, Math.min(1, pct));
  }

  const better = (metric, a, b) => (METRICS[metric].better === 'higher' ? a > b : a < b);

  // Accepts the logger's camelCase keys or snake_case columns and returns one consistent shape.
  function normalizeSet(raw) {
    const num = (...keys) => {
      for (const key of keys) if (raw[key] != null && raw[key] !== '') return Number(raw[key]);
      return null;
    };
    return {
      exerciseId: num('exercise_id', 'exerciseId'),
      exerciseName: raw.exercise_name ?? raw.exerciseName ?? null,
      weightKg: num('weight_kgs', 'weightKgs', 'weight_kg'),
      reps: num('reps'),
      durationSecs: num('duration_secs', 'durationSecs'),
      distanceMeters: num('distance_meters', 'distanceMeters'),
    };
  }

  function sameExercise(goal, set) {
    if (goal.exerciseId != null && set.exerciseId != null) return goal.exerciseId === set.exerciseId;
    return Boolean(set.exerciseName) && String(set.exerciseName).trim().toLowerCase() === String(goal.exercise).trim().toLowerCase();
  }

  // Best result for an exercise goal across all logged sets (null when none count).
  // Conditions: weight goals can need N+ reps, rep goals can need a minimum weight, and time goals count sets run
  // within -2%/+5% of the goal distance, scaled to exactly that distance at the same average pace.
  function bestFromSets(goal, sets) {
    const q = goal.qualifier || {};
    const nearGoalDistance = (d) => d >= q.distance * 0.98 && d <= q.distance * 1.05;
    const values = [];
    for (const s of sets) {
      if (!sameExercise(goal, s)) continue;
      let v = null;
      switch (goal.metric) {
        case 'weight': if (s.weightKg > 0 && (!q.reps || s.reps >= q.reps)) v = s.weightKg; break;
        case 'reps': if (s.reps > 0 && (!q.weight || s.weightKg >= q.weight - 0.01)) v = s.reps; break;
        case 'volume': if (s.weightKg > 0 && s.reps > 0) v = s.weightKg * s.reps; break;
        case 'duration': if (s.durationSecs > 0) v = s.durationSecs; break;
        case 'distance': if (s.distanceMeters > 0) v = s.distanceMeters; break;
        case 'time':
          if (q.distance && s.distanceMeters > 0 && s.durationSecs > 0 && nearGoalDistance(s.distanceMeters)) v = s.durationSecs * (q.distance / s.distanceMeters);
          break;
        case 'pace':
          if (s.distanceMeters > 0 && s.durationSecs > 0 && (!q.distance || nearGoalDistance(s.distanceMeters))) v = s.durationSecs / s.distanceMeters;
          break;
        case 'speed':
          if (s.distanceMeters > 0 && s.durationSecs > 0 && (!q.distance || nearGoalDistance(s.distanceMeters))) v = s.distanceMeters / s.durationSecs;
          break;
        default: break;
      }
      if (v !== null && Number.isFinite(v)) values.push(v);
    }
    return values.length ? values.reduce((best, v) => (better(goal.metric, v, best) ? v : best)) : null;
  }

  return { DIST, METRICS, parseDuration, formatDuration, parseKind, formatKind, progress, better, fmtNumber, normalizeSet, bestFromSets };
})();

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
window.createAchievementsView = (api, getUser) => {
  const $ = (id) => document.getElementById(id);
  const { METRICS, parseKind, formatKind, progress, better, normalizeSet, bestFromSets } = window.GoalMath;
  let version = 0;
  let data = { summary: null, records: [], unit: 'kg', sets: null };
  let catalog = [];
  let goals = [];
  let loggingId = null;

  const COUNT_GOALS = {
    workouts: { key: 'saved_workouts', noun: 'workouts', label: 'Save more workouts' },
    sets: { key: 'logged_sets', noun: 'sets', label: 'Log more sets' },
    prs: { key: 'personal_records', noun: 'PRs', label: 'Set more personal records' },
  };

  // ---------- storage ----------
  function storageKey() {
    const user = getUser();
    return user ? `workout-goals:${user.username}` : null;
  }
  function migrate(goal) {
    // Goals saved by the first version of this page used type 'lift' with a record type.
    if (goal.type !== 'lift') return goal;
    const metric = goal.recordType === 'max_reps' ? 'reps' : goal.recordType === 'max_set_volume' ? 'volume' : 'weight';
    return { id: goal.id, type: 'exercise', exercise: goal.exercise, metric, unit: 'km', target: goal.target, qualifier: null, start: null, manual: null, log: [], deadline: goal.deadline, createdAt: goal.createdAt, completedAt: goal.completedAt };
  }
  function readGoals() {
    try {
      const key = storageKey();
      const parsed = key ? JSON.parse(localStorage.getItem(key) || '[]') : [];
      return Array.isArray(parsed) ? parsed.map(migrate) : [];
    } catch (error) {
      return [];
    }
  }
  function saveGoals() {
    try {
      const key = storageKey();
      if (key) localStorage.setItem(key, JSON.stringify(goals));
      return true;
    } catch (error) {
      $('goals-page-status').textContent = 'Could not save goals in this browser.';
      return false;
    }
  }

  // ---------- formatting helpers ----------
  const weightOpts = () => ({ weightUnit: data.unit, formatWeight: (kg) => Units.formatWeight(kg, data.unit) });
  const fmt = (kind, value, distUnit) => formatKind(kind, value, { ...weightOpts(), distUnit });
  const parse = (kind, raw, distUnit) => parseKind(kind, raw, { ...weightOpts(), distUnit });

  function typeLabel(type) {
    if (type === 'max_reps') return 'Max reps';
    if (type === 'max_set_volume') return 'Max set volume';
    const text = String(type || 'record').replace(/_/g, ' ');
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  // Same rules as the dashboard: reps are a count, everything else is kg shown in the user's unit.
  function formatRecord(type, value) {
    if (type === 'max_reps') return `${value} reps`;
    return Units.formatWeight(value, data.unit) + (type === 'max_set_volume' ? ' total' : '');
  }

  // ---------- goal maths ----------
  // Best known result for an exercise goal: the better of what your logged sets show (when the sets endpoint is
  // configured) and anything logged by hand on the goal.
  function currentFor(goal) {
    const candidates = [];
    if (goal.manual != null) candidates.push(goal.manual);
    if (data.sets) {
      const fromSets = bestFromSets(goal, data.sets);
      if (fromSets !== null) candidates.push(fromSets);
    }
    if (!candidates.length) return null;
    return candidates.reduce((best, v) => (better(goal.metric, v, best) ? v : best));
  }

  function qualifierText(goal) {
    const q = goal.qualifier;
    if (!q) return '';
    if (q.distance) return ` over ${fmt('distance', q.distance, goal.unit)}`;
    if (q.reps) return ` for ${q.reps}+ reps`;
    if (q.weight) return ` at ${fmt('weight', q.weight)}`;
    return '';
  }

  function goalTexts(goal) {
    if (goal.type === 'exercise') {
      const m = METRICS[goal.metric];
      const verb = m.better === 'higher' ? 'at least' : 'under';
      return { title: goal.exercise, sub: `${m.label} ${verb} ${fmt(m.kind, goal.target, goal.unit)}${qualifierText(goal)}` };
    }
    const spec = COUNT_GOALS[goal.type];
    return { title: spec.label, sub: `${goal.target - goal.baseline} more` };
  }

  function evaluate(goal) {
    let pct;
    let label;
    if (goal.type === 'exercise') {
      const m = METRICS[goal.metric];
      const current = currentFor(goal);
      pct = progress(goal.metric, current, goal.start, goal.target);
      label = current === null ? 'No result yet. Log one when you have it.' : `Best so far ${fmt(m.kind, current, goal.unit)}`;
    } else {
      const spec = COUNT_GOALS[goal.type];
      const now = Number(data.summary?.[spec.key] || 0);
      const needed = goal.target - goal.baseline;
      const done = Math.max(0, now - goal.baseline);
      pct = needed > 0 ? Math.min(1, done / needed) : 0;
      label = `${Math.min(done, needed)} of ${needed} ${spec.noun}`;
    }
    let status = 'active';
    let statusText = 'In progress';
    if (pct >= 1 || goal.completedAt) {
      status = 'done';
      statusText = 'Completed';
    } else if (goal.deadline) {
      const end = new Date(`${goal.deadline}T23:59:59`).getTime();
      const startTime = goal.createdAt || Date.now();
      const now = Date.now();
      if (now > end) {
        status = 'overdue';
        statusText = 'Past deadline';
      } else if (end > startTime) {
        const elapsed = (now - startTime) / (end - startTime);
        if (elapsed > pct + 0.15) {
          status = 'behind';
          statusText = 'Behind pace';
        } else {
          status = 'on-track';
          statusText = 'On track';
        }
      }
    }
    return { pct, label, status, statusText };
  }

  // ---------- rendering ----------
  function renderTotals() {
    const summary = data.summary || {};
    $('achievements-workouts').textContent = summary.saved_workouts ?? '—';
    $('achievements-sets').textContent = summary.logged_sets ?? '—';
    $('achievements-prs').textContent = summary.personal_records ?? '—';
  }

  function renderGoals() {
    const list = $('goals-list');
    list.replaceChildren();
    $('goals-empty').hidden = goals.length > 0;
    let changed = false;
    const rendered = goals.map((goal) => {
      const result = evaluate(goal);
      if (result.status === 'done' && !goal.completedAt) {
        goal.completedAt = Date.now();
        changed = true;
      }
      return { goal, result };
    });
    if (changed) saveGoals();
    rendered.sort((a, b) => (a.result.status === 'done') - (b.result.status === 'done'));
    for (const { goal, result } of rendered) {
      const texts = goalTexts(goal);
      const item = document.createElement('li');
      item.className = `goal-item goal-${result.status}`;
      const heading = document.createElement('h3');
      heading.textContent = texts.title;
      const badge = document.createElement('span');
      badge.className = 'goal-status';
      badge.textContent = result.statusText;
      const top = document.createElement('div');
      top.className = 'goal-top';
      top.append(heading, badge);
      const sub = document.createElement('p');
      sub.className = 'goal-sub';
      sub.textContent = texts.sub;
      const bar = document.createElement('progress');
      bar.max = 100;
      bar.value = Math.round(result.pct * 100);
      bar.setAttribute('aria-label', `${texts.title}: ${texts.sub}, progress`);
      const detail = document.createElement('p');
      detail.className = 'muted';
      const due = goal.deadline ? ` · Due ${new Date(`${goal.deadline}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : '';
      detail.textContent = `${result.label} (${Math.round(result.pct * 100)}%)${due}`;
      const actions = document.createElement('div');
      actions.className = 'goal-actions';
      if (goal.type === 'exercise') {
        const log = document.createElement('button');
        log.type = 'button';
        log.textContent = 'Log result';
        log.setAttribute('aria-label', `Log a result for ${texts.title}`);
        log.addEventListener('click', () => openLogDialog(goal));
        actions.appendChild(log);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'link-btn';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete goal: ${texts.title}, ${texts.sub}`);
      remove.addEventListener('click', () => {
        goals = goals.filter((g) => g.id !== goal.id);
        saveGoals();
        renderGoals();
        $('goals-page-status').textContent = 'Goal deleted.';
      });
      actions.appendChild(remove);
      item.append(top, sub, bar, detail, actions);
      list.appendChild(item);
    }
  }

  function renderRecords() {
    const board = $('records-board');
    board.replaceChildren();
    const query = $('records-search').value.trim().toLowerCase();
    const byExercise = new Map();
    for (const record of data.records) {
      if (query && !String(record.exercise_name).toLowerCase().includes(query)) continue;
      if (!byExercise.has(record.exercise_name)) byExercise.set(record.exercise_name, new Map());
      const types = byExercise.get(record.exercise_name);
      const existing = types.get(record.record_type);
      if (!existing || Number(record.value) > Number(existing.value)) types.set(record.record_type, record);
    }
    $('records-empty').hidden = data.records.length > 0;
    $('records-none').hidden = !(data.records.length > 0 && byExercise.size === 0);
    for (const [exercise, types] of byExercise) {
      const card = document.createElement('li');
      card.className = 'record-card';
      const heading = document.createElement('h3');
      heading.textContent = exercise;
      const rows = document.createElement('ul');
      rows.className = 'record-rows';
      for (const [type, record] of types) {
        const row = document.createElement('li');
        const badge = document.createElement('span');
        badge.className = 'pr-badge';
        badge.textContent = 'PR';
        const text = document.createElement('span');
        text.textContent = `${typeLabel(type)}: ${formatRecord(type, record.value)}`;
        row.append(badge, text);
        const when = record.achieved_at || record.created_at;
        if (when && !Number.isNaN(new Date(when).getTime())) {
          const date = document.createElement('small');
          date.className = 'muted';
          date.textContent = new Date(when).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
          row.appendChild(date);
        }
        rows.appendChild(row);
      }
      card.append(heading, rows);
      board.appendChild(card);
    }
  }

  function renderAll() {
    renderTotals();
    renderGoals();
    renderRecords();
  }

  // ---------- data ----------
  async function load() {
    clear();
    const activeVersion = version;
    goals = readGoals();
    $('achievements-status').textContent = 'Loading your achievements…';
    try {
      const [dashboard, exercises, setsResult] = await Promise.all([
        api('GET', '/api/dashboard'),
        EXERCISE_API ? api('GET', EXERCISE_API).catch(() => ({ exercises: [] })) : Promise.resolve({ exercises: [] }),
        SETS_API ? api('GET', SETS_API).catch(() => null) : Promise.resolve(null),
      ]);
      if (activeVersion !== version) return;
      data = {
        summary: dashboard.summary,
        records: dashboard.recentAchievements || [],
        unit: dashboard.weightUnit,
        sets: setsResult ? (setsResult.sets || []).map(normalizeSet) : null,
      };
      catalog = exercises.exercises || [];
      renderAll();
      $('achievements-status').textContent = SETS_API && !setsResult
        ? 'Could not load your logged sets, so goals will only use results you log by hand.'
        : '';
    } catch (error) {
      if (activeVersion !== version) return;
      $('achievements-status').textContent = `Could not load your achievements: ${error.message}`;
      $('achievements-retry').hidden = false;
    }
  }

  function clear() {
    version += 1;
    data = { summary: null, records: [], unit: 'kg', sets: null };
    catalog = [];
    goals = [];
    loggingId = null;
    $('achievements-status').textContent = '';
    $('achievements-retry').hidden = true;
    $('goals-page-status').textContent = '';
    $('goals-list').replaceChildren();
    $('records-board').replaceChildren();
    $('records-search').value = '';
    $('goals-empty').hidden = true;
    $('records-empty').hidden = true;
    $('records-none').hidden = true;
    for (const id of ['achievements-workouts', 'achievements-sets', 'achievements-prs']) $(id).textContent = '—';
    $('goal-dialog').close();
    $('goal-log-dialog').close();
  }

  // ---------- goal dialog ----------
  const defaultDistUnit = () => (data.unit === 'lb' ? 'mi' : 'km');

  function findExercise(name) {
    const wanted = name.trim().toLowerCase();
    return wanted ? catalog.find((e) => String(e.name).toLowerCase() === wanted) : null;
  }

  function allowedMetrics(name) {
    const match = findExercise(name);
    const mapped = match && TRACKING_METRICS[match.tracking_type];
    return mapped || Object.keys(METRICS);
  }

  function openGoalDialog() {
    $('goal-form').reset();
    $('goal-error').hidden = true;
    const names = new Set([...catalog.map((e) => e.name), ...data.records.map((r) => r.exercise_name)]);
    $('goal-exercise-list').replaceChildren(...[...names].sort().map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }));
    $('goal-unit').value = defaultDistUnit();
    $('goal-metric').dataset.allowed = '';
    syncGoalForm();
    $('goal-dialog').showModal();
    $('goal-kind').focus();
  }

  const TARGET_HINTS = {
    weight: () => `Target (${data.unit === 'lb' ? 'lb' : 'kg'})`,
    count: () => 'Target reps',
    distance: () => 'Target distance (unit below)',
    duration: () => 'Target (mm:ss, or h:mm:ss)',
    pace: () => 'Target pace per distance unit (mm:ss)',
    speed: () => 'Target speed (unit below)',
  };
  const TARGET_PLACEHOLDERS = { weight: 'e.g. 100', count: 'e.g. 12', distance: 'e.g. 10', duration: 'e.g. 1:30 or 25:00', pace: 'e.g. 5:00', speed: 'e.g. 18' };

  function syncGoalForm() {
    const kind = $('goal-kind').value;
    const isExercise = kind === 'exercise';
    $('goal-exercise-fields').hidden = !isExercise;
    $('goal-count-fields').hidden = isExercise;
    $('goal-exercise').required = isExercise;
    $('goal-target').required = isExercise;
    $('goal-count').required = !isExercise;
    if (!isExercise) {
      $('goal-count-label').textContent = `How many more ${COUNT_GOALS[kind].noun}?`;
      return;
    }

    const allowed = allowedMetrics($('goal-exercise').value);
    const select = $('goal-metric');
    if (select.dataset.allowed !== allowed.join()) {
      const previous = select.value;
      select.replaceChildren(...allowed.map((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = METRICS[key].label;
        return option;
      }));
      select.value = allowed.includes(previous) ? previous : allowed[0];
      select.dataset.allowed = allowed.join();
    }
    const metricKey = select.value;
    const metric = METRICS[metricKey];

    $('goal-qual-wrap').hidden = !metric.qualifier;
    if (metric.qualifier) {
      $('goal-qual-label').textContent = metric.qualifierLabel;
      $('goal-qual').required = Boolean(metric.qualifierRequired);
      $('goal-qual').placeholder = metric.qualifier === 'distance' ? 'e.g. 5' : metric.qualifier === 'reps' ? 'e.g. 5' : 'e.g. 60';
    } else {
      $('goal-qual').required = false;
    }
    const usesDistUnit = ['distance', 'pace', 'speed'].includes(metric.kind) || metric.qualifier === 'distance';
    $('goal-unit-wrap').hidden = !usesDistUnit;
    // Pace and speed per metre make no sense, so those only offer km and mi.
    const metres = $('goal-unit').querySelector('option[value="m"]');
    const noMetres = metric.kind === 'pace' || metric.kind === 'speed';
    metres.disabled = noMetres;
    if (noMetres && $('goal-unit').value === 'm') $('goal-unit').value = defaultDistUnit();

    $('goal-target-label').textContent = TARGET_HINTS[metric.kind]();
    $('goal-target').placeholder = TARGET_PLACEHOLDERS[metric.kind];
    $('goal-exercise-hint').textContent = catalog.length && $('goal-exercise').value.trim() && !findExercise($('goal-exercise').value)
      ? 'Not in the exercise list yet, so this goal only moves when you tap Log result.'
      : '';
    syncPreview();
  }

  // Shows how the typed target will be read, so "25" vs "25:00" isn't a surprise.
  function syncPreview() {
    const metric = METRICS[$('goal-metric').value];
    const preview = $('goal-preview');
    const raw = $('goal-target').value.trim();
    if (!metric || !raw) {
      preview.textContent = '';
      return;
    }
    const value = parse(metric.kind, raw, $('goal-unit').value);;
  }

  function showGoalError(message) {
    $('goal-error').textContent = message;
    $('goal-error').hidden = false;
  }

  function submitGoal(event) {
    event.preventDefault();
    $('goal-error').hidden = true;
    const kind = $('goal-kind').value;
    const deadline = $('goal-deadline').value || null;
    if (deadline && new Date(`${deadline}T23:59:59`).getTime() < Date.now()) {
      showGoalError('Pick a deadline that has not passed.');
      return;
    }
    const goal = { id: `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, deadline, createdAt: Date.now() };

    if (kind === 'exercise') {
      const exercise = $('goal-exercise').value.trim();
      const metricKey = $('goal-metric').value;
      const metric = METRICS[metricKey];
      const unit = $('goal-unit').value;
      if (!exercise) return showGoalError('Enter an exercise.');
      const target = parse(metric.kind, $('goal-target').value, unit);
      if (Number.isNaN(target)) return showGoalError(`Enter a valid target (${TARGET_PLACEHOLDERS[metric.kind].replace('e.g. ', 'for example ')}).`);

      let qualifier = null;
      const rawQual = $('goal-qual').value.trim();
      if (metric.qualifier && rawQual) {
        const qualKind = metric.qualifier === 'distance' ? 'distance' : metric.qualifier === 'reps' ? 'count' : 'weight';
        const value = parse(qualKind, rawQual, unit);
        if (Number.isNaN(value)) return showGoalError('Enter a valid number for the extra condition.');
        qualifier = { [metric.qualifier]: value };
      } else if (metric.qualifierRequired) {
        return showGoalError('Enter the distance for this goal.');
      }

      Object.assign(goal, { type: 'exercise', exercise, exerciseId: findExercise(exercise)?.id ?? null, metric: metricKey, unit, target, qualifier, start: null, manual: null, log: [] });
      // Progress is measured from wherever you already are when you set the goal.
      goal.start = currentFor(goal);
    } else {
      const more = Number($('goal-count').value);
      if (!Number.isInteger(more) || more < 1) return showGoalError('Enter a whole number greater than zero.');
      const baseline = Number(data.summary?.[COUNT_GOALS[kind].key] || 0);
      Object.assign(goal, { type: kind, baseline, target: baseline + more });
    }

    goals.push(goal);
    if (!saveGoals()) {
      goals.pop();
      return;
    }
    $('goal-dialog').close();
    renderGoals();
    $('goals-page-status').textContent = 'Goal added.';
  }

  // ---------- log-a-result dialog ----------
  function openLogDialog(goal) {
    loggingId = goal.id;
    const metric = METRICS[goal.metric];
    const texts = goalTexts(goal);
    $('goal-log-title').textContent = `Log a result: ${texts.title}`;
    $('goal-log-context').textContent = texts.sub;
    const speedUnit = goal.unit === 'mi' ? 'mph' : goal.unit === 'm' ? 'm/s' : 'km/h';
    const logLabels = {
      weight: `Weight (${data.unit === 'lb' ? 'lb' : 'kg'})`,
      count: 'Reps',
      distance: `Distance (${goal.unit})`,
      duration: 'Time (mm:ss or h:mm:ss)',
      pace: `Pace per ${goal.unit} (mm:ss)`,
      speed: `Speed (${speedUnit})`,
    };
    $('goal-log-label').textContent = logLabels[metric.kind];
    $('goal-log-value').placeholder = TARGET_PLACEHOLDERS[metric.kind];
    $('goal-log-error').hidden = true;
    $('goal-log-form').reset();
    $('goal-log-dialog').showModal();
    $('goal-log-value').focus();
  }

  function submitLog(event) {
    event.preventDefault();
    const goal = goals.find((g) => g.id === loggingId);
    if (!goal) return;
    const metric = METRICS[goal.metric];
    const value = parse(metric.kind, $('goal-log-value').value, goal.unit);
    if (Number.isNaN(value)) {
      $('goal-log-error').textContent = 'Enter a valid result.';
      $('goal-log-error').hidden = false;
      return;
    }
    goal.log = [...(goal.log || []), { t: Date.now(), v: value }];
    const before = currentFor(goal);
    if (goal.manual == null || better(goal.metric, value, goal.manual)) goal.manual = value;
    if (!saveGoals()) return;
    $('goal-log-dialog').close();
    renderGoals();
    const improved = before === null || better(goal.metric, value, before);
    $('goals-page-status').textContent = improved
      ? `New best logged: ${fmt(metric.kind, value, goal.unit)}.`
      : `Logged. Your best is still ${fmt(metric.kind, before, goal.unit)}.`;
  }

  for (const id of ['goal-kind', 'goal-metric', 'goal-unit']) $(id).addEventListener('change', syncGoalForm);
  $('goal-exercise').addEventListener('input', syncGoalForm);
  $('goal-target').addEventListener('input', syncPreview);
  $('goal-form').addEventListener('submit', submitGoal);
  $('goal-cancel').addEventListener('click', () => $('goal-dialog').close());
  $('goal-log-form').addEventListener('submit', submitLog);
  $('goal-log-cancel').addEventListener('click', () => $('goal-log-dialog').close());
  $('goal-add').addEventListener('click', openGoalDialog);
  $('records-search').addEventListener('input', renderRecords);
  $('achievements-retry').addEventListener('click', load);

  return { load, clear };
};