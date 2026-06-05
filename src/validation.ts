export function isValidPort(p: number): boolean {
  return !isNaN(p) && p > 0 && p <= 65535;
}
