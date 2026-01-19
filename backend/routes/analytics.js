// backend/routes/analytics.js
const express = require('express');
const router = express.Router();

router.get('/overview', (req, res) => {
    res.json({
        totalDisputes: 150,
        activeDisputes: 12,
        resolvedDisputes: 135,
        totalValueLocked: '45.5',
        averageConfidenceScore: 87
    });
});

router.get('/categories', (req, res) => {
    res.json({
        data: [
            { category: 'ContractBreach', count: 45 },
            { category: 'ServiceQuality', count: 30 },
            { category: 'PaymentDispute', count: 50 },
            { category: 'IntellectualProperty', count: 15 },
            { category: 'FraudClaim', count: 5 },
            { category: 'Other', count: 5 }
        ]
    });
});

router.get('/trends', (req, res) => {
    const days = parseInt(req.query.days) || 30;
    res.json({ days, data: [] });
});

module.exports = router;
