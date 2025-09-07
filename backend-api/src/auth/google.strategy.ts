import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService, private readonly auth: AuthService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');

    if (!clientID || !clientSecret) {
      Logger.warn(
        'GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET not set. Google login is disabled.',
        'GoogleStrategy',
      );
    }

    super({
      clientID: clientID || 'disabled',
      clientSecret: clientSecret || 'disabled',
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL') ??
        'http://localhost:4000/api/auth/google/callback',
      scope: ['profile', 'email'],
    });
  }

  // Always show Google account chooser
  authorizationParams() {
    return { prompt: 'select_account' } as any;
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
  ) {
    const user = await this.auth.validateOrCreateGoogleUser({
      id: profile.id,
      emails: profile.emails as any,
      displayName: profile.displayName,
      photos: profile.photos as any,
    });
    return user;
  }
}
