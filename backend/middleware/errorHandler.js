// backend/middleware/errorHandler.js
/**
 * Global Error Handler Middleware
 */

function errorHandler(err, req, res, next) {
    console.error('Error:', err);

    // Default error
    let status = err.status || 500;
    let message = err.message || 'Internal server error';

    // Handle specific error types
    if (err.name === 'ValidationError') {
        status = 400;
        message = err.message;
    }

    if (err.name === 'UnauthorizedError') {
        status = 401;
        message = 'Unauthorized';
    }

    if (err.code === 'ECONNREFUSED') {
        status = 503;
        message = 'Service unavailable';
    }

    // Don't expose internal errors in production
    if (process.env.NODE_ENV === 'production' && status === 500) {
        message = 'Internal server error';
    }

    res.status(status).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
}

module.exports = errorHandler;
