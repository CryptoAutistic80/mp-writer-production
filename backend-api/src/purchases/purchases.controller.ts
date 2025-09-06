import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PurchasesService } from './purchases.service';
import { CreatePurchaseDto } from './dto/create-purchase.dto';

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  @Get()
  async list(@Req() req: any) {
    return this.purchases.findMine(req.user.id);
  }

  @Get(':id')
  async get(@Req() req: any, @Param('id') id: string) {
    return this.purchases.getById(req.user.id, id);
  }

  @Post()
  async create(@Req() req: any, @Body() body: CreatePurchaseDto) {
    return this.purchases.create(req.user.id, body);
  }
}

