// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import DisputeResolutionDApp from './components/DisputeResolutionDApp';
import AnalyticsDashboard from './components/AnalyticsDashboard';

// Documentation page component
const Documentation = () => {
    return (
        <div className="min-h-screen bg-gray-50">
            <div className="max-w-4xl mx-auto px-4 py-12">
                <h1 className="text-3xl font-bold text-gray-900 mb-8">Documentation</h1>
                
                <div className="space-y-8">
                    <section className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">🚀 Getting Started</h2>
                        <ol className="list-decimal list-inside space-y-2 text-gray-600">
                            <li>Connect your wallet (MetaMask recommended)</li>
                            <li>Switch to Base network</li>
                            <li>Create a new dispute or respond to an existing one</li>
                            <li>Submit evidence during the evidence period</li>
                            <li>Wait for the AI verdict</li>
                            <li>Appeal if necessary, or finalize the dispute</li>
                        </ol>
                    </section>

                    <section className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">📋 Dispute Lifecycle</h2>
                        <div className="space-y-3">
                            {[
                                { step: 1, title: 'Created', desc: 'Claimant creates dispute with initial stake', color: 'blue' },
                                { step: 2, title: 'Evidence Submission', desc: 'Both parties submit evidence (3 day period)', color: 'yellow' },
                                { step: 3, title: 'AI Analysis', desc: 'GenLayer AI analyzes dispute and evidence', color: 'purple' },
                                { step: 4, title: 'Verdict Delivered', desc: 'AI verdict with confidence score', color: 'green' },
                                { step: 5, title: 'Appeal Period', desc: '2 days to appeal with 10% stake', color: 'orange' },
                                { step: 6, title: 'Resolved', desc: 'Funds distributed based on verdict', color: 'gray' }
                            ].map(({ step, title, desc, color }) => (
                                <div key={step} className="flex items-start gap-4">
                                    <div className={`w-8 h-8 bg-${color}-100 rounded-full flex items-center justify-center text-${color}-600 font-bold shrink-0`}>{step}</div>
                                    <div>
                                        <h3 className="font-medium text-gray-900">{title}</h3>
                                        <p className="text-gray-600 text-sm">{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    <section className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">💰 Fees & Limits</h2>
                        <table className="w-full text-left">
                            <tbody className="text-gray-900">
                                {[
                                    ['Platform Fee', '2.5% of total pool'],
                                    ['Appeal Stake', '10% of total pool'],
                                    ['Minimum Dispute', '0.001 ETH'],
                                    ['Maximum Dispute', '1,000 ETH'],
                                    ['Evidence Period', '3 days'],
                                    ['Appeal Period', '2 days']
                                ].map(([item, value], i) => (
                                    <tr key={i} className="border-b last:border-0">
                                        <td className="py-3">{item}</td>
                                        <td className="py-3 text-gray-600">{value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </section>

                    <section className="bg-white rounded-xl shadow-sm p-6">
                        <h2 className="text-xl font-semibold text-gray-900 mb-4">❓ FAQ</h2>
                        <div className="space-y-4">
                            {[
                                { q: 'How does the AI make decisions?', a: 'The AI analyzes all submitted evidence, the dispute description, and category to reach a fair decision through GenLayer consensus.' },
                                { q: 'What happens if I disagree with the verdict?', a: 'You have 2 days to appeal by staking an additional 10% of the total pool.' },
                                { q: 'How long does resolution take?', a: 'Typical resolution takes 5-7 days: 3 days evidence period, AI analysis, and 2 days appeal period.' }
                            ].map(({ q, a }, i) => (
                                <details key={i} className="group">
                                    <summary className="cursor-pointer font-medium text-gray-900">{q}</summary>
                                    <p className="mt-2 text-gray-600 text-sm pl-4">{a}</p>
                                </details>
                            ))}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<DisputeResolutionDApp />} />
                <Route path="/analytics" element={<AnalyticsDashboard />} />
                <Route path="/docs" element={<Documentation />} />
            </Routes>
        </Router>
    );
}

export default App;
