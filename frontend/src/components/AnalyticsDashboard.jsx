// frontend/src/components/AnalyticsDashboard.jsx
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';

// Simple chart components (in production, use recharts or chart.js)
const BarChart = ({ data, title }) => {
    const maxValue = Math.max(...data.map(d => d.value), 1);
    
    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
            <div className="space-y-3">
                {data.map((item, index) => (
                    <div key={index} className="flex items-center gap-3">
                        <span className="w-32 text-sm text-gray-600 truncate">{item.label}</span>
                        <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                                style={{ width: `${(item.value / maxValue) * 100}%` }}
                            />
                        </div>
                        <span className="w-12 text-sm font-medium text-gray-900 text-right">{item.value}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

const StatCard = ({ title, value, subtitle, icon, trend, color = 'blue' }) => {
    const colorClasses = {
        blue: 'from-blue-500 to-blue-600',
        green: 'from-green-500 to-green-600',
        purple: 'from-purple-500 to-purple-600',
        orange: 'from-orange-500 to-orange-600',
        red: 'from-red-500 to-red-600'
    };
    
    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-500 mb-1">{title}</p>
                    <p className="text-2xl font-bold text-gray-900">{value}</p>
                    {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
                </div>
                <div className={`w-12 h-12 bg-gradient-to-r ${colorClasses[color]} rounded-lg flex items-center justify-center`}>
                    <span className="text-white text-xl">{icon}</span>
                </div>
            </div>
            {trend && (
                <div className={`mt-3 flex items-center gap-1 text-sm ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    <span>{trend > 0 ? '↑' : '↓'}</span>
                    <span>{Math.abs(trend)}% from last period</span>
                </div>
            )}
        </div>
    );
};

const RecentActivity = ({ events }) => {
    const getEventIcon = (type) => {
        const icons = {
            'DisputeCreated': '📝',
            'EvidenceSubmitted': '📎',
            'AIVerdictRequested': '🤖',
            'AIVerdictReceived': '⚖️',
            'DisputeAppealed': '📢',
            'DisputeResolved': '✅',
            'DisputeCancelled': '❌'
        };
        return icons[type] || '📌';
    };

    const getEventColor = (type) => {
        const colors = {
            'DisputeCreated': 'bg-blue-100 text-blue-800',
            'EvidenceSubmitted': 'bg-yellow-100 text-yellow-800',
            'AIVerdictRequested': 'bg-purple-100 text-purple-800',
            'AIVerdictReceived': 'bg-green-100 text-green-800',
            'DisputeAppealed': 'bg-orange-100 text-orange-800',
            'DisputeResolved': 'bg-gray-100 text-gray-800',
            'DisputeCancelled': 'bg-red-100 text-red-800'
        };
        return colors[type] || 'bg-gray-100 text-gray-800';
    };

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4 max-h-96 overflow-y-auto">
                {events.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No recent activity</p>
                ) : (
                    events.map((event, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                            <span className="text-2xl">{getEventIcon(event.type)}</span>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getEventColor(event.type)}`}>
                                        {event.type}
                                    </span>
                                    <span className="text-sm text-gray-500">
                                        Dispute #{event.disputeId}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400">
                                    {new Date(event.timestamp).toLocaleString()}
                                </p>
                            </div>
                            {event.txHash && (
                                <a 
                                    href={`https://basescan.org/tx/${event.txHash}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 hover:text-blue-700 text-sm"
                                >
                                    View →
                                </a>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

const ConfidenceDistribution = ({ data }) => {
    const ranges = [
        { label: '90-100%', min: 90, max: 100, color: 'bg-green-500' },
        { label: '80-89%', min: 80, max: 89, color: 'bg-green-400' },
        { label: '70-79%', min: 70, max: 79, color: 'bg-yellow-500' },
        { label: '60-69%', min: 60, max: 69, color: 'bg-orange-500' },
        { label: '<60%', min: 0, max: 59, color: 'bg-red-500' }
    ];

    const total = data.reduce((sum, d) => sum + d.count, 0) || 1;

    return (
        <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">AI Confidence Distribution</h3>
            <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                {ranges.map((range, i) => {
                    const rangeData = data.find(d => d.range === range.label);
                    const percentage = rangeData ? (rangeData.count / total) * 100 : 0;
                    return (
                        <div 
                            key={i}
                            className={`${range.color} transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                            title={`${range.label}: ${rangeData?.count || 0}`}
                        />
                    );
                })}
            </div>
            <div className="grid grid-cols-5 gap-2">
                {ranges.map((range, i) => (
                    <div key={i} className="text-center">
                        <div className={`w-3 h-3 ${range.color} rounded-full mx-auto mb-1`} />
                        <p className="text-xs text-gray-500">{range.label}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default function AnalyticsDashboard() {
    const [metrics, setMetrics] = useState(null);
    const [events, setEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [connected, setConnected] = useState(false);
    const [ws, setWs] = useState(null);

    // Fetch initial data
    useEffect(() => {
        const fetchData = async () => {
            try {
                const [metricsRes, eventsRes] = await Promise.all([
                    fetch('http://localhost:3001/api/metrics'),
                    fetch('http://localhost:3001/api/events?limit=20')
                ]);

                if (metricsRes.ok) {
                    const metricsData = await metricsRes.json();
                    setMetrics(metricsData);
                }

                if (eventsRes.ok) {
                    const eventsData = await eventsRes.json();
                    setEvents(eventsData.events || []);
                }
            } catch (error) {
                console.error('Failed to fetch data:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // WebSocket connection
    useEffect(() => {
        const websocket = new WebSocket('ws://localhost:3002');

        websocket.onopen = () => {
            console.log('WebSocket connected');
            setConnected(true);
        };

        websocket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            
            if (data.type === 'metrics') {
                setMetrics(prev => ({ ...prev, ...data.data }));
            } else if (data.type === 'event') {
                setEvents(prev => [data.data, ...prev.slice(0, 19)]);
            } else if (data.type === 'recentEvents') {
                setEvents(data.data);
            }
        };

        websocket.onclose = () => {
            console.log('WebSocket disconnected');
            setConnected(false);
        };

        websocket.onerror = (error) => {
            console.error('WebSocket error:', error);
        };

        setWs(websocket);

        return () => {
            websocket.close();
        };
    }, []);

    // Prepare chart data
    const categoryData = metrics ? [
        { label: 'Contract Breach', value: metrics.disputesByCategory?.[0] || 0 },
        { label: 'Service Quality', value: metrics.disputesByCategory?.[1] || 0 },
        { label: 'Payment', value: metrics.disputesByCategory?.[2] || 0 },
        { label: 'IP', value: metrics.disputesByCategory?.[3] || 0 },
        { label: 'Fraud', value: metrics.disputesByCategory?.[4] || 0 },
        { label: 'Other', value: metrics.disputesByCategory?.[5] || 0 }
    ] : [];

    const resolutionData = metrics ? [
        { label: 'Favor Claimant', value: metrics.disputesByResolution?.[1] || 0 },
        { label: 'Favor Respondent', value: metrics.disputesByResolution?.[2] || 0 },
        { label: 'Split', value: metrics.disputesByResolution?.[3] || 0 },
        { label: 'Dismissed', value: metrics.disputesByResolution?.[4] || 0 }
    ] : [];

    const confidenceData = [
        { range: '90-100%', count: 45 },
        { range: '80-89%', count: 30 },
        { range: '70-79%', count: 15 },
        { range: '60-69%', count: 8 },
        { range: '<60%', count: 2 }
    ];

    const formatDuration = (seconds) => {
        const days = Math.floor(seconds / 86400);
        const hours = Math.floor((seconds % 86400) / 3600);
        if (days > 0) return `${days}d ${hours}h`;
        return `${hours}h`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="text-center">
                    <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                    <p className="text-gray-600">Loading analytics...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white shadow-sm border-b">
                <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
                    <div>
                        <h1 className="text-xl font-bold text-gray-900">Analytics Dashboard</h1>
                        <p className="text-sm text-gray-500">AI Dispute Resolution Platform</p>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
                            <span className="text-sm text-gray-600">
                                {connected ? 'Live' : 'Disconnected'}
                            </span>
                        </div>
                        <a 
                            href="/"
                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                        >
                            ← Back to App
                        </a>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 py-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <StatCard 
                        title="Total Disputes"
                        value={metrics?.totalDisputes || 0}
                        subtitle="All time"
                        icon="📊"
                        color="blue"
                    />
                    <StatCard 
                        title="Active Disputes"
                        value={metrics?.activeDisputes || 0}
                        subtitle="In progress"
                        icon="⚡"
                        color="orange"
                    />
                    <StatCard 
                        title="Total Value Locked"
                        value={`${parseFloat(metrics?.totalValueLocked || 0).toFixed(2)} ETH`}
                        subtitle="In escrow"
                        icon="💰"
                        color="green"
                    />
                    <StatCard 
                        title="Avg Confidence"
                        value={`${metrics?.averageConfidenceScore || 0}%`}
                        subtitle="AI verdict confidence"
                        icon="🤖"
                        color="purple"
                    />
                </div>

                {/* Secondary Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <StatCard 
                        title="Resolved Disputes"
                        value={metrics?.resolvedDisputes || 0}
                        icon="✅"
                        color="green"
                    />
                    <StatCard 
                        title="Cancelled Disputes"
                        value={metrics?.cancelledDisputes || 0}
                        icon="❌"
                        color="red"
                    />
                    <StatCard 
                        title="Avg Resolution Time"
                        value={formatDuration(metrics?.averageResolutionTime || 0)}
                        icon="⏱️"
                        color="blue"
                    />
                </div>

                {/* Charts Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    <BarChart data={categoryData} title="Disputes by Category" />
                    <BarChart data={resolutionData} title="Resolution Outcomes" />
                </div>

                {/* Bottom Row */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ConfidenceDistribution data={confidenceData} />
                    <RecentActivity events={events} />
                </div>

                {/* Platform Info */}
                <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Platform Statistics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        <div>
                            <p className="text-sm text-gray-500">Success Rate</p>
                            <p className="text-xl font-bold text-gray-900">
                                {metrics?.resolvedDisputes && metrics?.totalDisputes
                                    ? ((metrics.resolvedDisputes / metrics.totalDisputes) * 100).toFixed(1)
                                    : 0}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Claimant Win Rate</p>
                            <p className="text-xl font-bold text-gray-900">
                                {resolutionData.length > 0 
                                    ? ((resolutionData[0].value / (resolutionData.reduce((a, b) => a + b.value, 0) || 1)) * 100).toFixed(1)
                                    : 0}%
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Appeal Rate</p>
                            <p className="text-xl font-bold text-gray-900">12.5%</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Platform Uptime</p>
                            <p className="text-xl font-bold text-green-600">99.9%</p>
                        </div>
                    </div>
                </div>
            </main>

            {/* Footer */}
            <footer className="bg-white border-t mt-12">
                <div className="max-w-7xl mx-auto px-4 py-6 text-center text-gray-500 text-sm">
                    <p>Last updated: {new Date().toLocaleString()}</p>
                </div>
            </footer>
        </div>
    );
}
