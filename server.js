const express = require('express');
const session = require('express-session');
const path = require('path');
const { initializeDatabase } = require('./db/database');
const { setLocals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize database
initializeDatabase();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve video files from IT_BEGINNER directory
app.use('/videos', express.static(path.join(__dirname, '..', 'IT_BEGINNER')));

// Session
app.use(session({
  secret: 'it-beginner-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true
  }
}));

// Set template locals
app.use(setLocals);

// Routes
app.use('/', require('./routes/auth'));
app.use('/', require('./routes/dashboard'));
app.use('/', require('./routes/course'));
app.use('/', require('./routes/quiz'));
app.use('/', require('./routes/profile'));
app.use('/', require('./routes/playground'));
app.use('/', require('./routes/search'));
app.use('/', require('./routes/resources'));
app.use('/', require('./routes/certificate'));
app.use('/', require('./routes/admin'));

// Landing page
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/dashboard');
  res.render('landing', { title: 'IT Beginner - Learn IT from Scratch' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).render('error', { 
    title: 'Page Not Found', 
    message: 'The page you are looking for does not exist.' 
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 IT Beginner Learning Platform running at http://localhost:${PORT}\n`);
});

