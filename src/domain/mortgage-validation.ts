import { z } from 'zod';
import type { MortgageDetails } from './transactions';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, 'La data deve essere YYYY-MM-DD').refine((value) => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Data non valida');

const centsSchema = z.number().int().safe().nonnegative();

const installmentSchema = z.object({
  number: z.number().int().positive(),
  dueDate: isoDateSchema,
  status: z.enum(['paid', 'due', 'other']),
  principalCents: centsSchema,
  interestCents: centsSchema,
  installmentCents: centsSchema,
  residualCents: centsSchema,
  otherCents: centsSchema.optional(),
});

export const mortgageSchema: z.ZodType<MortgageDetails> = z.object({
  contractNumber: z.string().optional(),
  accountId: z.string().optional(),
  warnings: z.array(z.string()).optional(),
  parserVersion: z.number().int().positive().optional(),
  originalAmountCents: centsSchema.optional(),
  debtResidualCents: centsSchema.optional(),
  accountLabel: z.string().optional(),
  scheduleFileName: z.string().min(1),
  installments: z.array(installmentSchema).min(1),
}).superRefine((plan, context) => {
  const seenNumbers = new Set<number>();
  const seenDates = new Set<string>();
  let priorNumber = 0;
  let priorDate = '';
  plan.installments.forEach((installment, index) => {
    if (seenNumbers.has(installment.number)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['installments', index, 'number'], message: 'Numero rata duplicato' });
    }
    if (seenDates.has(installment.dueDate)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['installments', index, 'dueDate'], message: 'Data rata duplicata' });
    }
    if (installment.number <= priorNumber) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['installments', index, 'number'], message: 'I numeri rata devono essere strettamente crescenti' });
    }
    if (priorDate && installment.dueDate <= priorDate) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['installments', index, 'dueDate'], message: 'Le date rata devono essere strettamente crescenti' });
    }
    seenNumbers.add(installment.number);
    seenDates.add(installment.dueDate);
    priorNumber = installment.number;
    priorDate = installment.dueDate;
  });
});

/** Returns non-blocking reconciliation warnings for inconsistent source schedules. */
export function mortgageWarnings(plan: MortgageDetails): string[] {
  const warnings: string[] = [];
  for (let index = 0; index < plan.installments.length; index += 1) {
    const installment = plan.installments[index];
    const breakdown = installment.principalCents + installment.interestCents + (installment.otherCents ?? 0);
    if (!Number.isSafeInteger(breakdown) || breakdown !== installment.installmentCents) {
      warnings.push(`Rata ${installment.number}: le componenti non coincidono con l'importo della rata.`);
    }
    const next = plan.installments[index + 1];
    if (next && installment.residualCents - next.residualCents !== next.principalCents) {
      warnings.push(`Rate ${installment.number}–${next.number}: il residuo non coincide con la quota capitale successiva.`);
    }
  }
  const last = plan.installments.at(-1);
  if (last && last.residualCents !== 0) warnings.push(`Ultima rata ${last.number}: il capitale residuo finale non è zero.`);
  return warnings;
}
