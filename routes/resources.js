const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');

router.get('/resources', requireAuth, (req, res) => {
  res.render('resources', {
    title: 'Course Resources & Cheatsheets'
  });
});

module.exports = router;

