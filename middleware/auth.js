const { getDb } = require('../db/database');

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  req.session.returnTo = req.originalUrl;
  res.redirect('/login');
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  res.status(403).render('error', { 
    title: 'Access Denied', 
    message: 'You do not have permission to access the admin portal.',
    user: req.session 
  });
}

function getStreak(userId) {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT DISTINCT date(updated_at) as act_date 
      FROM user_progress 
      WHERE user_id = ? 
      UNION 
      SELECT DISTINCT date(attempted_at) as act_date 
      FROM quiz_attempts 
      WHERE user_id = ? 
      ORDER BY act_date DESC
    `).all(userId, userId);

    if (!rows || rows.length === 0) return 1;

    let streak = 0;
    const checkDate = new Date();
    checkDate.setHours(0, 0, 0, 0);

    const dates = new Set(rows.map(r => r.act_date));
    const todayStr = checkDate.toISOString().split('T')[0];

    if (!dates.has(todayStr)) {
      checkDate.setDate(checkDate.getDate() - 1);
      const yesterdayStr = checkDate.toISOString().split('T')[0];
      if (!dates.has(yesterdayStr)) {
        return 1;
      }
    }

    while (true) {
      const dStr = checkDate.toISOString().split('T')[0];
      if (dates.has(dStr)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return Math.max(1, streak);
  } catch (e) {
    return 1;
  }
}

function setLocals(req, res, next) {
  if (req.session.userId) {
    res.locals.user = {
      id: req.session.userId,
      username: req.session.username,
      fullName: req.session.fullName,
      email: req.session.email,
      role: req.session.role,
      avatarUrl: req.session.avatarUrl
    };
    res.locals.streak = getStreak(req.session.userId);
  } else {
    res.locals.user = null;
    res.locals.streak = 0;
  }
  res.locals.currentPath = req.path;
  next();
}

module.exports = { requireAuth, requireAdmin, setLocals };

