import { Controller, Get, Param, Query, Inject } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuditService } from './audit.service.js';
import { RequirePermissions } from '../auth/decorators.js';

@ApiTags('audit')
@ApiBearerAuth()
@Controller(['audit-logs', 'api/v1/audit-logs'])
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Query audit logs with filters + pagination' })
  public list(
    @Query('search') search?: string,
    @Query('action') action?: string,
    @Query('module') module?: string,
    @Query('status') status?: string,
    @Query('role') role?: string,
    @Query('ip') ip?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.audit.query({
      search,
      action,
      module,
      status,
      role,
      ip,
      dateFrom,
      dateTo,
      sort: sort === 'asc' ? 'asc' : 'desc',
      page: page ? Number(page) : 1,
      pageSize: pageSize ? Number(pageSize) : 25,
    });
  }

  @Get('facets')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Distinct filter values (actions, modules, roles)' })
  public facets() {
    return this.audit.facets();
  }

  @Get(':id')
  @RequirePermissions('audit.view')
  @ApiOperation({ summary: 'Single audit log entry' })
  public getOne(@Param('id') id: string) {
    return this.audit.getOne(Number(id));
  }
}
