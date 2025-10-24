import { Body, Controller, Post, Query, Req, Sse, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AiService } from './ai.service';
import { GenerateDto } from './dto/generate.dto';
import { WritingDeskIntakeDto } from './dto/writing-desk-intake.dto';
import { WritingDeskFollowUpDto } from './dto/writing-desk-follow-up.dto';
import { TranscriptionDto, StreamingTranscriptionDto } from './dto/transcription.dto';
import { ThrottleAI } from '../common/decorators/throttle.decorators';

@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly ai: AiService) {}

  @ThrottleAI()
  @Post('generate')
  async generate(@Body() body: GenerateDto) {
    return this.ai.generate(body);
  }

  @ThrottleAI()
  @Post('writing-desk/follow-up')
  async writingDeskFollowUp(@Req() req: any, @Body() body: WritingDeskIntakeDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.ai.generateWritingDeskFollowUps(userId, body);
  }

  @ThrottleAI()
  @Post('writing-desk/follow-up/answers')
  async writingDeskFollowUpAnswers(@Body() body: WritingDeskFollowUpDto) {
    return this.ai.recordWritingDeskFollowUps(body);
  }

  @ThrottleAI()
  @Sse('writing-desk/deep-research')
  writingDeskDeepResearch(@Req() req: any, @Query('jobId') jobId?: string) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.ai.streamWritingDeskDeepResearch(userId, { jobId: jobId ?? null });
  }

  @ThrottleAI()
  @Sse('writing-desk/letter')
  writingDeskLetter(
    @Req() req: any,
    @Query('jobId') jobId?: string,
    @Query('tone') tone?: string,
    @Query('resume') resume?: string,
  ) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.ai.streamWritingDeskLetter(userId, {
      jobId: jobId ?? null,
      tone: tone ?? null,
      resume: resume === '1' || resume === 'true',
    });
  }

  @ThrottleAI()
  @Post('transcription')
  async transcribeAudio(@Req() req: any, @Body() body: TranscriptionDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.ai.transcribeAudio(userId, body);
  }

  @ThrottleAI()
  @Sse('transcription/stream')
  streamTranscription(@Req() req: any, @Body() body: StreamingTranscriptionDto) {
    const userId = req?.user?.id ?? req?.user?._id ?? null;
    return this.ai.streamTranscription(userId, body);
  }
}
