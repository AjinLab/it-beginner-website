const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'learning.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initializeDatabase() {
  const db = getDb();

  // Users table
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      avatar_url TEXT DEFAULT '/images/default-avatar.png',
      role TEXT DEFAULT 'student' CHECK(role IN ('student', 'admin')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    )
  `);

  // Chapters table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chapters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      order_index INTEGER NOT NULL,
      icon TEXT DEFAULT '📚'
    )
  `);

  // Lessons table
  db.exec(`
    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chapter_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      video_filename TEXT NOT NULL,
      duration_seconds INTEGER DEFAULT 0,
      order_index INTEGER NOT NULL,
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    )
  `);

  // User progress tracking
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      status TEXT DEFAULT 'not_started' CHECK(status IN ('not_started', 'in_progress', 'completed')),
      progress_percent INTEGER DEFAULT 0,
      last_position_seconds INTEGER DEFAULT 0,
      started_at DATETIME,
      completed_at DATETIME,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      UNIQUE(user_id, lesson_id)
    )
  `);

  // Notes table
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      content TEXT NOT NULL,
      timestamp_seconds INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id)
    )
  `);

  // Bookmarks table
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      UNIQUE(user_id, lesson_id)
    )
  `);

  // Quiz questions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER,
      chapter_id INTEGER,
      question TEXT NOT NULL,
      option_a TEXT NOT NULL,
      option_b TEXT NOT NULL,
      option_c TEXT NOT NULL,
      option_d TEXT NOT NULL,
      correct_option TEXT NOT NULL CHECK(correct_option IN ('A', 'B', 'C', 'D')),
      explanation TEXT,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    )
  `);

  // Quiz attempts
  db.exec(`
    CREATE TABLE IF NOT EXISTS quiz_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_option TEXT NOT NULL,
      is_correct INTEGER NOT NULL,
      attempted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (question_id) REFERENCES quiz_questions(id)
    )
  `);

  // Certificates table
  db.exec(`
    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      chapter_id INTEGER,
      certificate_type TEXT DEFAULT 'chapter' CHECK(certificate_type IN ('chapter', 'course')),
      issued_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      certificate_code TEXT UNIQUE NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (chapter_id) REFERENCES chapters(id)
    )
  `);

  // Discussions / Q&A table
  db.exec(`
    CREATE TABLE IF NOT EXISTS discussions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lesson_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      parent_id INTEGER DEFAULT NULL,
      content TEXT NOT NULL,
      upvotes INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (parent_id) REFERENCES discussions(id) ON DELETE CASCADE
    )
  `);

  // Discussion upvotes
  db.exec(`
    CREATE TABLE IF NOT EXISTS discussion_upvotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discussion_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (discussion_id) REFERENCES discussions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(discussion_id, user_id)
    )
  `);

  // Daily Activity / Streaks
  db.exec(`
    CREATE TABLE IF NOT EXISTS daily_activity (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      activity_date TEXT NOT NULL,
      time_spent_seconds INTEGER DEFAULT 0,
      lessons_completed INTEGER DEFAULT 0,
      quizzes_completed INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, activity_date)
    )
  `);

  // Code Snippets / Playground
  db.exec(`
    CREATE TABLE IF NOT EXISTS code_snippets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      html_code TEXT DEFAULT '',
      css_code TEXT DEFAULT '',
      js_code TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Seed course data
  seedCourseData(db);
  syncNewChaptersAndLessons(db);
  seedAdditionalQuizQuestions(db);
  seedSampleDiscussions(db);
}

function syncNewChaptersAndLessons(db) {
  let ch5 = db.prepare('SELECT id FROM chapters WHERE order_index = 5').get();
  if (!ch5) {
    const res = db.prepare('INSERT INTO chapters (title, description, order_index, icon) VALUES (?, ?, ?, ?)').run(
      'Vue.js Framework & Single Page Apps',
      'Explore modern reactive frontend architecture, Vue components, state, and UI implementation.',
      5, '⚡'
    );
    ch5 = { id: res.lastInsertRowid };
  }

  let ch6 = db.prepare('SELECT id FROM chapters WHERE order_index = 6').get();
  if (!ch6) {
    const res = db.prepare('INSERT INTO chapters (title, description, order_index, icon) VALUES (?, ?, ?, ?)').run(
      'Full-Stack Architecture & Backend Communication',
      'Understand client-server architecture, APIs, HTTP protocols, and full-stack integration.',
      6, '🔌'
    );
    ch6 = { id: res.lastInsertRowid };
  }

  const ch4 = db.prepare('SELECT id FROM chapters WHERE order_index = 4').get();

  const extraLessons = [
    [ch4.id, 'Install JS Libraries With NPM', 'Learn how to install and manage third-party JavaScript libraries using npm.', '0036_14_Install_Js_Libraries_With_Npm - By @iAzazelOfc 🔥.mp4', 14],
    [ch5.id, 'Chapter Introduction', 'Introduction to Vue.js framework and reactive single-page applications.', '0037_1_Chapter_Intro - By @iAzazelOfc 🔥.mp4', 1],
    [ch5.id, 'Vue.js Tutorial Part 1', 'Getting started with Vue.js - core concepts, directives, and templates.', '0038_2_Vuejs_Tutorial_Part_1 - By @iAzazelOfc 🔥.mp4', 2],
    [ch5.id, 'Vue.js Tutorial Part 2', 'Advanced Vue.js - reactive state, event handling, and computed properties.', '0039_3_Vuejs_Tutorial_Part_2 - By @iAzazelOfc 🔥.mp4', 3],
    [ch5.id, 'Implement Frontend With Vue.js Part 1', 'Hands-on frontend development using HTML, CSS, and Vue.js.', '0040_4_Implement_Frontend_With_Html_Css_Vuejs_Part_1_By_@iAzazelOfc.mp4', 4],
    [ch5.id, 'Implement Frontend With Vue.js Part 2', 'Complete the real-world responsive frontend UI with Vue.js.', '0041_5_Implement_Frontend_With_Html_Css_Vuejs_Part_2_By_@iAzazelOfc.mp4', 5],
    [ch6.id, 'Frontend & Backend Communication', 'Deep dive into HTTP methods, JSON data exchange, REST APIs, and client-server communication.', '0042_1_Frontend_Backend_Communication_Explained_By_@iAzazelOfc_🔥.mp4', 1],
  ];

  const insertL = db.prepare('INSERT INTO lessons (chapter_id, title, description, video_filename, order_index) VALUES (?, ?, ?, ?, ?)');
  for (const l of extraLessons) {
    const exists = db.prepare('SELECT id FROM lessons WHERE video_filename = ?').get(l[3]);
    if (!exists) {
      insertL.run(...l);
    }
  }
}

function seedCourseData(db) {
  const chapterCount = db.prepare('SELECT COUNT(*) as count FROM chapters').get().count;
  if (chapterCount > 0) return; // Already seeded

  // Insert chapters
  const insertChapter = db.prepare('INSERT INTO chapters (title, description, order_index, icon) VALUES (?, ?, ?, ?)');
  
  const chapters = [
    ['Getting Started', 'Welcome to the course! Get an overview of the curriculum and learn how to access resources.', 1, '🚀'],
    ['Software Development Basics', 'Learn the fundamentals of software development workflow, Agile methodology, and Scrum.', 2, '⚙️'],
    ['Web Development Fundamentals', 'Dive into how websites work, JavaScript basics, HTML, CSS, and building your first website.', 3, '🌐'],
    ['Frontend Development & Tools', 'Build real applications, explore JS frameworks, open source, libraries, npm, and the command line.', 4, '🛠️'],
    ['Vue.js Framework & Single Page Apps', 'Explore modern reactive frontend architecture, Vue components, state, and UI implementation.', 5, '⚡'],
    ['Full-Stack Architecture & Backend Communication', 'Understand client-server architecture, APIs, HTTP protocols, and full-stack integration.', 6, '🔌']
  ];

  const chapterIds = [];
  for (const ch of chapters) {
    const result = insertChapter.run(...ch);
    chapterIds.push(result.lastInsertRowid);
  }

  // Insert lessons
  const insertLesson = db.prepare('INSERT INTO lessons (chapter_id, title, description, video_filename, order_index) VALUES (?, ?, ?, ?, ?)');

  const lessons = [
    // Chapter 1: Getting Started
    [chapterIds[0], 'Welcome & Course Overview', 'Get introduced to the course and understand what you will learn.', '0001_1_Welcome_Course_Overview - By @iAzazelOfc 🔥.mp4', 1],
    [chapterIds[0], 'Curriculum', 'Explore the full curriculum and learning path.', '0002_2_Curriculum - By @iAzazelOfc 🔥.mp4', 2],
    [chapterIds[0], 'How to Access Course Resources', 'Learn how to navigate and access all course materials.', '0003_3_How_to_Access_Course_Resources - By @iAzazelOfc 🔥.mp4', 3],

    // Chapter 2: Software Development Basics
    [chapterIds[1], 'Software Development Workflow', 'Understand the complete software development lifecycle.', '0004_1_Software_Development_Workflow - By @iAzazelOfc 🔥.mp4', 1],
    [chapterIds[1], 'What Is Agile and Scrum', 'Learn about Agile methodology and Scrum framework.', '0005_2_What_Is_Agile_and_Scrum - By @iAzazelOfc 🔥.mp4', 2],
    [chapterIds[1], 'Backlog and Scrum Board in Jira', 'Master using Jira for backlog management and scrum boards.', '0006_3_Backlog_and_Scrum_Board_in_Jira - By @iAzazelOfc 🔥.mp4', 3],

    // Chapter 3: Web Development Fundamentals
    [chapterIds[2], 'Chapter Introduction', 'Overview of the web development fundamentals chapter.', '0007_1_Chapter_Intro - By @iAzazelOfc 🔥.mp4', 1],
    [chapterIds[2], 'How Websites Work', 'Understand the fundamentals of how websites work behind the scenes.', '0008_2_How_Websites_Work - By @iAzazelOfc 🔥.mp4', 2],
    [chapterIds[2], 'What Is JavaScript', 'Introduction to JavaScript programming language.', '0009_3_What_Is_Js - By @iAzazelOfc 🔥.mp4', 3],
    [chapterIds[2], 'Variables & Data Types', 'Learn about variables and different data types in JavaScript.', '0010_4_Variables_Data_Types - By @iAzazelOfc 🔥.mp4', 4],
    [chapterIds[2], 'How to Execute JavaScript', 'Different ways to run JavaScript code.', '0011_5_How_to_Execute_Js - By @iAzazelOfc 🔥.mp4', 5],
    [chapterIds[2], 'Conditionals & Comparators', 'Master if/else statements and comparison operators.', '0012_6_Conditionals_Comparators - By @iAzazelOfc 🔥.mp4', 6],
    [chapterIds[2], 'Objects', 'Understanding JavaScript objects and their properties.', '0013_7_Objects - By @iAzazelOfc 🔥.mp4', 7],
    [chapterIds[2], 'Arrays', 'Working with arrays in JavaScript.', '0014_8_Arrays - By @iAzazelOfc 🔥.mp4', 8],
    [chapterIds[2], 'Loops', 'Master loops: for, while, and forEach.', '0015_9_Loops - By @iAzazelOfc 🔥.mp4', 9],
    [chapterIds[2], 'Functions', 'Creating and using functions in JavaScript.', '0016_10_Functions - By @iAzazelOfc 🔥.mp4', 10],
    [chapterIds[2], 'Built-in Functions', 'Explore JavaScript\'s powerful built-in functions.', '0017_11_Built_in_Functions - By @iAzazelOfc 🔥.mp4', 11],
    [chapterIds[2], 'Intro to HTML & CSS', 'Getting started with HTML and CSS basics.', '0018_12_Intro_to_Html_Css - By @iAzazelOfc 🔥.mp4', 12],
    [chapterIds[2], 'HTML', 'Deep dive into HTML elements, tags, and structure.', '0019_13_Html - By @iAzazelOfc 🔥.mp4', 13],
    [chapterIds[2], 'CSS', 'Styling web pages with CSS - selectors, properties, and layouts.', '0020_14_Css - By @iAzazelOfc 🔥.mp4', 14],
    [chapterIds[2], 'HTML Head Tags', 'Understanding meta tags, links, and the document head.', '0021_15_Html_Head_Tags - By @iAzazelOfc 🔥.mp4', 15],
    [chapterIds[2], 'Website With HTML, CSS & JS', 'Build a complete website combining HTML, CSS, and JavaScript.', '0022_16_Website_With_Html_Css_Js - By @iAzazelOfc 🔥.mp4', 16],

    // Chapter 4: Frontend Development & Tools
    [chapterIds[3], 'Chapter Introduction', 'Overview of frontend development tools and concepts.', '0023_1_Chapter_Intro - By @iAzazelOfc 🔥.mp4', 1],
    [chapterIds[3], 'Develop Teamable Demo App', 'Build a team collaboration demo app with HTML, CSS, and JS.', '0024_2_Develop_Teamable_Demo_App_With_Html_Css_and_Js_By_@iAzazelOfc.mp4', 2],
    [chapterIds[3], 'JavaScript Frameworks', 'Overview of popular JavaScript frameworks (React, Angular, Vue).', '0025_3_Js_Frameworks - By @iAzazelOfc 🔥.mp4', 3],
    [chapterIds[3], 'Maintaining JS Frameworks', 'Best practices for maintaining JavaScript framework projects.', '0026_4_Maintaining_Js_Frameworks - By @iAzazelOfc 🔥.mp4', 4],
    [chapterIds[3], 'Open Source Explained', 'Understanding open source software and its ecosystem.', '0027_5_Open_Source_Explained - By @iAzazelOfc 🔥.mp4', 5],
    [chapterIds[3], 'Libraries Explained', 'What are libraries and how to use them effectively.', '0028_6_Libraries_Explained - By @iAzazelOfc 🔥.mp4', 6],
    [chapterIds[3], 'NPM Registry', 'Understanding the Node Package Manager registry.', '0029_7_Npm_Registry - By @iAzazelOfc 🔥.mp4', 7],
    [chapterIds[3], 'Versioning in Software Development', 'Semantic versioning and version management explained.', '0030_8_Versioning_in_Software_Development_Explained_By_@iAzazelOfc.mp4', 8],
    [chapterIds[3], 'How to Use Libraries in JS', 'Practical guide to importing and using libraries.', '0031_9_How_to_Use_Libraries_in_Js_Application_By_@iAzazelOfc_🔥.mp4', 9],
    [chapterIds[3], 'NPM CLI', 'Master the npm command line interface.', '0032_10_Npm_Cli - By @iAzazelOfc 🔥.mp4', 10],
    [chapterIds[3], 'Command Line & OS Basics', 'Essential CLI and operating system fundamentals.', '0033_11_Command_Line_Interface_Operating_System_Basics_Explained.mp4', 11],
    [chapterIds[3], 'Install NPM on macOS', 'Step-by-step Node.js and npm installation on Mac.', '0034_12_Install_Npm_on_Macos - By @iAzazelOfc 🔥.mp4', 12],
    [chapterIds[3], 'Install NPM on Windows', 'Step-by-step Node.js and npm installation on Windows.', '0035_13_Install_Npm_on_Windows - By @iAzazelOfc 🔥.mp4', 13],
    [chapterIds[3], 'Install JS Libraries With NPM', 'Learn how to install and manage third-party JavaScript libraries using npm.', '0036_14_Install_Js_Libraries_With_Npm - By @iAzazelOfc 🔥.mp4', 14],

    // Chapter 5: Vue.js Framework & Single Page Apps
    [chapterIds[4], 'Chapter Introduction', 'Introduction to Vue.js framework and reactive single-page applications.', '0037_1_Chapter_Intro - By @iAzazelOfc 🔥.mp4', 1],
    [chapterIds[4], 'Vue.js Tutorial Part 1', 'Getting started with Vue.js - core concepts, directives, and templates.', '0038_2_Vuejs_Tutorial_Part_1 - By @iAzazelOfc 🔥.mp4', 2],
    [chapterIds[4], 'Vue.js Tutorial Part 2', 'Advanced Vue.js - reactive state, event handling, and computed properties.', '0039_3_Vuejs_Tutorial_Part_2 - By @iAzazelOfc 🔥.mp4', 3],
    [chapterIds[4], 'Implement Frontend With Vue.js Part 1', 'Hands-on frontend development using HTML, CSS, and Vue.js.', '0040_4_Implement_Frontend_With_Html_Css_Vuejs_Part_1_By_@iAzazelOfc.mp4', 4],
    [chapterIds[4], 'Implement Frontend With Vue.js Part 2', 'Complete the real-world responsive frontend UI with Vue.js.', '0041_5_Implement_Frontend_With_Html_Css_Vuejs_Part_2_By_@iAzazelOfc.mp4', 5],

    // Chapter 6: Full-Stack Architecture & Backend Communication
    [chapterIds[5], 'Frontend & Backend Communication', 'Deep dive into HTTP methods, JSON data exchange, REST APIs, and client-server communication.', '0042_1_Frontend_Backend_Communication_Explained_By_@iAzazelOfc_🔥.mp4', 1],
  ];

  const insertMany = db.transaction(() => {
    for (const lesson of lessons) {
      insertLesson.run(...lesson);
    }
  });
  insertMany();

  // Seed quiz questions
  seedQuizQuestions(db);

  // Create demo admin user
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO users (username, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)')
    .run('admin', 'admin@itbeginner.com', hash, 'Course Admin', 'admin');

  console.log('✅ Database seeded with course data');
}

function seedQuizQuestions(db) {
  const insertQ = db.prepare(
    'INSERT INTO quiz_questions (chapter_id, lesson_id, question, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );

  const questions = [
    // Chapter 2 questions
    [2, null, 'What does Agile methodology emphasize?', 'Rigid planning', 'Iterative development and flexibility', 'No documentation', 'Working alone', 'B', 'Agile emphasizes iterative development, collaboration, and adaptability to change.'],
    [2, null, 'What is a Scrum Board used for?', 'Writing code', 'Tracking sprint progress visually', 'Database design', 'File management', 'B', 'A Scrum Board provides a visual representation of work items and their status in a sprint.'],
    [2, null, 'What is a Product Backlog?', 'A list of bugs', 'A prioritized list of features and requirements', 'A database table', 'A CSS file', 'B', 'The Product Backlog is an ordered list of everything that is needed in the product.'],

    // Chapter 3 questions - JavaScript
    [3, null, 'Which keyword is used to declare a variable in modern JavaScript?', 'var', 'let', 'dim', 'define', 'B', 'The "let" keyword is the modern way to declare variables in JavaScript (ES6+).'],
    [3, null, 'What is the correct way to write a JavaScript array?', '{1, 2, 3}', '(1, 2, 3)', '[1, 2, 3]', '<1, 2, 3>', 'C', 'JavaScript arrays are written with square brackets, with items separated by commas.'],
    [3, null, 'What does HTML stand for?', 'Hyper Text Markup Language', 'High Tech Modern Language', 'Hyper Transfer Markup Language', 'Home Tool Markup Language', 'A', 'HTML stands for Hyper Text Markup Language.'],
    [3, null, 'Which CSS property is used to change text color?', 'font-color', 'text-color', 'color', 'text-style', 'C', 'The "color" property in CSS is used to set the color of text.'],
    [3, null, 'What is a JavaScript function?', 'A CSS selector', 'A reusable block of code', 'An HTML tag', 'A database query', 'B', 'A function is a reusable block of code designed to perform a particular task.'],
    [3, null, 'Which loop will execute at least once?', 'for loop', 'while loop', 'do...while loop', 'forEach loop', 'C', 'A do...while loop executes the code block once before checking the condition.'],
    [3, null, 'What is the DOM?', 'Document Object Model', 'Data Output Method', 'Digital Operating Machine', 'Document Order Map', 'A', 'DOM stands for Document Object Model - it represents the page structure as objects.'],

    // Chapter 4 questions
    [4, null, 'Which of these is a JavaScript framework?', 'Django', 'React', 'Flask', 'Laravel', 'B', 'React is a popular JavaScript library/framework for building user interfaces.'],
    [4, null, 'What does npm stand for?', 'Node Package Manager', 'New Program Module', 'Network Protocol Manager', 'Node Program Module', 'A', 'npm stands for Node Package Manager.'],
    [4, null, 'What is semantic versioning format?', 'v1-2-3', 'MAJOR.MINOR.PATCH', 'year.month.day', 'name-version', 'B', 'Semantic versioning follows the MAJOR.MINOR.PATCH format (e.g., 2.1.3).'],
    [4, null, 'What is open source software?', 'Software that costs money', 'Software with publicly available source code', 'Software only for companies', 'Software without documentation', 'B', 'Open source software has source code that anyone can inspect, modify, and enhance.'],
    [4, null, 'Which command installs a package with npm?', 'npm download', 'npm install', 'npm get', 'npm add', 'B', 'The "npm install" command is used to install packages from the npm registry.'],
  ];

  const insertMany = db.transaction(() => {
    for (const q of questions) {
      insertQ.run(...q);
    }
  });
  insertMany();
}

function seedAdditionalQuizQuestions(db) {
  const ch1Count = db.prepare('SELECT COUNT(*) as count FROM quiz_questions WHERE chapter_id = 1').get().count;
  if (ch1Count === 0) {
    const insertQ = db.prepare(
      'INSERT INTO quiz_questions (chapter_id, lesson_id, question, option_a, option_b, option_c, option_d, correct_option, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const ch1Questions = [
      [1, null, 'What is the primary prerequisite to start this IT Beginner course?', 'Advanced mathematics degree', 'No prior programming experience needed', '10 years of Linux experience', 'Expert knowledge of C++', 'B', 'This course is tailored specifically for complete beginners with zero prior tech background.'],
      [1, null, 'Why is hands-on coding recommended while watching course videos?', 'It is required by the video player', 'It builds muscle memory and real-world problem solving', 'It speeds up video buffering', 'It avoids reading documentation', 'B', 'Typing out code and experimenting builds practical problem-solving confidence.'],
      [1, null, 'How should you organize your course files and exercises?', 'Save everything directly onto Desktop loosely', 'In a dedicated, structured directory organized by lesson or chapter', 'Delete files immediately after running', 'Store them on USB drives only', 'B', 'Maintaining a neat and dedicated project folder is essential for good developer workflow.']
    ];

    for (const q of ch1Questions) {
      insertQ.run(...q);
    }
  }
}

function seedSampleDiscussions(db) {
  const count = db.prepare('SELECT COUNT(*) as count FROM discussions').get().count;
  if (count > 0) return;

  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  const student = db.prepare("SELECT id FROM users WHERE role = 'student' LIMIT 1").get();

  const adminId = admin ? admin.id : 1;
  const studentId = student ? student.id : adminId;

  const insertDisc = db.prepare('INSERT INTO discussions (lesson_id, user_id, parent_id, content, upvotes, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  // Lesson 1 discussion
  const d1 = insertDisc.run(1, studentId, null, 'Is VS Code recommended for following along with this course?', 4, '2026-10-18 10:15:00');
  insertDisc.run(1, adminId, d1.lastInsertRowid, 'Yes! Visual Studio Code (VS Code) is free, cross-platform, and ideal for this course.', 6, '2026-10-18 10:30:00');

  // Lesson 10 discussion (Variables & Data Types)
  const d2 = insertDisc.run(10, studentId, null, 'When should I use const instead of let in JavaScript?', 7, '2026-10-19 14:20:00');
  insertDisc.run(10, adminId, d2.lastInsertRowid, 'Best practice is to use "const" by default unless you know the variable value will be reassigned, then use "let". Never use "var" in modern JS.', 9, '2026-10-19 14:45:00');

  // Lesson 20 discussion (CSS)
  const d3 = insertDisc.run(20, studentId, null, 'What is the best way to center a div horizontally and vertically?', 5, '2026-10-20 11:00:00');
  insertDisc.run(20, adminId, d3.lastInsertRowid, 'Use Flexbox! Set display: flex; justify-content: center; align-items: center; on the parent container.', 8, '2026-10-20 11:15:00');
}

module.exports = { getDb, initializeDatabase };

