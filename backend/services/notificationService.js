// backend/services/notificationService.js
const nodemailer = require('nodemailer');

class NotificationService {
    constructor() {
        this.emailTransporter = null;
        this.initEmail();
    }

    initEmail() {
        if (process.env.SMTP_HOST) {
            this.emailTransporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT || 587,
                secure: process.env.SMTP_SECURE === 'true',
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS
                }
            });
        }
    }

    async sendEmail(to, subject, html) {
        if (!this.emailTransporter) return false;
        
        try {
            await this.emailTransporter.sendMail({
                from: process.env.EMAIL_FROM || 'noreply@disputes.example.com',
                to,
                subject,
                html
            });
            return true;
        } catch (error) {
            console.error('Email send failed:', error);
            return false;
        }
    }

    async notifyDisputeCreated(dispute, recipientEmail) {
        const subject = `New Dispute #${dispute.id} Created`;
        const html = `
            <h2>New Dispute Created</h2>
            <p>A new dispute has been created that involves you.</p>
            <ul>
                <li><strong>Dispute ID:</strong> ${dispute.id}</li>
                <li><strong>Amount:</strong> ${dispute.amount} ETH</li>
                <li><strong>Category:</strong> ${dispute.category}</li>
            </ul>
            <p><a href="${process.env.FRONTEND_URL}/disputes/${dispute.id}">View Dispute</a></p>
        `;
        return this.sendEmail(recipientEmail, subject, html);
    }

    async notifyVerdictReceived(dispute, recipientEmail) {
        const resolutions = ['None', 'Favor Claimant', 'Favor Respondent', 'Split', 'Dismissed'];
        const subject = `Verdict Received for Dispute #${dispute.id}`;
        const html = `
            <h2>AI Verdict Received</h2>
            <p>The AI has delivered a verdict for your dispute.</p>
            <ul>
                <li><strong>Dispute ID:</strong> ${dispute.id}</li>
                <li><strong>Resolution:</strong> ${resolutions[dispute.resolution]}</li>
                <li><strong>Confidence:</strong> ${dispute.aiConfidenceScore}%</li>
            </ul>
            <p>You have 2 days to appeal this decision.</p>
            <p><a href="${process.env.FRONTEND_URL}/disputes/${dispute.id}">View Dispute</a></p>
        `;
        return this.sendEmail(recipientEmail, subject, html);
    }

    async notifyDisputeResolved(dispute, recipientEmail, payout) {
        const subject = `Dispute #${dispute.id} Resolved`;
        const html = `
            <h2>Dispute Resolved</h2>
            <p>Your dispute has been finalized.</p>
            <ul>
                <li><strong>Dispute ID:</strong> ${dispute.id}</li>
                <li><strong>Your Payout:</strong> ${payout} ETH</li>
            </ul>
            <p><a href="${process.env.FRONTEND_URL}/disputes/${dispute.id}">View Details</a></p>
        `;
        return this.sendEmail(recipientEmail, subject, html);
    }
}

module.exports = NotificationService;
