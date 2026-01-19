// frontend/src/components/DisputeResolutionDApp.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

// ===================== CONTRACT ABI =====================
const DISPUTE_ABI = [
    "function createDispute(address,uint8,string) payable returns (uint256)",
    "function acceptDispute(uint256) payable",
    "function submitEvidence(uint256,string,uint8)",
    "function requestAIVerdict(uint256)",
    "function appealVerdict(uint256) payable",
    "function finalizeDispute(uint256)",
    "function cancelDispute(uint256)",
    "function getDispute(uint256) view returns (tuple(uint256,address,address,uint256,uint256,uint256,uint256,uint8,uint8,uint8,string,uint8,bool))",
    "function getDisputeEvidence(uint256) view returns (tuple(address,string,uint256,uint8)[])",
    "function getUserDisputes(address) view returns (uint256[])",
    "function getAIVerdict(uint256) view returns (tuple(uint8,uint8,string,uint256,bytes32))",
    "function getDisputeCount() view returns (uint256)"
];

const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || '0xad4502F3dEFec74aeCf9Ec46EED4063Ce510E1e7';

// ===================== CONSTANTS =====================
const CATEGORIES = ['Contract Breach', 'Service Quality', 'Payment Dispute', 'Intellectual Property', 'Fraud Claim', 'Other'];
const STATUS_NAMES = ['Created', 'Evidence', 'Awaiting AI', 'Verdict', 'Appeal', 'Resolved', 'Cancelled'];
const RESOLUTION_NAMES = ['Pending', 'Favor Claimant', 'Favor Respondent', 'Split', 'Dismissed'];
const EVIDENCE_TYPES = ['Document', 'Image', 'Video', 'Contract', 'Communication', 'Transaction', 'Other'];

// ===================== UI HELPERS =====================
const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

const StatusBadge = ({ status }) => {
    const colors = {
        0: 'bg-yellow-100 text-yellow-800',
        1: 'bg-blue-100 text-blue-800',
        2: 'bg-purple-100 text-purple-800',
        3: 'bg-indigo-100 text-indigo-800',
        4: 'bg-orange-100 text-orange-800',
        5: 'bg-green-100 text-green-800',
        6: 'bg-gray-100 text-gray-800'
    };
    return (
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-100'}`}>
            {STATUS_NAMES[status] ?? 'Unknown'}
        </span>
    );
};

const ResolutionBadge = ({ resolution }) => {
    const colors = {
        0: 'bg-gray-100 text-gray-800',
        1: 'bg-green-100 text-green-800',
        2: 'bg-red-100 text-red-800',
        3: 'bg-yellow-100 text-yellow-800',
        4: 'bg-gray-100 text-gray-800'
    };
    return (
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[resolution] || 'bg-gray-100'}`}>
            {RESOLUTION_NAMES[resolution] ?? 'Unknown'}
        </span>
    );
};

// ===================== MAIN COMPONENT =====================
export default function DisputeResolutionDApp() {
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [account, setAccount] = useState('');
    const [chainId, setChainId] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [disputes, setDisputes] = useState([]);
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [activeTab, setActiveTab] = useState('list');
    
    // Form states
    const [newDispute, setNewDispute] = useState({ respondent: '', category: 0, amount: '', description: '' });
    const [newEvidence, setNewEvidence] = useState({ contentHash: '', evidenceType: 0 });

    // ===================== WALLET =====================
    const connectWallet = async () => {
        try {
            if (!window.ethereum) throw new Error("MetaMask required");
            setLoading(true);
            setError('');

            const p = new ethers.BrowserProvider(window.ethereum);
            const accounts = await p.send("eth_requestAccounts", []);
            const s = await p.getSigner();
            const network = await p.getNetwork();

            setProvider(p);
            setSigner(s);
            setContract(new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_ABI, s));
            setAccount(accounts[0]);
            setChainId(Number(network.chainId));
            setIsConnected(true);
            setSuccess("Wallet connected!");
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const disconnectWallet = () => {
        setProvider(null);
        setSigner(null);
        setContract(null);
        setAccount('');
        setIsConnected(false);
        setDisputes([]);
        setSelectedDispute(null);
    };

    // ===================== LOAD DISPUTES =====================
    const loadDisputes = useCallback(async () => {
        if (!contract || !account) return;

        try {
            setLoading(true);
            setError('');

            const ids = await contract.getUserDisputes(account);
            console.log("Dispute IDs:", ids);

            const results = await Promise.all(
                ids.map(async (id) => {
                    try {
                        const d = await contract.getDispute(id);
                        console.log("Raw dispute", id.toString(), d);
                        
                        let evidence = [];
                        try {
                            evidence = await contract.getDisputeEvidence(id);
                        } catch (e) {
                            console.log("No evidence for", id.toString());
                        }

                        let aiVerdict = null;
                        const status = Number(d[7]); // status is at index 7
                        if (status >= 3) {
                            try {
                                aiVerdict = await contract.getAIVerdict(id);
                            } catch (e) {
                                console.log("No verdict for", id.toString());
                            }
                        }

                        return {
                            id: id.toString(),
                            claimant: d[1],
                            respondent: d[2],
                            amount: d[3],
                            createdAt: Number(d[4]),
                            evidenceDeadline: Number(d[5]),
                            appealDeadline: Number(d[6]),
                            status: Number(d[7]),
                            resolution: Number(d[8]),
                            category: Number(d[9]),
                            descriptionHash: d[10],
                            aiConfidenceScore: Number(d[11]),
                            appealed: d[12],
                            evidence: evidence.map(e => ({
                                submitter: e[0],
                                contentHash: e[1],
                                timestamp: Number(e[2]),
                                evidenceType: Number(e[3])
                            })),
                            aiVerdict: aiVerdict ? {
                                decision: Number(aiVerdict[0]),
                                confidenceScore: Number(aiVerdict[1]),
                                reasoningHash: aiVerdict[2],
                                timestamp: Number(aiVerdict[3])
                            } : null
                        };
                    } catch (e) {
                        console.error("Error loading dispute", id.toString(), e);
                        return null;
                    }
                })
            );

            const validResults = results.filter(r => r !== null);
            console.log("Loaded disputes:", validResults);
            setDisputes(validResults.reverse());
        } catch (e) {
            console.error("Load disputes error:", e);
            setError("Failed to load disputes");
        } finally {
            setLoading(false);
        }
    }, [contract, account]);

    // ===================== ACTIONS =====================
    const createDispute = async (e) => {
        e.preventDefault();
        if (!contract) return;
        
        try {
            setLoading(true);
            setError('');
            
            const descriptionHash = 'Qm' + btoa(newDispute.description).slice(0, 44);
            const tx = await contract.createDispute(
                newDispute.respondent,
                newDispute.category,
                descriptionHash,
                { value: ethers.parseEther(newDispute.amount) }
            );
            
            setSuccess('Transaction submitted...');
            await tx.wait();
            setSuccess('Dispute created successfully!');
            setNewDispute({ respondent: '', category: 0, amount: '', description: '' });
            setActiveTab('list');
            await loadDisputes();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    const acceptDispute = async (disputeId, amount) => {
        if (!contract) return;
        
        try {
            setLoading(true);
            setError('');
            
            const tx = await contract.acceptDispute(disputeId, { value: amount });
            setSuccess('Accepting dispute...');
            await tx.wait();
            setSuccess('Dispute accepted!');
            await loadDisputes();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    const submitEvidence = async (e) => {
        e.preventDefault();
        if (!contract || !selectedDispute) return;
        
        try {
            setLoading(true);
            setError('');
            
            const tx = await contract.submitEvidence(
                selectedDispute.id,
                newEvidence.contentHash,
                newEvidence.evidenceType
            );
            setSuccess('Submitting evidence...');
            await tx.wait();
            setSuccess('Evidence submitted!');
            setNewEvidence({ contentHash: '', evidenceType: 0 });
            await loadDisputes();
            
            // Update selected dispute
            const updated = await contract.getDispute(selectedDispute.id);
            setSelectedDispute(prev => ({ ...prev, status: Number(updated[7]) }));
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    const requestVerdict = async () => {
        if (!contract || !selectedDispute) return;
        
        try {
            setLoading(true);
            setError('');
            
            const tx = await contract.requestAIVerdict(selectedDispute.id);
            setSuccess('Requesting AI verdict...');
            await tx.wait();
            setSuccess('Verdict requested!');
            await loadDisputes();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    const finalizeDispute = async () => {
        if (!contract || !selectedDispute) return;
        
        try {
            setLoading(true);
            setError('');
            
            const tx = await contract.finalizeDispute(selectedDispute.id);
            setSuccess('Finalizing dispute...');
            await tx.wait();
            setSuccess('Dispute finalized!');
            await loadDisputes();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    const cancelDispute = async () => {
        if (!contract || !selectedDispute) return;
        
        try {
            setLoading(true);
            setError('');
            
            const tx = await contract.cancelDispute(selectedDispute.id);
            setSuccess('Cancelling dispute...');
            await tx.wait();
            setSuccess('Dispute cancelled!');
            setSelectedDispute(null);
            await loadDisputes();
            
            setTimeout(() => setSuccess(''), 3000);
        } catch (err) {
            setError(err.reason || err.message);
        } finally {
            setLoading(false);
        }
    };

    // ===================== EFFECTS =====================
    useEffect(() => {
        if (isConnected) loadDisputes();
    }, [isConnected, loadDisputes]);

    useEffect(() => {
        if (window.ethereum) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    disconnectWallet();
                } else {
                    setAccount(accounts[0]);
                }
            });
            window.ethereum.on('chainChanged', () => window.location.reload());
        }
    }, []);

    // ===================== RENDER =====================
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-bold text-gray-900">⚖️ AI Dispute Resolution</h1>
                        <p className="text-sm text-gray-500">Powered by GenLayer on Base</p>
                    </div>
                    
                    {isConnected ? (
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="font-mono text-sm">{formatAddress(account)}</p>
                                <p className="text-xs text-gray-500">Base Sepolia</p>
                            </div>
                            <button
                                onClick={disconnectWallet}
                                className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg"
                            >
                                Disconnect
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={connectWallet}
                            disabled={loading}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                            {loading ? 'Connecting...' : 'Connect Wallet'}
                        </button>
                    )}
                </div>
            </header>

            {/* Alerts */}
            {error && (
                <div className="max-w-7xl mx-auto px-4 mt-4">
                    <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex justify-between">
                        <span>{error}</span>
                        <button onClick={() => setError('')}>✕</button>
                    </div>
                </div>
            )}
            {success && (
                <div className="max-w-7xl mx-auto px-4 mt-4">
                    <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                        {success}
                    </div>
                </div>
            )}

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 py-8">
                {!isConnected ? (
                    <div className="text-center py-20">
                        <div className="text-6xl mb-4">⚖️</div>
                        <h2 className="text-2xl font-bold mb-2">AI-Powered Dispute Resolution</h2>
                        <p className="text-gray-500 mb-6">Connect your wallet to get started</p>
                        <button
                            onClick={connectWallet}
                            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                            Connect Wallet
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Left Panel - Dispute List */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-xl shadow-sm p-4">
                                {/* Tabs */}
                                <div className="flex gap-2 mb-4">
                                    <button
                                        onClick={() => setActiveTab('list')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                                            activeTab === 'list' 
                                                ? 'bg-blue-600 text-white' 
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        My Disputes
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('create')}
                                        className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                                            activeTab === 'create' 
                                                ? 'bg-blue-600 text-white' 
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        Create New
                                    </button>
                                </div>

                                {activeTab === 'list' ? (
                                    <>
                                        <div className="flex justify-between items-center mb-4">
                                            <h2 className="font-semibold">My Disputes</h2>
                                            <button
                                                onClick={loadDisputes}
                                                disabled={loading}
                                                className="text-sm text-blue-600 hover:text-blue-700"
                                            >
                                                {loading ? 'Loading...' : 'Refresh'}
                                            </button>
                                        </div>

                                        {disputes.length === 0 ? (
                                            <p className="text-gray-500 text-center py-8">No disputes found</p>
                                        ) : (
                                            <div className="space-y-2">
                                                {disputes.map(d => (
                                                    <button
                                                        key={d.id}
                                                        onClick={() => setSelectedDispute(d)}
                                                        className={`w-full text-left p-4 rounded-lg border transition ${
                                                            selectedDispute?.id === d.id
                                                                ? 'border-blue-500 bg-blue-50'
                                                                : 'border-gray-200 hover:border-gray-300'
                                                        }`}
                                                    >
                                                        <div className="flex justify-between items-start mb-2">
                                                            <span className="font-medium">Dispute #{d.id}</span>
                                                            <StatusBadge status={d.status} />
                                                        </div>
                                                        <div className="text-sm text-gray-500">
                                                            {ethers.formatEther(d.amount)} ETH
                                                        </div>
                                                        <div className="text-xs text-gray-400 mt-1">
                                                            {CATEGORIES[d.category]}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    /* Create Form */
                                    <form onSubmit={createDispute} className="space-y-4">
                                        <h2 className="font-semibold mb-4">Create New Dispute</h2>
                                        
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Respondent Address
                                            </label>
                                            <input
                                                type="text"
                                                value={newDispute.respondent}
                                                onChange={(e) => setNewDispute({ ...newDispute, respondent: e.target.value })}
                                                placeholder="0x..."
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Amount (ETH)
                                            </label>
                                            <input
                                                type="text"
                                                value={newDispute.amount}
                                                onChange={(e) => setNewDispute({ ...newDispute, amount: e.target.value })}
                                                placeholder="0.01"
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Category
                                            </label>
                                            <select
                                                value={newDispute.category}
                                                onChange={(e) => setNewDispute({ ...newDispute, category: parseInt(e.target.value) })}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                            >
                                                {CATEGORIES.map((cat, i) => (
                                                    <option key={i} value={i}>{cat}</option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                                Description
                                            </label>
                                            <textarea
                                                value={newDispute.description}
                                                onChange={(e) => setNewDispute({ ...newDispute, description: e.target.value })}
                                                placeholder="Describe the dispute..."
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                                                required
                                            />
                                        </div>

                                        <button
                                            type="submit"
                                            disabled={loading}
                                            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        >
                                            {loading ? 'Creating...' : 'Create Dispute'}
                                        </button>
                                    </form>
                                )}
                            </div>
                        </div>

                        {/* Right Panel - Dispute Details */}
                        <div className="lg:col-span-2">
                            {selectedDispute ? (
                                <div className="bg-white rounded-xl shadow-sm p-6">
                                    <div className="flex justify-between items-start mb-6">
                                        <div>
                                            <h2 className="text-2xl font-bold">Dispute #{selectedDispute.id}</h2>
                                            <p className="text-gray-500">{CATEGORIES[selectedDispute.category]}</p>
                                        </div>
                                        <div className="flex gap-2">
                                            <StatusBadge status={selectedDispute.status} />
                                            {selectedDispute.status >= 3 && (
                                                <ResolutionBadge resolution={selectedDispute.resolution} />
                                            )}
                                        </div>
                                    </div>

                                    {/* Dispute Info */}
                                    <div className="grid grid-cols-2 gap-4 mb-6">
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-500">Amount at Stake</p>
                                            <p className="text-xl font-bold">{ethers.formatEther(selectedDispute.amount)} ETH</p>
                                        </div>
                                        <div className="p-4 bg-gray-50 rounded-lg">
                                            <p className="text-sm text-gray-500">Total Pool</p>
                                            <p className="text-xl font-bold">
                                                {selectedDispute.status >= 1 
                                                    ? `${ethers.formatEther(selectedDispute.amount * 2n)} ETH`
                                                    : 'Waiting for respondent'
                                                }
                                            </p>
                                        </div>
                                    </div>

                                    {/* Parties */}
                                    <div className="mb-6">
                                        <h3 className="font-semibold mb-3">Parties</h3>
                                        <div className="space-y-2">
                                            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                                                <span className="text-gray-600">Claimant</span>
                                                <span className="font-mono text-sm">
                                                    {formatAddress(selectedDispute.claimant)}
                                                    {selectedDispute.claimant.toLowerCase() === account.toLowerCase() && (
                                                        <span className="ml-2 text-blue-600">(You)</span>
                                                    )}
                                                </span>
                                            </div>
                                            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                                                <span className="text-gray-600">Respondent</span>
                                                <span className="font-mono text-sm">
                                                    {formatAddress(selectedDispute.respondent)}
                                                    {selectedDispute.respondent.toLowerCase() === account.toLowerCase() && (
                                                        <span className="ml-2 text-blue-600">(You)</span>
                                                    )}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* AI Verdict */}
                                    {selectedDispute.aiVerdict && (
                                        <div className="mb-6 p-4 bg-purple-50 rounded-lg border border-purple-200">
                                            <h3 className="font-semibold mb-3 flex items-center gap-2">
                                                <span>🤖</span> AI Verdict
                                            </h3>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div>
                                                    <p className="text-sm text-gray-600">Decision</p>
                                                    <p className="font-medium">{RESOLUTION_NAMES[selectedDispute.aiVerdict.decision]}</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm text-gray-600">Confidence</p>
                                                    <p className="font-medium">{selectedDispute.aiVerdict.confidenceScore}%</p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Evidence */}
                                    <div className="mb-6">
                                        <h3 className="font-semibold mb-3">Evidence ({selectedDispute.evidence?.length || 0})</h3>
                                        {selectedDispute.evidence?.length > 0 ? (
                                            <div className="space-y-2">
                                                {selectedDispute.evidence.map((e, i) => (
                                                    <div key={i} className="p-3 bg-gray-50 rounded-lg">
                                                        <div className="flex justify-between">
                                                            <span className="font-medium">{EVIDENCE_TYPES[e.evidenceType]}</span>
                                                            <span className="text-sm text-gray-500">
                                                                {formatAddress(e.submitter)}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs font-mono text-gray-400 mt-1">{e.contentHash}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-gray-500">No evidence submitted yet</p>
                                        )}

                                        {/* Submit Evidence Form */}
                                        {(selectedDispute.status === 0 || selectedDispute.status === 1) && (
                                            <form onSubmit={submitEvidence} className="mt-4 p-4 border rounded-lg">
                                                <h4 className="font-medium mb-3">Submit Evidence</h4>
                                                <div className="grid grid-cols-2 gap-3">
                                                    <input
                                                        type="text"
                                                        value={newEvidence.contentHash}
                                                        onChange={(e) => setNewEvidence({ ...newEvidence, contentHash: e.target.value })}
                                                        placeholder="IPFS Hash (Qm...)"
                                                        className="px-3 py-2 border rounded-lg"
                                                        required
                                                    />
                                                    <select
                                                        value={newEvidence.evidenceType}
                                                        onChange={(e) => setNewEvidence({ ...newEvidence, evidenceType: parseInt(e.target.value) })}
                                                        className="px-3 py-2 border rounded-lg"
                                                    >
                                                        {EVIDENCE_TYPES.map((type, i) => (
                                                            <option key={i} value={i}>{type}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <button
                                                    type="submit"
                                                    disabled={loading}
                                                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                                >
                                                    Submit Evidence
                                                </button>
                                            </form>
                                        )}
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex gap-3 flex-wrap">
                                        {/* Accept - for respondent when status is Created */}
                                        {selectedDispute.status === 0 && 
                                         selectedDispute.respondent.toLowerCase() === account.toLowerCase() && (
                                            <button
                                                onClick={() => acceptDispute(selectedDispute.id, selectedDispute.amount)}
                                                disabled={loading}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                            >
                                                Accept Dispute ({ethers.formatEther(selectedDispute.amount)} ETH)
                                            </button>
                                        )}

                                        {/* Request Verdict - when in Evidence phase */}
                                        {selectedDispute.status === 1 && (
                                            <button
                                                onClick={requestVerdict}
                                                disabled={loading}
                                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                                            >
                                                Request AI Verdict
                                            </button>
                                        )}

                                        {/* Finalize - when verdict delivered and appeal period passed */}
                                        {(selectedDispute.status === 3 || selectedDispute.status === 4) && (
                                            <button
                                                onClick={finalizeDispute}
                                                disabled={loading}
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                            >
                                                Finalize Dispute
                                            </button>
                                        )}

                                        {/* Cancel - for claimant when status is Created */}
                                        {selectedDispute.status === 0 && 
                                         selectedDispute.claimant.toLowerCase() === account.toLowerCase() && (
                                            <button
                                                onClick={cancelDispute}
                                                disabled={loading}
                                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                                            >
                                                Cancel Dispute
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm p-12 text-center">
                                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <span className="text-3xl">⚖️</span>
                                    </div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Dispute</h3>
                                    <p className="text-gray-500">Choose a dispute from the list to view details.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-12">
                <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
                    AI-Verified Dispute Resolution • Built on Base L2 with GenLayer
                </div>
            </footer>
        </div>
    );
}
