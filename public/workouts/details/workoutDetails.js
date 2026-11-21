(() => {
  const $ = (id) => document.getElementById(id);

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function formatSet(trackingType, s) {
    switch (trackingType) {
      case 'weight_and_reps': return `${s.weightKgs} kg × ${s.reps}`;
      case 'reps_only':       return `${s.reps} reps`;
      case 'duration':        return `${s.durationSecs} s`;
      case 'distance':
        return s.durationSecs != null
          ? `${s.distanceMeters} m in ${s.durationSecs} s`
          : `${s.distanceMeters} m`;
      default: return '';
    }
  }

  (async () => {
    const id = location.pathname.split('/').filter(Boolean).pop();
    if (!/^\d+$/.test(id)) return showError('No workout id given.');

    try {
      const res = await fetch(`/api/workouts/${encodeURIComponent(id)}`, { credentials: 'same-origin' });
      if (res.status === 401) { window.location.href = '/'; return; }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load workout');

      const w = data.workout ?? data;
      $('title').textContent = w.name;
      document.title = w.name;
      if (w.createdAt) {
        $('date').textContent = new Date(w.createdAt).toLocaleString();
        $('date').hidden = false;
      }

      for (const ex of w.exercises || []) {
        const card = document.createElement('div');
        card.className = 'card';

        const h = document.createElement('h2');
        h.textContent = ex.name;

        const ol = document.createElement('ol');
        for (const s of ex.sets) {
          const li = document.createElement('li');
          li.textContent = formatSet(ex.trackingType, s);
          ol.appendChild(li);
        }

        card.append(h, ol);
        $('exercises').appendChild(card);
      }
    } catch (e) {
      showError(e.message);
    }
  })();
})();