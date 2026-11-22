
const express = require('express');
const router = express.Router();

const {
  saveOnboarding,
  getOnboarding
} = require('../db');

// Get onboarding information for the current user
router.get('/', async (req, res, next) => {
  try {
    const onboarding = await getOnboarding(req.user.id);

    res.json({
      onboarding,
      completed: Boolean(onboarding)
    });
  } catch (err) {
    next(err);
  }
});

// Save onboarding information for the current user
router.post('/', async (req, res, next) => {
  try {
    const {
      goals,
      goalDetails,
      preferences,
      background
    } = req.body || {};

    // Validate the onboarding information server-side
    if (
      !Array.isArray(goals) ||
      !goalDetails ||
      typeof goalDetails !== 'object' ||
      Array.isArray(goalDetails) ||
      !preferences ||
      typeof preferences !== 'object' ||
      Array.isArray(preferences) ||
      !background ||
      typeof background !== 'object' ||
      Array.isArray(background)
    ) {
      return res.status(400).json({
        error: 'Invalid onboarding information'
      });
    }
    // Save the onboarding information to the database
    const onboarding = await saveOnboarding(req.user.id, {
      goals,
      goalDetails,
      preferences,
      background
    });
    res.status(200).json({
      success: true,
      onboarding
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
