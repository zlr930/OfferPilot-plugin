import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import {
  extractResumeFile,
  extractPdfLayoutText,
  extractPdfLinkEvidence,
  getResumeFileType,
  normalizeExtractedText,
} from "../extension/resume-parser.js";

test("recognizes supported resume extensions", () => {
  assert.equal(getResumeFileType("resume.pdf"), "pdf");
  assert.equal(getResumeFileType("resume.DOCX"), "docx");
  assert.equal(getResumeFileType("resume.htm"), "html");
});

test("rejects unsupported resume extensions", () => {
  assert.throws(() => getResumeFileType("resume.doc"), /仅支持/);
});

test("normalizes extracted whitespace", () => {
  assert.equal(normalizeExtractedText(" A\u00a0 B\r\n\r\n\r\nC "), "A B\n\nC");
});

test("extracts text from a DOCX in browser-compatible mode", async () => {
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    "_rels/.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    "word/document.xml",
    '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Candidate qa@example.com JavaScript Node.js</w:t></w:r></w:p></w:body></w:document>',
  );
  const bytes = await zip.generateAsync({ type: "uint8array" });
  const result = await extractResumeFile(
    new File([bytes], "resume.docx", {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }),
  );
  assert.equal(result.fileType, "docx");
  assert.match(result.text, /qa@example\.com/);
});

test("extracts text from a PDF in browser-compatible mode", async () => {
  let result;
  const progress = [];
  try {
    result = await extractResumeFile(
      new File([createPdf("Candidate qa@example.com JavaScript Node.js")], "resume.pdf", {
        type: "application/pdf",
      }),
      (event) => progress.push(event),
    );
  } catch (error) {
    assert.fail(error.cause?.stack || error.stack);
  }
  assert.equal(result.fileType, "pdf");
  assert.match(result.text, /qa@example\.com/);
  assert.ok(progress.some((event) => event.phase === "read"));
  assert.ok(
    progress.some(
      (event) => event.phase === "extract" && event.current === 1 && event.total === 1,
    ),
  );
  assert.equal(progress.at(-1).phase, "normalize");
});

test("binds PDF annotation URLs to same-line project context", () => {
  const items = [
    { str: "zero2Agent", transform: [1, 0, 0, 1, 72, 500], width: 70, height: 12 },
    { str: "-- Agent 工程体系", transform: [1, 0, 0, 1, 150, 500], width: 110, height: 12 },
    { str: "(GitHub)", transform: [1, 0, 0, 1, 270, 500], width: 45, height: 12 },
  ];
  const evidence = extractPdfLinkEvidence(items, [
    { url: "https://github.com/example/zero2Agent", rect: [270, 498, 315, 514] },
  ]);
  assert.equal(evidence.length, 1);
  assert.match(evidence[0], /anchor="\(GitHub\)"/);
  assert.match(evidence[0], /context="zero2Agent -- Agent 工程体系 \(GitHub\)"/);
  assert.match(evidence[0], /https:\/\/github\.com\/example\/zero2Agent/);
});

test("preserves PDF rows and separates two-column award evidence", () => {
  const items = [
    { str: "2022", transform: [1, 0, 0, 1, 97, 196], width: 28, height: 10 },
    { str: "省挑战杯铜奖", transform: [1, 0, 0, 1, 132, 196], width: 78, height: 10 },
    { str: "1/10", transform: [1, 0, 0, 1, 220, 196], width: 25, height: 10 },
    { str: "2022", transform: [1, 0, 0, 1, 317, 196], width: 28, height: 10 },
    { str: "省电子商务竞赛二等奖", transform: [1, 0, 0, 1, 352, 196], width: 126, height: 10 },
    { str: "3/5", transform: [1, 0, 0, 1, 486, 196], width: 20, height: 10 },
    { str: "2021", transform: [1, 0, 0, 1, 97, 183], width: 28, height: 10 },
    { str: "省物流设计竞赛二等奖", transform: [1, 0, 0, 1, 132, 183], width: 126, height: 10 },
  ];

  const text = extractPdfLayoutText(items, 595, 2);
  assert.match(text, /ROW y=196\] \[LEFT\] 2022 省挑战杯铜奖 1\/10 \[RIGHT\] 2022 省电子商务竞赛二等奖 3\/5/);
  assert.match(text, /ROW y=183\] 2021 省物流设计竞赛二等奖/);
});

function createPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}
