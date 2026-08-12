/**
 * Response shapes the suite asserts on.
 *
 * supertest types `res.body` as `any`, so every body is narrowed through one of
 * these at the point of use. They are deliberately **hand-written rather than
 * imported from `src/**\/dto`**: a test that reuses the production DTO cannot
 * notice a field being renamed or dropped, because both sides move together.
 * These are the contract as the frontend will consume it.
 */

export interface LoginBody {
  accessToken: string;
  user: {
    id: number;
    name: string;
    email: string;
    role: 'ADMIN' | 'EMPLOYEE';
    hourlyRate: number | null;
  };
}

export interface UserBody {
  id: number;
  name: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE';
  hourlyRate: number | null;
  isActive: boolean;
  hasActivated: boolean;
  setupCode: string | null;
}

export interface TimeEntryBody {
  id: number;
  userId: number;
  startTime: string;
  endTime: string | null;
  notes: string | null;
}

export interface CycleEntriesBody {
  cycle: string;
  prevCycle: string;
  nextCycle: string;
  cycleStart: string;
  cycleEnd: string;
  entries: Array<TimeEntryBody & { isSplit: boolean }>;
}

export interface OpenShiftBody {
  openShift: TimeEntryBody | null;
}

export interface PayrollZone {
  zone: 'DAY' | 'EVENING' | 'NIGHT' | 'WEEKEND';
  label: string;
  hours: number;
  rate: number;
  pay: number;
}

export interface PayrollDay {
  date: string;
  hours: { DAY: number; EVENING: number; NIGHT: number; WEEKEND: number };
  totalHours: number;
}

export interface PayrollBody {
  cycle: string;
  prevCycle: string;
  nextCycle: string;
  cycleStart: string;
  cycleEnd: string;
  userId: number;
  name: string;
  hourlyRate: number;
  totalHours: number;
  totalPay: number;
  hasOpenShift: boolean;
  zones: PayrollZone[];
  days: PayrollDay[];
}

export interface PayrollOverviewBody {
  cycle: string;
  prevCycle: string;
  nextCycle: string;
  cycleStart: string;
  cycleEnd: string;
  totalCost: number;
  rows: Array<{
    userId: number;
    name: string;
    totalHours: number;
    totalPay: number;
    hasOpenShift: boolean;
  }>;
}

export interface SettingsBody {
  cycleStartDay: number;
  cycleEndDay: number;
}

export interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error?: string;
}
