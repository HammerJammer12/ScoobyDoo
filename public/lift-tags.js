// Shared presentation keeps tags and recommendation cards consistent.
window.liftPresentation = (lift) => ({
  'squat': { emoji: '🦵', tone: 'teal' },
  'deadlift': { emoji: '🏋️', tone: 'amber' },
  'dumbbell curl': { emoji: '💪', tone: 'purple' },
  'bench': { emoji: '🏋️', tone: 'blue' },
}[lift.name.toLowerCase()] || { emoji: '🏋️', tone: 'neutral' });

window.renderLiftTag = (lift) => {
  const presentation = window.liftPresentation(lift);
  const tag = document.createElement('p');
  tag.className = 'post-lift';
  tag.dataset.liftTone = presentation.tone;
  const emoji = document.createElement('span');
  emoji.textContent = presentation.emoji;
  emoji.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = `${lift.name} · ${lift.primary_muscle}`;
  tag.append(emoji, label);
  return tag;
};

window.bodyPartPresentation = (bodyPart) => ({
  arms: { name: 'Arms', emoji: '💪', tone: 'purple' },
  legs: { name: 'Legs', emoji: '🦵', tone: 'teal' },
  back: { name: 'Back', emoji: '🏋️', tone: 'amber' },
  chest: { name: 'Chest', emoji: '🏋️', tone: 'blue' },
}[bodyPart]);

window.renderBodyPartTag = (bodyPart) => {
  const presentation = window.bodyPartPresentation(bodyPart);
  const tag = document.createElement('p');
  tag.className = 'post-lift';
  tag.dataset.liftTone = presentation.tone;
  const emoji = document.createElement('span');
  emoji.textContent = presentation.emoji;
  emoji.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span');
  label.textContent = presentation.name;
  tag.append(emoji, label);
  return tag;
};
