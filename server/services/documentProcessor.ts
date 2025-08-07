import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { simpleParser } from 'mailparser';
import { parse } from 'node-html-parser';

export interface ProcessedDocument {
  id: string;
  filename: string;
  type: string;
  content: string;
  metadata: {
    pages?: number;
    wordCount: number;
    extractedAt: Date;
  };
}

export class DocumentProcessor {
  static async processDocument(filePath: string, filename: string, fileType: string): Promise<ProcessedDocument> {
    try {
      let content = '';
      let metadata: any = {
        extractedAt: new Date()
      };

      const fileBuffer = fs.readFileSync(filePath);
      
      if (fileType.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        // PDF support will be added in a future update
        content = `[PDF Document: ${filename}]\n\nThis PDF file has been successfully uploaded. Currently, text extraction from PDF files is not available, but the file is stored and can be processed when PDF support is enabled. For immediate text analysis, please upload DOCX or email files.`;
        metadata.pages = 1;
      } 
      else if (fileType.includes('word') || fileType.includes('document') || 
               filename.toLowerCase().endsWith('.docx') || filename.toLowerCase().endsWith('.doc')) {
        content = await this.extractFromDOCX(fileBuffer);
      }
      else if (fileType.includes('message') || filename.toLowerCase().endsWith('.eml') || 
               filename.toLowerCase().endsWith('.msg')) {
        content = await this.extractFromEmail(fileBuffer);
      }
      else if (fileType === 'text/plain') {
        content = fileBuffer.toString('utf-8');
      }
      else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Calculate word count
      metadata.wordCount = content.split(/\s+/).filter(word => word.length > 0).length;

      return {
        id: path.basename(filename, path.extname(filename)) + '_' + Date.now(),
        filename,
        type: fileType,
        content: content.trim(),
        metadata
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error(`Failed to process document: ${filename}`);
    }
  }

  private static async extractFromDOCX(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      console.error('DOCX extraction error:', error);
      throw new Error('Failed to extract text from DOCX');
    }
  }

  private static async extractFromEmail(buffer: Buffer): Promise<string> {
    try {
      const parsed = await simpleParser(buffer);
      
      let content = '';
      
      // Add email headers
      if (parsed.subject) content += `Subject: ${parsed.subject}\n\n`;
      if (parsed.from?.text) content += `From: ${parsed.from.text}\n`;
      if (parsed.to) {
        const toText = Array.isArray(parsed.to) ? parsed.to.map(addr => (addr as any).text || (addr as any).address || '').join(', ') : ((parsed.to as any).text || (parsed.to as any).address || '');
        content += `To: ${toText}\n`;
      }
      if (parsed.date) content += `Date: ${parsed.date}\n\n`;
      
      // Add email body
      if (parsed.text) {
        content += parsed.text;
      } else if (parsed.html) {
        // Convert HTML to text
        const root = parse(parsed.html);
        content += root.text;
      }

      // Add attachments info
      if (parsed.attachments && parsed.attachments.length > 0) {
        content += `\n\nAttachments: ${parsed.attachments.map(att => att.filename).join(', ')}`;
      }

      return content;
    } catch (error) {
      console.error('Email extraction error:', error);
      throw new Error('Failed to extract text from email');
    }
  }

  static searchDocuments(documents: ProcessedDocument[], query: string): ProcessedDocument[] {
    const lowercaseQuery = query.toLowerCase();
    const queryWords = lowercaseQuery.split(/\s+/).filter(word => word.length > 0);
    
    return documents
      .map(doc => {
        const content = doc.content.toLowerCase();
        let score = 0;
        
        // Calculate relevance score
        queryWords.forEach(word => {
          const matches = (content.match(new RegExp(word, 'g')) || []).length;
          score += matches;
        });
        
        return { ...doc, relevanceScore: score };
      })
      .filter(doc => (doc as any).relevanceScore > 0)
      .sort((a, b) => (b as any).relevanceScore - (a as any).relevanceScore);
  }

  static extractRelevantContext(document: ProcessedDocument, query: string, maxLength: number = 500): string {
    const content = document.content;
    const lowercaseQuery = query.toLowerCase();
    const lowercaseContent = content.toLowerCase();
    
    // Find the best matching section
    const queryWords = lowercaseQuery.split(/\s+/).filter(word => word.length > 0);
    let bestStart = 0;
    let bestScore = 0;
    
    // Sliding window to find most relevant section
    const windowSize = Math.min(maxLength, content.length);
    for (let i = 0; i <= content.length - windowSize; i += 50) {
      const window = lowercaseContent.substring(i, i + windowSize);
      let score = 0;
      
      queryWords.forEach(word => {
        const matches = (window.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
      }
    }
    
    let extract = content.substring(bestStart, bestStart + maxLength);
    
    // Try to end at a sentence boundary
    const lastPeriod = extract.lastIndexOf('.');
    if (lastPeriod > maxLength * 0.7) {
      extract = extract.substring(0, lastPeriod + 1);
    }
    
    return extract + (bestStart + extract.length < content.length ? '...' : '');
  }
}
