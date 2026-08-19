/**
 * Auth — email + password sign-up / sign-in for the example.
 *
 * In a real hackathon this would talk to Postgres + a JWT library.
 * Here we keep it tiny so the demo_path can be verified in seconds.
 */

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

const users = new Map<string, { user: User; passwordHash: string }>();

export function signUp(email: string, password: string): User {
  if (users.has(email)) throw new Error('email already registered');
  if (password.length < 8) throw new Error('password must be >= 8 chars');
  const user: User = { id: crypto.randomUUID(), email, createdAt: new Date().toISOString() };
  // NEVER use a sync hash in production; this is example code.
  users.set(email, { user, passwordHash: 'sha256$' + password });
  return user;
}

export function signIn(email: string, password: string): User | null {
  const record = users.get(email);
  if (!record) return null;
  if (record.passwordHash !== 'sha256$' + password) return null;
  return record.user;
}
