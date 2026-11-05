import { Controller, Get, Res, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { type FastifyReply } from 'fastify';
import { HealthService, type LivenessReport } from './health.service.js';
import { Public } from '../auth/decorators.js';

@ApiTags('Health & Telemetry')
@Public()
@Controller(['health', 'api/v1/health'])
export class HealthController {
  constructor(@Inject(HealthService) private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Platform Health Overview' })
  @ApiResponse({ status: 200, description: 'Health check summary' })
  async getHealth(@Res() reply: FastifyReply): Promise<void> {
    const readiness = await this.healthService.getReadiness();
    const statusCode = readiness.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    reply.status(statusCode).send(readiness);
  }

  @Get('live')
  @ApiOperation({ summary: 'Kubernetes Liveness Probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  getLiveness(): LivenessReport {
    return this.healthService.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Kubernetes Readiness Probe' })
  @ApiResponse({
    status: 200,
    description: 'Service is fully ready and connected to infrastructure',
  })
  @ApiResponse({ status: 503, description: 'Service is degraded or missing critical dependencies' })
  async getReadiness(@Res() reply: FastifyReply): Promise<void> {
    const readiness = await this.healthService.getReadiness();
    const statusCode = readiness.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    reply.status(statusCode).send(readiness);
  }
}
