const express = require('express');
const { getPosts, createPost, setPostLike } = require('../db');
const router = express.Router();
const validId = (id) => /^(?:[1-9]\d*)$/.test(String(id)) && Number(id) <= 2147483647;

router.get('/feed', async (req, res) => res.json({ posts: await getPosts(req.user.id) }));
router.get('/posts/me', async (req, res) => res.json({ posts: await getPosts(req.user.id, { mine: true }) }));
router.post('/posts', async (req, res) => {
  const { content, workoutId = null, bodyPart = null } = req.body || {};
  if (bodyPart !== null && !['arms', 'legs', 'back', 'chest'].includes(bodyPart)) {
    return res.status(400).json({ error: 'Choose Arms, Legs, Back, or Chest.' });
  }
  if (typeof content !== 'string' || !content.trim() || [...content.trim()].length > 1000) {
    return res.status(400).json({ error: 'Write a post between 1 and 1,000 characters.' });
  }
  if (workoutId !== null && (typeof workoutId !== 'string' && typeof workoutId !== 'number' || !validId(workoutId))) {
    return res.status(400).json({ error: 'Invalid workout tag' });
  }
  const post = await createPost(req.user.id, content.trim(), workoutId, bodyPart);
  if (!post) return res.status(404).json({ error: 'Workout not found' });
  res.status(201).json({ post });
});
for (const method of ['put', 'delete']) {
  router[method]('/posts/:id/like', async (req, res) => {
    if (!validId(req.params.id)) return res.status(400).json({ error: 'Invalid post ID' });
    const post = await setPostLike(req.user.id, req.params.id, method === 'put');
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json({ post });
  });
}
module.exports = router;
