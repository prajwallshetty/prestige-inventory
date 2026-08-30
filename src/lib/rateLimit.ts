/**
 * In-memory / Sliding Window Rate Limiter for Login Endpoint Protection.
 *
 * Protects against brute-force code guessing while keeping legitimate logins instant.
 * Throttles client IP and login code after 5 failed attempts within 5 minutes.
 */

interface AttemptRecord {
  count: number;
  resetAt: number;
}

const attemptsMap = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes

export function checkLoginRateLimit(key: string): { allowed: boolean; remainingMs?: number } {
  const now = Date.now();
  const record = attemptsMap.get(key);

  if (!record || now > record.resetAt) {
    return { allowed: true };
  }

  if (record.count >= MAX_ATTEMPTS) {
    return { allowed: false, remainingMs: record.resetAt - now };
  }

  return { allowed: true };
}

export function recordFailedLoginAttempt(key: string): void {
  const now = Date.now();
  const record = attemptsMap.get(key);

  if (!record || now > record.resetAt) {
    attemptsMap.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    record.count += 1;
  }
}

export function clearLoginRateLimit(key: string): void {
  attemptsMap.delete(key);
}
