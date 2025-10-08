import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CheckoutService } from './checkout.service';
import { CheckoutController } from './checkout.controller';
import { UserCreditsModule } from '../user-credits/user-credits.module';
import { PurchasesModule } from '../purchases/purchases.module';

@Module({
  imports: [ConfigModule, UserCreditsModule, PurchasesModule],
  controllers: [CheckoutController],
  providers: [CheckoutService],
  exports: [CheckoutService],
})
export class CheckoutModule {}

