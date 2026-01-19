// backend/routes/notifications.js
const express = require('express');
const router = express.Router();

const notifications = new Map();

router.get('/', (req, res) => {
    const userNotifications = notifications.get(req.user.address) || [];
    res.json({ notifications: userNotifications });
});

router.post('/read/:id', (req, res) => {
    res.json({ success: true });
});

router.post('/read-all', (req, res) => {
    res.json({ success: true });
});

router.put('/preferences', (req, res) => {
    res.json({ success: true, preferences: req.body });
});

module.exports = router;
