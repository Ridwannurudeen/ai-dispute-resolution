const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

const CONTRACT_ADDRESS = '0xad4502F3dEFec74aeCf9Ec46EED4063Ce510E1e7';
const RPC_URL = 'https://sepolia.base.org';

const DISPUTE_ABI = [
    "function getDispute(uint256) view returns (tuple(uint256,address,address,uint256,uint256,uint256,uint256,uint8,uint8,uint8,string,uint8,bool))",
    "function getDisputeCount() view returns (uint256)",
    "function getUserDisputes(address) view returns (uint256[])"
];

const provider = new ethers.JsonRpcProvider(RPC_URL);
const contract = new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_ABI, provider);

app.get('/health', (req, res) => {
    res.json({ status: 'ok', contract: CONTRACT_ADDRESS });
});

app.get('/api/stats', async (req, res) => {
    try {
        const count = await contract.getDisputeCount();
        res.json({ totalDisputes: Number(count) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/disputes', async (req, res) => {
    try {
        const count = await contract.getDisputeCount();
        const disputes = [];
        for (let i = 1; i <= Math.min(Number(count), 20); i++) {
            const d = await contract.getDispute(i);
            disputes.push({ id: i, amount: ethers.formatEther(d[3]), status: Number(d[7]) });
        }
        res.json({ disputes });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log('Backend running on http://localhost:' + PORT));