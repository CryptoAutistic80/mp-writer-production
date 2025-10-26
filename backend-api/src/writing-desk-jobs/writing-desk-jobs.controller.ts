import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  Post,
  Put,
  Req,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { UpsertActiveWritingDeskJobDto } from './dto/upsert-active-writing-desk-job.dto';
import { StartDeepResearchDto } from './dto/start-deep-research.dto';
import { StartLetterDto } from './dto/start-letter.dto';
import { AiService } from '../ai/ai.service';

@UseGuards(JwtAuthGuard)
@Controller('writing-desk/jobs/active')
export class WritingDeskJobsController {
  constructor(
    private readonly jobs: WritingDeskJobsService,
    @Inject(forwardRef(() => AiService)) private readonly ai: AiService,
  ) {}

  @Get()
  async getActiveJob(@Req() req: any) {
    const userId = req?.user?.id ?? req?.user?._id;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }
    return this.jobs.getActiveJobForUser(userId);
  }

  @Put()
  async upsertActiveJob(@Req() req: any, @Body() body: UpsertActiveWritingDeskJobDto) {
    const userId = req?.user?.id ?? req?.user?._id;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }
    return this.jobs.upsertActiveJob(userId, body);
  }

  @Delete()
  async deleteActiveJob(@Req() req: any) {
    const userId = req?.user?.id ?? req?.user?._id;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }
    await this.jobs.deleteActiveJob(userId);
    return { success: true };
  }

  @Post('research/start')
  async startDeepResearch(@Req() req: any, @Body() body: StartDeepResearchDto) {
    const userId = req?.user?.id ?? req?.user?._id;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }
    const activeJob = await this.jobs.getActiveJobForUser(userId);
    if (!activeJob) {
      throw new BadRequestException('We could not find an active letter to research. Save your answers and try again.');
    }

    if (body?.jobId && body.jobId !== activeJob.jobId) {
      throw new ConflictException('Your saved letter changed. Refresh the page before running deep research again.');
    }

    const resume = body?.resume === true;
    if (resume) {
      await this.ai.ensureDeepResearchRun(userId, activeJob.jobId, { createIfMissing: false });
    } else {
      await this.ai.ensureDeepResearchRun(userId, activeJob.jobId, { restart: true });
    }

    const params = new URLSearchParams();
    params.set('jobId', activeJob.jobId);

    return {
      jobId: activeJob.jobId,
      streamPath: `/api/ai/writing-desk/deep-research?${params.toString()}`,
    };
  }

  @Post('letter/start')
  async startLetter(@Req() req: any, @Body() body: StartLetterDto) {
    const userId = req?.user?.id ?? req?.user?._id;
    if (!userId) {
      throw new BadRequestException('User authentication required');
    }
    const activeJob = await this.jobs.getActiveJobForUser(userId);
    if (!activeJob) {
      throw new BadRequestException('We could not find an active letter to compose. Save your answers and try again.');
    }

    if (body?.jobId && body.jobId !== activeJob.jobId) {
      throw new ConflictException('Your saved letter changed. Refresh the page before composing the letter again.');
    }

    const resume = body?.resume === true;
    const tone = body?.tone ?? activeJob.letterTone;

    if (!tone) {
      throw new BadRequestException('Select a tone before composing the letter.');
    }

    if (resume && activeJob.letterStatus !== 'generating') {
      throw new BadRequestException('There is no letter in progress to resume.');
    }

    if (resume) {
      await this.ai.ensureLetterRun(userId, activeJob.jobId, { createIfMissing: false });
    } else {
      await this.ai.ensureLetterRun(userId, activeJob.jobId, { tone, restart: true });
    }

    const params = new URLSearchParams();
    params.set('jobId', activeJob.jobId);
    params.set('tone', tone);
    if (resume) {
      params.set('resume', '1');
    }

    return {
      jobId: activeJob.jobId,
      streamPath: `/api/ai/writing-desk/letter?${params.toString()}`,
    };
  }
}
