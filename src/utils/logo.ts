export const DEFAULT_BRAND_LOGO_PATH =
  '/assets/aistudio/WhatsApp_Image_2026-11-16_at_2.13.58_PM-removebg-preview_1dc4c95a.png';

export const ALLOWED_LOGO_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
]);

export const MAX_LOGO_FILE_BYTES = 5 * 1024 * 1024; // 5 MB raw upload limit
export const MAX_FIRESTORE_LOGO_CHARS = 340_000;

export interface ProcessedLogoResult {
  originalDataUrl: string;
  whiteDataUrl: string;
  width: number;
  height: number;
  hasTransparency: boolean;
  trimmedPadding: boolean;
  needsConfirmation: boolean;
  warningReason?: string;
}

export interface PDFLogoAsset {
  dataUrl: string;
  width: number;
  height: number;
  format: 'PNG';
}

const whiteUrlCache = new Map<string, Promise<string>>();
const pdfLogoCache = new Map<string, Promise<PDFLogoAsset>>();

export function isSupportedLogoFile(file: File): boolean {
  if (ALLOWED_LOGO_MIME_TYPES.has(file.type.toLowerCase())) {
    return true;
  }
  const name = file.name.toLowerCase();
  return /\.(png|jpe?g|webp|svg)$/i.test(name);
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Could not read the selected image file.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read the selected image file.'));
    reader.readAsDataURL(file);
  });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (!src.startsWith('data:') && !src.startsWith('blob:')) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (w <= 0 || h <= 0) {
        reject(new Error('The selected logo image has invalid dimensions.'));
        return;
      }
      resolve(img);
    };
    img.onerror = () => reject(new Error('Unable to load logo image asset.'));
    img.src = src;
  });
}

function sanitizeSvgDataUrlIfSafe(rawText: string): string | null {
  const trimmed = rawText.trim();
  if (!trimmed.toLowerCase().includes('<svg')) return null;
  // Strip any script tags or inline event handlers
  const cleaned = trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(['"])[\s\S]*?\1/gi, '')
    .replace(/javascript:/gi, '');
  const encoded = btoa(unescape(encodeURIComponent(cleaned)));
  return `data:image/svg+xml;base64,${encoded}`;
}

interface PixelBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  opaqueCount: number;
  semiTransparentCount: number;
  fullyTransparentCount: number;
}

function analyzeImageData(data: Uint8ClampedArray, width: number, height: number): PixelBounds {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  let opaqueCount = 0;
  let semiTransparentCount = 0;
  let fullyTransparentCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a <= 4) {
        fullyTransparentCount++;
      } else {
        if (a < 245) semiTransparentCount++;
        else opaqueCount++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    opaqueCount,
    semiTransparentCount,
    fullyTransparentCount,
  };
}

function estimateCornerBackgroundColor(
  data: Uint8ClampedArray,
  width: number,
  height: number
): { r: number; g: number; b: number; isUniform: boolean } {
  const sampleCoords: [number, number][] = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [Math.floor(width / 2), height - 1],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
  ];

  const samples = sampleCoords.map(([x, y]) => {
    const idx = (y * width + x) * 4;
    return { r: data[idx], g: data[idx + 1], b: data[idx + 2], a: data[idx + 3] };
  });

  const avgR = Math.round(samples.reduce((s, p) => s + p.r, 0) / samples.length);
  const avgG = Math.round(samples.reduce((s, p) => s + p.g, 0) / samples.length);
  const avgB = Math.round(samples.reduce((s, p) => s + p.b, 0) / samples.length);

  const maxSpread = samples.reduce((max, p) => {
    const dist = Math.abs(p.r - avgR) + Math.abs(p.g - avgG) + Math.abs(p.b - avgB);
    return Math.max(max, dist);
  }, 0);

  return { r: avgR, g: avgG, b: avgB, isUniform: maxSpread < 60 };
}

function createCanvasFromBounds(
  sourceCanvas: HTMLCanvasElement,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas context is unavailable.');
  }
  ctx.drawImage(sourceCanvas, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function encodePngWithinBudget(canvas: HTMLCanvasElement, maxChars: number): string {
  let current = canvas;
  let dataUrl = current.toDataURL('image/png');
  let step = 0;

  while (dataUrl.length > maxChars && step < 4 && current.width > 160 && current.height > 80) {
    step++;
    const scale = 0.78;
    const next = document.createElement('canvas');
    next.width = Math.max(120, Math.round(current.width * scale));
    next.height = Math.max(60, Math.round(current.height * scale));
    const ctx = next.getContext('2d');
    if (!ctx) break;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(current, 0, 0, next.width, next.height);
    current = next;
    dataUrl = current.toDataURL('image/png');
  }

  return dataUrl;
}

function buildWhiteLogoCanvas(
  sourceCanvas: HTMLCanvasElement,
  hasTransparency: boolean,
  bgThreshold: number
): {
  whiteCanvas: HTMLCanvasElement;
  visibleRatio: number;
  solidRectRisk: boolean;
  bgColorUniform: boolean;
} {
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;
  const whiteCanvas = document.createElement('canvas');
  whiteCanvas.width = w;
  whiteCanvas.height = h;
  const ctx = whiteCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Browser canvas context is unavailable.');
  }
  ctx.drawImage(sourceCanvas, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const px = imgData.data;

  const total = w * h;
  let visiblePixels = 0;
  let bgColorUniform = true;

  if (hasTransparency) {
    // Transparent PNG / WebP / SVG: preserve alpha channel cleanly, turn all visible artwork pure white
    for (let i = 0; i < px.length; i += 4) {
      const a = px[i + 3];
      if (a > 0) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = a;
        if (a > 24) visiblePixels++;
      } else {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
      }
    }
  } else {
    // Opaque image (e.g. JPG or non-transparent PNG): strip uniform background color cleanly
    const bg = estimateCornerBackgroundColor(px, w, h);
    bgColorUniform = bg.isUniform;
    const threshold = Math.max(12, Math.min(120, bgThreshold));
    const featherRange = Math.max(18, threshold * 0.65);

    for (let i = 0; i < px.length; i += 4) {
      const dr = px[i] - bg.r;
      const dg = px[i + 1] - bg.g;
      const db = px[i + 2] - bg.b;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);

      let outAlpha = 0;
      if (dist <= threshold) {
        outAlpha = 0;
      } else if (dist < threshold + featherRange) {
        const t = (dist - threshold) / featherRange;
        outAlpha = Math.round(Math.min(255, Math.max(0, t * 255)));
      } else {
        outAlpha = 255;
      }

      if (outAlpha > 0) {
        px[i] = 255;
        px[i + 1] = 255;
        px[i + 2] = 255;
        px[i + 3] = outAlpha;
        if (outAlpha > 24) visiblePixels++;
      } else {
        px[i] = 0;
        px[i + 1] = 0;
        px[i + 2] = 0;
        px[i + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const visibleRatio = total > 0 ? visiblePixels / total : 0;
  // Flag risk if output turns out almost blank (<0.5%) or nearly a solid white rectangle (>82%)
  const solidRectRisk = visibleRatio > 0.82 || visibleRatio < 0.005;

  return {
    whiteCanvas,
    visibleRatio,
    solidRectRisk,
    bgColorUniform,
  };
}

export async function processUploadedLogo(
  file: File,
  options?: {
    bgThreshold?: number;
    trimTransparentMargin?: boolean;
  }
): Promise<ProcessedLogoResult> {
  if (!isSupportedLogoFile(file)) {
    throw new Error('Unsupported file format. Please upload a PNG, JPG, SVG, or WebP logo.');
  }
  if (file.size > MAX_LOGO_FILE_BYTES) {
    throw new Error('Logo file is larger than 5 MB. Please upload a smaller file.');
  }

  const bgThreshold = options?.bgThreshold ?? 38;
  const shouldTrim = options?.trimTransparentMargin ?? true;

  let rawDataUrl: string;
  let sanitizedSvgDataUrl: string | null = null;

  if (file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')) {
    const svgText = await file.text();
    sanitizedSvgDataUrl = sanitizeSvgDataUrlIfSafe(svgText);
    if (!sanitizedSvgDataUrl) {
      throw new Error('Invalid SVG file. Please select a valid SVG logo.');
    }
    rawDataUrl = sanitizedSvgDataUrl;
  } else {
    rawDataUrl = await readFileAsDataUrl(file);
  }

  const img = await loadImageElement(rawDataUrl);
  const natW = img.naturalWidth || img.width || 500;
  const natH = img.naturalHeight || img.height || 500;

  // Scale proportionally only when oversized (>720px on longest edge), preserving aspect ratio
  const maxDim = 720;
  const scale = Math.max(natW, natH) > maxDim ? maxDim / Math.max(natW, natH) : 1;
  const targetW = Math.max(1, Math.round(natW * scale));
  const targetH = Math.max(1, Math.round(natH * scale));

  const workCanvas = document.createElement('canvas');
  workCanvas.width = targetW;
  workCanvas.height = targetH;
  const workCtx = workCanvas.getContext('2d');
  if (!workCtx) {
    throw new Error('Browser canvas context is unavailable.');
  }
  workCtx.imageSmoothingEnabled = true;
  workCtx.imageSmoothingQuality = 'high';
  workCtx.drawImage(img, 0, 0, targetW, targetH);

  const rawImgData = workCtx.getImageData(0, 0, targetW, targetH);
  const bounds = analyzeImageData(rawImgData.data, targetW, targetH);

  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) {
    throw new Error('The uploaded logo image appears completely blank.');
  }

  const totalPixels = targetW * targetH;
  const hasTransparency = bounds.fullyTransparentCount / totalPixels > 0.03;

  // Trim excess empty transparent margin ONLY if >25% of canvas is blank alpha=0 border,
  // preserving every visible artwork pixel and keeping exact artwork proportions.
  let activeOriginalCanvas = workCanvas;
  let trimmedPadding = false;

  if (hasTransparency && shouldTrim) {
    const contentW = bounds.maxX - bounds.minX + 1;
    const contentH = bounds.maxY - bounds.minY + 1;
    const areaRatio = (contentW * contentH) / totalPixels;

    if (areaRatio < 0.72) {
      const pad = Math.max(6, Math.round(Math.max(contentW, contentH) * 0.03));
      const sx = Math.max(0, bounds.minX - pad);
      const sy = Math.max(0, bounds.minY - pad);
      const ex = Math.min(targetW - 1, bounds.maxX + pad);
      const ey = Math.min(targetH - 1, bounds.maxY + pad);
      activeOriginalCanvas = createCanvasFromBounds(
        workCanvas,
        sx,
        sy,
        ex - sx + 1,
        ey - sy + 1
      );
      trimmedPadding = true;
    }
  }

  const { whiteCanvas, solidRectRisk, bgColorUniform } = buildWhiteLogoCanvas(
    activeOriginalCanvas,
    hasTransparency,
    bgThreshold
  );

  // If opaque background removal trimmed out the border, also check white canvas tight bounds
  // so white version doesn't carry unused border when converted from opaque files
  let finalWhiteCanvas = whiteCanvas;
  if (!hasTransparency && shouldTrim) {
    const wCtx = whiteCanvas.getContext('2d');
    if (wCtx) {
      const wBounds = analyzeImageData(
        wCtx.getImageData(0, 0, whiteCanvas.width, whiteCanvas.height).data,
        whiteCanvas.width,
        whiteCanvas.height
      );
      if (wBounds.maxX >= wBounds.minX && wBounds.maxY >= wBounds.minY) {
        const cw = wBounds.maxX - wBounds.minX + 1;
        const ch = wBounds.maxY - wBounds.minY + 1;
        if ((cw * ch) / (whiteCanvas.width * whiteCanvas.height) < 0.72) {
          const pad = Math.max(6, Math.round(Math.max(cw, ch) * 0.03));
          const sx = Math.max(0, wBounds.minX - pad);
          const sy = Math.max(0, wBounds.minY - pad);
          const ex = Math.min(whiteCanvas.width - 1, wBounds.maxX + pad);
          const ey = Math.min(whiteCanvas.height - 1, wBounds.maxY + pad);
          finalWhiteCanvas = createCanvasFromBounds(
            whiteCanvas,
            sx,
            sy,
            ex - sx + 1,
            ey - sy + 1
          );
        }
      }
    }
  }

  const originalDataUrl =
    sanitizedSvgDataUrl && !trimmedPadding && sanitizedSvgDataUrl.length <= MAX_FIRESTORE_LOGO_CHARS
      ? sanitizedSvgDataUrl
      : encodePngWithinBudget(activeOriginalCanvas, MAX_FIRESTORE_LOGO_CHARS);

  const whiteDataUrl = encodePngWithinBudget(finalWhiteCanvas, MAX_FIRESTORE_LOGO_CHARS);

  let needsConfirmation = false;
  let warningReason: string | undefined;

  if (!hasTransparency) {
    needsConfirmation = true;
    warningReason = bgColorUniform
      ? 'This image has a solid background. Please review the auto-converted white logo below and adjust sensitivity if needed before saving.'
      : 'This image has a varied/opaque background without transparency. Please inspect the white preview carefully before saving.';
  } else if (solidRectRisk) {
    needsConfirmation = true;
    warningReason =
      'Automatic white conversion detected either very high solid fill or almost no visible artwork. Please confirm the white preview before applying.';
  }

  return {
    originalDataUrl,
    whiteDataUrl,
    width: activeOriginalCanvas.width,
    height: activeOriginalCanvas.height,
    hasTransparency,
    trimmedPadding,
    needsConfirmation,
    warningReason,
  };
}

export function generateWhiteLogoFromUrl(url: string): Promise<string> {
  const existing = whiteUrlCache.get(url);
  if (existing) return existing;

  const task = (async () => {
    const img = await loadImageElement(url);
    const w = img.naturalWidth || img.width || 500;
    const h = img.naturalHeight || img.height || 500;
    const maxDim = 640;
    const scale = Math.max(w, h) > maxDim ? maxDim / Math.max(w, h) : 1;
    const targetW = Math.max(1, Math.round(w * scale));
    const targetH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Browser canvas context is unavailable.');
    ctx.drawImage(img, 0, 0, targetW, targetH);

    const bounds = analyzeImageData(
      ctx.getImageData(0, 0, targetW, targetH).data,
      targetW,
      targetH
    );
    const hasTransparency = bounds.fullyTransparentCount / (targetW * targetH) > 0.03;

    let work = canvas;
    if (hasTransparency && bounds.maxX >= bounds.minX && bounds.maxY >= bounds.minY) {
      const cw = bounds.maxX - bounds.minX + 1;
      const ch = bounds.maxY - bounds.minY + 1;
      if ((cw * ch) / (targetW * targetH) < 0.72) {
        const pad = Math.max(6, Math.round(Math.max(cw, ch) * 0.03));
        const sx = Math.max(0, bounds.minX - pad);
        const sy = Math.max(0, bounds.minY - pad);
        const ex = Math.min(targetW - 1, bounds.maxX + pad);
        const ey = Math.min(targetH - 1, bounds.maxY + pad);
        work = createCanvasFromBounds(canvas, sx, sy, ex - sx + 1, ey - sy + 1);
      }
    }

    const { whiteCanvas } = buildWhiteLogoCanvas(work, hasTransparency, 38);
    return whiteCanvas.toDataURL('image/png');
  })().catch((err) => {
    whiteUrlCache.delete(url);
    throw err;
  });

  whiteUrlCache.set(url, task);
  return task;
}

export function loadLogoForPDF(src: string): Promise<PDFLogoAsset> {
  const existing = pdfLogoCache.get(src);
  if (existing) return existing;

  const task = (async (): Promise<PDFLogoAsset> => {
    const img = await loadImageElement(src);
    const natW = img.naturalWidth || img.width || 500;
    const natH = img.naturalHeight || img.height || 500;

    // Rasterize cleanly onto an offscreen canvas (handles PNG, JPG, SVG, and WebP uniformly)
    const maxEdge = 900;
    const scale = Math.max(natW, natH) > maxEdge ? maxEdge / Math.max(natW, natH) : 1;
    const targetW = Math.max(1, Math.round(natW * scale));
    const targetH = Math.max(1, Math.round(natH * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Could not initialize canvas while embedding logo into PDF.');
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, targetW, targetH);

    // If excess transparent padding (>28%) exists on a bundled/fallback PNG, trim empty alpha=0 border
    const bounds = analyzeImageData(
      ctx.getImageData(0, 0, targetW, targetH).data,
      targetW,
      targetH
    );
    let outCanvas = canvas;
    if (
      bounds.fullyTransparentCount / (targetW * targetH) > 0.03 &&
      bounds.maxX >= bounds.minX &&
      bounds.maxY >= bounds.minY
    ) {
      const cw = bounds.maxX - bounds.minX + 1;
      const ch = bounds.maxY - bounds.minY + 1;
      if ((cw * ch) / (targetW * targetH) < 0.72) {
        const pad = Math.max(6, Math.round(Math.max(cw, ch) * 0.03));
        const sx = Math.max(0, bounds.minX - pad);
        const sy = Math.max(0, bounds.minY - pad);
        const ex = Math.min(targetW - 1, bounds.maxX + pad);
        const ey = Math.min(targetH - 1, bounds.maxY + pad);
        outCanvas = createCanvasFromBounds(canvas, sx, sy, ex - sx + 1, ey - sy + 1);
      }
    }

    return {
      dataUrl: outCanvas.toDataURL('image/png'),
      width: outCanvas.width,
      height: outCanvas.height,
      format: 'PNG',
    };
  })().catch((err) => {
    pdfLogoCache.delete(src);
    throw err instanceof Error
      ? err
      : new Error('Failed to load company logo for PDF export.');
  });

  pdfLogoCache.set(src, task);
  return task;
}

export function clearLogoCaches(): void {
  whiteUrlCache.clear();
  pdfLogoCache.clear();
}
