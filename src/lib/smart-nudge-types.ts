export interface SmartNudge {
  key: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  tone: 'info' | 'warning' | 'danger';
  priority?: 'high' | 'medium' | 'low';
  priorityLabel?: string;
  snoozeKey?: string;
}

export interface SmartNudgesStatus {
  periodLabel: string;
  nudges: SmartNudge[];
}

export interface SmartNudgeCurrentPeriodStatusInput {
  periodLabel: string;
  expectsBankData: boolean;
  expectsCreditData: boolean;
  missingSources: string[];
  isPartial: boolean;
}

export interface SmartNudgeBudgetStatusInput {
  periodKey: string;
  paceStatus: 'on-track' | 'warning' | 'over';
  projectedRemaining: number;
  projectedUtilizationPercent: number;
  warningCount: number;
  overCount: number;
}
