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
import { PunchQueryDto, IngestPunchDto } from './dto/punch-query.dto.js';

@ApiTags('Attendance & Punch Logs')
@Controller(['punches', 'api/v1/punches'])
export class PunchesController {
  constructor(@Inject(PunchesService) private readonly punchesService: PunchesService) {}

  @Get()
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
  @ApiOperation({ summary: 'Get recent real-time normalized punch stream' })
  @ApiResponse({ status: 200, description: 'Recent normalized punch events' })
  public async getLiveFeed(@Query('limit') limit?: number): Promise<PunchLogItem[]> {
    return this.punchesService.getLiveFeed(limit ? Number(limit) : 25);
  }

  @Post('sync/:deviceId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sync real hardware events from physical biometric terminal' })
  @ApiParam({ name: 'deviceId', description: 'Device ID or Device Code' })
  @ApiResponse({ status: 200, description: 'Sync summary from hardware terminal' })
  public async syncFromDevice(@Param('deviceId') deviceId: string) {
    return this.punchesService.syncFromDevice(deviceId);
  }

  @Post('simulate')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Simulate/Ingest a punch event for test validation' })
  @ApiResponse({ status: 201, description: 'Created normalized punch log' })
  public async simulatePunch(@Body() dto: IngestPunchDto): Promise<PunchLogItem> {
    return this.punchesService.ingestSimulatedPunch(dto);
  }

  @Post('push/hikvision')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HTTP Push Receiver for Hikvision Alarm Center / Listening Host' })
  @ApiResponse({ status: 200, description: 'Acknowledged push event' })
  public async handleHikvisionPush(@Body() payload: any) {
    return this.punchesService.handleHikvisionPush(payload);
  }

  @Post('purge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Purge mock/simulated punch logs and resync' })
  @ApiResponse({ status: 200, description: 'Purged all logs' })
  public async purgeLogs() {
    return this.punchesService.purgeLogs();
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a single punch log record' })
  @ApiResponse({ status: 200, description: 'Deleted punch log' })
  public async deletePunch(@Param('id', ParseIntPipe) id: number) {
    return this.punchesService.deletePunchLog(id);
  }

  @Post(':id/reemit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Re-emit a punch log event to Kafka topic' })
  @ApiResponse({ status: 200, description: 'Re-emitted event to Kafka' })
  public async reemitPunch(@Param('id', ParseIntPipe) id: number) {
    return this.punchesService.reemitToKafka(id);
  }
}
