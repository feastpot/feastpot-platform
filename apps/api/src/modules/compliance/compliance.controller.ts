import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import type { AuthUser } from '../../auth/types';

import { ComplianceService } from './compliance.service';
import { UploadDocumentDto } from './dto/upload-document.dto';
import { VerifyDocumentDto } from './dto/verify-document.dto';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user)
    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'Authentication required',
    });
  return user;
}

@ApiTags('Compliance')
@ApiBearerAuth()
@Controller({ path: 'vendors/:vendorId/documents', version: '1' })
export class ComplianceController {
  constructor(private readonly compliance: ComplianceService) {}

  @Get()
  // Customers must not be able to enumerate vendor documents. The service
  // additionally enforces vendor-self ownership via assertCanManageVendor -
  // a vendor user can only list their own vendor's docs.
  @Roles(UserRole.vendor, UserRole.compliance, UserRole.admin)
  @ApiOperation({ summary: 'List vendor documents (vendor-owner / compliance / admin)' })
  list(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.compliance.listDocuments(vendorId, requireUser(user));
  }

  @Post()
  @Roles(UserRole.vendor, UserRole.compliance, UserRole.admin)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        type: {
          type: 'string',
          enum: ['hygiene_cert', 'insurance', 'photo_id', 'bank_details', 'kitchen_reg'],
        },
        expiresAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiOperation({ summary: 'Upload a vendor document (vendor or compliance/admin)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  upload(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @CurrentUser() user: AuthUser | null,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'Multipart field "file" is required',
      });
    return this.compliance.uploadDocument(vendorId, file, dto, requireUser(user));
  }

  @Get(':documentId/download')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  async download(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() user: AuthUser | null,
  ) {
    const file = await this.compliance.downloadDocument(vendorId, documentId, requireUser(user));
    return new StreamableFile(file.bytes, {
      type: file.type,
      disposition: `attachment; filename="${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
    });
  }

  @Delete(':documentId')
  @Roles(UserRole.vendor, UserRole.compliance, UserRole.admin)
  deleteDocument(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() user: AuthUser | null,
  ) {
    return this.compliance.deleteDocument(vendorId, documentId, requireUser(user));
  }

  @Put(':documentId')
  @Roles(UserRole.vendor, UserRole.compliance, UserRole.admin)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  replaceDocument(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() user: AuthUser | null,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file)
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'File is required' });
    return this.compliance.uploadDocument(vendorId, file, dto, requireUser(user), documentId);
  }

  @Patch(':documentId/verify')
  @Roles(UserRole.compliance, UserRole.admin)
  @ApiOperation({ summary: 'Verify or reject a document (compliance/admin)' })
  verify(
    @Param('vendorId', new ParseUUIDPipe()) vendorId: string,
    @Param('documentId', new ParseUUIDPipe()) documentId: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: VerifyDocumentDto,
  ) {
    return this.compliance.verifyDocument(vendorId, documentId, dto, requireUser(user));
  }
}
