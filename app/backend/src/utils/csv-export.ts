import { Parser } from "json2csv";

export function exportToCSV<T extends Record<string, unknown>>(data: T[]): string {
  const parser = new Parser<T>();
  return parser.parse(data);
}