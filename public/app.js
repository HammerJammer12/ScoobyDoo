(() => {
  const $ = (id) => document.getElementById(id);
  let mode = 'login';

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

  
  function showUser(user) {
    hideAllViews();

    $('nav').hidden = false;
    $('nav-user').textContent = user.username;
    $('welcome').textContent = `Welcome, ${user.username}`;

    showPage('home');
  }


  function showAuth() {
    $('home-view').hidden = true;
    $('nav').hidden = true;
    $('auth-view').hidden = false;
  }


  function hideAllViews() {
    [
      'auth-view',
      'welcome-view',
      'goals-view',
      'home-view',
      'preferences-view',
    ].forEach(id => {
      const element = $(id);
      if (element) element.hidden = true;
    });
  }

  let newUser = null;
  let onboardingData = {};

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

  $('welcome-next').addEventListener('click', showGoals);

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

  alert('Preferences saved! Next: workout schedule.');
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
    document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === next));
    $('password').autocomplete = next === 'signup' ? 'new-password' : 'current-password';
    $('auth-submit').textContent = next === 'signup' ? 'Create account' : 'Log in';
    $('auth-error').hidden = true;
  }

  document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));

  $('auth-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('auth-submit');
    const err = $('auth-error');
    err.hidden = true;
    btn.disabled = true;
    try {
      const payload = { username: $('username').value.trim(), password: $('password').value };
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
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try { await api('POST', '/api/logout', {}); } finally { showAuth(); setMode('login'); }
  });

  api('GET', '/api/me').then(({ user }) => showUser(user)).catch(showAuth);
})();
