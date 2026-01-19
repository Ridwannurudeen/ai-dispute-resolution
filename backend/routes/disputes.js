// backend/routes/disputes.js
const express = require('express');
const router = express.Router();
const { ethers } = require('ethers');

// Mock database for demo (replace with real DB in production)
const disputes = new Map();
const evidence = new Map();

// GET /api/disputes - List disputes
router.get('/', async (req, res) => {
    try {
        const { status, category, page = 1, limit = 20 } = req.query;
        const userAddress = req.user.address;
        
        let results = Array.from(disputes.values()).filter(d => 
            d.claimant.toLowerCase() === userAddress || 
            d.respondent.toLowerCase() === userAddress
        );
        
        if (status) results = results.filter(d => d.status === parseInt(status));
        if (category) results = results.filter(d => d.category === parseInt(category));
        
        const total = results.length;
        const start = (page - 1) * limit;
        results = results.slice(start, start + parseInt(limit));
        
        res.json({ disputes: results, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/disputes/:id - Get dispute details
router.get('/:id', async (req, res) => {
    try {
        const dispute = disputes.get(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
        
        const disputeEvidence = evidence.get(req.params.id) || [];
        res.json({ ...dispute, evidence: disputeEvidence });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/disputes - Create dispute (off-chain metadata)
router.post('/', async (req, res) => {
    try {
        const { disputeId, txHash, description, metadata } = req.body;
        
        disputes.set(disputeId, {
            id: disputeId,
            txHash,
            description,
            metadata,
            claimant: req.user.address,
            createdAt: new Date().toISOString()
        });
        
        res.status(201).json({ success: true, disputeId });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// POST /api/disputes/:id/evidence - Add evidence metadata
router.post('/:id/evidence', async (req, res) => {
    try {
        const { contentHash, description, type } = req.body;
        const disputeEvidence = evidence.get(req.params.id) || [];
        
        disputeEvidence.push({
            contentHash,
            description,
            type,
            submitter: req.user.address,
            timestamp: new Date().toISOString()
        });
        
        evidence.set(req.params.id, disputeEvidence);
        res.status(201).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/disputes/:id/timeline - Get dispute timeline
router.get('/:id/timeline', async (req, res) => {
    try {
        const dispute = disputes.get(req.params.id);
        if (!dispute) return res.status(404).json({ error: 'Dispute not found' });
        
        // Build timeline from events
        const timeline = [
            { type: 'created', timestamp: dispute.createdAt, data: { amount: dispute.amount } }
        ];
        
        res.json({ timeline });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
