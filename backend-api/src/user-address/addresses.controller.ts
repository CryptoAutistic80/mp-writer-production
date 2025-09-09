import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { AddressesService } from './addresses.service';

@Controller('addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get('lookup')
  async lookup(@Query('postcode') postcode?: string) {
    if (!postcode) throw new BadRequestException('postcode is required');
    const items = await this.addresses.lookup(postcode);
    return { items };
  }
}

