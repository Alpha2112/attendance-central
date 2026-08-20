import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObservabilityContext } from '@attendance/observability';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      ObservabilityContext.getCorrelationId();

    let errorCode = 'INTERNAL_SERVER_ERROR';
    let errorMessage = 'An unexpected error occurred';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        errorMessage = res;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        errorMessage = (resObj['message'] as string) || exception.message;
        errorCode = (resObj['error'] as string) || `HTTP_${status}`;
        details = resObj['details'];
      }
    } else if (exception instanceof Error) {
      errorMessage = exception.message;
      errorCode = exception.name;
    }

    if (status >= 500) {
      this.logger.error(
        {
          correlationId,
          path: request.url,
          method: request.method,
          status,
          error: exception instanceof Error ? exception.stack : exception,
        },
        'Unhandled server exception',
      );
    } else {
      this.logger.warn(
        {
          correlationId,
          path: request.url,
          method: request.method,
          status,
          errorCode,
          errorMessage,
        },
        'Client request error',
      );
    }

    const payload = {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage,
        ...(details ? { details } : {}),
      },
      meta: {
        correlationId,
        timestamp: new Date().toISOString(),
        path: request.url,
      },
    };

    response.status(status).send(payload);
  }
}
