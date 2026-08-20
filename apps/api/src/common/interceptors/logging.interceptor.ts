import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ObservabilityContext } from '@attendance/observability';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();

    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      randomUUID();

    reply.header('x-correlation-id', correlationId);

    const startTime = performance.now();
    const { method, url } = request;

    return new Observable((subscriber) => {
      ObservabilityContext.run({ correlationId }, () => {
        next
          .handle()
          .pipe(
            tap({
              next: () => {
                const durationMs = Number((performance.now() - startTime).toFixed(2));
                const statusCode = reply.statusCode;
                this.logger.log(
                  {
                    method,
                    url,
                    statusCode,
                    durationMs,
                    correlationId,
                  },
                  `${method} ${url} ${statusCode} +${durationMs}ms`,
                );
              },
              error: (err: unknown) => {
                const durationMs = Number((performance.now() - startTime).toFixed(2));
                this.logger.warn(
                  {
                    method,
                    url,
                    durationMs,
                    correlationId,
                    error: err instanceof Error ? err.message : err,
                  },
                  `${method} ${url} FAILED +${durationMs}ms`,
                );
              },
            }),
          )
          .subscribe(subscriber);
      });
    });
  }
}
