// Recommendations use the same API as the original workout view.
window.createWorkoutView = (api, { daily = false } = {}) => {
  let generation = 0;
  let slots = [];

  function clear() {
    generation += 1;
    for (const slot of slots) slot.replaceChildren();
    slots = [];
  }

  function renderRecommendation(workout, version) {
    const card = document.createElement('article');
    card.className = 'feed-post recommended-post';
    const presentation = window.liftPresentation(workout);
    card.dataset.liftTone = presentation.tone;
    card.setAttribute('aria-label', `Recommended lift: ${workout.name}`);
    const marker = document.createElement('div');
    marker.className = 'avatar recommendation-marker';
    marker.textContent = presentation.emoji;
    marker.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'post-body';
    const label = document.createElement('p');
    label.className = 'recommendation-label muted';
    label.textContent = daily ? 'Lift of the day' : 'Recommended lift';
    const summary = document.createElement('div');
    summary.className = 'recommendation-summary';
    const info = document.createElement('div');
    const title = document.createElement('h3');
    title.textContent = workout.name;
    const muscle = document.createElement('p');
    muscle.className = 'muted';
    muscle.textContent = `Primary muscle: ${workout.primary_muscle}`;
    info.append(title, muscle);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'View lift details';
    button.setAttribute('aria-expanded', 'false');
    const details = document.createElement('div');
    details.id = `${daily ? 'daily' : 'feed'}-details-${workout.id}`;
    details.className = 'recommendation-details';
    details.setAttribute('aria-live', 'polite');
    details.hidden = true;
    button.setAttribute('aria-controls', details.id);
    let request = 0;
    button.addEventListener('click', async () => {
      const currentRequest = ++request;
      const opening = details.hidden;
      details.hidden = !opening;
      button.setAttribute('aria-expanded', String(opening));
      button.textContent = opening ? 'Hide lift details' : 'View lift details';
      if (!opening) return;
      details.textContent = 'Loading lift…';
      try {
        const { workout: selected } = await api('GET', `/api/workouts/${encodeURIComponent(workout.id)}`);
        if (version !== generation || currentRequest !== request) return;
        const muscles = document.createElement('p');
        muscles.textContent = `Also active: ${selected.secondary_muscles.join(', ')}`;
        const sets = document.createElement('p');
        sets.className = 'muted';
        sets.textContent = selected.sets.length ? `${selected.sets.length} sets recorded.` : 'No sets recorded.';
        details.replaceChildren(muscles, sets);
      } catch (error) {
        if (version === generation && currentRequest === request) details.textContent = `Could not load lift: ${error.message}`;
      }
    });
    summary.append(info, button);
    body.append(label, summary, details);
    card.append(marker, body);
    return card;
  }

  async function load(nextSlots) {
    clear();
    slots = nextSlots;
    const version = generation;
    if (!slots.length) return;
    const status = document.createElement('p');
    status.className = 'recommendation-status muted';
    status.setAttribute('role', 'status');
    status.textContent = 'Loading recommended lifts…';
    slots[0].appendChild(status);
    try {
      const { workouts } = await api('GET', '/api/workouts');
      if (version !== generation) return;
      status.remove();
      // Rotate the example daily using the browser's local calendar date.
      const today = new Date();
      const day = Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86400000);
      const recommendations = daily && workouts.length ? [workouts[day % workouts.length]] : workouts;
      recommendations.forEach((workout, index) => {
        slots[Math.min(index, slots.length - 1)].appendChild(renderRecommendation(workout, version));
      });
      if (!workouts.length) {
        status.textContent = 'No recommended lifts yet.';
        slots[0].appendChild(status);
      }
    } catch (error) {
      if (version !== generation) return;
      status.textContent = `Could not load recommended lifts: ${error.message}`;
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Retry lifts';
      retry.addEventListener('click', () => load(slots));
      status.append(' ', retry);
    }
  }

  return { load, clear };
};
