import { Body, Controller, Get, Put, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UserCreditsService } from './user-credits.service';
import { UpsertUserCreditsDto } from './dto/upsert-user-credits.dto';
import { AdjustUserCreditsDto } from './dto/adjust-user-credits.dto';

@UseGuards(JwtAuthGuard)
@Controller('user/credits')
export class UserCreditsController {
  constructor(private readonly userCredits: UserCreditsService) {}

  @Get()
  async getMine(@Req() req: any) {
    return this.userCredits.getMine(req.user.id);
  }

  @Put()
  async setMine(@Req() req: any, @Body() body: UpsertUserCreditsDto) {
    return this.userCredits.setMine(req.user.id, body.credits);
  }

  @Post('add')
  async add(@Req() req: any, @Body() body: AdjustUserCreditsDto) {
    return this.userCredits.addToMine(req.user.id, body.amount);
  }

  @Post('deduct')
  async deduct(@Req() req: any, @Body() body: AdjustUserCreditsDto) {
    return this.userCredits.deductFromMine(req.user.id, body.amount);
  }
}
