const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// Public Certificate Verification & Printable View
router.get('/certificate/:code', (req, res) => {
  const db = getDb();
  const { code } = req.params;

  const cert = db.prepare(`
    SELECT cert.*, u.full_name, u.username, c.title as chapter_title, c.description as chapter_desc
    FROM certificates cert
    JOIN users u ON cert.user_id = u.id
    LEFT JOIN chapters c ON cert.chapter_id = c.id
    WHERE cert.certificate_code = ?
  `).get(code.toUpperCase());

  if (!cert) {
    return res.status(404).render('error', {
      title: 'Certificate Not Found',
      message: 'The certificate code provided is invalid or has expired.'
    });
  }

  res.render('certificate', {
    title: `Certificate: ${cert.full_name}`,
    cert
  });
});

module.exports = router;

