
export function nonNil<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
