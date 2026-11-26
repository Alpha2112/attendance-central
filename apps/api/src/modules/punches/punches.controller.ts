import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Inject,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { PunchesService, type PunchLogItem } from './punches.service.js';
import { ManualSyncService } from './manual-sync.service.js';
import { PunchQueryDto, IngestPunchDto } from './dto/punch-query.dto.js';
import { ManualSyncFetchDto, ManualSyncCommitDto } from './dto/manual-sync.dto.js';
import { RequirePermissions, Public, CurrentUser } from '../auth/decorators.js';
import { type AuthUser } from '../auth/auth.types.js';

@ApiTags('Attendance & Punch Logs')
@Controller(['punches', 'api/v1/punches'])
export class PunchesController {
  constructor(
    @Inject(PunchesService) private readonly punchesService: PunchesService,
    @Inject(ManualSyncService) private readonly manualSyncService: ManualSyncService,
  ) {}

  @Get()
  @RequirePermissions('punches.view')
  @ApiOperation({ summary: 'Get historical attendance punch logs with keyset pagination' })
  @ApiResponse({ status: 200, description: 'Paginated attendance punch logs' })
  public async getHistoricalLogs(@Query() query: PunchQueryDto): Promise<{
    items: PunchLogItem[];
    total: number;
    nextCursor?: { punchTimeUtc: string; id: number };
  }> {
    return this.punchesService.getHistoricalLogs(query);
  }

  @Get('live')
  @RequirePermissions('punches.view')
  @ApiOperation({ summary: 'Get recent real-time normalized punch stream' })
  @ApiResponse({ status: 200, description: 'Recent normalized punch events' })
  public async getLiveFeed(@Query('limit') limit?: number): Promise<PunchLogItem[]> {
    return this.punchesService.getLiveFeed(limit ? Number(limit) : 25);
  }

  @Post('sync')
  @RequirePermissions('punches.sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync all registered pull-based (Hikvision) terminals' })
  @ApiResponse({ status: 200, description: 'Aggregate sync summary across pull terminals' })
  public async syncAllPullDevices() {
    return this.punchesService.syncAllPullDevices();
  }

  @Post('sync/fetch')
  @RequirePermissions('punches.manual_sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Manual sync — FETCH punch candidates from a terminal for a date range (no write)',
  })
  @ApiResponse({ status: 200, description: 'Normalized, validated candidates (nothing persisted)' })
  public async manualFetch(@Body() dto: ManualSyncFetchDto, @CurrentUser() user: AuthUser) {
    return this.manualSyncService.fetch(dto.deviceId, dto.from, dto.to, user.email);
  }

  @Post('sync/commit')
  @RequirePermissions('punches.manual_sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manual sync — COMMIT selected candidates as MANUAL attendance rows' })
  @ApiResponse({ status: 200, description: 'Idempotent commit summary + per-row results' })
  public async manualCommit(@Body() dto: ManualSyncCommitDto, @CurrentUser() user: AuthUser) {
    return this.manualSyncService.commit(dto.jobId, dto.rows, user.email);
  }

  @Get('sync/jobs')
  @RequirePermissions('punches.manual_sync')
  @ApiOperation({ summary: 'List manual synchronization jobs (audit/history)' })
  @ApiResponse({ status: 200, description: 'Manual sync job history, newest first' })
  public async listSyncJobs(
    @Query('deviceId') deviceId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
  ) {
    return this.manualSyncService.listJobs({
      deviceId: deviceId ? Number(deviceId) : undefined,
      status: status || undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('sync/:deviceId')
  @RequirePermissions('punches.sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync real hardware events from a specific physical terminal' })
  @ApiParam({ name: 'deviceId', description: 'Device ID or Device Code' })
  @ApiResponse({ status: 200, description: 'Sync summary from hardware terminal' })
  public async syncFromDevice(@Param('deviceId') deviceId: string) {
    return this.punchesService.syncFromDevice(deviceId);
  }

  @Post('simulate')
  @RequirePermissions('punches.simulate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Simulate/Ingest a punch event for test validation' })
  @ApiResponse({ status: 201, description: 'Created normalized punch log' })
  public async simulatePunch(@Body() dto: IngestPunchDto): Promise<PunchLogItem> {
    return this.punchesService.ingestSimulatedPunch(dto);
  }

  @Post('push/hikvision')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HTTP Push Receiver for Hikvision Alarm Center / Listening Host' })
  @ApiResponse({ status: 200, description: 'Acknowledged push event' })
  public async handleHikvisionPush(@Body() payload: unknown) {
    return this.punchesService.handleHikvisionPush(payload);
  }

  @Post('purge')
  @RequirePermissions('punches.purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purge mock/simulated punch logs and resync' })
  @ApiResponse({ status: 200, description: 'Purged all logs' })
  public async purgeLogs() {
    return this.punchesService.purgeLogs();
  }

  @Delete(':id')
  @RequirePermissions('punches.delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a single punch log record' })
  @ApiResponse({ status: 200, description: 'Deleted punch log' })
  public async deletePunch(@Param('id', ParseIntPipe) id: number) {
    return this.punchesService.deletePunchLog(id);
  }

  @Post(':id/reemit')
  @RequirePermissions('punches.sync')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-emit a punch log event to Kafka topic' })
  @ApiResponse({ status: 200, description: 'Re-emitted event to Kafka' })
  public async reemitPunch(@Param('id', ParseIntPipe) id: number) {
    return this.punchesService.reemitToKafka(id);
  }
}
