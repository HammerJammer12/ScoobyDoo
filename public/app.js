(() => {
  const $ = (id) => document.getElementById(id);
  let mode = 'login';
  let newUser = null;
  let onboardingData = {};

  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }


  const workoutView = window.createWorkoutView(api);
  const feedView = window.createFeedView(api);
  const dailyLiftView = window.createWorkoutView(api, { daily: true });
  const plannerView = window.createPlannerView(api);
  const dashboardView = window.createDashboardView(api);
  const achievementsView = window.createAchievementsView(api, () => currentUser);
  let currentUser = null;
  let sessionVersion = 0;
  let feedLoaded = false;

  function showView(view, focus = true) {
    if (!currentUser) return;
    document.body.dataset.currentView = view;
    for (const name of ['dashboard', 'planner', 'community', 'profile', 'achievements']) {
      $(`${name}-view`).hidden = name !== view;
    }
    document.querySelectorAll('[data-view]').forEach((button) => {
      if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    $('create-post-floating').hidden = !['community', 'profile'].includes(view);
    if (view === 'planner') plannerView.load();
    if (view === 'dashboard') dashboardView.load();
    if (view === 'achievements') achievementsView.load();
    if (view === 'community' && !feedLoaded) {
      feedLoaded = true;
      const activeVersion = sessionVersion;
      feedView.load(currentUser).then((slots) => {
        if (activeVersion === sessionVersion) workoutView.load(slots);
      });
    }
    if (view === 'profile') {
      $('profile-username').textContent = `@${currentUser.username}`;
      const today = new Date();
      $('profile-day').textContent = today.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
      $('profile-day').dateTime = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      feedView.renderProfile();
      dailyLiftView.load([$('profile-recommendation')]);
    }
    if (!wideNavigation.matches) setNavigation(false);
    if (focus) $(`${view}-title`).focus();
  }

  document.querySelectorAll('[data-view]').forEach((button) => {
    button.addEventListener('click', () => showView(button.dataset.view));
  });

  const wideNavigation = window.matchMedia('(min-width: 513px)');

  function setNavigation(open) {
    document.body.classList.toggle('nav-open', open);
    for (const id of ['nav-toggle', 'dashboard-menu']) $(id).setAttribute('aria-expanded', String(open));
  }

  for (const id of ['nav-toggle', 'dashboard-menu']) {
    $(id).addEventListener('click', () => setNavigation(!document.body.classList.contains('nav-open')));
  }

  wideNavigation.addEventListener('change', () => setNavigation(wideNavigation.matches));

  $('view-progress').addEventListener('click', () => dashboardView.showProgress());

  // The Achievements nav button carries data-view="achievements", so the generic handler above opens the page.
  $('dashboard-view-achievements').addEventListener('click', () => showView('achievements'));

  function showUser(user) {
    currentUser = user;
    sessionVersion += 1;
    feedLoaded = false;
    $('auth-dialog').close();
    document.body.classList.add('signed-in');
    $('nav-toggle').hidden = false;
    setNavigation(wideNavigation.matches);
    $('landing-view').hidden = true;
    $('nav').hidden = false;
    $('nav-user').textContent = user.username;
    $('welcome').textContent = `Welcome, ${user.username}. Here’s your training at a glance.`;
    feedView.initialize(user);
    showView('dashboard', false);
  }

  function showLanding() {
    currentUser = null;
    document.body.classList.remove('signed-in', 'nav-open');
    $('nav-toggle').hidden = true;
    sessionVersion += 1;
    feedLoaded = false;
    dashboardView.clear();
    achievementsView.clear();
    plannerView.clear();
    dailyLiftView.clear();
    workoutView.clear();
    feedView.clear();
    for (const name of ['dashboard', 'planner', 'community', 'profile', 'achievements']) $(`${name}-view`).hidden = true;
    $('create-post-floating').hidden = true;
    $('nav').hidden = true;
    $('landing-view').hidden = false;
  }
  
  function hideAllViews() {
    [
      'auth-view',
      'welcome-view',
      'goals-view',
      'preferences-view',
      'background-view',
      'home-view',
      'feed-view',
      'progress-view',
      'plan-view',
      'profile-view',
      'settings-view'
    ].forEach(id => {
      const element = $(id);
      if (element) element.hidden = true;
    });
  }



  // Onboarding flow functions
  function startOnboarding(user) {
    newUser = user;
    onboardingData = {};

    hideAllViews();

    $('nav').hidden = true;
    $('welcome-view').hidden = false;
  }

  // Show goals view  
  function showGoals() {
    $('welcome-view').hidden = true;
    $('goals-view').hidden = false;
  }

  const welcomeNext = $('welcome-next');

  if (welcomeNext) {
    welcomeNext.addEventListener('click', showGoals);
  }
  $('goals-back').addEventListener('click', () => {
    $('goals-view').hidden = true;
    $('welcome-view').hidden = false;
  });

  // Expand and collapse goal questions
  document.querySelectorAll('[data-goal]').forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      const details = $(
        `${checkbox.dataset.goal}-details`
      );

      details.hidden = !checkbox.checked;

      if (!checkbox.checked) {
        details.querySelectorAll('input').forEach(input => {
          input.checked = false;
        });
      }
    });
  });

  function getValues(name) {
    return [
      ...document.querySelectorAll(
        `input[name="${name}"]:checked`
      )
    ].map(input => input.value);
  }
  // Collect goals from the form
  function collectGoals() {
    const selectedGoals = [
      ...document.querySelectorAll(
        'input[name="goal"]:checked'
      )
    ];

    if (!selectedGoals.length) {
      throw new Error('Please select at least one goal.');
    }

    const details = {};

    for (const goal of selectedGoals) {
      const type = goal.dataset.goal;
      const section = $(`${type}-details`);

      if (type === 'weight') {
        const focus = section.querySelector(
          'input[name="weightFocus"]:checked'
        );

        if (!focus) {
          throw new Error(
            'Please select your weight management focus.'
          );
        }

        details.weight = { focus: focus.value };

      } else {
        const selected = [
          ...section.querySelectorAll(
            'input[type="checkbox"]:checked'
          )
        ].map(input => input.value);

        if (!selected.length) {
          throw new Error(
            `Please answer the questions for ${goal.value}.`
          );
        }

        details[type] = selected;
      }
    }

    return {
      goals: selectedGoals.map(goal => goal.value),
      goalDetails: details
    };
  }
  
$('goals-next').addEventListener('click', () => {
  const error = $('goals-error');
  error.hidden = true;

  try {
    onboardingData = collectGoals();

    console.log('Collected onboarding data:', onboardingData);

    $('goals-view').hidden = true;
    $('preferences-view').hidden = false;

  } catch (ex) {
    error.textContent = ex.message;
    error.hidden = false;
  }
});

// Preferences: Back button
$('preferences-back').addEventListener('click', () => {
  $('preferences-view').hidden = true;
  $('goals-view').hidden = false;
});

// Preferences: Continue button
$('preferences-next').addEventListener('click', () => {
  const error = $('preferences-error');
  error.hidden = true;

  const fitnessLevel = $('fitness-level').value;
  const workoutTypes = getValues('workoutType');
  const workoutLocation = $('workout-location').value;

  if (!fitnessLevel || !workoutTypes.length || !workoutLocation) {
    error.textContent = 'Please complete all preferences.';
    error.hidden = false;
    return;
  }

  onboardingData.preferences = {
    fitnessLevel,
    workoutTypes,
    workoutLocation
  };

  console.log('Complete onboarding data:', onboardingData);

  $('preferences-view').hidden = true;
  $('background-view').hidden = false;
});

$('background-back').addEventListener('click', () => {
  $('background-view').hidden = true;
  $('preferences-view').hidden = false;
});

$('background-next').addEventListener('click', async () => {
  const error = $('background-error');
  error.hidden = true;

  const experience = document.querySelector(
    'input[name="fitnessExperience"]:checked'
  );

  const activity = document.querySelector(
    'input[name="activityLevel"]:checked'
  );

  const equipment = getValues('equipment');

  if (!experience || !activity) {
    error.textContent =
      'Please answer your fitness experience and activity level.';
    error.hidden = false;
    return;
  }

  if (!equipment.length) {
    error.textContent =
      'Please select at least one equipment option.';
    error.hidden = false;
    return;
  }

  // Save the final onboarding answers
  onboardingData.background = {
    experience: experience.value,
    activity: activity.value,
    equipment: equipment
  };

  console.log('Complete onboarding data:', onboardingData);

  try {
    await api('POST', '/api/onboarding', onboardingData);

    const user = newUser;
    newUser = null;
    showUser(user);
  } catch (ex) {
    error.textContent = ex.message || 'Could not save onboarding.';
    error.hidden = false;
  }
});


  function showPage(page) {
    document.querySelectorAll('.page').forEach((section) => {
      section.hidden = true;
    });

    const selectedPage = $(`${page}-view`);

    if (!selectedPage) return;
    selectedPage.hidden = false;

    // Update navigation link
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle(
        'active',
        link.dataset.page === page
      );
    });
  }

  // Handle navigation clicks
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();

      const page = link.dataset.page;
      showPage(page);

      window.location.hash = page;
    });
  });


  function setMode(next) {
    mode = next;
    const signingUp = next === 'signup';
    $('signup-fields').hidden = !signingUp;
    $('confirm-password').required = signingUp;
    $('confirm-password').value = '';
    $('password').value = '';
    $('password').minLength = signingUp ? 8 : 1;
    $('username').pattern = signingUp ? '[A-Za-z0-9_]{3,30}' : '.*';
    document.querySelectorAll('.tab').forEach((t) => {
      const active = t.dataset.mode === next;
      t.classList.toggle('active', active);
      t.setAttribute('aria-pressed', String(active));
    });
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('auth-submit').textContent = next === 'signup' ? 'Create account' : 'Log in';
    $('auth-error').hidden = true;
  }

  $('open-auth').addEventListener('click', () => {
    setMode('login');
    $('auth-dialog').showModal();
    $('username').focus();
  });

  $('close-auth').addEventListener('click', () => {
    $('auth-dialog').close();
  });

  $('auth-dialog').addEventListener('close', () => {
    $('auth-form').reset();
    $('auth-error').hidden = true;
  });

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('auth-submit');
    const err = $('auth-error');
    err.hidden = true;
    btn.disabled = true;
    btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    document.querySelectorAll('.tab').forEach((tab) => { tab.disabled = true; });
    try {
      const payload = { username: $('username').value.trim(), password: $('password').value };
      if (mode === 'signup') {
        payload.confirmPassword = $('confirm-password').value;
        if (payload.password !== payload.confirmPassword) {
          throw new Error('Passwords do not match.');
        }
      }
      const { user } = await api('POST', mode === 'signup' ? '/api/signup' : '/api/login', payload);
      $('auth-form').reset();
      if (mode == 'signup') {
        startOnboarding(user);
      } else {
        showUser(user);
      }
    } catch (ex) {
      err.textContent = ex.message;
      err.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = mode === 'signup' ? 'Create account' : 'Log in';
      document.querySelectorAll('.tab').forEach((tab) => { tab.disabled = false; });
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try {
      await api('POST', '/api/logout', {});
      showLanding();
      setMode('login');
    } catch (error) {
      alert('Could not log out. Please try again.');
    }
  });

  setMode('login');
  api('GET', '/api/me').then(({ user }) => showUser(user)).catch(showLanding);
})();