import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserAddressService } from './user-address.service';
import { UpsertUserAddressDto } from './dto/upsert-user-address.dto';

@UseGuards(JwtAuthGuard)
@Controller('user/address')
export class UserAddressController {
  constructor(private readonly userAddress: UserAddressService) {}

  @Get()
  async getMine(@Req() req: any) {
    return this.userAddress.getMine(req.user.id);
  }

  @Put()
  async upsertMine(@Req() req: any, @Body() body: UpsertUserAddressDto) {
    return this.userAddress.upsertMine(req.user.id, body);
  }

  @Delete()
  async deleteMine(@Req() req: any) {
    return this.userAddress.clearMine(req.user.id);
  }
}

