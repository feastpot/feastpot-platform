import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../auth/decorators/public.decorator';

import { CoverageInterestDto } from './dto/coverage-interest.dto';
import { CoverageService } from './coverage.service';

/**
 * Customer waitlist capture for uncovered postcodes. Public — the user
 * is anonymous at this point because they bounced off the homepage
 * coverage check before any account flow.
 */
@ApiTags('Coverage')
@Controller({ path: 'coverage-interest', version: '1' })
export class CoverageController {
  constructor(private readonly coverage: CoverageService) {}

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Register customer interest for an uncovered postcode (waitlist).',
  })
  register(@Body() dto: CoverageInterestDto) {
    return this.coverage.registerInterest(dto);
  }
}
