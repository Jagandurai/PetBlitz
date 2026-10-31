export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError("NOT_FOUND", 404, `${what} not found`);
export const conflict = (code: string, msg: string) => new AppError(code, 409, msg);
export const unprocessable = (code: string, msg: string) => new AppError(code, 422, msg);

export function isDuplicateKeyError(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: number }).code === 11000;
}
