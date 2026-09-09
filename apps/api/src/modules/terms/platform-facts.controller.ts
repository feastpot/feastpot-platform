import { buildPlatformFactsModel } from '@feastpot/config/platform-facts';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TermsDocumentType } from '@prisma/client';

import { Public } from '../../auth/decorators/public.decorator';

import { TermsService } from './terms.service';

@ApiTags('platform facts')
@Controller({ path: 'platform-facts', version: '1' })
export class PlatformFactsController {
  constructor(private readonly terms: TermsService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Get the nine public platform policy facts' })
  async getPlatformFacts() {
    const currentTerms = await this.terms.getCurrentVersion(TermsDocumentType.VENDOR_TERMS);
    if (!currentTerms) {
      throw new ServiceUnavailableException(
        'No current effective VENDOR_TERMS version is published.',
      );
    }
    return buildPlatformFactsModel(currentTerms.version);
  }
}
