export class TascabileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TascabileError";
  }
}

export class HttpStatusError extends TascabileError {
  constructor(
    public readonly url: string,
    public readonly status: number,
  ) {
    super(`HTTP ${status} while requesting ${url}`);
    this.name = "HttpStatusError";
  }
}

export class MissingFieldError extends TascabileError {
  constructor(fieldName: string, context: string) {
    super(`Missing required field "${fieldName}" while parsing ${context}`);
    this.name = "MissingFieldError";
  }
}
