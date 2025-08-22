/**
 * Global error handler middleware
 * Provides consistent error responses across the application
 */
const errorHandler = (err, req, res, next) => {
    console.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Default error response
    let statusCode = 500;
    let message = 'Internal server error';
    let error = 'ServerError';

    // Handle different types of errors
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation error';
        error = 'ValidationError';
    } else if (err.name === 'ZodError') {
        statusCode = 400;
        message = 'Invalid request data';
        error = 'ValidationError';
    } else if (err.code === 'PGRST116') {
        // Supabase/PostgREST not found error
        statusCode = 404;
        message = 'Resource not found';
        error = 'NotFoundError';
    } else if (err.code === 'PGRST301') {
        // Supabase/PostgREST unique constraint violation
        statusCode = 409;
        message = 'Resource already exists';
        error = 'ConflictError';
    } else if (err.message ? .includes('not found')) {
        statusCode = 404;
        message = err.message;
        error = 'NotFoundError';
    } else if (err.message ? .includes('already exists')) {
        statusCode = 409;
        message = err.message;
        error = 'ConflictError';
    } else if (err.message ? .includes('unauthorized') || err.message ? .includes('permission')) {
        statusCode = 403;
        message = err.message;
        error = 'PermissionError';
    } else if (err.message ? .includes('invalid') || err.message ? .includes('bad request')) {
        statusCode = 400;
        message = err.message;
        error = 'BadRequestError';
    }

    // In development, include stack trace
    const response = {
        error,
        message,
        timestamp: new Date().toISOString(),
        path: req.url,
        method: req.method
    };

    if (process.env.NODE_ENV === 'development') {
        response.stack = err.stack;
        response.details = err.message;
    }

    res.status(statusCode).json(response);
};

module.exports = errorHandler;