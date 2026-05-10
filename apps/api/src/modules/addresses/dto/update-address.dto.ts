import { PartialType } from '@nestjs/swagger';

import { CreateAddressDto } from './create-address.dto';

/**
 * All fields optional on update. Postcode validation still applies *if*
 * the field is supplied because PartialType preserves decorators.
 */
export class UpdateAddressDto extends PartialType(CreateAddressDto) {}
