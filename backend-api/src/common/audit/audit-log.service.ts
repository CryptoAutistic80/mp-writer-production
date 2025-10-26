import { Injectable, Logger } from '@nestjs/common';

export enum AuditEventType {
  AUTH_FAILURE = 'AUTH_FAILURE',
  AUTH_SUCCESS = 'AUTH_SUCCESS',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  CREDIT_DEDUCTION = 'CREDIT_DEDUCTION',
  CREDIT_ADDITION = 'CREDIT_ADDITION',
  PURCHASE_COMPLETED = 'PURCHASE_COMPLETED',
  PURCHASE_FAILED = 'PURCHASE_FAILED',
}

export interface AuditLogEntry {
  eventType: AuditEventType;
  userId?: string;
  ip?: string;
  timestamp: string;
  success: boolean;
  details: string;
  metadata?: Record<string, any>;
}

export interface RequestContext {
  userId?: string;
  ip?: string;
  endpoint?: string;
}

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger('AUDIT');
  private contextStorage = new Map<number, RequestContext>();

  /**
   * Store request context for current request
   */
  setContext(requestId: number, context: RequestContext) {
    this.contextStorage.set(requestId, context);
  }

  /**
   * Get stored context for current request
   */
  getContext(requestId: number): RequestContext | undefined {
    return this.contextStorage.get(requestId);
  }

  /**
   * Clear context after request completes
   */
  clearContext(requestId: number) {
    this.contextStorage.delete(requestId);
  }

  /**
   * Log a security audit event with structured format
   */
  log(eventType: AuditEventType, context: RequestContext, success: boolean, details: string, metadata?: Record<string, any>) {
    const entry: AuditLogEntry = {
      eventType,
      userId: context.userId,
      ip: context.ip,
      timestamp: new Date().toISOString(),
      success,
      details,
      metadata,
    };

    // Format for grep-friendly analysis
    const logMessage = JSON.stringify(entry);
    
    if (success) {
      this.logger.log(logMessage);
    } else {
      this.logger.warn(logMessage);
    }
  }

  /**
   * Log authentication failure
   */
  logAuthFailure(context: RequestContext, reason: string, metadata?: Record<string, any>) {
    this.log(AuditEventType.AUTH_FAILURE, context, false, reason, metadata);
  }

  /**
   * Log authentication success
   */
  logAuthSuccess(context: RequestContext, metadata?: Record<string, any>) {
    this.log(AuditEventType.AUTH_SUCCESS, context, true, 'Authentication successful', metadata);
  }

  /**
   * Log permission denial
   */
  logPermissionDenied(context: RequestContext, resource: string, action?: string, metadata?: Record<string, any>) {
    this.log(AuditEventType.PERMISSION_DENIED, context, false, `Access denied to ${resource}${action ? `: ${action}` : ''}`, metadata);
  }

  /**
   * Log credit deduction
   */
  logCreditDeduction(context: RequestContext, amount: number, balanceBefore: number, balanceAfter: number, success: boolean, reason?: string, metadata?: Record<string, any>) {
    this.log(
      AuditEventType.CREDIT_DEDUCTION,
      context,
      success,
      success 
        ? `Deducted ${amount} credits. Balance: ${balanceBefore} -> ${balanceAfter}`
        : `Failed to deduct ${amount} credits: ${reason}`,
      { amount, balanceBefore, balanceAfter, ...metadata },
    );
  }

  /**
   * Log credit addition
   */
  logCreditAddition(context: RequestContext, amount: number, balanceBefore: number, balanceAfter: number, reason: string, metadata?: Record<string, any>) {
    this.log(
      AuditEventType.CREDIT_ADDITION,
      context,
      true,
      `Added ${amount} credits via ${reason}. Balance: ${balanceBefore} -> ${balanceAfter}`,
      { amount, balanceBefore, balanceAfter, ...metadata },
    );
  }

  /**
   * Log purchase completion
   */
  logPurchaseCompleted(context: RequestContext, sessionId: string, amount: number, creditsGranted: number, metadata?: Record<string, any>) {
    this.log(
      AuditEventType.PURCHASE_COMPLETED,
      context,
      true,
      `Purchase completed: ${sessionId}`,
      { sessionId, amount, creditsGranted, ...metadata },
    );
  }

  /**
   * Log purchase failure
   */
  logPurchaseFailed(context: RequestContext, sessionId: string, reason: string, metadata?: Record<string, any>) {
    this.log(
      AuditEventType.PURCHASE_FAILED,
      context,
      false,
      `Purchase failed: ${sessionId} - ${reason}`,
      { sessionId, ...metadata },
    );
  }
}

