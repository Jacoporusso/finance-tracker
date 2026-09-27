import * as XLSX from 'xlsx';
import { ingParser } from '../ing/parser';
import { intesaParser } from '../intesa/parser';
import type { ParsedImport } from './types';

const parsers = [ingParser, intesaParser];

/** Parses an uploaded bank workbook without making any network or persistence calls. */
export function parseBankFile(buffer: ArrayBuffer): ParsedImport {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellNF: false, cellText: false });
  } catch {
    throw new Error('Impossibile leggere il file selezionato.');
  }

  const detections = parsers
    .map((parser) => ({ parser, result: parser.detect(workbook) }))
    .filter(({ result }) => result.bank !== 'UNKNOWN')
    .sort((left, right) => right.result.confidence - left.result.confidence);

  if (!detections.length) throw new Error('Formato bancario non riconosciuto.');
  if (detections.length > 1 && detections[0].result.confidence === detections[1].result.confidence) {
    throw new Error('Il file contiene più formati bancari riconosciuti. Selezionare un solo estratto.');
  }
  return detections[0].parser.parse(workbook);
}
