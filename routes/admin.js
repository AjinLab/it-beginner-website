const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();

  // Total metrics
  const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
  const totalCompletions = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE status = 'completed'").get().count;
  const totalQuizAttempts = db.prepare('SELECT COUNT(*) as count FROM quiz_attempts').get().count;
  const correctQuizAttempts = db.prepare('SELECT COUNT(*) as count FROM quiz_attempts WHERE is_correct = 1').get().count;
  const totalCertificates = db.prepare('SELECT COUNT(*) as count FROM certificates').get().count;
  const totalDiscussions = db.prepare('SELECT COUNT(*) as count FROM discussions').get().count;

  const quizPassRate = totalQuizAttempts > 0 ? Math.round((correctQuizAttempts / totalQuizAttempts) * 100) : 0;

  // Student roster with individual progress
  const students = db.prepare(`
    SELECT u.id, u.full_name, u.username, u.email, u.role, u.created_at, u.last_login,
      COUNT(CASE WHEN up.status = 'completed' THEN 1 END) as completed_count,
      COUNT(DISTINCT n.id) as notes_count,
      COUNT(DISTINCT cert.id) as certs_count
    FROM users u
    LEFT JOIN user_progress up ON u.id = up.user_id
    LEFT JOIN notes n ON u.id = n.user_id
    LEFT JOIN certificates cert ON u.id = cert.user_id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  const studentsWithPercent = students.map(s => ({
    ...s,
    progress_percent: totalLessons > 0 ? Math.round((s.completed_count / totalLessons) * 100) : 0
  }));

  // Most active / popular lessons
  const popularLessons = db.prepare(`
    SELECT l.id, l.title, c.title as chapter_title,
      COUNT(up.id) as views,
      COUNT(CASE WHEN up.status = 'completed' THEN 1 END) as completions
    FROM lessons l
    JOIN chapters c ON l.chapter_id = c.id
    LEFT JOIN user_progress up ON l.id = up.lesson_id
    GROUP BY l.id
    ORDER BY completions DESC, views DESC
    LIMIT 6
  `).all();

  // Recent quiz attempts
  const recentAttempts = db.prepare(`
    SELECT qa.*, u.full_name, qq.question, c.title as chapter_title
    FROM quiz_attempts qa
    JOIN users u ON qa.user_id = u.id
    JOIN quiz_questions qq ON qa.question_id = qq.id
    JOIN chapters c ON qq.chapter_id = c.id
    ORDER BY qa.attempted_at DESC
    LIMIT 6
  `).all();

  res.render('admin', {
    title: 'Admin Control Center & Analytics',
    metrics: {
      totalUsers,
      totalLessons,
      totalCompletions,
      totalQuizAttempts,
      quizPassRate,
      totalCertificates,
      totalDiscussions
    },
    students: studentsWithPercent,
    popularLessons,
    recentAttempts
  });
});

// Admin API: toggle user role
router.post('/api/admin/toggle-role/:userId', requireAuth, requireAdmin, (req, res) => {
  const db = getDb();
  const targetId = req.params.userId;

  // Don't let current user demote themselves
  if (parseInt(targetId) === req.session.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(targetId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const newRole = user.role === 'admin' ? 'student' : 'admin';
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(newRole, targetId);

  res.json({ success: true, newRole });
});

module.exports = router;

