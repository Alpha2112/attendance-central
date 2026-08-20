import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import helmet from '@fastify/helmet';
import cors from '@fastify/cors';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { CONFIG_TOKEN } from './modules/config/config.module.js';
import { NestPinoLoggerAdapter } from '@attendance/logging';
import { RequestLoggingInterceptor } from './common/interceptors/logging.interceptor.js';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { type AppConfig } from '@attendance/config';

async function bootstrap(): Promise<void> {
  const fastifyAdapter = new FastifyAdapter({
    logger: false, // Internal logger disabled in favor of our Pino logger
  });

  const app = await NestFactory.create<NestFastifyApplication>(AppModule, fastifyAdapter, {
    bufferLogs: true,
  });

  const config = app.get<AppConfig>(CONFIG_TOKEN);
  const loggerAdapter = app.get(NestPinoLoggerAdapter);
  app.useLogger(loggerAdapter);

  // Enable graceful shutdown hooks
  app.enableShutdownHooks();

  // Security headers with Helmet
  await app.register(helmet as never, {
    contentSecurityPolicy: config.NODE_ENV === 'production',
  });

  // CORS support
  await app.register(cors as never, {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  // Global interceptors & filters
  app.useGlobalInterceptors(new RequestLoggingInterceptor());
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // Swagger / OpenAPI documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Enterprise Attendance Integration Platform API')
    .setDescription('Central Control Plane, Device Registry, and Attendance Distribution API')
    .setVersion(config.SERVICE_VERSION)
    .addTag('Health & Telemetry', 'Liveness, readiness, and infrastructure health')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  await app.listen(config.PORT, config.HOST);
  loggerAdapter.log(
    `🚀 Attendance API server running on http://${config.HOST}:${config.PORT} (env: ${config.NODE_ENV})`,
    'Bootstrap',
  );
  loggerAdapter.log(
    `📖 API Documentation available at http://${config.HOST}:${config.PORT}/docs`,
    'Bootstrap',
  );
}

bootstrap().catch((error) => {
  console.error('Fatal error during API bootstrap:', error);
  process.exit(1);
});
