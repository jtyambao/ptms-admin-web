// Short, readable text for any thrown value - shown under "Details for
// support" on the error screens so a crash can be reported precisely.
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 600);
  try {
    return String(error).slice(0, 600);
  } catch {
    return 'Unknown error';
  }
}
