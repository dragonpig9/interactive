// Copies pdf.js font/CMap data into public/ so Chinese PDFs render and extract offline.
import { cpSync, existsSync, mkdirSync } from 'node:fs';
const src = 'node_modules/pdfjs-dist';
const dest = 'public/pdfjs';
mkdirSync(dest, { recursive: true });
for (const dir of ['cmaps', 'standard_fonts', 'wasm']) {
  if (existsSync(`${src}/${dir}`)) cpSync(`${src}/${dir}`, `${dest}/${dir}`, { recursive: true });
}
console.log('pdf.js assets copied to public/pdfjs');
