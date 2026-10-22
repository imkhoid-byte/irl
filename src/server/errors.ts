/** An error whose message is safe to show to the user. */
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export const notFound = (what = "that") => new AppError("not_found", `We couldn't find ${what}.`, 404);
export const forbidden = () => new AppError("forbidden", "You don't have access to that.", 403);

export function userMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error(e);
  return "Something went wrong on our side. Nothing was charged — please try again.";
}
