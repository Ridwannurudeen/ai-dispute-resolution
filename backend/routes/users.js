// backend/routes/users.js
const express = require('express');
const router = express.Router();

router.get('/profile', (req, res) => {
    res.json({ address: req.user.address, createdAt: new Date().toISOString() });
});

router.put('/preferences', (req, res) => {
    res.json({ success: true, preferences: req.body });
});

router.get('/stats', (req, res) => {
    res.json({ totalDisputes: 0, won: 0, lost: 0, reputation: 5000 });
});

module.exports = router;
