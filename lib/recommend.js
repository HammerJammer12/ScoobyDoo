// Rule-based workout plan recommendations.
// Everything here is a pure function: callers pass in exercise rows from the database.

const C = 'compound';
const I = 'isolation';
const BACK = ['lats', 'middle back'];
const slot = (muscles, mechanic = null) => ({ muscles: [].concat(muscles), mechanic });

// Slots are in priority order; shorter sessions keep the first ones.
// mechanic null means either compound or isolation is fine.
const DAY_TYPES = {
  full: {
    label: 'Full Body',
    slots: [slot('quadriceps', C), slot('chest', C), slot(BACK, C), slot('hamstrings', C),
      slot('shoulders', C), slot('biceps', I), slot('triceps', I), slot('abdominals')],
  },
  upper: {
    label: 'Upper',
    slots: [slot('chest', C), slot(BACK, C), slot('shoulders', C), slot(BACK, C),
      slot('chest', I), slot('biceps', I), slot('triceps', I)],
  },
  lower: {
    label: 'Lower',
    slots: [slot('quadriceps', C), slot('hamstrings', C), slot('glutes'), slot('quadriceps', I),
      slot('hamstrings', I), slot('calves'), slot('abdominals')],
  },
  push: {
    label: 'Push',
    slots: [slot('chest', C), slot('shoulders', C), slot('chest', C), slot('shoulders', I),
      slot('triceps', I), slot('chest', I), slot('triceps', I)],
  },
  pull: {
    label: 'Pull',
    slots: [slot('lats', C), slot('middle back', C), slot(BACK, C), slot('biceps', I),
      slot('traps'), slot('biceps', I), slot('forearms')],
  },
  legs: {
    label: 'Legs',
    slots: [slot('quadriceps', C), slot('hamstrings', C), slot('quadriceps', I), slot('glutes'),
      slot('hamstrings', I), slot('calves'), slot('abdominals')],
  },
};

// Days per week -> weekly split
const SPLITS = {
  1: { name: 'full_body', days: ['full'] },
  2: { name: 'full_body', days: ['full', 'full'] },
  3: { name: 'full_body', days: ['full', 'full', 'full'] },
  4: { name: 'upper_lower', days: ['upper', 'lower', 'upper', 'lower'] },
  5: { name: 'ppl_upper_lower', days: ['push', 'pull', 'legs', 'upper', 'lower'] },
  6: { name: 'push_pull_legs', days: ['push', 'pull', 'legs', 'push', 'pull', 'legs'] },
};

module.exports = { DAY_TYPES, SPLITS };
