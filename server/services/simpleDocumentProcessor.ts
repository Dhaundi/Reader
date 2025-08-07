import fs from "fs";
import path from "path";
import mammoth from "mammoth";
import { simpleParser } from "mailparser";
import { JSDOM } from "jsdom";
import * as cheerio from "cheerio";

export interface SimpleProcessedDocument {
  id: string;
  filename: string;
  type: string;
  content: string;
  metadata: {
    wordCount: number;
    extractedAt: Date;
    processed: boolean;
  };
}

export class SimpleDocumentProcessor {
  static async processDocument(
    filePath: string,
    filename: string,
    fileType: string,
  ): Promise<SimpleProcessedDocument> {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      let content = "";
      let processed = true;

      // Extract text based on file type
      if (fileType.includes("pdf") || filename.toLowerCase().endsWith(".pdf")) {
        // PDF processing is temporarily disabled
        content = `PDF Document: ${filename}

✅ UPLOADED SUCCESSFULLY

📄 PDF text extraction is currently disabled due to technical limitations. Your file has been uploaded and stored, but content analysis is not available.

💡 For full document analysis and AI chat capabilities, please upload:
• DOCX or DOC files (Microsoft Word)
• HTML files
• Email files (.eml, .msg)
• Plain text files (.txt)

Your PDF file is safely stored and can be downloaded if needed.`;
        processed = false;
      } else if (
        fileType.includes("word") ||
        fileType.includes("document") ||
        filename.toLowerCase().endsWith(".docx") ||
        filename.toLowerCase().endsWith(".doc")
      ) {
        content = await this.extractFromDOCX(fileBuffer);
      } else if (
        fileType.includes("html") ||
        filename.toLowerCase().endsWith(".html") ||
        filename.toLowerCase().endsWith(".htm")
      ) {
        content = await this.extractFromHTML(fileBuffer);
      } else if (
        fileType.includes("message") ||
        filename.toLowerCase().endsWith(".eml") ||
        filename.toLowerCase().endsWith(".msg")
      ) {
        content = await this.extractFromEmail(fileBuffer);
      } else if (
        fileType === "text/plain" ||
        filename.toLowerCase().endsWith(".txt")
      ) {
        content = fileBuffer.toString("utf-8");
      } else {
        content = `[${filename}]\n\nFile uploaded but format not fully supported for text extraction.`;
        processed = false;
      }

      // Calculate word count
      const wordCount = content
        .split(/\s+/)
        .filter((word) => word.length > 0).length;

      const documentId =
        path.basename(filename, path.extname(filename)) + "_" + Date.now();

      return {
        id: documentId,
        filename,
        type: fileType,
        content: content.trim(),
        metadata: {
          wordCount,
          extractedAt: new Date(),
          processed,
        },
      };
    } catch (error) {
      console.error("Error processing document:", error);

      // Return a basic document structure even if processing fails
      return {
        id: path.basename(filename, path.extname(filename)) + "_" + Date.now(),
        filename,
        type: fileType,
        content: `[${filename}]\n\nDocument uploaded but processing encountered an error: ${(error as Error).message}`,
        metadata: {
          wordCount: 0,
          extractedAt: new Date(),
          processed: false,
        },
      };
    }
  }

  private static async extractFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error("DOCX extraction error:", error);
      throw new Error("Failed to extract text from DOCX");
    }
  }

  private static async extractFromHTML(buffer: Buffer): Promise<string> {
    try {
      const html = buffer.toString("utf-8");
      const $ = cheerio.load(html);

      // Remove script and style elements
      $("script, style, nav, footer, header, aside").remove();

      // Extract text from main content areas
      const mainContent = $(
        "main, article, .content, #content, .post, #main",
      ).first();
      const text =
        mainContent.length > 0 ? mainContent.text() : $("body").text();

      return text.replace(/\s+/g, " ").trim();
    } catch (error) {
      console.error("HTML extraction error:", error);
      throw new Error("Failed to extract text from HTML");
    }
  }

  private static async extractFromEmail(buffer: Buffer): Promise<string> {
    try {
      const parsed = await simpleParser(buffer);

      let content = "";

      // Add email headers
      if (parsed.subject) content += `Subject: ${parsed.subject}\n\n`;
      if (parsed.from?.text) content += `From: ${parsed.from.text}\n`;
      if (parsed.to) {
        const toText = Array.isArray(parsed.to)
          ? parsed.to
              .map((addr) => (addr as any).text || (addr as any).address || "")
              .join(", ")
          : (parsed.to as any).text || (parsed.to as any).address || "";
        content += `To: ${toText}\n`;
      }
      if (parsed.date) content += `Date: ${parsed.date}\n\n`;

      // Add email body
      if (parsed.text) {
        content += parsed.text;
      } else if (parsed.html) {
        // Convert HTML to text
        const $ = cheerio.load(parsed.html);
        content += $.text();
      }

      // Add attachments info
      if (parsed.attachments && parsed.attachments.length > 0) {
        content += `\n\nAttachments: ${parsed.attachments.map((att) => att.filename).join(", ")}`;
      }

      return content;
    } catch (error) {
      console.error("Email extraction error:", error);
      throw new Error("Failed to extract text from email");
    }
  }
}
