// Extracts text from an uploaded PDF or image entirely in the browser.
// The original file never leaves the device — only the text this
// produces is ever sent anywhere, and only once the student approves it.

async function ocrImage(source, onProgress) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: m => {
      if (m.status === 'recognizing text') onProgress?.(`Reading text… ${Math.round(m.progress * 100)}%`);
    },
  });
  try {
    const { data } = await worker.recognize(source);
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}

async function loadPdf(file) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();
  const buffer = await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: buffer }).promise;
}

async function extractPdfTextLayer(pdf, onProgress) {
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    onProgress?.(`Reading page ${i} of ${pdf.numPages}…`);
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n\n';
  }
  return text;
}

async function ocrPdfPages(pdf, onProgress) {
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    const pageText = await ocrImage(canvas, p => onProgress?.(`Scanning page ${i} of ${pdf.numPages} (${p.replace('Reading text… ', '')})`));
    text += pageText + '\n\n';
  }
  return text;
}

export async function extractText(file, onProgress) {
  if (file.type === 'application/pdf') {
    onProgress?.('Opening your PDF…');
    const pdf = await loadPdf(file);
    let text = await extractPdfTextLayer(pdf, onProgress);
    const density = text.replace(/\s+/g, '').length / pdf.numPages;
    if (density < 15) {
      onProgress?.('This looks like a scanned document — running OCR…');
      text = await ocrPdfPages(pdf, onProgress);
    }
    return text.trim();
  }
  if (file.type.startsWith('image/')) {
    onProgress?.('Reading text from your image…');
    return ocrImage(file, onProgress);
  }
  throw new Error('Please upload a PDF or an image (JPG or PNG).');
}
