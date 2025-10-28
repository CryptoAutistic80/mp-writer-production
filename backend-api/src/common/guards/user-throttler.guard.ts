import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Use user ID if available, otherwise fall back to IP address
    const userId = req.user?.id || req.user?._id;
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    
    return userId ? `user:${userId}` : `ip:${ip}`;
  }
}
