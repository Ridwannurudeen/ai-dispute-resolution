// backend/middleware/auth.js
/**
 * Authentication Middleware
 * Handles wallet-based authentication using signed messages
 */

const jwt = require('jsonwebtoken');
const { ethers } = require('ethers');

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-in-production';
const JWT_EXPIRY = process.env.JWT_EXPIRY || '24h';

/**
 * Verify JWT token middleware
 */
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({ error: 'Authentication required' });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(403).json({ error: 'Invalid token' });
    }
}

/**
 * Optional authentication - doesn't fail if no token
 */
function optionalAuth(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            req.user = decoded;
        } catch (error) {
            // Ignore invalid tokens for optional auth
        }
    }
    next();
}

/**
 * Verify wallet signature
 */
function verifySignature(message, signature, expectedAddress) {
    try {
        const recoveredAddress = ethers.verifyMessage(message, signature);
        return recoveredAddress.toLowerCase() === expectedAddress.toLowerCase();
    } catch (error) {
        return false;
    }
}

/**
 * Generate JWT token
 */
function generateToken(walletAddress) {
    return jwt.sign(
        { 
            address: walletAddress.toLowerCase(),
            iat: Math.floor(Date.now() / 1000)
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRY }
    );
}

/**
 * Generate nonce for signing
 */
function generateNonce() {
    return `Sign this message to authenticate with AI Dispute Resolution.\n\nNonce: ${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Admin only middleware
 */
function adminOnly(req, res, next) {
    const adminAddresses = (process.env.ADMIN_ADDRESSES || '').toLowerCase().split(',');
    
    if (!req.user || !adminAddresses.includes(req.user.address.toLowerCase())) {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

module.exports = {
    authenticateToken,
    optionalAuth,
    verifySignature,
    generateToken,
    generateNonce,
    adminOnly,
    JWT_SECRET
};
