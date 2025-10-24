import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    // Determine status code and message
    let status: number;
    let message: string | object;

    if (exception instanceof HttpException) {
      // NestJS HTTP exceptions are safe to expose
      status = exception.getStatus();
      message = exception.getResponse();
    } else {
      // Unknown exceptions - sanitize completely
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = {
        statusCode: status,
        message: 'An unexpected error occurred. Please try again later.',
        timestamp: new Date().toISOString(),
        path: request.url,
      };

      // Log the full error details server-side
      this.logger.error(
        `Unhandled exception: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // Log all errors for debugging (but don't expose to client)
    this.logger.error(
      `HTTP ${status} Error on ${request.method} ${request.url}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(status).json(message);
  }
}
