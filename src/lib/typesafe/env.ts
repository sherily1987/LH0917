export function hasTypeSafeKey(): boolean {
  return Boolean(process.env.TYPESAFE_API_KEY?.trim());
}
