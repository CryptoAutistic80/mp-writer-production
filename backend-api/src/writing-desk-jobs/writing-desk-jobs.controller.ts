import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WritingDeskJobsService } from './writing-desk-jobs.service';
import { UpsertActiveWritingDeskJobDto } from './dto/upsert-active-writing-desk-job.dto';
import { StartDeepResearchDto } from './dto/start-deep-research.dto';

@UseGuards(JwtAuthGuard)
@Controller('writing-desk/jobs/active')
export class WritingDeskJobsController {
  constructor(private readonly jobs: WritingDeskJobsService) {}

  @Get()
  async getActiveJob(@Req() req: any) {
    return this.jobs.getActiveJobForUser(req.user.id);
  }

  @Put()
  async upsertActiveJob(@Req() req: any, @Body() body: UpsertActiveWritingDeskJobDto) {
    return this.jobs.upsertActiveJob(req.user.id, body);
  }

  @Delete()
  async deleteActiveJob(@Req() req: any) {
    await this.jobs.deleteActiveJob(req.user.id);
    return { success: true };
  }

  @Post('research/start')
  async startDeepResearch(@Req() req: any, @Body() body: StartDeepResearchDto) {
    const activeJob = await this.jobs.getActiveJobForUser(req.user.id);
    if (!activeJob) {
      throw new BadRequestException('We could not find an active letter to research. Save your answers and try again.');
    }

    if (body?.jobId && body.jobId !== activeJob.jobId) {
      throw new ConflictException('Your saved letter changed. Refresh the page before running deep research again.');
    }

    const params = new URLSearchParams();
    params.set('jobId', activeJob.jobId);

    return {
      jobId: activeJob.jobId,
      streamPath: `/api/ai/writing-desk/deep-research?${params.toString()}`,
    };
  }
}
