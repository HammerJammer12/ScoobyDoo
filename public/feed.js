window.createFeedView = (api) => {
  const $ = (id) => document.getElementById(id);
  const feed = $('friends-feed');
  const dialog = $('post-dialog');
  const form = $('post-form');
  const content = $('post-content');
  const count = $('post-count');
  const status = $('feed-status');
  const profilePosts = $('profile-posts');
  const profileEmpty = $('profile-empty');
  const profileStatus = $('profile-status');
  const bodyPartPicker = $('post-body-part');
  const tagOptions = $('post-tag-options');
  const tagPreview = $('post-tag-preview');
  const submit = $('post-submit');
  const error = $('post-error');
  let user = null;
  let version = 0;
  let profileVersion = 0;
  let saving = false;

  function updateLike(button, post) {
    button.textContent = `${post.liked ? '♥ Liked' : '♡ Like'} · ${post.likes}`;
    button.setAttribute('aria-pressed', String(post.liked));
  }

  function renderPost(post) {
    const article = document.createElement('article');
    article.className = 'feed-post';
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.setAttribute('aria-hidden', 'true');
    avatar.textContent = post.name.slice(0, 2).toUpperCase();
    const body = document.createElement('div');
    body.className = 'post-body';
    const heading = document.createElement('div');
    heading.className = 'post-heading';
    const author = document.createElement('h3');
    author.textContent = post.name;
    const handle = document.createElement('span');
    handle.className = 'muted';
    handle.textContent = `@${post.handle}`;
    heading.append(author, handle);
    const time = document.createElement('time');
    time.className = 'post-time muted';
    time.dateTime = post.created_at;
    time.textContent = new Date(post.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const text = document.createElement('p');
    text.className = 'post-content';
    text.textContent = post.content;
    body.append(heading, time, text);
    if (post.body_part) body.appendChild(window.renderBodyPartTag(post.body_part));
    else if (post.lift) body.appendChild(window.renderLiftTag(post.lift));
    const like = document.createElement('button');
    like.className = 'like-post';
    like.type = 'button';
    like.dataset.likeId = post.id;
    like.setAttribute('aria-label', `Like post by ${post.name}`);
    updateLike(like, post);
    const likeError = document.createElement('p');
    likeError.className = 'error';
    likeError.setAttribute('role', 'status');
    likeError.hidden = true;
    like.addEventListener('click', async () => {
      const currentVersion = version;
      const method = like.getAttribute('aria-pressed') === 'true' ? 'DELETE' : 'PUT';
      like.disabled = true;
      likeError.hidden = true;
      try {
        const { post: updated } = await api(method, `/api/posts/${encodeURIComponent(post.id)}/like`, {});
        if (currentVersion !== version) return;
        for (const button of document.querySelectorAll('[data-like-id]')) {
          if (button.dataset.likeId === post.id) updateLike(button, updated);
        }
      } catch (err) {
        if (currentVersion !== version) return;
        likeError.textContent = `Could not save like: ${err.message}`;
        likeError.hidden = false;
      } finally {
        like.disabled = false;
      }
    });
    body.append(like, likeError);
    article.append(avatar, body);
    return article;
  }

  function clear() {
    version += 1;
    profileVersion += 1;
    user = null;
    saving = false;
    submit.disabled = false;
    submit.textContent = 'Post';
    dialog.close();
    form.reset();
    content.setCustomValidity('');
    count.textContent = '0 / 1,000';
    bodyPartPicker.value = '';
    renderTagOptions();
    tagPreview.replaceChildren();
    error.hidden = true;
    feed.replaceChildren();
    profilePosts.replaceChildren();
    profileEmpty.hidden = true;
    profileStatus.textContent = '';
    status.textContent = '';
  }

  async function load(currentUser) {
    clear();
    user = currentUser;
    const currentVersion = version;
    status.textContent = 'Loading posts…';
    let posts = [];
    try {
      ({ posts } = await api('GET', '/api/feed'));
      if (currentVersion !== version) return [];
      status.textContent = posts.length ? 'Latest updates from everyone.' : 'No posts yet. Share an update to get started.';
    } catch (err) {
      if (currentVersion !== version) return [];
      status.textContent = `Could not load posts: ${err.message}. Refresh the page to try again.`;
    }
    const slots = [];
    for (const [index, post] of posts.entries()) {
      feed.appendChild(renderPost(post));
      if (index < 4) {
        const slot = document.createElement('div');
        feed.appendChild(slot);
        slots.push(slot);
      }
    }
    // Recommendations remain available even before the first post.
    if (!slots.length) {
      const slot = document.createElement('div');
      feed.appendChild(slot);
      slots.push(slot);
    }
    return slots;
  }

  async function renderProfile() {
    if (!user) return;
    const request = ++profileVersion;
    const currentVersion = version;
    profileStatus.textContent = 'Loading your posts…';
    profileEmpty.hidden = true;
    try {
      const { posts } = await api('GET', '/api/posts/me');
      if (request !== profileVersion || currentVersion !== version) return;
      profilePosts.replaceChildren(...posts.map(renderPost));
      profileEmpty.hidden = posts.length > 0;
      profileStatus.textContent = '';
    } catch (err) {
      if (request !== profileVersion || currentVersion !== version) return;
      profileStatus.textContent = `Could not load your posts: ${err.message}`;
    }
  }

  function openComposer() {
    if (!user) return;
    error.hidden = true;
    dialog.showModal();
    content.focus();
  }
  for (const id of ['create-post-top', 'create-post-floating', 'create-post-profile']) $(id).addEventListener('click', openComposer);
  $('close-post').addEventListener('click', () => dialog.close());
  function renderTagOptions() {
    tagOptions.replaceChildren();
    for (const bodyPart of ['', 'arms', 'legs', 'back', 'chest']) {
      const presentation = bodyPart ? window.bodyPartPresentation(bodyPart) : { tone: 'neutral', name: 'No tag' };
      const label = document.createElement('label');
      label.className = 'workout-tag-option';
      label.dataset.liftTone = presentation.tone;
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'body-part-choice';
      radio.value = bodyPart;
      radio.checked = radio.defaultChecked = bodyPart === bodyPartPicker.value;
      const text = document.createElement('span');
      text.textContent = bodyPart ? `${presentation.emoji} ${presentation.name}` : 'No tag';
      radio.addEventListener('change', () => {
        bodyPartPicker.value = bodyPart;
        tagPreview.replaceChildren(...(bodyPart ? [window.renderBodyPartTag(bodyPart)] : []));
      });
      label.append(radio, text);
      tagOptions.appendChild(label);
    }
  }

  content.addEventListener('input', () => {
    content.setCustomValidity('');
    count.textContent = `${content.value.length} / 1,000`;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!user || saving) return;
    const text = content.value.trim();
    if (!text) {
      content.setCustomValidity('Write something before posting.');
      content.reportValidity();
      return;
    }
    const currentVersion = version;
    saving = true;
    submit.disabled = true;
    submit.textContent = 'Posting…';
    error.hidden = true;
    try {
      const { post } = await api('POST', '/api/posts', { content: text, bodyPart: bodyPartPicker.value || null });
      if (currentVersion !== version) return;
      feed.prepend(renderPost(post));
      renderProfile();
      dialog.close();
      form.reset();
      bodyPartPicker.value = '';
      renderTagOptions();
      tagPreview.replaceChildren();
      content.setCustomValidity('');
      count.textContent = '0 / 1,000';
      status.textContent = 'Your post was saved.';
      const destination = $('profile-view').hidden ? feed : profilePosts;
      destination.scrollIntoView({ block: 'start', behavior: 'smooth' });
    } catch (err) {
      if (currentVersion !== version) return;
      error.textContent = `Could not save post: ${err.message}`;
      error.hidden = false;
    } finally {
      if (currentVersion === version) {
        saving = false;
        submit.disabled = false;
        submit.textContent = 'Post';
      }
    }
  });
  return { load, clear, renderProfile };
};
