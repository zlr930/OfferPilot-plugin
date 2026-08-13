const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 80_000;
const EXTENSION_TYPES = new Map([
  ["pdf", "pdf"],
  ["docx", "docx"],
  ["html", "html"],
  ["htm", "html"],
]);

export async function extractResumeFile(file, onProgress = () => {}) {
  if (!file || !file.size) throw new Error("请选择一个非空的简历文件");
  if (file.size > MAX_RESUME_FILE_BYTES) {
    throw new Error("简历文件不能超过 10 MB");
  }

  const fileType = getResumeFileType(file.name);
  let text;
  try {
    onProgress({ phase: "read", progress: 0 });
    if (fileType === "pdf") text = await extractPdf(file, onProgress);
    if (fileType === "docx") text = await extractDocx(file, onProgress);
    if (fileType === "html") text = await extractHtml(file, onProgress);
  } catch (error) {
    if (error.message?.includes("扫描版")) throw error;
    throw new Error(`无法读取该 ${fileType.toUpperCase()} 文件，请确认文件未损坏`, {
      cause: error,
    });
  }

  const normalized = normalizeExtractedText(text);
  onProgress({ phase: "normalize", progress: 1 });
  if (normalized.length < 20) {
    if (fileType === "pdf") {
      throw new Error("扫描版 PDF 暂不支持，请先转换为可选择文字的 PDF");
    }
    throw new Error("文件中没有足够的可解析文字");
  }

  return {
    fileName: file.name,
    fileType,
    text: normalized.slice(0, MAX_EXTRACTED_CHARACTERS),
    extractedCharacterCount: normalized.length,
    truncated: normalized.length > MAX_EXTRACTED_CHARACTERS,
  };
}

export function getResumeFileType(fileName = "") {
  const extension = fileName.toLowerCase().split(".").pop();
  const fileType = EXTENSION_TYPES.get(extension);
  if (!fileType) throw new Error("仅支持 PDF、DOCX、HTML 和 HTM 格式");
  return fileType;
}

async function extractPdf(file, onProgress) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = extensionUrl("vendor/pdf.worker.min.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: extensionUrl("vendor/cmaps/"),
    cMapPacked: true,
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  onProgress({ phase: "extract", progress: 0, current: 0, total: document.numPages });
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const [content, annotations] = await Promise.all([
        page.getTextContent(),
        page.getAnnotations({ intent: "display" }),
      ]);
      const viewport = page.getViewport({ scale: 1 });
      const pageText = extractPdfLayoutText(content.items, viewport.width, pageNumber);
      const linkEvidence = extractPdfLinkEvidence(content.items, annotations);
      pages.push(
        linkEvidence.length
          ? `${pageText}\n\nPDF_LINK_EVIDENCE:\n${linkEvidence.join("\n")}`
          : pageText,
      );
      onProgress({
        phase: "extract",
        progress: pageNumber / document.numPages,
        current: pageNumber,
        total: document.numPages,
      });
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n\n");
}

async function extractDocx(file, onProgress) {
  onProgress({ phase: "extract", progress: 0 });
  if (!globalThis.mammoth) await import("./vendor/mammoth.browser.min.js");
  if (!globalThis.mammoth?.extractRawText) {
    throw new Error("DOCX 解析组件加载失败");
  }
  const result = await globalThis.mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  onProgress({ phase: "extract", progress: 1 });
  return result.value;
}

export function extractPdfLayoutText(items, pageWidth = 0, pageNumber = 1) {
  const textItems = (items || [])
    .filter((item) => item?.str?.trim() && Array.isArray(item.transform))
    .map((item) => ({
      text: String(item.str).trim(),
      x: Number(item.transform[4]) || 0,
      y: Number(item.transform[5]) || 0,
      width: Number(item.width) || 0,
      height: Math.abs(Number(item.height)) || Math.abs(Number(item.transform[3])) || 10,
    }))
    .sort((left, right) => right.y - left.y || left.x - right.x);

  const rows = [];
  for (const item of textItems) {
    const tolerance = Math.max(2, Math.min(5, item.height * 0.35));
    const row = rows.find((candidate) => Math.abs(candidate.y - item.y) <= tolerance);
    if (row) {
      row.items.push(item);
      row.y = row.items.reduce((sum, entry) => sum + entry.y, 0) / row.items.length;
    } else {
      rows.push({ y: item.y, items: [item] });
    }
  }

  rows.sort((left, right) => right.y - left.y);
  return rows
    .map((row) => {
      const sorted = row.items.sort((left, right) => left.x - right.x);
      const splitIndex = findPdfColumnSplit(sorted, pageWidth);
      const prefix = `[PDF_PAGE ${pageNumber} ROW y=${Math.round(row.y)}]`;
      if (splitIndex < 1) return `${prefix} ${joinPdfItems(sorted)}`;
      return `${prefix} [LEFT] ${joinPdfItems(sorted.slice(0, splitIndex))} [RIGHT] ${joinPdfItems(sorted.slice(splitIndex))}`;
    })
    .join("\n");
}

function findPdfColumnSplit(items, pageWidth) {
  if (items.length < 2 || !pageWidth) return -1;
  const center = pageWidth / 2;
  let best = { index: -1, gap: 0 };
  for (let index = 1; index < items.length; index += 1) {
    const leftEdge = items[index - 1].x + items[index - 1].width;
    const rightEdge = items[index].x;
    const gap = rightEdge - leftEdge;
    if (leftEdge <= center && rightEdge >= center && gap >= 16 && gap > best.gap) {
      best = { index, gap };
    }
  }
  return best.index;
}

function joinPdfItems(items) {
  return items.map((item) => item.text).join(" ");
}

export function extractPdfLinkEvidence(items, annotations) {
  const textItems = items
    .filter((item) => item?.str && Array.isArray(item.transform))
    .map((item) => ({
      text: String(item.str).trim(),
      x: Number(item.transform[4]) || 0,
      y: Number(item.transform[5]) || 0,
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
    }));
  const seen = new Set();
  const evidence = [];
  for (const annotation of annotations || []) {
    const url = String(annotation?.url || annotation?.unsafeUrl || "").trim();
    if (!url || seen.has(url) || !Array.isArray(annotation.rect)) continue;
    seen.add(url);
    const [x1, y1, x2, y2] = annotation.rect.map(Number);
    const centerY = (y1 + y2) / 2;
    const anchor = textItems
      .filter((item) => rectanglesOverlap(item, { x1, y1, x2, y2 }))
      .sort((left, right) => left.x - right.x)
      .map((item) => item.text)
      .filter(Boolean)
      .join(" ");
    const lineItems = textItems
      .filter((item) => Math.abs(item.y + item.height / 2 - centerY) <= Math.max(8, item.height))
      .sort((left, right) => left.x - right.x);
    const context = lineItems.map((item) => item.text).filter(Boolean).join(" ");
    evidence.push(
      `[PDF_LINK] anchor=${JSON.stringify(anchor)} context=${JSON.stringify(context)} url=${JSON.stringify(url)}`,
    );
  }
  return evidence;
}

function rectanglesOverlap(item, rect) {
  return (
    item.x <= rect.x2 &&
    item.x + item.width >= rect.x1 &&
    item.y <= rect.y2 &&
    item.y + item.height >= rect.y1
  );
}

async function extractHtml(file, onProgress) {
  onProgress({ phase: "extract", progress: 0 });
  const document = new DOMParser().parseFromString(await file.text(), "text/html");
  document.querySelectorAll("script, style, noscript, template, svg").forEach(
    (element) => element.remove(),
  );
  document
    .querySelectorAll("br, p, div, section, article, header, footer, li, tr, h1, h2, h3, h4, h5, h6")
    .forEach((element) => element.append("\n"));
  const text = document.body?.textContent || document.documentElement.textContent || "";
  onProgress({ phase: "extract", progress: 1 });
  return text;
}

export function normalizeExtractedText(value) {
  return String(value || "")
    .replaceAll("\u0000", "")
    .replaceAll("\r\n", "\n")
    .replaceAll("\r", "\n")
    .replaceAll("\u00a0", " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extensionUrl(path) {
  return globalThis.chrome?.runtime?.getURL
    ? globalThis.chrome.runtime.getURL(path)
    : new URL(path, import.meta.url).href;
}
