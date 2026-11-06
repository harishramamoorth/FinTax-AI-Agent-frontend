import { type DemoRole, ADVISOR_FIRMS } from './demoAccounts';

const SESSION_KEY = 'fintax-authenticated-session-v1';

export interface DemoSession {
  role: DemoRole;
  userName: string;
  email: string;
  advisorId?: string;
  advisorFirm?: string;
  privacyAccepted?: boolean;
}

export interface DemoCredentials {
  advisorId?: string;
  clientName?: string;
  username?: string;
  password: string;
}

export type LoginField = 'advisorId' | 'clientName' | 'username' | 'password' | 'general';

export class DemoLoginError extends Error {
  constructor(public field: LoginField, message: string) {
    super(message);
    this.name = 'DemoLoginError';
  }
}

export async function authenticateDemoUser(role: DemoRole, credentials: DemoCredentials): Promise<DemoSession> {
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (role === 'client') {
    const validAdvisor = credentials.advisorId === '7' || credentials.advisorId === '1';
    const validClient = credentials.clientName === 'clientdemo' || credentials.username === 'clientdemo';
    const validPassword = credentials.password === 'client123';

    // Show neutral message as required by concept PDF, keeping specific field for test assertions
    if (!validAdvisor) throw new DemoLoginError('advisorId', 'Invalid Advisor ID, username, or password. Please verify your login details.');
    if (!validClient) throw new DemoLoginError('clientName', 'Invalid Advisor ID, username, or password. Please verify your login details.');
    if (!validPassword) throw new DemoLoginError('password', 'Invalid Advisor ID, username, or password. Please verify your login details.');

    const firm = ADVISOR_FIRMS[credentials.advisorId ?? '7'] ?? 'FinTax Consulting';
    return {
      role,
      userName: 'Muster GmbH',
      email: 'client@fintax.demo',
      advisorId: credentials.advisorId ?? '7',
      advisorFirm: firm,
    };
  }

  const expectedUsername = role === 'staff' ? 'staffdemo' : 'admindemo';
  const expectedEmail = role === 'staff' ? 'lena@fintax.demo' : 'admin@fintax.demo';
  const expectedPassword = role === 'staff' ? 'staff123' : 'admin123';
  const username = credentials.username?.trim().toLowerCase();
  if (username !== expectedUsername && username !== expectedEmail) {
    throw new DemoLoginError('username', 'Invalid username or password.');
  }
  if (credentials.password !== expectedPassword) throw new DemoLoginError('password', 'Invalid username or password.');

  return role === 'staff'
    ? { role, userName: 'Lena M.', email: 'lena@fintax.demo', advisorFirm: 'FinTax Consulting' }
    : { role, userName: 'Alex Morgan', email: 'admin@fintax.demo', advisorFirm: 'FinTax Consulting' };
}

function isDemoSession(value: unknown): value is DemoSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<DemoSession>;
  return (session.role === 'client' || session.role === 'staff' || session.role === 'admin')
    && typeof session.userName === 'string'
    && typeof session.email === 'string'
    && (session.privacyAccepted === undefined || typeof session.privacyAccepted === 'boolean');
}

export function readDemoSession(): DemoSession | null {
  const value = sessionStorage.getItem(SESSION_KEY);
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!isDemoSession(parsed)) {
    sessionStorage.removeItem(SESSION_KEY);
    return null;
  }
  return parsed;
}

export function saveDemoSession(session: DemoSession): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearDemoSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
