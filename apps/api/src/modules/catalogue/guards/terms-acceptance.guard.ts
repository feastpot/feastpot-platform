import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';

import type { AuthUser } from '../../../auth/types';
import { TermsService } from '../../terms/terms.service';

interface CatalogueRequest {
  method: string;
  user?: AuthUser | null;
  params: Record<string, string>;
}

@Injectable()
export class TermsAcceptanceGuard implements CanActivate {
  constructor(private readonly terms: TermsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CatalogueRequest>();
    if (request.method === 'GET' || request.user?.role !== UserRole.vendor) return true;
    await this.terms.assertAcceptedCurrentVersion(request.params.vendorId);
    return true;
  }
}
