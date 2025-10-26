import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async validateOrCreateGoogleUser(profile: {
    id: string;
    emails?: Array<{ value: string }>;
    displayName?: string;
    photos?: Array<{ value: string }>;
  }) {
    const email = profile.emails?.[0]?.value;
    const name = profile.displayName ?? email ?? 'Unknown';
    const image = profile.photos?.[0]?.value;
    
    return this.users.findOrCreateFromOAuth({
      provider: 'google',
      providerId: profile.id,
      email,
      name,
      image,
    });
  }

  async getUserById(id: string) {
    return this.users.findById(id);
  }

  async signJwt(user: { id: string; email?: string | null }) {
    const payload = { sub: user.id, email: user.email ?? undefined };
    const accessToken = await this.jwt.signAsync(payload);
    
    // Create refresh token with longer expiration (7 days)
    const refreshPayload = { sub: user.id, type: 'refresh' };
    const refreshToken = await this.jwt.signAsync(refreshPayload, { expiresIn: '7d' });
    
    return { 
      access_token: accessToken,
      refresh_token: refreshToken 
    };
  }

  async refreshAccessToken(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken);
      
      // Verify this is a refresh token
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Generate new access token
      const user = await this.users.findById(payload.sub);
      if (!user) {
        throw new Error('User not found');
      }
      
      return this.signJwt({ id: user._id, email: user.email });
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }
}

