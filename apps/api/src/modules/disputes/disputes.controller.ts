import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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

import { DisputesService } from './disputes.service';
import { CloseDisputeDto } from './dto/close-dispute.dto';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { ListDisputesDto } from './dto/list-disputes.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { VendorResponseDto } from './dto/vendor-response.dto';

function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Authentication required' });
  return user;
}

@ApiTags('Disputes')
@ApiBearerAuth()
@Controller({ path: 'disputes', version: '1' })
export class DisputesController {
  constructor(private readonly disputes: DisputesService) {}

  @Get()
  // Finance / compliance staff have their own dedicated tools - they don't
  // need raw dispute access. The service still scopes results: customers see
  // their own, vendors see disputes on their orders, support/admin see all.
  @Roles(UserRole.customer, UserRole.vendor, UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'List disputes (customer: own; vendor: own orders; support/admin: all)' })
  list(@CurrentUser() user: AuthUser | null, @Query() dto: ListDisputesDto) {
    return this.disputes.list(requireUser(user), dto);
  }

  @Post()
  @Roles(UserRole.customer)
  @ApiOperation({ summary: 'Raise a new dispute (customer)' })
  create(@CurrentUser() user: AuthUser | null, @Body() dto: CreateDisputeDto) {
    return this.disputes.create(dto, requireUser(user));
  }

  @Get(':id')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'Get a dispute with evidence' })
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser | null) {
    return this.disputes.get(id, requireUser(user));
  }

  @Patch(':id')
  @Roles(UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'Update a dispute (support/admin)' })
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: UpdateDisputeDto,
  ) {
    return this.disputes.update(id, dto, requireUser(user));
  }

  @Post(':id/vendor-response')
  @Roles(UserRole.vendor)
  @ApiOperation({ summary: 'Vendor submits response to a dispute' })
  vendorResponse(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: VendorResponseDto,
  ) {
    return this.disputes.vendorResponse(id, dto, requireUser(user));
  }

  @Post(':id/escalate')
  @Roles(UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'Escalate a dispute (support/admin)' })
  escalate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser | null) {
    return this.disputes.escalate(id, requireUser(user));
  }

  @Post(':id/close')
  @Roles(UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'Close a dispute with resolution (issues refund if applicable)' })
  close(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @Body() dto: CloseDisputeDto,
  ) {
    return this.disputes.close(id, dto, requireUser(user));
  }

  @Get(':id/evidence')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.support, UserRole.admin)
  @ApiOperation({ summary: 'List evidence on a dispute' })
  listEvidence(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: AuthUser | null) {
    return this.disputes.listEvidence(id, requireUser(user));
  }

  @Post(':id/evidence')
  @Roles(UserRole.customer, UserRole.vendor, UserRole.support, UserRole.admin)
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' }, caption: { type: 'string' } } } })
  @ApiOperation({ summary: 'Upload an evidence file (multipart)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  uploadEvidence(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthUser | null,
    @UploadedFile() file: Express.Multer.File,
    @Body('caption') caption?: string,
  ) {
    if (!file) {
      throw new BadRequestException({ code: 'FILE_REQUIRED', message: 'Multipart field "file" is required' });
    }
    return this.disputes.uploadEvidence(id, file, caption, requireUser(user));
  }
}
