export type InvoiceRow = {
  destination: string;
  amount: string;
  asset: string;
  memo: string;
};

export type RowError = {
  row: number;
  field: string;
  message: string;
};

export type ParseResult = {
  validRows: InvoiceRow[];
  errors: RowError[];
};

const REQUIRED_COLUMNS = ["destination", "amount"];
const VALID_ASSETS = ["USDC", "XLM"];

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z]/g, "");
}

const HEADER_MAP: Record<string, keyof InvoiceRow> = {
  destination: "destination",
  address: "destination",
  recipient: "destination",
  wallet: "destination",
  amount: "amount",
  value: "amount",
  asset: "asset",
  currency: "asset",
  token: "asset",
  memo: "memo",
  note: "memo",
  description: "memo",
  message: "memo",
};

function parseLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseCSV(text: string): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { validRows: [], errors: [{ row: 0, field: "file", message: "CSV file is empty." }] };
  }

  // Map headers
  const rawHeaders = parseLine(lines[0]);
  const columnMap: Record<number, keyof InvoiceRow> = {};

  rawHeaders.forEach((h, i) => {
    const normalized = normalizeHeader(h);
    if (HEADER_MAP[normalized]) {
      columnMap[i] = HEADER_MAP[normalized];
    }
  });

  // Check required columns exist
  const mappedFields = new Set(Object.values(columnMap));
  for (const req of REQUIRED_COLUMNS) {
    if (!mappedFields.has(req as keyof InvoiceRow)) {
      return {
        validRows: [],
        errors: [{ row: 0, field: req, message: `Missing required column: "${req}". Expected columns: destination, amount, asset (optional), memo (optional).` }],
      };
    }
  }

  const validRows: InvoiceRow[] = [];
  const errors: RowError[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cells = parseLine(lines[i]);
    const row: InvoiceRow = { destination: "", amount: "", asset: "USDC", memo: "" };

    // Fill from column map
    for (const [colIdx, field] of Object.entries(columnMap)) {
      const value = cells[Number(colIdx)] ?? "";
      row[field] = value;
    }

    // Default asset
    if (!row.asset || row.asset.trim() === "") {
      row.asset = "USDC";
    } else {
      row.asset = row.asset.toUpperCase().trim();
    }

    // Validate
    let hasError = false;

    if (!row.destination) {
      errors.push({ row: i, field: "destination", message: "Destination address is required." });
      hasError = true;
    }

    if (!row.amount) {
      errors.push({ row: i, field: "amount", message: "Amount is required." });
      hasError = true;
    } else {
      const num = Number(row.amount);
      if (isNaN(num)) {
        errors.push({ row: i, field: "amount", message: `"${row.amount}" is not a valid number.` });
        hasError = true;
      } else if (num <= 0) {
        errors.push({ row: i, field: "amount", message: "Amount must be greater than zero." });
        hasError = true;
      }
    }

    if (!VALID_ASSETS.includes(row.asset)) {
      errors.push({ row: i, field: "asset", message: `Unsupported asset "${row.asset}". Use USDC or XLM.` });
      hasError = true;
    }

    if (hasError) {
      // Still add so user can fix in review table
      validRows.push(row);
    } else {
      validRows.push(row);
    }
  }

  return { validRows, errors };
}
