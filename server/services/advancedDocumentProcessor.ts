import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';
import { simpleParser } from 'mailparser';
import { JSDOM } from 'jsdom';
import * as cheerio from 'cheerio';
import pdfParse from 'pdf-parse-new';
import natural from 'natural';
import { removeStopwords } from 'stopword';
import { split } from 'sentence-splitter';

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    documentId: string;
    filename: string;
    chunkIndex: number;
    startPosition: number;
    endPosition: number;
    type: 'paragraph' | 'section' | 'table' | 'header' | 'footer';
    wordCount: number;
  };
}

export interface ProcessedDocument {
  id: string;
  filename: string;
  type: string;
  rawContent: string;
  cleanedContent: string;
  chunks: DocumentChunk[];
  metadata: {
    pages?: number;
    wordCount: number;
    characterCount: number;
    extractedAt: Date;
    language?: string;
    keywords: string[];
  };
}

export class AdvancedDocumentProcessor {
  
  static async processDocument(filePath: string, filename: string, fileType: string): Promise<ProcessedDocument> {
    try {
      const fileBuffer = fs.readFileSync(filePath);
      let rawContent = '';
      let metadata: any = {
        extractedAt: new Date()
      };

      // Extract text based on file type
      if (fileType.includes('pdf') || filename.toLowerCase().endsWith('.pdf')) {
        const result = await this.extractFromPDF(fileBuffer);
        rawContent = result.text;
        metadata.pages = result.pages;
      } 
      else if (fileType.includes('word') || fileType.includes('document') || 
               filename.toLowerCase().endsWith('.docx') || filename.toLowerCase().endsWith('.doc')) {
        rawContent = await this.extractFromDOCX(fileBuffer);
      }
      else if (fileType.includes('html') || filename.toLowerCase().endsWith('.html') || filename.toLowerCase().endsWith('.htm')) {
        rawContent = await this.extractFromHTML(fileBuffer);
      }
      else if (fileType.includes('message') || filename.toLowerCase().endsWith('.eml') || 
               filename.toLowerCase().endsWith('.msg')) {
        rawContent = await this.extractFromEmail(fileBuffer);
      }
      else if (fileType === 'text/plain' || filename.toLowerCase().endsWith('.txt')) {
        rawContent = fileBuffer.toString('utf-8');
      }
      else {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Clean and preprocess the content
      const cleanedContent = this.preprocessText(rawContent);
      
      // Generate document chunks
      const chunks = this.createDocumentChunks(cleanedContent, filename);
      
      // Extract keywords and metadata
      const keywords = this.extractKeywords(cleanedContent);
      const language = this.detectLanguage(cleanedContent);

      metadata.wordCount = cleanedContent.split(/\s+/).filter(word => word.length > 0).length;
      metadata.characterCount = cleanedContent.length;
      metadata.keywords = keywords;
      metadata.language = language;

      const documentId = path.basename(filename, path.extname(filename)) + '_' + Date.now();

      return {
        id: documentId,
        filename,
        type: fileType,
        rawContent,
        cleanedContent,
        chunks,
        metadata
      };
    } catch (error) {
      console.error('Error processing document:', error);
      throw new Error(`Failed to process document: ${filename}`);
    }
  }

  private static async extractFromPDF(buffer: Buffer): Promise<{ text: string; pages: number }> {
    try {
      const data = await pdfParse(buffer);
      return {
        text: data.text,
        pages: data.numpages
      };
    } catch (error) {
      console.error('PDF extraction error:', error);
      // Fallback for problematic PDFs
      return {
        text: `[PDF Document - Text extraction encountered an issue. The document was uploaded but content analysis may be limited.]`,
        pages: 1
      };
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

  private static async extractFromHTML(buffer: Buffer): Promise<string> {
    try {
      const html = buffer.toString('utf-8');
      const $ = cheerio.load(html);
      
      // Remove script and style elements
      $('script, style, nav, footer, header, aside').remove();
      
      // Extract text from main content areas
      const mainContent = $('main, article, .content, #content, .post, #main').first();
      const text = mainContent.length > 0 ? mainContent.text() : $('body').text();
      
      return text.replace(/\s+/g, ' ').trim();
    } catch (error) {
      console.error('HTML extraction error:', error);
      throw new Error('Failed to extract text from HTML');
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
        const toText = Array.isArray(parsed.to) ? 
          parsed.to.map(addr => (addr as any).text || (addr as any).address || '').join(', ') : 
          ((parsed.to as any).text || (parsed.to as any).address || '');
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
        content += `\n\nAttachments: ${parsed.attachments.map(att => att.filename).join(', ')}`;
      }

      return content;
    } catch (error) {
      console.error('Email extraction error:', error);
      throw new Error('Failed to extract text from email');
    }
  }

  private static preprocessText(text: string): string {
    // Remove excessive whitespace
    let cleaned = text.replace(/\s+/g, ' ').trim();
    
    // Remove special characters but keep punctuation
    cleaned = cleaned.replace(/[^\w\s\.,;:!?\-()]/g, ' ');
    
    // Normalize quotes and dashes
    cleaned = cleaned.replace(/[""]/g, '"');
    cleaned = cleaned.replace(/['']/g, "'");
    cleaned = cleaned.replace(/[–—]/g, '-');
    
    // Remove extra spaces
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
  }

  private static createDocumentChunks(content: string, filename: string): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];
    const maxChunkSize = 500; // words per chunk
    const overlap = 50; // word overlap between chunks
    
    // Split into sentences first
    const sentences = split(content).filter(item => item.type === 'Sentence').map(item => item.raw);
    
    let currentChunk = '';
    let currentWordCount = 0;
    let chunkIndex = 0;
    let startPosition = 0;
    
    for (let i = 0; i < sentences.length; i++) {
      const sentence = sentences[i];
      const sentenceWords = sentence.split(/\s+/).length;
      
      if (currentWordCount + sentenceWords > maxChunkSize && currentChunk.length > 0) {
        // Create chunk
        const chunk: DocumentChunk = {
          id: `${filename}_chunk_${chunkIndex}`,
          content: currentChunk.trim(),
          metadata: {
            documentId: filename,
            filename,
            chunkIndex,
            startPosition,
            endPosition: startPosition + currentChunk.length,
            type: 'paragraph',
            wordCount: currentWordCount
          }
        };
        chunks.push(chunk);
        
        // Start new chunk with overlap
        const overlapSentences = sentences.slice(Math.max(0, i - 2), i);
        currentChunk = overlapSentences.join(' ') + ' ';
        currentWordCount = overlapSentences.join(' ').split(/\s+/).length;
        startPosition += currentChunk.length - currentChunk.length;
        chunkIndex++;
      }
      
      currentChunk += sentence + ' ';
      currentWordCount += sentenceWords;
    }
    
    // Add final chunk
    if (currentChunk.trim().length > 0) {
      const chunk: DocumentChunk = {
        id: `${filename}_chunk_${chunkIndex}`,
        content: currentChunk.trim(),
        metadata: {
          documentId: filename,
          filename,
          chunkIndex,
          startPosition,
          endPosition: startPosition + currentChunk.length,
          type: 'paragraph',
          wordCount: currentWordCount
        }
      };
      chunks.push(chunk);
    }
    
    return chunks;
  }

  private static extractKeywords(text: string): string[] {
    try {
      // Tokenize and clean
      const tokens = natural.WordTokenizer().tokenize(text.toLowerCase()) || [];
      
      // Remove stopwords
      const filteredTokens = removeStopwords(tokens);
      
      // Calculate TF-IDF or use frequency for keywords
      const frequency: { [key: string]: number } = {};
      filteredTokens.forEach(token => {
        if (token.length > 3) { // Only consider words longer than 3 characters
          frequency[token] = (frequency[token] || 0) + 1;
        }
      });
      
      // Get top keywords by frequency
      const keywords = Object.entries(frequency)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 20)
        .map(([word]) => word);
      
      return keywords;
    } catch (error) {
      console.error('Keyword extraction error:', error);
      return [];
    }
  }

  private static detectLanguage(text: string): string {
    try {
      // Simple language detection (could be enhanced with a proper library)
      const commonEnglishWords = ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'];
      const words = text.toLowerCase().split(/\s+/).slice(0, 100);
      const englishWordCount = words.filter(word => commonEnglishWords.includes(word)).length;
      
      return englishWordCount > words.length * 0.1 ? 'english' : 'unknown';
    } catch (error) {
      return 'unknown';
    }
  }

  // Semantic search capabilities
  static searchDocuments(documents: ProcessedDocument[], query: string): ProcessedDocument[] {
    const queryWords = this.preprocessText(query).toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    return documents
      .map(doc => {
        let score = 0;
        const content = doc.cleanedContent.toLowerCase();
        const keywords = doc.metadata.keywords;
        
        // Score based on content matches
        queryWords.forEach(word => {
          const contentMatches = (content.match(new RegExp(word, 'g')) || []).length;
          score += contentMatches * 2;
          
          // Bonus for keyword matches
          if (keywords.includes(word)) {
            score += 5;
          }
          
          // Bonus for similar words
          keywords.forEach(keyword => {
            if (natural.JaroWinklerDistance(word, keyword) > 0.8) {
              score += 2;
            }
          });
        });
        
        return { ...doc, relevanceScore: score };
      })
      .filter(doc => (doc as any).relevanceScore > 0)
      .sort((a, b) => (b as any).relevanceScore - (a as any).relevanceScore);
  }

  static findRelevantChunks(documents: ProcessedDocument[], query: string): DocumentChunk[] {
    const queryWords = this.preprocessText(query).toLowerCase().split(/\s+/).filter(word => word.length > 2);
    const allChunks: (DocumentChunk & { relevanceScore: number })[] = [];
    
    documents.forEach(doc => {
      doc.chunks.forEach(chunk => {
        let score = 0;
        const content = chunk.content.toLowerCase();
        
        queryWords.forEach(word => {
          const matches = (content.match(new RegExp(word, 'g')) || []).length;
          score += matches * 3;
          
          // Bonus for exact phrase matches
          if (content.includes(query.toLowerCase())) {
            score += 10;
          }
        });
        
        if (score > 0) {
          allChunks.push({ ...chunk, relevanceScore: score });
        }
      });
    });
    
    return allChunks
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5); // Return top 5 most relevant chunks
  }
}
