import { Controller, Get, Query, Req, Res, UseGuards, Param } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CsrfService } from '../common/csrf/csrf.service';
import { SkipCsrf } from '../common/csrf/csrf.decorator';
import { AuditLogService } from '../common/audit/audit-log.service';

const CSRF_COOKIE_PROD = '__Host-csrf-token';
const CSRF_COOKIE_DEV = 'mpw_csrf';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
    private readonly auditService: AuditLogService,
    private readonly csrf: CsrfService,
  ) {}

  // Initiates Google OAuth (redirect flow)
  @Get('google')
  @SkipCsrf()
  @UseGuards(AuthGuard('google'))
  async googleAuth() {
    return;
  }

  // Google OAuth callback
  @Get('google/callback')
  @SkipCsrf()
  @UseGuards(AuthGuard('google'))
  async googleCallback(
    @Req() req: any,
    @Res() res: Response,
    @Query('returnTo') returnTo?: string,
  ) {
    // req.user is set by GoogleStrategy.validate
    const user = req.user;
    // Use Mongo _id when present
    const rawId = (user as any)?._id ?? (user as any)?.id;
    const id = typeof rawId === 'string' ? rawId : rawId?.toString?.();
    const token = await this.auth.signJwt({ id, email: user.email });

    // Issue HttpOnly session cookies with __Host- prefix for enhanced security
    const appOrigin = this.config.get<string>('APP_ORIGIN', 'http://localhost:3000');
    const isSecure = appOrigin.startsWith('https://');
    const fifteenMinutesMs = 15 * 60 * 1000; // Access token: 15 minutes
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // Refresh token: 7 days
    
    // Cookie options for access token (short-lived)
    const accessCookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: fifteenMinutesMs,
      path: '/',
    };
    
    // Cookie options for refresh token (long-lived)
    const refreshCookieOptions = {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax' as const,
      maxAge: sevenDaysMs,
      path: '/',
    };
    
    // In development, if we're proxying through Next.js, set domain to work with localhost:3000
    if (appOrigin.includes('localhost:3000') && !isSecure) {
      // Remove __Host- prefix in development to allow cross-port cookies
      res.cookie('mpw_session', token.access_token, accessCookieOptions);
      res.cookie('mpw_refresh', token.refresh_token, refreshCookieOptions);
    } else {
      // Production: use __Host- prefix for security
      res.cookie('__Host-mpw_session', token.access_token, accessCookieOptions);
      res.cookie('__Host-mpw_refresh', token.refresh_token, refreshCookieOptions);
    }

    // Best-practice: redirect back to app — default to dashboard
    let target = appOrigin.replace(/\/$/, '') + '/dashboard';
    // Defensive: only allow relative paths for returnTo
    if (returnTo && returnTo.startsWith('/')) {
      target = appOrigin.replace(/\/$/, '') + returnTo;
    }
    return res.redirect(target);
  }

  // Refresh access token using refresh token
  @Get('refresh')
  @SkipCsrf()
  async refresh(@Req() req: any, @Res() res: Response) {
    const appOrigin = this.config.get<string>('APP_ORIGIN', 'http://localhost:3000');
    const isSecure = appOrigin.startsWith('https://');
    
    // Get refresh token from cookie
    const refreshToken = req.cookies['mpw_refresh'] || req.cookies['__Host-mpw_refresh'];
    
    if (!refreshToken) {
      return res.status(401).json({ message: 'No refresh token provided' });
    }
    
    try {
      const tokens = await this.auth.refreshAccessToken(refreshToken);
      
      const fifteenMinutesMs = 15 * 60 * 1000; // Access token: 15 minutes
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000; // Refresh token: 7 days
      
      // Cookie options for access token (short-lived)
      const accessCookieOptions = {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax' as const,
        maxAge: fifteenMinutesMs,
        path: '/',
      };
      
      // Cookie options for refresh token (long-lived)
      const refreshCookieOptions = {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax' as const,
        maxAge: sevenDaysMs,
        path: '/',
      };
      
      // Set new cookies
      if (appOrigin.includes('localhost:3000') && !isSecure) {
        res.cookie('mpw_session', tokens.access_token, accessCookieOptions);
        res.cookie('mpw_refresh', tokens.refresh_token, refreshCookieOptions);
      } else {
        res.cookie('__Host-mpw_session', tokens.access_token, accessCookieOptions);
        res.cookie('__Host-mpw_refresh', tokens.refresh_token, refreshCookieOptions);
      }
      
      return res.json({ success: true });
    } catch (error) {
      // Clear invalid refresh token cookies
      const cookieOptions = { 
        httpOnly: true, 
        secure: isSecure, 
        sameSite: 'lax' as const, 
        path: '/' 
      };
      
      // Log authentication failure for refresh token
      const authContext = {
        ip: req.ip || req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown',
        endpoint: '/auth/refresh',
      };
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      let reason = 'Invalid refresh token';
      if (errorMessage.includes('expired')) {
        reason = 'Refresh token expired';
      } else if (errorMessage.includes('malformed') || errorMessage.includes('invalid')) {
        reason = 'Refresh token malformed or invalid';
      }
      
      this.auditService.logAuthFailure(authContext, reason, {
        tokenType: 'refresh',
        error: errorMessage,
      });

      res.clearCookie('mpw_session', cookieOptions);
      res.clearCookie('mpw_refresh', cookieOptions);
      res.clearCookie('__Host-mpw_session', cookieOptions);
      res.clearCookie('__Host-mpw_refresh', cookieOptions);
      this.clearCsrfCookies(res, isSecure);

      return res.status(401).json({ message: 'Invalid refresh token' });
    }
  }

  // Return current user
  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@Req() req: any) {
    return req.user;
  }

  // Proxy Google profile images to avoid CORS issues
  @Get('avatar/:userId')
  @SkipCsrf()
  @UseGuards(JwtAuthGuard)
  async getAvatar(@Req() req: any, @Res() res: Response, @Param('userId') userId: string) {
    // Only allow users to access their own avatar
    if (req.user.id !== userId) {
      return res.status(403).json({ message: 'Forbidden' });
    }

    const user = await this.auth.getUserById(userId);
    if (!user || !user.image) {
      return res.status(404).json({ message: 'Avatar not found' });
    }

    try {
      // Fetch the image from Google
      const response = await fetch(user.image);
      if (!response.ok) {
        return res.status(404).json({ message: 'Avatar not found' });
      }

      const imageBuffer = await response.arrayBuffer();
      const contentType = response.headers.get('content-type') || 'image/jpeg';

      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      });
      
      return res.send(Buffer.from(imageBuffer));
    } catch {
      return res.status(500).json({ message: 'Failed to fetch avatar' });
    }
  }

  private setCsrfCookie(res: Response, isSecure: boolean, token: string) {
    if (isSecure) {
      res.cookie(CSRF_COOKIE_PROD, token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: this.csrf.getTokenTtlMs(),
        path: '/',
      });
    } else {
      res.cookie(CSRF_COOKIE_DEV, token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: this.csrf.getTokenTtlMs(),
        path: '/',
      });
    }
  }

  private clearCsrfCookies(res: Response, isSecure: boolean) {
    const options = {
      httpOnly: true,
      secure: isSecure,
      sameSite: isSecure ? ('strict' as const) : ('lax' as const),
      path: '/',
    };

    res.clearCookie(CSRF_COOKIE_PROD, options);
    res.clearCookie(CSRF_COOKIE_DEV, options);
  }

  private getCsrfCookieName(isSecure: boolean) {
    return isSecure ? CSRF_COOKIE_PROD : CSRF_COOKIE_DEV;
  }

  @Get('csrf-token')
  @SkipCsrf()
  async getCsrfToken(@Req() req: any, @Res() res: Response) {
    const appOrigin = this.config.get<string>('APP_ORIGIN', 'http://localhost:3000');
    const isSecure = appOrigin.startsWith('https://');
    const token = this.csrf.generateToken();

    this.setCsrfCookie(res, isSecure, token);

    return res.json({ csrfToken: token, cookie: this.getCsrfCookieName(isSecure) });
  }

  // Logout clears cookies and redirects to app
  @Get('logout')
  @SkipCsrf()
  async logout(@Res() res: Response) {
    const appOrigin = this.config.get<string>('APP_ORIGIN', 'http://localhost:3000');
    const isSecure = appOrigin.startsWith('https://');
    const cookieOptions = { 
      httpOnly: true, 
      secure: isSecure, 
      sameSite: 'lax' as const, 
      path: '/' 
    };
    
    // Clear all possible cookie names (development and production, access and refresh)
    res.clearCookie('mpw_session', cookieOptions);
    res.clearCookie('mpw_refresh', cookieOptions);
    res.clearCookie('__Host-mpw_session', cookieOptions);
    res.clearCookie('__Host-mpw_refresh', cookieOptions);
    this.clearCsrfCookies(res, isSecure);
    
    return res.redirect(appOrigin);
  }
}
