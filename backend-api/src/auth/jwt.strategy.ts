import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { UserCreditsService } from '../user-credits/user-credits.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly users: UsersService,
    private readonly credits: UserCreditsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        // Prefer HttpOnly cookie, fallback to Bearer header
        (req: any) => {
          const raw = req?.headers?.cookie as string | undefined;
          if (!raw) return null;
          // Minimal cookie parser for both cookie names (dev and prod)
          const parts = raw.split(';');
          for (const part of parts) {
            const [k, v] = part.trim().split('=');
            if (k === '__Host-mpw_session' || k === 'mpw_session') {
              return decodeURIComponent(v || '');
            }
          }
          return null;
        },
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email?: string }) {
    const user = await this.users.findById(payload.sub);
    if (!user) return null;
    const credits = await this.credits.getMine((user as any)._id?.toString?.() ?? payload.sub);
    // Mongoose documents expose id via _id; use string form
    return {
      id: (user as any)._id?.toString?.() ?? undefined,
      email: (user as any).email,
      name: (user as any).name,
      image: (user as any).image,
      credits: credits.credits ?? 0,
    } as any;
  }
}
