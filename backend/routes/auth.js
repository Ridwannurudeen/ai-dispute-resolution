// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key';
const nonceStore = new Map();

function generateNonce() {
    return `Sign this message to authenticate.\n\nNonce: ${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

function verifySignature(message, signature, expectedAddress) {
    try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch { return false; }
}

function generateToken(address) {
    return jwt.sign({ address: address.toLowerCase(), iat: Math.floor(Date.now() / 1000) }, JWT_SECRET, { expiresIn: '24h' });
}

router.get('/nonce/:address', (req, res) => {
    const { address } = req.params;
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) return res.status(400).json({ error: 'Invalid address' });
    const nonce = generateNonce();
    nonceStore.set(address.toLowerCase(), { nonce, timestamp: Date.now() });
    res.json({ nonce });
});

router.post('/verify', (req, res) => {
    const { address, signature } = req.body;
    if (!address || !signature) return res.status(400).json({ error: 'Address and signature required' });
    
    const stored = nonceStore.get(address.toLowerCase());
    if (!stored || Date.now() - stored.timestamp > 300000) {
        nonceStore.delete(address.toLowerCase());
        return res.status(400).json({ error: 'Nonce expired' });
    }
    
    if (!verifySignature(stored.nonce, signature, address)) {
        return res.status(401).json({ error: 'Invalid signature' });
    }
    
    nonceStore.delete(address.toLowerCase());
    res.json({ token: generateToken(address), user: { address: address.toLowerCase() } });
});

router.post('/refresh', (req, res) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Token required' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET, { ignoreExpiration: true });
        if (Date.now() / 1000 - decoded.iat > 604800) return res.status(401).json({ error: 'Token too old' });
        res.json({ token: generateToken(decoded.address) });
    } catch { res.status(401).json({ error: 'Invalid token' }); }
});

module.exports = router;
