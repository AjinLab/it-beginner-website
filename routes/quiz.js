const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Quizzes index redirect
router.get(['/quiz', '/quizzes'], requireAuth, (req, res) => {
  res.redirect('/quiz/1');
});

// Quiz page for a chapter
router.get('/quiz/:chapterId', requireAuth, (req, res) => {
  const db = getDb();
  const { chapterId } = req.params;
  const userId = req.session.userId;

  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
  if (!chapter) return res.status(404).render('error', { title: 'Not Found', message: 'Chapter not found.' });

  const questions = db.prepare('SELECT * FROM quiz_questions WHERE chapter_id = ?').all(chapterId);

  // Get previous attempts
  const attempts = db.prepare(`
    SELECT qa.*, qq.question FROM quiz_attempts qa
    JOIN quiz_questions qq ON qa.question_id = qq.id
    WHERE qa.user_id = ? AND qq.chapter_id = ?
    ORDER BY qa.attempted_at DESC
  `).all(userId, chapterId);

  const totalAttempted = new Set(attempts.map(a => a.question_id)).size;
  const totalCorrect = attempts.filter(a => a.is_correct).length;

  res.render('quiz', {
    title: `Quiz: ${chapter.title}`,
    chapter,
    questions,
    attempts,
    totalAttempted,
    totalCorrect,
    totalQuestions: questions.length
  });
});

// Submit quiz answer
router.post('/api/quiz/submit', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { questionId, selectedOption } = req.body;

  try {
    const question = db.prepare('SELECT * FROM quiz_questions WHERE id = ?').get(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const isCorrect = selectedOption === question.correct_option ? 1 : 0;

    db.prepare('INSERT INTO quiz_attempts (user_id, question_id, selected_option, is_correct) VALUES (?, ?, ?, ?)')
      .run(userId, questionId, selectedOption, isCorrect);

    res.json({
      success: true,
      isCorrect: !!isCorrect,
      correctOption: question.correct_option,
      explanation: question.explanation
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

module.exports = router;

