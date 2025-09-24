import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateDto } from './dto/generate.dto';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post('generate')
  async generate(@Body() body: GenerateDto) {
    return this.ai.generate(body);
  }

  @Post('writing-desk/follow-up')
  async writingDeskFollowUp(@Body() body: WritingDeskIntakeDto) {
    return this.ai.generateWritingDeskFollowUps(body);
  }

  @Post('writing-desk/follow-up/answers')
  async writingDeskFollowUpAnswers(@Body() body: WritingDeskFollowUpDto) {
    return this.ai.recordWritingDeskFollowUps(body);
  }
}
