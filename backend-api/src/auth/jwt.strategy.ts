import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly users: UsersService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'changeme'),
    });
  }

  async validate(payload: { sub: string; email?: string }) {
    const user = await this.users.findById(payload.sub);
    // Mongoose documents expose id via _id; use string form
    return user ? { id: (user as any)._id?.toString?.() ?? undefined, email: (user as any).email, name: (user as any).name, image: (user as any).image } : null;
  }
}

