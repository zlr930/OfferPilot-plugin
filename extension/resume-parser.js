const MAX_RESUME_FILE_BYTES = 10 * 1024 * 1024;
const MAX_EXTRACTED_CHARACTERS = 80_000;
const EXTENSION_TYPES = new Map([
  ["pdf", "pdf"],
  ["docx", "docx"],
  ["html", "html"],
  ["htm", "html"],
]);

export async function extractResumeFile(file) {
  if (!file || !file.size) throw new Error("请选择一个非空的简历文件");
  if (file.size > MAX_RESUME_FILE_BYTES) {
    throw new Error("简历文件不能超过 10 MB");
  }

  const fileType = getResumeFileType(file.name);
  let text;
  try {
    if (fileType === "pdf") text = await extractPdf(file);
    if (fileType === "docx") text = await extractDocx(file);
    if (fileType === "html") text = await extractHtml(file);
  } catch (error) {
    if (error.message?.includes("扫描版")) throw error;
    throw new Error(`无法读取该 ${fileType.toUpperCase()} 文件，请确认文件未损坏`, {
      cause: error,
    });
  }

  const normalized = normalizeExtractedText(text);
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

async function extractPdf(file) {
  const pdfjs = await import("./vendor/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = extensionUrl("vendor/pdf.worker.min.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
    useSystemFonts: true,
  });
  const document = await loadingTask.promise;
  const pages = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(content.items.map((item) => item.str || "").join(" "));
      page.cleanup();
    }
  } finally {
    await loadingTask.destroy();
  }
  return pages.join("\n\n");
}

async function extractDocx(file) {
  if (!globalThis.mammoth) await import("./vendor/mammoth.browser.min.js");
  if (!globalThis.mammoth?.extractRawText) {
    throw new Error("DOCX 解析组件加载失败");
  }
  const result = await globalThis.mammoth.extractRawText({
    arrayBuffer: await file.arrayBuffer(),
  });
  return result.value;
}

async function extractHtml(file) {
  const document = new DOMParser().parseFromString(await file.text(), "text/html");
  document.querySelectorAll("script, style, noscript, template, svg").forEach(
    (element) => element.remove(),
  );
  document
    .querySelectorAll("br, p, div, section, article, header, footer, li, tr, h1, h2, h3, h4, h5, h6")
    .forEach((element) => element.append("\n"));
  return document.body?.textContent || document.documentElement.textContent || "";
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
