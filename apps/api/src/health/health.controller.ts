import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

import { Public } from '../auth/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Public()
  @Get()
  check(): {
    status: string;
    version: string | undefined;
    timestamp: string;
    environment: string | undefined;
  } {
    return {
      status: 'ok',
      version: process.env.npm_package_version,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
    };
  }
}
