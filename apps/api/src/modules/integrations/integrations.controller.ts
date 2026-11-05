import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  ParseIntPipe,
  Inject,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { IntegrationsService } from './integrations.service.js';
import { CreateIntegrationDto } from './dto/create-integration.dto.js';
import { UpdateIntegrationDto } from './dto/update-integration.dto.js';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('Outbound Integrations')
@Controller(['integrations', 'api/v1/integrations'])
export class IntegrationsController {
  constructor(@Inject(IntegrationsService) private readonly service: IntegrationsService) {}

  @Get()
  @RequirePermissions('integrations.view')
  @ApiOperation({ summary: 'List registered webhook subscriptions with delivery stats' })
  list() {
    return this.service.list();
  }

  @Get('stats')
  @RequirePermissions('integrations.view')
  @ApiOperation({ summary: 'Outbox + delivery KPIs' })
  stats() {
    return this.service.stats();
  }

  @Get(':id')
  @RequirePermissions('integrations.view')
  @ApiOperation({ summary: 'Integration detail incl. signing key, example body, and headers' })
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.getDetail(id);
  }

  @Post()
  @RequirePermissions('integrations.create')
  @ApiOperation({ summary: 'Register a new webhook subscription' })
  create(@Body() dto: CreateIntegrationDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @RequirePermissions('integrations.edit')
  @ApiOperation({ summary: 'Update a webhook subscription (endpoint, signing, filters, status)' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateIntegrationDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/test')
  @RequirePermissions('integrations.test')
  @ApiOperation({ summary: 'Send a signed test webhook and record the delivery attempt' })
  test(@Param('id', ParseIntPipe) id: number) {
    return this.service.testDispatch(id);
  }

  @Delete(':id')
  @RequirePermissions('integrations.delete')
  @ApiOperation({ summary: 'Remove a webhook subscription' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
