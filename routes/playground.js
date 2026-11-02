const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

// Playground exercises
const PRESETS = [
  {
    id: 'js-variables',
    title: '1. Variables & Data Types',
    category: 'JavaScript Basics',
    html: `<h3>JavaScript Output</h3>\n<div id="output"></div>`,
    css: `#output {\n  background: #1a1a2e;\n  padding: 16px;\n  border-radius: 8px;\n  color: #00d2ff;\n  font-family: monospace;\n}`,
    js: `// Declare variables with let and const\nconst courseName = "IT Beginner";\nlet totalLessons = 35;\nlet isCompleted = false;\n\nconsole.log("Welcome to " + courseName + "!");\nconsole.log("Total Lessons: " + totalLessons);\n\n// Display inside output div\nconst out = document.getElementById("output");\nout.innerHTML = \`<p><strong>Course:</strong> \${courseName}</p><p><strong>Lessons:</strong> \${totalLessons}</p>\`;`
  },
  {
    id: 'js-conditionals',
    title: '2. Conditionals & Logic',
    category: 'Control Flow',
    html: `<h3>Exam Score Grader</h3>\n<input type="number" id="scoreInput" value="85" placeholder="Enter score (0-100)">\n<button id="checkBtn">Calculate Grade</button>\n<p id="gradeResult"></p>`,
    css: `input, button {\n  padding: 8px 12px;\n  border-radius: 6px;\n  border: 1px solid #444;\n  margin-right: 8px;\n}\nbutton {\n  background: #00d2ff;\n  color: #000;\n  font-weight: bold;\n  cursor: pointer;\n}\n#gradeResult {\n  margin-top: 16px;\n  font-size: 1.2rem;\n  font-weight: 600;\n}`,
    js: `function calculateGrade(score) {\n  if (score >= 90) return "🌟 A - Outstanding!";\n  if (score >= 80) return "👍 B - Very Good";\n  if (score >= 70) return "👌 C - Good";\n  if (score >= 60) return "⚠️ D - Passing";\n  return "❌ F - Keep Practicing!";\n}\n\ndocument.getElementById("checkBtn").addEventListener("click", () => {\n  const score = parseInt(document.getElementById("scoreInput").value);\n  const grade = calculateGrade(score);\n  console.log("Evaluated score " + score + " -> " + grade);\n  document.getElementById("gradeResult").textContent = grade;\n});`
  },
  {
    id: 'js-loops-arrays',
    title: '3. Arrays & Loops',
    category: 'Data Structures',
    html: `<h3>My IT Beginner Tech Stack</h3>\n<ul id="techList"></ul>`,
    css: `#techList {\n  list-style: none;\n  padding: 0;\n}\n#techList li {\n  background: rgba(0, 210, 255, 0.1);\n  border-left: 4px solid #00d2ff;\n  margin: 6px 0;\n  padding: 10px 14px;\n  border-radius: 4px;\n}`,
    js: `const technologies = [\n  "HTML5 (Structure)",\n  "CSS3 (Styling & Flexbox)",\n  "JavaScript (Interactivity)",\n  "NPM (Package Management)",\n  "Git & Agile / Scrum"\n];\n\nconst list = document.getElementById("techList");\n\n// Loop through array\ntechnologies.forEach((tech, index) => {\n  console.log(\`[\${index + 1}] \${tech}\`);\n  const li = document.createElement("li");\n  li.textContent = \`\${index + 1}. \${tech}\`;\n  list.appendChild(li);\n});`
  },
  {
    id: 'html-css-card',
    title: '4. HTML & CSS Profile Card',
    category: 'Web Design',
    html: `<div class="card">\n  <div class="avatar">👨‍💻</div>\n  <h2>Junior Web Developer</h2>\n  <p>Learning full-stack web development through the IT Beginner course.</p>\n  <span class="badge">Active Learner</span>\n</div>`,
    css: `.card {\n  max-width: 300px;\n  background: #1e1e38;\n  border: 1px solid #333366;\n  border-radius: 12px;\n  padding: 24px;\n  text-align: center;\n  box-shadow: 0 8px 24px rgba(0,0,0,0.4);\n}\n.avatar {\n  font-size: 3rem;\n  margin-bottom: 12px;\n}\nh2 {\n  font-size: 1.25rem;\n  color: #fff;\n  margin-bottom: 8px;\n}\np {\n  font-size: 0.9rem;\n  color: #a0a0c0;\n  line-height: 1.5;\n}\n.badge {\n  display: inline-block;\n  margin-top: 14px;\n  background: #00e676;\n  color: #000;\n  padding: 4px 12px;\n  border-radius: 20px;\n  font-size: 0.8rem;\n  font-weight: bold;\n}`,
    js: `console.log("Card rendered successfully!");`
  }
];

// Playground Main View
router.get('/playground', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;

  const savedSnippets = db.prepare('SELECT id, title, created_at, updated_at FROM code_snippets WHERE user_id = ? ORDER BY updated_at DESC').all(userId);

  res.render('playground', {
    title: 'Interactive Code Playground',
    presets: PRESETS,
    savedSnippets
  });
});

// API: Save code snippet
router.post('/api/playground/save', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const { title, html_code, css_code, js_code, snippet_id } = req.body;

  if (!title) {
    return res.status(400).json({ error: 'Title is required' });
  }

  try {
    if (snippet_id) {
      db.prepare(`
        UPDATE code_snippets 
        SET title = ?, html_code = ?, css_code = ?, js_code = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(title, html_code || '', css_code || '', js_code || '', snippet_id, userId);
      return res.json({ success: true, snippet_id });
    } else {
      const result = db.prepare(`
        INSERT INTO code_snippets (user_id, title, html_code, css_code, js_code)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, title, html_code || '', css_code || '', js_code || '');
      return res.json({ success: true, snippet_id: result.lastInsertRowid });
    }
  } catch (err) {
    console.error('Error saving snippet:', err);
    res.status(500).json({ error: 'Failed to save code snippet' });
  }
});

// API: Load snippet
router.get('/api/playground/snippet/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  const snippet = db.prepare('SELECT * FROM code_snippets WHERE id = ? AND user_id = ?').get(req.params.id, userId);

  if (!snippet) {
    return res.status(404).json({ error: 'Snippet not found' });
  }
  res.json({ success: true, snippet });
});

// API: Delete snippet
router.delete('/api/playground/snippet/:id', requireAuth, (req, res) => {
  const db = getDb();
  const userId = req.session.userId;
  try {
    db.prepare('DELETE FROM code_snippets WHERE id = ? AND user_id = ?').run(req.params.id, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete snippet' });
  }
});

module.exports = router;

