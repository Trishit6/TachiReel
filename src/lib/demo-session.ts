export const DEMO_EMAIL = 'admin@admin.com';
export const DEMO_PASSWORD = 'password';

// In-memory only: reloading the app returns to the login screen, and this never
// overrides a real Supabase session because the demo path requires supabase === null.
let demoSessionActive = false;

export function startDemoSession(): void {
  demoSessionActive = true;
}

export function hasDemoSession(): boolean {
  return demoSessionActive;
}

export function endDemoSession(): void {
  demoSessionActive = false;
}

export function isDemoCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
