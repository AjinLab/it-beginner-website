const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Chapter listing / Course overview
router.get('/courses', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;

  const chapters = db.prepare(`
    SELECT c.*, COUNT(l.id) as lesson_count
    FROM chapters c
    LEFT JOIN lessons l ON l.chapter_id = c.id
    GROUP BY c.id
    ORDER BY c.order_index
  `).all();

  const chaptersWithProgress = chapters.map(ch => {
    const completed = db.prepare(`
      SELECT COUNT(*) as count FROM user_progress up
      JOIN lessons l ON up.lesson_id = l.id
      WHERE up.user_id = ? AND l.chapter_id = ? AND up.status = 'completed'
    `).get(userId, ch.id).count;
    return {
      ...ch,
      completed_lessons: completed,
      progress_percent: ch.lesson_count > 0 ? Math.round((completed / ch.lesson_count) * 100) : 0
    };
  });

  res.render('courses', { title: 'Course Chapters', chapters: chaptersWithProgress });
});

// Chapter detail with lessons
router.get('/chapter/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const chapterId = req.params.id;

  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
  if (!chapter) return res.status(404).render('error', { title: 'Not Found', message: 'Chapter not found.' });

  const lessons = db.prepare('SELECT * FROM lessons WHERE chapter_id = ? ORDER BY order_index').all(chapterId);
  
  const lessonsWithProgress = lessons.map(lesson => {
    const progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?')
      .get(userId, lesson.id);
    const isBookmarked = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND lesson_id = ?')
      .get(userId, lesson.id);
    return {
      ...lesson,
      progress: progress || { status: 'not_started', progress_percent: 0 },
      is_bookmarked: !!isBookmarked
    };
  });

  const completed = lessonsWithProgress.filter(l => l.progress.status === 'completed').length;
  const progressPercent = lessons.length > 0 ? Math.round((completed / lessons.length) * 100) : 0;

  res.render('chapter', {
    title: chapter.title,
    chapter,
    lessons: lessonsWithProgress,
    progressPercent,
    completedCount: completed
  });
});

// Lesson / Video player page
router.get('/lesson/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const lessonId = req.params.id;

  const lesson = db.prepare('SELECT * FROM lessons WHERE id = ?').get(lessonId);
  if (!lesson) return res.status(404).render('error', { title: 'Not Found', message: 'Lesson not found.' });

  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(lesson.chapter_id);
  
  // Get all lessons in this chapter for navigation
  const chapterLessons = db.prepare('SELECT id, title, order_index FROM lessons WHERE chapter_id = ? ORDER BY order_index')
    .all(lesson.chapter_id);

  // Current lesson index for prev/next nav
  const currentIndex = chapterLessons.findIndex(l => l.id === lesson.id);
  const prevLesson = currentIndex > 0 ? chapterLessons[currentIndex - 1] : null;
  const nextLesson = currentIndex < chapterLessons.length - 1 ? chapterLessons[currentIndex + 1] : null;

  // Get or create progress
  let progress = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId);
  
  if (!progress) {
    db.prepare(`INSERT INTO user_progress (user_id, lesson_id, status, started_at) VALUES (?, ?, 'in_progress', CURRENT_TIMESTAMP)`)
      .run(userId, lessonId);
    progress = { status: 'in_progress', progress_percent: 0, last_position_seconds: 0 };
  } else if (progress.status === 'not_started') {
    db.prepare("UPDATE user_progress SET status = 'in_progress', started_at = CURRENT_TIMESTAMP WHERE user_id = ? AND lesson_id = ?")
      .run(userId, lessonId);
    progress.status = 'in_progress';
  }

  // Get notes for this lesson
  const notes = db.prepare('SELECT * FROM notes WHERE user_id = ? AND lesson_id = ? ORDER BY timestamp_seconds')
    .all(userId, lessonId);

  // Check bookmark
  const isBookmarked = !!db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND lesson_id = ?')
    .get(userId, lessonId);

  // Get Q&A / Discussions for this lesson
  const rawDiscussions = db.prepare(`
    SELECT d.*, u.full_name, u.username, u.role,
      (SELECT COUNT(*) FROM discussion_upvotes du WHERE du.discussion_id = d.id AND du.user_id = ?) as user_has_upvoted
    FROM discussions d
    JOIN users u ON d.user_id = u.id
    WHERE d.lesson_id = ?
    ORDER BY d.created_at ASC
  `).all(userId, lessonId);

  // Organize into questions & replies
  const discussionMap = new Map();
  const topLevelDiscussions = [];

  rawDiscussions.forEach(item => {
    item.replies = [];
    discussionMap.set(item.id, item);
  });

  rawDiscussions.forEach(item => {
    if (item.parent_id && discussionMap.has(item.parent_id)) {
      discussionMap.get(item.parent_id).replies.push(item);
    } else if (!item.parent_id) {
      topLevelDiscussions.push(item);
    }
  });

  // Sort top-level by upvotes DESC then created_at DESC
  topLevelDiscussions.sort((a, b) => b.upvotes - a.upvotes || new Date(b.created_at) - new Date(a.created_at));

  res.render('lesson', {
    title: lesson.title,
    lesson,
    chapter,
    chapterLessons,
    prevLesson,
    nextLesson,
    progress,
    notes,
    isBookmarked,
    discussions: topLevelDiscussions
  });
});

// API: Update progress
router.post('/api/progress/:lessonId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { lessonId } = req.params;
  const { progressPercent, positionSeconds, status } = req.body;

  try {
    const existing = db.prepare('SELECT * FROM user_progress WHERE user_id = ? AND lesson_id = ?')
      .get(userId, lessonId);

    if (existing) {
      const newStatus = status || (progressPercent >= 90 ? 'completed' : 'in_progress');
      const completedAt = newStatus === 'completed' && existing.status !== 'completed' ? 
        new Date().toISOString() : existing.completed_at;

      db.prepare(`
        UPDATE user_progress 
        SET progress_percent = ?, last_position_seconds = ?, status = ?, 
            completed_at = ?, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = ? AND lesson_id = ?
      `).run(
        Math.max(progressPercent || 0, existing.progress_percent),
        positionSeconds || existing.last_position_seconds,
        newStatus,
        completedAt,
        userId, lessonId
      );
    } else {
      db.prepare(`
        INSERT INTO user_progress (user_id, lesson_id, status, progress_percent, last_position_seconds, started_at)
        VALUES (?, ?, 'in_progress', ?, ?, CURRENT_TIMESTAMP)
      `).run(userId, lessonId, progressPercent || 0, positionSeconds || 0);
    }

    // Record activity for today
    const todayStr = new Date().toISOString().split('T')[0];
    const isNowCompleted = (status === 'completed' || (progressPercent >= 90));
    db.prepare(`
      INSERT INTO daily_activity (user_id, activity_date, time_spent_seconds, lessons_completed)
      VALUES (?, ?, 10, ?)
      ON CONFLICT(user_id, activity_date) DO UPDATE SET
        time_spent_seconds = time_spent_seconds + 10,
        lessons_completed = lessons_completed + excluded.lessons_completed
    `).run(userId, todayStr, isNowCompleted ? 1 : 0);

    res.json({ success: true });
  } catch (err) {
    console.error('Progress update error:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

// API: Toggle bookmark
router.post('/api/bookmark/:lessonId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { lessonId } = req.params;

  try {
    const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND lesson_id = ?')
      .get(userId, lessonId);

    if (existing) {
      db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND lesson_id = ?').run(userId, lessonId);
      res.json({ bookmarked: false });
    } else {
      db.prepare('INSERT INTO bookmarks (user_id, lesson_id) VALUES (?, ?)').run(userId, lessonId);
      res.json({ bookmarked: true });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});

// API: Add note
router.post('/api/notes/:lessonId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { lessonId } = req.params;
  const { content, timestampSeconds } = req.body;

  try {
    const result = db.prepare('INSERT INTO notes (user_id, lesson_id, content, timestamp_seconds) VALUES (?, ?, ?, ?)')
      .run(userId, lessonId, content, timestampSeconds || 0);
    
    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
    res.json({ success: true, note });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add note' });
  }
});

// API: Delete note
router.delete('/api/notes/:noteId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { noteId } = req.params;

  try {
    db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(noteId, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

// API: Add Discussion Question or Reply
router.post('/api/discussions/:lessonId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { lessonId } = req.params;
  const { content, parentId } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Content cannot be empty' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO discussions (lesson_id, user_id, parent_id, content)
      VALUES (?, ?, ?, ?)
    `).run(lessonId, userId, parentId || null, content.trim());

    const newDisc = db.prepare(`
      SELECT d.*, u.full_name, u.username, u.role
      FROM discussions d
      JOIN users u ON d.user_id = u.id
      WHERE d.id = ?
    `).get(result.lastInsertRowid);

    newDisc.replies = [];
    newDisc.user_has_upvoted = 0;

    res.json({ success: true, discussion: newDisc });
  } catch (err) {
    console.error('Discussion error:', err);
    res.status(500).json({ error: 'Failed to post discussion' });
  }
});

// API: Toggle Discussion Upvote
router.post('/api/discussions/:discussionId/upvote', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { discussionId } = req.params;

  try {
    const existing = db.prepare('SELECT id FROM discussion_upvotes WHERE discussion_id = ? AND user_id = ?')
      .get(discussionId, userId);

    let upvoted = false;
    if (existing) {
      db.prepare('DELETE FROM discussion_upvotes WHERE discussion_id = ? AND user_id = ?').run(discussionId, userId);
      db.prepare('UPDATE discussions SET upvotes = MAX(0, upvotes - 1) WHERE id = ?').run(discussionId);
      upvoted = false;
    } else {
      db.prepare('INSERT INTO discussion_upvotes (discussion_id, user_id) VALUES (?, ?)').run(discussionId, userId);
      db.prepare('UPDATE discussions SET upvotes = upvotes + 1 WHERE id = ?').run(discussionId);
      upvoted = true;
    }

    const updated = db.prepare('SELECT upvotes FROM discussions WHERE id = ?').get(discussionId);
    res.json({ success: true, upvoted, upvotes: updated ? updated.upvotes : 0 });
  } catch (err) {
    console.error('Upvote error:', err);
    res.status(500).json({ error: 'Failed to upvote' });
  }
});

// API: Delete Discussion
router.delete('/api/discussions/:discussionId', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const userRole = req.session.role;
  const { discussionId } = req.params;

  try {
    const disc = db.prepare('SELECT user_id FROM discussions WHERE id = ?').get(discussionId);
    if (!disc) return res.status(404).json({ error: 'Not found' });

    if (disc.user_id !== userId && userRole !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    db.prepare('DELETE FROM discussions WHERE id = ? OR parent_id = ?').run(discussionId, discussionId);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete discussion error:', err);
    res.status(500).json({ error: 'Failed to delete discussion' });
  }
});

module.exports = router;

