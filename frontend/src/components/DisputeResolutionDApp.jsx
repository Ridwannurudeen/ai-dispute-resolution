// frontend/src/components/DisputeResolutionDApp.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';

/* ===================== CONTRACT ABI ===================== */
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
    "function getAIVerdict(uint256) view returns (tuple(uint8,uint8,string,uint256,bytes32))"
];

const CONTRACT_ADDRESS =
    import.meta.env.VITE_CONTRACT_ADDRESS ||
    '0xad4502F3dEFec74aeCf9Ec46EED4063Ce510E1e7';

/* ===================== CONSTANTS ===================== */
const CATEGORIES = [
    'Contract Breach',
    'Service Quality',
    'Payment Dispute',
    'Intellectual Property',
    'Fraud Claim',
    'Other'
];

const STATUS_NAMES = [
    'Created',
    'Evidence',
    'Awaiting AI',
    'Verdict',
    'Appeal',
    'Resolved',
    'Cancelled'
];

const RESOLUTION_NAMES = [
    'Pending',
    'Favor Claimant',
    'Favor Respondent',
    'Split',
    'Dismissed'
];

const EVIDENCE_TYPES = [
    'Document',
    'Image',
    'Video',
    'Contract',
    'Communication',
    'Transaction',
    'Other'
];

/* ===================== HELPERS ===================== */
const formatAddress = (addr) =>
    addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';

/* ===================== MAIN COMPONENT ===================== */
export default function DisputeResolutionDApp() {
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);

    const [account, setAccount] = useState('');
    const [isConnected, setIsConnected] = useState(false);
    const [loading, setLoading] = useState(false);

    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [disputes, setDisputes] = useState([]);
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [activeTab, setActiveTab] = useState('list');

    const [newDispute, setNewDispute] = useState({
        respondent: '',
        category: 0,
        amount: '',
        description: ''
    });

    const [newEvidence, setNewEvidence] = useState({
        contentHash: '',
        evidenceType: 0
    });

    /* ===================== WALLET ===================== */
    const connectWallet = async () => {
        try {
            if (!window.ethereum) throw new Error('MetaMask required');

            setLoading(true);
            const p = new ethers.BrowserProvider(window.ethereum);
            const [addr] = await p.send('eth_requestAccounts', []);
            const s = await p.getSigner();

            setProvider(p);
            setSigner(s);
            setContract(new ethers.Contract(CONTRACT_ADDRESS, DISPUTE_ABI, s));
            setAccount(addr);
            setIsConnected(true);
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

    /* ===================== LOAD DISPUTES ===================== */
    const loadDisputes = useCallback(async () => {
        if (!contract || !account) return;

        try {
            setLoading(true);

            const ids = await contract.getUserDisputes(account);

            const loaded = await Promise.all(
                ids.map(async (id) => {
                    const d = await contract.getDispute(id);
                    const evidence = await contract.getDisputeEvidence(id);

                    let aiVerdict = null;
                    if (Number(d[7]) >= 3) {
                        try {
                            const v = await contract.getAIVerdict(id);
                            aiVerdict = {
                                decision: Number(v[0]),
                                confidenceScore: Number(v[1]),
                                reasoningHash: v[2],
                                timestamp: Number(v[3])
                            };
                        } catch {}
                    }

                    return {
                        id: id.toString(),
                        claimant: d[1],
                        respondent: d[2],
                        amount: d[3],
                        createdAt: Number(d[4]),
                        status: Number(d[7]),
                        resolution: Number(d[8]),
                        category: Number(d[9]),
                        evidence: evidence.map(e => ({
                            submitter: e[0],
                            contentHash: e[1],
                            timestamp: Number(e[2]),
                            evidenceType: Number(e[3])
                        })),
                        aiVerdict
                    };
                })
            );

            setDisputes(loaded.reverse());
        } catch (e) {
            setError('Failed to load disputes');
        } finally {
            setLoading(false);
        }
    }, [contract, account]);

    /* ===================== ACTIONS ===================== */
    const createDispute = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);

            const hash = 'Qm' + btoa(newDispute.description).slice(0, 44);
            const tx = await contract.createDispute(
                newDispute.respondent,
                newDispute.category,
                hash,
                { value: ethers.parseEther(newDispute.amount) }
            );

            await tx.wait();
            setActiveTab('list');
            setNewDispute({ respondent: '', category: 0, amount: '', description: '' });
            await loadDisputes();
        } catch (e) {
            setError(e.reason || e.message);
        } finally {
            setLoading(false);
        }
    };

    const submitEvidence = async (e) => {
        e.preventDefault();
        try {
            setLoading(true);

            const tx = await contract.submitEvidence(
                BigInt(selectedDispute.id),
                newEvidence.contentHash,
                newEvidence.evidenceType
            );

            await tx.wait();
            setNewEvidence({ contentHash: '', evidenceType: 0 });
            await loadDisputes();
        } catch (e) {
            setError(e.reason || e.message);
        } finally {
            setLoading(false);
        }
    };

    const requestVerdict = async () => {
        try {
            setLoading(true);

            const tx = await contract.requestAIVerdict(
                BigInt(selectedDispute.id)
            );

            await tx.wait();
            await loadDisputes();

            const updated = await contract.getDispute(selectedDispute.id);
            setSelectedDispute(prev => ({
                ...prev,
                status: Number(updated[7])
            }));
        } catch (e) {
            setError(e.reason || e.message);
        } finally {
            setLoading(false);
        }
    };

    const finalizeDispute = async () => {
        try {
            setLoading(true);
            const tx = await contract.finalizeDispute(BigInt(selectedDispute.id));
            await tx.wait();
            await loadDisputes();
        } catch (e) {
            setError(e.reason || e.message);
        } finally {
            setLoading(false);
        }
    };

    /* ===================== EFFECTS ===================== */
    useEffect(() => {
        if (isConnected) loadDisputes();
    }, [isConnected, loadDisputes]);

    /* ===================== RENDER ===================== */
    return (
        <div className="min-h-screen bg-gray-50">
            <header className="bg-white border-b p-4 flex justify-between">
                <h1 className="font-bold">⚖️ AI Dispute Resolution</h1>
                {isConnected ? (
                    <button onClick={disconnectWallet}>Disconnect</button>
                ) : (
                    <button onClick={connectWallet}>Connect Wallet</button>
                )}
            </header>

            <main className="max-w-6xl mx-auto p-6 grid grid-cols-3 gap-6">
                <div className="col-span-1 bg-white p-4 rounded">
                    <button onClick={() => setActiveTab('list')}>My Disputes</button>
                    <button onClick={() => setActiveTab('create')}>Create</button>

                    {activeTab === 'list' &&
                        disputes.map(d => (
                            <button
                                key={d.id}
                                onClick={() => setSelectedDispute(d)}
                                className="block w-full text-left border p-3 mt-2"
                            >
                                Dispute #{d.id} — {STATUS_NAMES[d.status]}
                            </button>
                        ))}

                    {activeTab === 'create' && (
                        <form onSubmit={createDispute}>
                            <input placeholder="Respondent" onChange={e => setNewDispute({...newDispute, respondent: e.target.value})} />
                            <input placeholder="Amount" onChange={e => setNewDispute({...newDispute, amount: e.target.value})} />
                            <textarea placeholder="Description" onChange={e => setNewDispute({...newDispute, description: e.target.value})} />
                            <button>Create</button>
                        </form>
                    )}
                </div>

                <div className="col-span-2 bg-white p-6 rounded">
                    {selectedDispute && (
                        <>
                            <h2>Dispute #{selectedDispute.id}</h2>

                            <p>Status: {STATUS_NAMES[selectedDispute.status]}</p>

                            {selectedDispute.status === 1 && (
                                <button
                                    onClick={requestVerdict}
                                    className="bg-purple-600 text-white px-4 py-2 mt-4"
                                >
                                    Request AI Verdict
                                </button>
                            )}

                            {(selectedDispute.status === 3 || selectedDispute.status === 4) && (
                                <button
                                    onClick={finalizeDispute}
                                    className="bg-green-600 text-white px-4 py-2 mt-4"
                                >
                                    Finalize
                                </button>
                            )}
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
