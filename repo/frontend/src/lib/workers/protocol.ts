export interface WorkerCommand<T extends string = string, P = unknown> {
  id: string;
  jobId: string;
  command: T;
  payload: P;
}

export interface WorkerResponse<T extends string = string, D = unknown> {
  id: string;
  jobId: string;
  type: T;
  data: D;
}

export type ImportCommand =
  | WorkerCommand<'parse-csv', { text: string }>
  | WorkerCommand<'parse-json', { text: string }>
  | WorkerCommand<'validate-rows', { rows: RawRow[]; maxRows: number }>
  | WorkerCommand<'cancel'>;

export type ImportResponse =
  | WorkerResponse<'progress', { parsed: number; total: number }>
  | WorkerResponse<'parse-complete', { rows: RawRow[]; totalRows: number }>
  | WorkerResponse<'validation-complete', { results: RowValidationResult[] }>
  | WorkerResponse<'error', { message: string; code?: string }>
  | WorkerResponse<'cancelled'>;

export interface RawRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface RowValidationResult {
  rowNumber: number;
  valid: boolean;
  normalized: NormalizedCardRow | null;
  errors: FieldError[];
  warnings: string[];
}

export interface NormalizedCardRow {
  title: string;
  body: string;
  date: string;
  mood: number;
  tags: string[];
}

export interface FieldError {
  field: string;
  message: string;
}

let messageCounter = 0;
export function generateMessageId(): string {
  return `msg-${++messageCounter}-${Date.now()}`;
}
