import type { WorkBook } from 'xlsx';
import type { ParsedImport } from './types';

export type ParsedWorkbook = WorkBook;

export type DetectionResult =
  | { bank: 'ING' | 'INTESA'; confidence: number; sheetName: string }
  | { bank: 'UNKNOWN'; confidence: number };

export interface BankParser {
  id: 'ING' | 'INTESA';
  version: string;
  detect(workbook: ParsedWorkbook): DetectionResult;
  parse(workbook: ParsedWorkbook): ParsedImport;
}
