// backend/config/database.js
/**
 * Database Configuration
 * Supports MongoDB, PostgreSQL, or in-memory for development
 */

class Database {
    constructor() {
        this.connected = false;
        this.data = {
            users: new Map(),
            disputes: new Map(),
            evidence: new Map(),
            notifications: new Map()
        };
    }

    async connect() {
        // In production, connect to actual database
        // For now, use in-memory storage
        this.connected = true;
        console.log('Database connected (in-memory mode)');
        return this;
    }

    async disconnect() {
        this.connected = false;
        console.log('Database disconnected');
    }

    // User operations
    users = {
        findByAddress: async (address) => {
            return this.data.users.get(address.toLowerCase());
        },
        create: async (userData) => {
            const user = { ...userData, address: userData.address.toLowerCase() };
            this.data.users.set(user.address, user);
            return user;
        },
        updateLastLogin: async (address) => {
            const user = this.data.users.get(address.toLowerCase());
            if (user) {
                user.lastLoginAt = new Date();
                this.data.users.set(address.toLowerCase(), user);
            }
            return user;
        },
        update: async (address, updates) => {
            const user = this.data.users.get(address.toLowerCase());
            if (user) {
                Object.assign(user, updates);
                this.data.users.set(address.toLowerCase(), user);
            }
            return user;
        }
    };

    // Dispute operations
    disputes = {
        findById: async (id) => this.data.disputes.get(id),
        findByUser: async (address) => {
            return Array.from(this.data.disputes.values()).filter(d => 
                d.claimant?.toLowerCase() === address.toLowerCase() ||
                d.respondent?.toLowerCase() === address.toLowerCase()
            );
        },
        create: async (dispute) => {
            this.data.disputes.set(dispute.id, dispute);
            return dispute;
        },
        update: async (id, updates) => {
            const dispute = this.data.disputes.get(id);
            if (dispute) {
                Object.assign(dispute, updates);
                this.data.disputes.set(id, dispute);
            }
            return dispute;
        }
    };

    // Evidence operations
    evidence = {
        findByDispute: async (disputeId) => this.data.evidence.get(disputeId) || [],
        add: async (disputeId, evidenceData) => {
            const list = this.data.evidence.get(disputeId) || [];
            list.push(evidenceData);
            this.data.evidence.set(disputeId, list);
            return evidenceData;
        }
    };

    // Notification operations
    notifications = {
        findByUser: async (address) => this.data.notifications.get(address.toLowerCase()) || [],
        create: async (address, notification) => {
            const list = this.data.notifications.get(address.toLowerCase()) || [];
            list.unshift({ ...notification, id: Date.now().toString(), read: false, createdAt: new Date() });
            this.data.notifications.set(address.toLowerCase(), list);
            return notification;
        },
        markRead: async (address, notificationId) => {
            const list = this.data.notifications.get(address.toLowerCase()) || [];
            const notification = list.find(n => n.id === notificationId);
            if (notification) notification.read = true;
            return notification;
        }
    };
}

module.exports = new Database();
