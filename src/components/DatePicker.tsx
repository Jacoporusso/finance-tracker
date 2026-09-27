import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDaysIcon, ChevronLeftIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { formatDate } from '../domain/display';

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  required?: boolean;
  label: string;
  className?: string;
}

const weekdays = ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'];
const invalidMessage = 'Inserisci una data valida nel formato gg/mm/aaaa.';

export default function DatePicker({ value, onChange, min, max, required = false, label, className = '' }: DatePickerProps) {
  const initial = parseIso(value) ?? parseIso(todayInRome())!;
  const [text, setText] = useState(formatDate(value));
  const [month, setMonth] = useState({ year: initial.year, month: initial.month });
  const [open, setOpen] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const selectedDayRef = useRef<HTMLButtonElement>(null);
  const days = useMemo(() => calendarDays(month.year, month.month), [month]);

  useEffect(() => {
    setText(formatDate(value));
    const parsed = parseIso(value);
    if (parsed) setMonth({ year: parsed.year, month: parsed.month });
    setInvalid(false);
    inputRef.current?.setCustomValidity('');
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    selectedDayRef.current?.focus();
  }, [open]);

  const setValidity = useCallback((nextText: string) => {
    const iso = parseItalianDate(nextText);
    const valid = Boolean(iso && (!min || iso >= min) && (!max || iso <= max));
    const message = nextText.trim() === '' && !required
      ? ''
      : valid
        ? ''
        : `${invalidMessage}${min || max ? ' La data deve essere compresa nell’intervallo consentito.' : ''}`;
    inputRef.current?.setCustomValidity(message);
    setInvalid(Boolean(message));
    return valid ? iso : undefined;
  }, [min, max, required]);

  useEffect(() => {
    if (inputRef.current) setValidity(inputRef.current.value);
  }, [setValidity]);

  function changeText(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.value;
    setText(next);
    const iso = setValidity(next);
    if (next.trim() === '' && !required) onChange('');
    else if (iso) onChange(iso);
  }

  function selectDay(day: number) {
    const iso = `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if ((min && iso < min) || (max && iso > max)) return;
    setText(formatDate(iso));
    setInvalid(false);
    inputRef.current?.setCustomValidity('');
    onChange(iso);
    closeCalendar();
  }

  function closeCalendar() {
    setOpen(false);
    if (dialogRef.current?.open) dialogRef.current.close();
  }

  const monthName = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(month.year, month.month - 1, 1)));

  return <div className={className}>
    <div className="flex min-h-11 items-stretch rounded-xl border border-line bg-canvas focus-within:border-green focus-within:ring-2 focus-within:ring-green/20">
      <input
        ref={inputRef}
        type="text" inputMode="numeric" autoComplete="off" required={required}
        aria-label={label} aria-invalid={invalid} aria-describedby={invalid ? `${inputId(label)}-error` : undefined}
        placeholder="gg/mm/aaaa" value={text}
        onChange={changeText}
        className="min-w-0 flex-1 rounded-l-xl bg-transparent px-3 text-base text-ink outline-none placeholder:text-muted"
      />
      <button type="button" aria-label={`Apri calendario: ${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="grid min-h-11 min-w-11 place-items-center rounded-r-xl text-muted hover:bg-surface hover:text-ink">
        <CalendarDaysIcon className="size-5" aria-hidden="true" />
      </button>
    </div>
    {invalid && <p id={`${inputId(label)}-error`} role="alert" className="mt-1 text-xs text-red-700">{invalidMessage}{min || max ? ' La data deve essere compresa nell’intervallo consentito.' : ''}</p>}
    {open && createPortal(
      <dialog
        ref={dialogRef}
        aria-label={`Calendario ${label}`}
        onCancel={(event) => { event.preventDefault(); closeCalendar(); }}
        onClick={(event) => { if (event.target === dialogRef.current) closeCalendar(); }}
        onClose={() => setOpen(false)}
        className="fixed inset-0 m-auto max-h-[min(90dvh,34rem)] w-[min(20rem,100vw)] max-w-none overflow-y-auto rounded-2xl border border-line bg-surface p-1 text-ink shadow-xl backdrop:bg-black/40"
      >
        <div className="mb-1 flex min-h-11 items-center justify-between gap-1">
          <button type="button" aria-label="Mese precedente" onClick={() => setMonth(shiftMonth(month, -1))} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-canvas"><ChevronLeftIcon className="size-5" aria-hidden="true" /></button>
          <p className="text-center text-sm font-semibold capitalize">{monthName}</p>
          <button type="button" aria-label="Mese successivo" onClick={() => setMonth(shiftMonth(month, 1))} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-canvas"><ChevronRightIcon className="size-5" aria-hidden="true" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-xs font-medium text-muted" aria-hidden="true">{weekdays.map((day) => <span key={day} className="flex min-h-11 items-center justify-center">{day}</span>)}</div>
        <div className="grid grid-cols-7" role="group" aria-label={monthName}>
          {days.map((day, index) => {
            if (day === null) return <span key={`blank-${index}`} aria-hidden="true" />;
            const iso = `${month.year}-${String(month.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const disabled = Boolean((min && iso < min) || (max && iso > max));
            return <button
              key={iso}
              ref={iso === value ? selectedDayRef : undefined}
              type="button" disabled={disabled} aria-label={formatDate(iso)} aria-pressed={iso === value}
              onClick={() => selectDay(day)}
              className={`min-h-11 min-w-11 rounded-lg text-sm tabular-nums hover:bg-green-soft hover:text-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-green disabled:cursor-not-allowed disabled:opacity-30 ${iso === value ? 'bg-green text-on-green hover:bg-green' : ''}`}
            >{day}</button>;
          })}
        </div>
        {!required && value && <button type="button" onClick={() => { setText(''); setInvalid(false); inputRef.current?.setCustomValidity(''); onChange(''); closeCalendar(); }} className="mt-1 min-h-11 w-full rounded-lg text-sm font-medium text-muted hover:bg-canvas">Cancella data</button>}
      </dialog>,
      document.body,
    )}
  </div>;
}

function inputId(label: string): string {
  return `date-picker-${label.toLowerCase().replace(/[^a-z0-9]+/gu, '-')}`;
}

function todayInRome(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function parseItalianDate(text: string): string | undefined {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/u.exec(text.trim());
  if (!match) return undefined;
  const [, day, month, year] = match;
  const parsed = parseIso(`${year}-${month}-${day}`);
  return parsed ? `${year}-${month}-${day}` : undefined;
}

function parseIso(value: string): { year: number; month: number; day: number } | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? { year, month, day }
    : undefined;
}

function calendarDays(year: number, month: number): Array<number | null> {
  const offset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: Array<number | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: count }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  return cells;
}

function shiftMonth(current: { year: number; month: number }, amount: number) {
  const date = new Date(Date.UTC(current.year, current.month - 1 + amount, 1));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 };
}
