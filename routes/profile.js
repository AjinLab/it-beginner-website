const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const crypto = require('crypto');

// Profile page
router.get('/profile', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const totalLessons = db.prepare('SELECT COUNT(*) as count FROM lessons').get().count;
  const completed = db.prepare("SELECT COUNT(*) as count FROM user_progress WHERE user_id = ? AND status = 'completed'").get(userId).count;
  const notesCount = db.prepare('SELECT COUNT(*) as count FROM notes WHERE user_id = ?').get(userId).count;
  const bookmarksCount = db.prepare('SELECT COUNT(*) as count FROM bookmarks WHERE user_id = ?').get(userId).count;

  // Get certificates
  const certificates = db.prepare(`
    SELECT cert.*, c.title as chapter_title
    FROM certificates cert
    LEFT JOIN chapters c ON cert.chapter_id = c.id
    WHERE cert.user_id = ?
    ORDER BY cert.issued_at DESC
  `).all(userId);

  // Check which chapters are fully completed for certificate eligibility
  const chapters = db.prepare('SELECT * FROM chapters ORDER BY order_index').all();
  const eligibleChapters = chapters.filter(ch => {
    const total = db.prepare('SELECT COUNT(*) as count FROM lessons WHERE chapter_id = ?').get(ch.id).count;
    const done = db.prepare(`
      SELECT COUNT(*) as count FROM user_progress up
      JOIN lessons l ON up.lesson_id = l.id
      WHERE up.user_id = ? AND l.chapter_id = ? AND up.status = 'completed'
    `).get(userId, ch.id).count;
    const hasCert = certificates.some(cert => cert.chapter_id === ch.id);
    return total > 0 && done >= total && !hasCert;
  });

  res.render('profile', {
    title: 'My Profile',
    userProfile: user,
    totalLessons,
    completedLessons: completed,
    notesCount,
    bookmarksCount,
    certificates,
    eligibleChapters,
    overallProgress: totalLessons > 0 ? Math.round((completed / totalLessons) * 100) : 0
  });
});

// Update profile
router.post('/profile/update', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { fullName, email } = req.body;

  try {
    db.prepare('UPDATE users SET full_name = ?, email = ? WHERE id = ?').run(fullName, email, userId);
    req.session.fullName = fullName;
    req.session.email = email;
    res.redirect('/profile?success=1');
  } catch (err) {
    res.redirect('/profile?error=update');
  }
});

// Change password
router.post('/profile/password', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { currentPassword, newPassword, confirmNewPassword } = req.body;

  const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(userId);

  if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.redirect('/profile?error=wrongpassword');
  }

  if (newPassword !== confirmNewPassword || newPassword.length < 6) {
    return res.redirect('/profile?error=passwordmatch');
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, userId);
  res.redirect('/profile?success=password');
});

// Claim certificate
router.post('/api/certificate/claim', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { chapterId } = req.body;

  try {
    const code = crypto.randomBytes(8).toString('hex').toUpperCase();
    db.prepare('INSERT INTO certificates (user_id, chapter_id, certificate_type, certificate_code) VALUES (?, ?, ?, ?)')
      .run(userId, chapterId || null, chapterId ? 'chapter' : 'course', code);
    res.json({ success: true, code });
  } catch (err) {
    res.status(500).json({ error: 'Failed to issue certificate' });
  }
});

module.exports = router;

