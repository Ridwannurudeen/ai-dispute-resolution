// backend/routes/webhooks.js
const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'webhook-secret';

function verifyWebhook(req, res, next) {
    const signature = req.headers['x-webhook-signature'];
    if (!signature) return res.status(401).json({ error: 'Missing signature' });
    
    const expectedSig = crypto.createHmac('sha256', WEBHOOK_SECRET)
        .update(JSON.stringify(req.body)).digest('hex');
    
    if (signature !== expectedSig) return res.status(401).json({ error: 'Invalid signature' });
    next();
}

router.post('/genlayer', verifyWebhook, async (req, res) => {
    const { event, data } = req.body;
    console.log('GenLayer webhook:', event, data);
    
    // Process GenLayer events (verdict delivered, etc.)
    if (event === 'verdict_ready') {
        // Notify relevant parties
        const io = req.app.get('io');
        if (io) {
            io.to(`dispute:${data.disputeId}`).emit('verdict', data);
        }
    }
    
    res.json({ received: true });
});

router.post('/blockchain', async (req, res) => {
    const { event, data } = req.body;
    console.log('Blockchain webhook:', event, data);
    res.json({ received: true });
});

module.exports = router;
