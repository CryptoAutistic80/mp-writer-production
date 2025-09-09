import { Body, Controller, Delete, Get, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserMpService } from './user-mp.service';
import { UpsertUserMpDto } from './dto/upsert-user-mp.dto';

@UseGuards(JwtAuthGuard)
@Controller('user/mp')
export class UserMpController {
  constructor(private readonly userMp: UserMpService) {}

  @Get()
  async getMine(@Req() req: any) {
    return this.userMp.getMine(req.user.id);
  }

  @Put()
  async upsertMine(@Req() req: any, @Body() body: UpsertUserMpDto) {
    return this.userMp.upsertMine(req.user.id, body);
  }

  @Delete()
  async deleteMine(@Req() req: any) {
    return this.userMp.clearMine(req.user.id);
  }
}

