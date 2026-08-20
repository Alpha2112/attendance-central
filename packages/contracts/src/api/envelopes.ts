import { z } from 'zod';

export interface ApiResponseEnvelope<T> {
  success: boolean;
  data: T;
  meta?: {
    correlationId?: string;
    timestamp: string;
    [key: string]: unknown;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    correlationId?: string;
    timestamp: string;
  };
}

export const KeysetPaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(50),
  cursor: z.string().optional(),
  direction: z.enum(['forward', 'backward']).default('forward'),
});

export type KeysetPaginationQuery = z.infer<typeof KeysetPaginationQuerySchema>;

export interface KeysetPaginatedResponse<T> {
  items: T[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor?: string;
    prevCursor?: string;
  };
}
