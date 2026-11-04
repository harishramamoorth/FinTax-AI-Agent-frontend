export type DemoRole = 'client' | 'staff' | 'admin';

export interface DemoClientAccount {
  id: string;
  name: string;
  email: string;
  company: string;
  country: string;
  currency: string;
  advisorId?: string;
  advisorFirm?: string;
}

export const ADVISOR_FIRMS: Record<string, string> = {
  '7': 'FinTax Consulting',
  '1': 'FinTax Consulting',
  '12': 'Al-Bustan Advisory Partners',
};

export const DEMO_CLIENTS: DemoClientAccount[] = [
  { id: 'client', name: 'Muster GmbH', email: 'client@fintax.demo', company: 'Muster GmbH', country: 'Germany', currency: 'EUR', advisorId: '7', advisorFirm: 'FinTax Consulting' },
  { id: 'client-nordlicht', name: 'Nordlicht Handel UG', email: 'nordlicht@fintax.demo', company: 'Nordlicht Handel UG', country: 'Germany', currency: 'EUR', advisorId: '7', advisorFirm: 'FinTax Consulting' },
  { id: 'client-palm', name: 'Palm Grove Trading LLC', email: 'palm@fintax.demo', company: 'Palm Grove Trading LLC', country: 'United Arab Emirates', currency: 'AED', advisorId: '12', advisorFirm: 'Al-Bustan Advisory Partners' },
];
