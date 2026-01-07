import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

export class ValidationError extends Error {
  constructor(
    message: string,
    public errors: any[]
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Express middleware factory for request validation using Zod schemas
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      if (schemas.query) {
        req.query = schemas.query.parse(req.query);
      }
      if (schemas.params) {
        req.params = schemas.params.parse(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.errors.map((err) => ({
          path: err.path.join('.'),
          message: err.message,
        }));
        return res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
      }
      next(error);
    }
  };
}

// Common validation schemas
export const schemas = {
  uuid: z.string().uuid('Invalid UUID format'),

  plan: z.enum(['basic', 'pro', 'premium'], {
    errorMap: () => ({ message: 'Plan must be basic, pro, or premium' }),
  }),

  email: z.string().email('Invalid email address'),

  // Checkout session request
  createCheckoutSession: z.object({
    accountId: z.string().uuid('Invalid account ID'),
    plan: z.enum(['pro', 'premium'], {
      errorMap: () => ({ message: 'Plan must be pro or premium' }),
    }),
    userId: z.string().uuid('Invalid user ID'),
  }),

  // Portal session request
  createPortalSession: z.object({
    accountId: z.string().uuid('Invalid account ID'),
  }),
};
