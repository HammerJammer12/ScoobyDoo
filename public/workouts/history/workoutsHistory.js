(() => {
  const $ = (id) => document.getElementById(id);

  function showError(msg) {
    const el = $('error');
    el.textContent = msg;
    el.hidden = !msg;
  }

  function plural(n, word) {
    return `${n} ${word}${n === 1 ? '' : 's'}`;
  }

  (async () => {
    try {
      const res = await fetch('/api/workouts', { credentials: 'same-origin' });
      if (res.status === 401) { window.location.href = '/'; return; }
      
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed to load workouts');

      const workouts = data.workouts || [];
      $('empty').hidden = workouts.length > 0;

      for (const w of workouts) {
        const card = document.createElement('div');
        card.className = 'card';

        const link = document.createElement('a');
        link.href = `/workouts/${encodeURIComponent(w.id)}`;
        link.textContent = w.name;

        const meta = document.createElement('div');
        const parts = [];
        if (w.createdAt) parts.push(new Date(w.createdAt).toLocaleDateString());
        if (w.exerciseCount != null) parts.push(plural(w.exerciseCount, 'exercise'));
        if (w.setCount != null) parts.push(plural(w.setCount, 'set'));
        meta.textContent = parts.join(' · ');

        card.append(link, meta);
        $('list').appendChild(card);
      }
    } catch (e) {
      showError(e.message);
    }
  })();
})();