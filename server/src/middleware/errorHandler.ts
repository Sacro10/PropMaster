import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ValidationError } from './validation';

export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * User-safe error messages
 * Never expose internal errors, stack traces, or sensitive data
 */
function getSafeErrorMessage(error: Error): string {
  // Known operational errors
  if (error instanceof AppError && error.isOperational) {
    return error.message;
  }

  if (error instanceof ValidationError) {
    return error.message;
  }

  // Stripe errors
  if (error.name === 'StripeError') {
    return 'Payment processing error. Please try again.';
  }

  // Database errors
  if (error.message?.includes('duplicate key')) {
    return 'This resource already exists';
  }

  if (error.message?.includes('foreign key')) {
    return 'Referenced resource not found';
  }

  if (error.message?.includes('not found')) {
    return 'Resource not found';
  }

  // Generic safe message
  return 'An error occurred. Please try again later.';
}

/**
 * Log errors for monitoring
 * In production, send to error tracking service (Sentry, etc.)
 */
function logError(error: Error, req: Request) {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
    error: {
      name: error.name,
      message: error.message,
      stack: config.nodeEnv === 'development' ? error.stack : undefined,
    },
  };

  console.error('Error:', JSON.stringify(errorInfo, null, 2));

  // TODO: Send to error tracking service in production
  // if (config.nodeEnv === 'production') {
  //   Sentry.captureException(error, { extra: errorInfo });
  // }
}

/**
 * Centralized error handling middleware
 * Must be the last middleware in the chain
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Log the error
  logError(err, req);

  // Determine status code
  let statusCode = 500;
  if (err instanceof AppError) {
    statusCode = err.statusCode;
  } else if (err instanceof ValidationError) {
    statusCode = 400;
  }

  // Get user-safe message
  const message = getSafeErrorMessage(err);

  // Build response
  const response: any = {
    error: message,
  };

  // Add validation details if applicable
  if (err instanceof ValidationError) {
    response.details = err.errors;
  }

  // Add stack trace in development only
  if (config.nodeEnv === 'development') {
    response.stack = err.stack;
    response.originalError = err.message;
  }

  res.status(statusCode).json(response);
}

/**
 * Async handler wrapper
 * Catches async errors and passes to error handling middleware
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
