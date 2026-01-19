const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Get disputes (mock data for now)
app.get('/api/disputes', (req, res) => {
    res.json({ disputes: [], total: 0 });
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════╗
║   Backend API Running on Port ${PORT}   ║
╚═══════════════════════════════════════╝
    `);
});