import { Module } from '@nestjs/common';
import { MpsController } from './mps.controller';
import { MpsService } from './mps.service';

@Module({
  providers: [MpsService],
  controllers: [MpsController],
})
export class MpsModule {}

