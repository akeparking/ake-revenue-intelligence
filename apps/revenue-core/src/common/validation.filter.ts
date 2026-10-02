import { ArgumentsHost, Catch, ExceptionFilter } from "@nestjs/common";
import { ZodError } from "zod";
import type { Response } from "express";

@Catch(ZodError)
export class ValidationFilter implements ExceptionFilter {
  catch(error: ZodError, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(400).json({
      message: "Check the required fields.",
      fields: error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    });
  }
}
