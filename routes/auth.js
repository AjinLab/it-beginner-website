const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/database');

// Login page
router.get('/login', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('login', { title: 'Login', error: null, success: null });
});

// Register page
router.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('register', { title: 'Create Account', error: null });
});

// Handle login
router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = getDb();

  try {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.render('login', { 
        title: 'Login', 
        error: 'Invalid email or password.',
        success: null
      });
    }

    // Update last login
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    // Set session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.fullName = user.full_name;
    req.session.email = user.email;
    req.session.role = user.role;
    req.session.avatarUrl = user.avatar_url;

    const returnTo = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(returnTo);
  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { title: 'Login', error: 'An error occurred. Please try again.', success: null });
  }
});

// Handle registration
router.post('/register', (req, res) => {
  const { username, email, password, confirmPassword, fullName } = req.body;
  const db = getDb();

  // Validation
  if (!username || !email || !password || !fullName) {
    return res.render('register', { title: 'Create Account', error: 'All fields are required.' });
  }

  if (password.length < 6) {
    return res.render('register', { title: 'Create Account', error: 'Password must be at least 6 characters.' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { title: 'Create Account', error: 'Passwords do not match.' });
  }

  try {
    // Check existing user
    const existing = db.prepare('SELECT id FROM users WHERE email = ? OR username = ?').get(email, username);
    if (existing) {
      return res.render('register', { title: 'Create Account', error: 'Email or username already exists.' });
    }

    const hash = bcrypt.hashSync(password, 10);
    db.prepare('INSERT INTO users (username, email, password_hash, full_name) VALUES (?, ?, ?, ?)')
      .run(username, email, hash, fullName);

    res.render('login', { title: 'Login', error: null, success: 'Account created successfully! Please login.' });
  } catch (err) {
    console.error('Registration error:', err);
    res.render('register', { title: 'Create Account', error: 'An error occurred. Please try again.' });
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;

