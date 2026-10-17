// Writes CV files for the email samples: a text PDF, a DOCX, and a "scanned" PDF that contains
// only an image (no text layer), which text extraction can't read.
const fs = require('node:fs');
const zlib = require('node:zlib');
const { PDFDocument, StandardFonts } = require('pdf-lib');
const { Document, Packer, Paragraph, TextRun } = require('docx');

async function writeTextPdf(file, text) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const size = 10.5;
  const margin = 54;
  let page = pdf.addPage([612, 792]);
  let y = 792 - margin;
  const maxWidth = 612 - margin * 2;
  const wrap = (line) => {
    const words = line.split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const next = cur ? `${cur} ${w}` : w;
      if (font.widthOfTextAtSize(next, size) > maxWidth && cur) { lines.push(cur); cur = w; } else cur = next;
    }
    lines.push(cur);
    return lines;
  };
  for (const raw of text.split('\n')) {
    for (const line of wrap(raw)) {
      if (y < margin) { page = pdf.addPage([612, 792]); y = 792 - margin; }
      page.drawText(line, { x: margin, y, size, font });
      y -= size * 1.45;
    }
  }
  fs.writeFileSync(file, await pdf.save());
}

async function writeDocx(file, text) {
  const doc = new Document({
    sections: [{ children: text.split('\n').map((line) => new Paragraph({ children: [new TextRun(line)] })) }],
  });
  fs.writeFileSync(file, await Packer.toBuffer(doc));
}

// A grayscale PNG with dark bars that look like lines of text on a scanned page.
function scannedPng(seed, width = 612, height = 792) {
  let s = seed >>> 0;
  const rand = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const raw = Buffer.alloc((width + 1) * height, 0xf4);
  for (let y = 0; y < height; y++) raw[y * (width + 1)] = 0; // filter byte per row
  for (let line = 60; line < height - 60; line += 22) {
    const len = 200 + Math.floor(rand() * 300);
    for (let y = line; y < line + 9; y++) {
      for (let x = 60; x < 60 + len; x++) if (rand() > 0.25) raw[y * (width + 1) + 1 + x] = 0x30 + Math.floor(rand() * 40);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 0; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit grayscale
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function writeScannedPdf(file, seed) {
  const pdf = await PDFDocument.create();
  const png = await pdf.embedPng(scannedPng(seed));
  const page = pdf.addPage([612, 792]);
  page.drawImage(png, { x: 0, y: 0, width: 612, height: 792 });
  fs.writeFileSync(file, await pdf.save());
}

module.exports = { writeTextPdf, writeDocx, writeScannedPdf };
