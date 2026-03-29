import PDFDocument from "pdfkit";

export function exportToPDF<T extends Record<string, unknown>>(data: T[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument();
    const buffers: Buffer[] = [];

    doc.on("data", (chunk: Buffer) => buffers.push(chunk));
    doc.on("end", () => {
      const pdfBuffer = Buffer.concat(buffers);
      resolve(pdfBuffer.toString("base64"));
    });
    doc.on("error", reject);

    doc.text("Financial Report");
    doc.moveDown();
    doc.text(JSON.stringify(data, null, 2));

    doc.end();
  });
}