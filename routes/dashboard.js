const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Dashboard
router.get('/dashboard', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;

  // Get all chapters with lesson counts
  const chapters = db.prepare(`
    SELECT c.*, COUNT(l.id) as lesson_count
    FROM chapters c
    LEFT JOIN lessons l ON l.chapter_id = c.id
    GROUP BY c.id
    ORDER BY c.order_index
  `).all();

  // Get user progress stats
  const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
  const completedLessons = db.prepare(
    "SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'completed'"
  ).get(userId).count;
  const inProgressLessons = db.prepare(
    "SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'in_progress'"
  ).get(userId).count;

  // Get chapter progress
  const chapterProgress = chapters.map(ch => {
    const total = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE chapter_id = ?').get(ch.id).count;
    const completed = db.prepare(`
      SELECT COUNT(*) as count FROM user_progress up
      JOIN lessons l ON up.lesson_id = l.id
      WHERE up.user_id = ? AND l.chapter_id = ? AND up.status = 'completed'
    `).get(userId, ch.id).count;
    return {
      ...ch,
      total_lessons: total,
      completed_lessons: completed,
      progress_percent: total > 0 ? Math.round((completed / total) * 100) : 0
    };
  });

  // Get recently watched
  const recentLessons = db.prepare(`
    SELECT l.*, c.title as chapter_title, up.progress_percent, up.status, up.updated_at
    FROM user_progress up
    JOIN lessons l ON up.lesson_id = l.id
    JOIN chapters c ON l.chapter_id = c.id
    WHERE up.user_id = ?
    ORDER BY up.updated_at DESC
    LIMIT 5
  `).all(userId);

  // Get bookmarked lessons
  const bookmarks = db.prepare(`
    SELECT l.*, c.title as chapter_title, b.created_at as bookmarked_at
    FROM bookmarks b
    JOIN lessons l ON b.lesson_id = l.id
    JOIN chapters c ON l.chapter_id = c.id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
    LIMIT 5
  `).all(userId);

  const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

  res.render('dashboard', {
    title: 'Dashboard',
    chapters: chapterProgress,
    totalLessons,
    completedLessons,
    inProgressLessons,
    overallProgress,
    recentLessons,
    bookmarks
  });
});

module.exports = router;

