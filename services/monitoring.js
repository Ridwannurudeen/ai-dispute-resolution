// services/monitoring.js
/**
 * Monitoring and Analytics Service
 * Tracks dispute metrics, AI performance, and system health
 */

const { ethers } = require('ethers');
const winston = require('winston');
const express = require('express');
const WebSocket = require('ws');

// Configure logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

// Contract ABIs
const DISPUTE_ABI = [
    "event DisputeCreated(uint256 indexed disputeId, address indexed claimant, address indexed respondent, uint256 amount, uint8 category)",
    "event EvidenceSubmitted(uint256 indexed disputeId, address indexed submitter, string contentHash, uint8 evidenceType)",
    "event AIVerdictRequested(uint256 indexed disputeId, bytes32 indexed genLayerRequestId)",
    "event AIVerdictReceived(uint256 indexed disputeId, uint8 resolution, uint8 confidenceScore)",
    "event DisputeAppealed(uint256 indexed disputeId, address indexed appealer, uint256 stakeAmount)",
    "event DisputeResolved(uint256 indexed disputeId, uint8 resolution, uint256 claimantPayout, uint256 respondentPayout)",
    "event DisputeCancelled(uint256 indexed disputeId)",
    "function getDisputeCount() external view returns (uint256)",
    "function getDispute(uint256 _disputeId) external view returns (tuple(uint256 id, address claimant, address respondent, uint256 amount, uint256 createdAt, uint256 evidenceDeadline, uint256 appealDeadline, uint8 status, uint8 resolution, uint8 category, string descriptionHash, uint8 aiConfidenceScore, bool appealed))"
];

class MonitoringService {
    constructor(config) {
        this.config = {
            rpcUrl: config.rpcUrl || process.env.BASE_RPC_URL,
            contractAddress: config.contractAddress || process.env.DISPUTE_CONTRACT_ADDRESS,
            httpPort: config.httpPort || 3001,
            wsPort: config.wsPort || 3002,
            metricsInterval: config.metricsInterval || 60000, // 1 minute
        };

        this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
        this.contract = new ethers.Contract(
            this.config.contractAddress,
            DISPUTE_ABI,
            this.provider
        );

        // Metrics storage
        this.metrics = {
            totalDisputes: 0,
            activeDisputes: 0,
            resolvedDisputes: 0,
            cancelledDisputes: 0,
            totalValueLocked: 0n,
            totalVolumeProcessed: 0n,
            averageResolutionTime: 0,
            averageConfidenceScore: 0,
            disputesByCategory: {},
            disputesByResolution: {},
            recentDisputes: [],
            hourlyStats: [],
            dailyStats: [],
        };

        // Real-time events
        this.recentEvents = [];
        this.wsClients = new Set();

        // Alert thresholds
        this.alertThresholds = {
            lowConfidence: 60,
            highValueDispute: ethers.parseEther("10"),
            longResolutionTime: 7 * 24 * 60 * 60, // 7 days
        };
    }

    /**
     * Start the monitoring service
     */
    async start() {
        logger.info('🚀 Starting Monitoring Service...');

        // Initial metrics collection
        await this.collectMetrics();

        // Start event listeners
        this.startEventListeners();

        // Start HTTP API server
        this.startHttpServer();

        // Start WebSocket server
        this.startWebSocketServer();

        // Start periodic metrics collection
        this.startMetricsCollection();

        logger.info('✅ Monitoring Service started');
        logger.info(`   HTTP API: http://localhost:${this.config.httpPort}`);
        logger.info(`   WebSocket: ws://localhost:${this.config.wsPort}`);
    }

    /**
     * Collect current metrics from blockchain
     */
    async collectMetrics() {
        try {
            logger.debug('Collecting metrics...');

            const disputeCount = await this.contract.getDisputeCount();
            this.metrics.totalDisputes = Number(disputeCount);

            let activeCount = 0;
            let resolvedCount = 0;
            let cancelledCount = 0;
            let totalValue = 0n;
            let totalConfidence = 0;
            let confidenceCount = 0;
            let totalResolutionTime = 0;
            let resolutionCount = 0;
            const categoryCount = {};
            const resolutionTypeCount = {};

            // Collect data from recent disputes (last 1000 or all)
            const startId = Math.max(1, this.metrics.totalDisputes - 1000);
            
            for (let i = startId; i <= this.metrics.totalDisputes; i++) {
                try {
                    const dispute = await this.contract.getDispute(i);
                    
                    // Count by status
                    const status = Number(dispute.status);
                    if (status < 5) {
                        activeCount++;
                        totalValue += dispute.amount * 2n;
                    } else if (status === 5) {
                        resolvedCount++;
                        
                        // Calculate resolution time
                        if (dispute.appealDeadline > 0) {
                            const resolutionTime = Number(dispute.appealDeadline) - Number(dispute.createdAt);
                            totalResolutionTime += resolutionTime;
                            resolutionCount++;
                        }
                    } else if (status === 6) {
                        cancelledCount++;
                    }

                    // Count by category
                    const category = Number(dispute.category);
                    categoryCount[category] = (categoryCount[category] || 0) + 1;

                    // Count by resolution
                    if (status >= 3) {
                        const resolution = Number(dispute.resolution);
                        resolutionTypeCount[resolution] = (resolutionTypeCount[resolution] || 0) + 1;
                    }

                    // Confidence scores
                    if (dispute.aiConfidenceScore > 0) {
                        totalConfidence += Number(dispute.aiConfidenceScore);
                        confidenceCount++;
                    }

                } catch (error) {
                    logger.warn(`Failed to fetch dispute ${i}: ${error.message}`);
                }
            }

            // Update metrics
            this.metrics.activeDisputes = activeCount;
            this.metrics.resolvedDisputes = resolvedCount;
            this.metrics.cancelledDisputes = cancelledCount;
            this.metrics.totalValueLocked = totalValue;
            this.metrics.disputesByCategory = categoryCount;
            this.metrics.disputesByResolution = resolutionTypeCount;
            this.metrics.averageConfidenceScore = confidenceCount > 0 
                ? Math.round(totalConfidence / confidenceCount) 
                : 0;
            this.metrics.averageResolutionTime = resolutionCount > 0 
                ? Math.round(totalResolutionTime / resolutionCount) 
                : 0;

            logger.info(`📊 Metrics updated: ${this.metrics.totalDisputes} total, ${activeCount} active`);

        } catch (error) {
            logger.error('Failed to collect metrics:', error.message);
        }
    }

    /**
     * Start blockchain event listeners
     */
    startEventListeners() {
        // DisputeCreated
        this.contract.on('DisputeCreated', (disputeId, claimant, respondent, amount, category, event) => {
            const eventData = {
                type: 'DisputeCreated',
                disputeId: disputeId.toString(),
                claimant,
                respondent,
                amount: ethers.formatEther(amount),
                category: Number(category),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
            this.metrics.totalDisputes++;
            this.metrics.activeDisputes++;

            // Check for high value dispute alert
            if (amount >= this.alertThresholds.highValueDispute) {
                this.sendAlert('HIGH_VALUE_DISPUTE', eventData);
            }
        });

        // EvidenceSubmitted
        this.contract.on('EvidenceSubmitted', (disputeId, submitter, contentHash, evidenceType, event) => {
            const eventData = {
                type: 'EvidenceSubmitted',
                disputeId: disputeId.toString(),
                submitter,
                contentHash,
                evidenceType: Number(evidenceType),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
        });

        // AIVerdictRequested
        this.contract.on('AIVerdictRequested', (disputeId, genLayerRequestId, event) => {
            const eventData = {
                type: 'AIVerdictRequested',
                disputeId: disputeId.toString(),
                genLayerRequestId,
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
        });

        // AIVerdictReceived
        this.contract.on('AIVerdictReceived', (disputeId, resolution, confidenceScore, event) => {
            const eventData = {
                type: 'AIVerdictReceived',
                disputeId: disputeId.toString(),
                resolution: Number(resolution),
                confidenceScore: Number(confidenceScore),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);

            // Check for low confidence alert
            if (confidenceScore < this.alertThresholds.lowConfidence) {
                this.sendAlert('LOW_CONFIDENCE_VERDICT', eventData);
            }
        });

        // DisputeAppealed
        this.contract.on('DisputeAppealed', (disputeId, appealer, stakeAmount, event) => {
            const eventData = {
                type: 'DisputeAppealed',
                disputeId: disputeId.toString(),
                appealer,
                stakeAmount: ethers.formatEther(stakeAmount),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
        });

        // DisputeResolved
        this.contract.on('DisputeResolved', (disputeId, resolution, claimantPayout, respondentPayout, event) => {
            const eventData = {
                type: 'DisputeResolved',
                disputeId: disputeId.toString(),
                resolution: Number(resolution),
                claimantPayout: ethers.formatEther(claimantPayout),
                respondentPayout: ethers.formatEther(respondentPayout),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
            this.metrics.activeDisputes = Math.max(0, this.metrics.activeDisputes - 1);
            this.metrics.resolvedDisputes++;
        });

        // DisputeCancelled
        this.contract.on('DisputeCancelled', (disputeId, event) => {
            const eventData = {
                type: 'DisputeCancelled',
                disputeId: disputeId.toString(),
                timestamp: Date.now(),
                txHash: event.log.transactionHash
            };

            this.handleEvent(eventData);
            this.metrics.activeDisputes = Math.max(0, this.metrics.activeDisputes - 1);
            this.metrics.cancelledDisputes++;
        });

        logger.info('👂 Event listeners started');
    }

    /**
     * Handle incoming events
     */
    handleEvent(eventData) {
        logger.info(`📥 Event: ${eventData.type} - Dispute #${eventData.disputeId}`);

        // Store in recent events
        this.recentEvents.unshift(eventData);
        if (this.recentEvents.length > 100) {
            this.recentEvents.pop();
        }

        // Broadcast to WebSocket clients
        this.broadcastToClients({
            type: 'event',
            data: eventData
        });
    }

    /**
     * Send alert
     */
    sendAlert(alertType, data) {
        const alert = {
            type: 'alert',
            alertType,
            data,
            timestamp: Date.now()
        };

        logger.warn(`⚠️ Alert: ${alertType}`, data);

        // Broadcast to WebSocket clients
        this.broadcastToClients(alert);

        // Could also send to external alerting services (Slack, PagerDuty, etc.)
    }

    /**
     * Start HTTP API server
     */
    startHttpServer() {
        const app = express();
        app.use(express.json());

        // CORS
        app.use((req, res, next) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
            next();
        });

        // Health check
        app.get('/health', (req, res) => {
            res.json({ status: 'healthy', timestamp: Date.now() });
        });

        // Get all metrics
        app.get('/api/metrics', (req, res) => {
            res.json({
                ...this.metrics,
                totalValueLocked: ethers.formatEther(this.metrics.totalValueLocked),
                timestamp: Date.now()
            });
        });

        // Get summary stats
        app.get('/api/stats', (req, res) => {
            res.json({
                totalDisputes: this.metrics.totalDisputes,
                activeDisputes: this.metrics.activeDisputes,
                resolvedDisputes: this.metrics.resolvedDisputes,
                totalValueLocked: ethers.formatEther(this.metrics.totalValueLocked),
                averageResolutionTime: this.metrics.averageResolutionTime,
                averageConfidenceScore: this.metrics.averageConfidenceScore,
                timestamp: Date.now()
            });
        });

        // Get recent events
        app.get('/api/events', (req, res) => {
            const limit = Math.min(parseInt(req.query.limit) || 50, 100);
            res.json({
                events: this.recentEvents.slice(0, limit),
                total: this.recentEvents.length
            });
        });

        // Get disputes by category
        app.get('/api/analytics/categories', (req, res) => {
            const categories = ['ContractBreach', 'ServiceQuality', 'PaymentDispute', 
                              'IntellectualProperty', 'FraudClaim', 'Other'];
            const data = categories.map((name, index) => ({
                category: name,
                count: this.metrics.disputesByCategory[index] || 0
            }));
            res.json({ data });
        });

        // Get disputes by resolution
        app.get('/api/analytics/resolutions', (req, res) => {
            const resolutions = ['None', 'FavorClaimant', 'FavorRespondent', 'Split', 'Dismissed'];
            const data = resolutions.map((name, index) => ({
                resolution: name,
                count: this.metrics.disputesByResolution[index] || 0
            }));
            res.json({ data });
        });

        // Get specific dispute
        app.get('/api/disputes/:id', async (req, res) => {
            try {
                const dispute = await this.contract.getDispute(req.params.id);
                res.json({
                    id: dispute.id.toString(),
                    claimant: dispute.claimant,
                    respondent: dispute.respondent,
                    amount: ethers.formatEther(dispute.amount),
                    status: Number(dispute.status),
                    resolution: Number(dispute.resolution),
                    category: Number(dispute.category),
                    aiConfidenceScore: Number(dispute.aiConfidenceScore),
                    createdAt: Number(dispute.createdAt),
                    evidenceDeadline: Number(dispute.evidenceDeadline),
                    appealDeadline: Number(dispute.appealDeadline),
                    appealed: dispute.appealed
                });
            } catch (error) {
                res.status(404).json({ error: 'Dispute not found' });
            }
        });

        app.listen(this.config.httpPort, () => {
            logger.info(`HTTP API listening on port ${this.config.httpPort}`);
        });
    }

    /**
     * Start WebSocket server
     */
    startWebSocketServer() {
        const wss = new WebSocket.Server({ port: this.config.wsPort });

        wss.on('connection', (ws) => {
            logger.info('New WebSocket client connected');
            this.wsClients.add(ws);

            // Send current metrics on connect
            ws.send(JSON.stringify({
                type: 'metrics',
                data: {
                    ...this.metrics,
                    totalValueLocked: ethers.formatEther(this.metrics.totalValueLocked)
                }
            }));

            // Send recent events
            ws.send(JSON.stringify({
                type: 'recentEvents',
                data: this.recentEvents.slice(0, 20)
            }));

            ws.on('close', () => {
                this.wsClients.delete(ws);
                logger.info('WebSocket client disconnected');
            });

            ws.on('error', (error) => {
                logger.error('WebSocket error:', error.message);
                this.wsClients.delete(ws);
            });
        });

        logger.info(`WebSocket server listening on port ${this.config.wsPort}`);
    }

    /**
     * Broadcast message to all WebSocket clients
     */
    broadcastToClients(message) {
        const data = JSON.stringify(message);
        this.wsClients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    }

    /**
     * Start periodic metrics collection
     */
    startMetricsCollection() {
        setInterval(async () => {
            await this.collectMetrics();

            // Broadcast updated metrics
            this.broadcastToClients({
                type: 'metrics',
                data: {
                    ...this.metrics,
                    totalValueLocked: ethers.formatEther(this.metrics.totalValueLocked)
                }
            });
        }, this.config.metricsInterval);
    }

    /**
     * Stop the monitoring service
     */
    stop() {
        logger.info('Stopping Monitoring Service...');
        this.contract.removeAllListeners();
        this.wsClients.forEach((client) => client.close());
        logger.info('Monitoring Service stopped');
    }
}

// Export for use
module.exports = { MonitoringService };

// Run directly if called as script
if (require.main === module) {
    require('dotenv').config();

    const service = new MonitoringService({});
    service.start().catch(console.error);

    // Handle shutdown
    process.on('SIGINT', () => {
        service.stop();
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        service.stop();
        process.exit(0);
    });
}
