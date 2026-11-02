const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Search and filter lessons
router.get('/search', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const q = (req.query.q || '').trim();
  const chapterId = req.query.chapter ? parseInt(req.query.chapter) : null;
  const statusFilter = req.query.status || 'all';

  const chapters = db.prepare('SELECT id, title, order_index FROM chapters ORDER BY order_index').all();

  let query = `
    SELECT l.*, c.title as chapter_title, c.icon as chapter_icon,
           COALESCE(up.status, 'not_started') as status,
           COALESCE(up.progress_percent, 0) as progress_percent,
           CASE WHEN b.id IS NOT NULL THEN 1 ELSE 0 END as is_bookmarked
    FROM lessons l
    JOIN chapters c ON l.chapter_id = c.id
    LEFT JOIN user_progress up ON l.id = up.lesson_id AND up.user_id = ?
    LEFT JOIN bookmarks b ON l.id = b.lesson_id AND b.user_id = ?
    WHERE 1=1
  `;
  const params = [userId, userId];

  if (q) {
    query += ` AND (l.title LIKE ? OR l.description LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`);
  }

  if (chapterId) {
    query += ` AND l.chapter_id = ?`;
    params.push(chapterId);
  }

  if (statusFilter === 'completed') {
    query += ` AND up.status = 'completed'`;
  } else if (statusFilter === 'in_progress') {
    query += ` AND up.status = 'in_progress'`;
  } else if (statusFilter === 'not_started') {
    query += ` AND (up.status IS NULL OR up.status = 'not_started')`;
  } else if (statusFilter === 'bookmarked') {
    query += ` AND b.id IS NOT NULL`;
  }

  query += ` ORDER BY c.order_index ASC, l.order_index ASC`;

  const results = db.prepare(query).all(...params);

  res.render('search', {
    title: 'Search & Filter Course Lessons',
    results,
    q,
    chapterId,
    statusFilter,
    chapters,
    totalFound: results.length
  });
});

// JSON API for instant header search
router.get('/api/search', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const q = (req.query.q || '').trim();

  if (!q) {
    return res.json({ results: [] });
  }

  const results = db.prepare(`
    SELECT l.id, l.title, l.description, c.title as chapter_title, c.icon as chapter_icon,
           COALESCE(up.status, 'not_started') as status
    FROM lessons l
    JOIN chapters c ON l.chapter_id = c.id
    LEFT JOIN user_progress up ON l.id = up.lesson_id AND up.user_id = ?
    WHERE l.title LIKE ? OR l.description LIKE ?
    ORDER BY c.order_index ASC, l.order_index ASC
    LIMIT 8
  `).all(userId, `%${q}%`, `%${q}%`);

  res.json({ results });
});

module.exports = router;

