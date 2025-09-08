import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MpsService } from './mps.service';

@Controller('mps')
export class MpsController {
  constructor(private readonly mps: MpsService) {}

  @Get('lookup')
  async lookup(@Query('postcode') postcode?: string) {
    if (!postcode) throw new BadRequestException('postcode is required');

    // Simple UK postcode format sanity check (not exhaustive)
    const compact = postcode.replace(/\s+/g, '').toUpperCase();
    const basicUkPostcode = /^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/;
    if (!basicUkPostcode.test(compact)) {
      throw new BadRequestException('invalid postcode format');
    }

    try {
      return await this.mps.lookupByPostcode(postcode);
    } catch (err: any) {
      if (err?.message === 'POSTCODE_NOT_FOUND') {
        throw new BadRequestException('postcode not found');
      }
      throw new BadRequestException('lookup failed');
    }
  }
}

