import { SimpleProcessedDocument } from './simpleDocumentProcessor';

export interface SimpleAIResponse {
  answer: string;
  confidence: number;
  documentsReferenced: number;
  documentDetails: Array<{
    filename: string;
    wordCount: number;
    relevanceScore: number;
  }>;
  queryType: string;
  processingTime: number;
}

export class SimpleAI {
  
  static async processQuery(message: string, documents: SimpleProcessedDocument[]): Promise<SimpleAIResponse> {
    const startTime = Date.now();
    const lowercaseMessage = message.toLowerCase();

    // Find relevant documents
    const relevantDocs = this.findRelevantDocuments(documents, message);

    // Determine query type
    const queryType = this.analyzeQueryType(message);

    // Generate response
    const answer = this.generateAnswer(message, relevantDocs, queryType);

    const processingTime = Date.now() - startTime;

    return {
      answer,
      confidence: this.calculateConfidence(relevantDocs, message),
      documentsReferenced: relevantDocs.length,
      documentDetails: relevantDocs.slice(0, 3).map(doc => ({
        filename: doc.filename,
        wordCount: doc.metadata.wordCount,
        relevanceScore: 0.8
      })),
      queryType,
      processingTime
    };
  }

  private static findRelevantDocuments(documents: SimpleProcessedDocument[], query: string): SimpleProcessedDocument[] {
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 2);
    
    return documents
      .map(doc => {
        const content = doc.content.toLowerCase();
        let score = 0;
        
        queryWords.forEach(word => {
          const matches = (content.match(new RegExp(word, 'g')) || []).length;
          score += matches;
        });
        
        return { ...doc, relevanceScore: score };
      })
      .filter(doc => (doc as any).relevanceScore > 0)
      .sort((a, b) => (b as any).relevanceScore - (a as any).relevanceScore);
  }

  private static analyzeQueryType(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (/\b(summary|summarize|overview|main points)\b/.test(lowerQuery)) {
      return 'summary';
    } else if (/\b(list|enumerate|find all|show all)\b/.test(lowerQuery)) {
      return 'list';
    } else if (/\b(dates?|when|deadline|timeline)\b/.test(lowerQuery)) {
      return 'temporal';
    } else if (/\b(contact|email|phone|address)\b/.test(lowerQuery)) {
      return 'contact';
    } else if (/\b(money|cost|price|amount|budget)\b/.test(lowerQuery)) {
      return 'financial';
    } else {
      return 'general';
    }
  }

  private static generateAnswer(query: string, documents: SimpleProcessedDocument[], queryType: string): string {
    if (documents.length === 0) {
      return "I couldn't find any relevant information in your uploaded documents. Please make sure you've uploaded documents that contain the information you're looking for.";
    }

    // Check if any documents are actually processed
    const processedDocs = documents.filter(doc => doc.metadata.processed);
    const unprocessedDocs = documents.filter(doc => !doc.metadata.processed);

    if (processedDocs.length === 0 && unprocessedDocs.length > 0) {
      return `I can see you've uploaded ${unprocessedDocs.length} document(s), but I can't analyze their content because they have limited support (likely PDF files).

For full document analysis, please upload:
• DOCX or DOC files (Microsoft Word)
• HTML files
• Email files (.eml, .msg)
• Plain text files (.txt)

These formats allow me to extract and analyze the text content to answer your questions.`;
    }

    const combinedContent = documents.slice(0, 3).map(doc => doc.content).join('\n\n');
    
    switch (queryType) {
      case 'summary':
        return this.generateSummary(combinedContent, documents);
      
      case 'list':
        return this.generateList(query, combinedContent);
      
      case 'temporal':
        return this.findDates(combinedContent);
      
      case 'contact':
        return this.findContacts(combinedContent);
      
      case 'financial':
        return this.findFinancial(combinedContent);
      
      default:
        return this.generateGeneral(query, combinedContent, documents);
    }
  }

  private static generateSummary(content: string, documents: SimpleProcessedDocument[]): string {
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPoints = sentences.slice(0, 4).map(s => s.trim());
    
    const summary = `**Document Summary:**\n\n${keyPoints.map((point, i) => `${i + 1}. ${point}.`).join('\n')}`;
    
    const sources = documents.map(doc => doc.filename);
    return summary + `\n\n**Sources:** ${sources.join(', ')}`;
  }

  private static generateList(query: string, content: string): string {
    // Extract bullet points, numbered lists, or line items
    const listPattern = /^[\s]*[\*\-\•][\s]+(.+)$/gm;
    const numberPattern = /^[\s]*\d+[\.\)][\s]+(.+)$/gm;
    const items = [
      ...(content.match(listPattern) || []),
      ...(content.match(numberPattern) || [])
    ];
    
    if (items.length === 0) {
      return `I searched for list items but couldn't find formatted lists. Here's relevant content:\n\n${content.substring(0, 300)}...`;
    }
    
    return `**Found these items:**\n\n${items.slice(0, 10).map(item => `• ${item.trim()}`).join('\n')}`;
  }

  private static findDates(content: string): string {
    const datePattern = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/gi;
    
    const dates = content.match(datePattern) || [];
    
    if (dates.length === 0) {
      return "I couldn't find any specific dates mentioned in your documents.";
    }
    
    const uniqueDates = [...new Set(dates)].slice(0, 10);
    return `**Dates found in documents:**\n\n${uniqueDates.map(date => `• ${date}`).join('\n')}`;
  }

  private static findContacts(content: string): string {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const phonePattern = /\b(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g;
    
    const emails = content.match(emailPattern) || [];
    const phones = content.match(phonePattern) || [];
    const contacts = [...emails, ...phones];
    
    if (contacts.length === 0) {
      return "I couldn't find any contact information (emails or phone numbers) in your documents.";
    }
    
    return `**Contact information found:**\n\n${contacts.slice(0, 10).map(contact => `• ${contact}`).join('\n')}`;
  }

  private static findFinancial(content: string): string {
    const moneyPattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(dollars?|usd|euros?|pounds?)/gi;
    
    const amounts = content.match(moneyPattern) || [];
    
    if (amounts.length === 0) {
      return "I couldn't find any financial information or monetary amounts in your documents.";
    }
    
    return `**Financial information found:**\n\n${amounts.slice(0, 10).map(amount => `• ${amount}`).join('\n')}`;
  }

  private static generateGeneral(query: string, content: string, documents: SimpleProcessedDocument[]): string {
    // Find sentences that might be relevant to the query
    const queryWords = query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
    
    const relevantSentences = sentences.filter(sentence => {
      const lowerSentence = sentence.toLowerCase();
      return queryWords.some(word => lowerSentence.includes(word));
    });
    
    if (relevantSentences.length === 0) {
      return `I searched through your ${documents.length} document(s) but couldn't find content specifically related to your question. Here's a sample of what's available:\n\n${content.substring(0, 200)}...`;
    }
    
    const answer = relevantSentences.slice(0, 3).join('. ');
    return `**Based on your documents:**\n\n${answer}`;
  }

  private static calculateConfidence(documents: SimpleProcessedDocument[], query: string): number {
    if (documents.length === 0) return 0.1;
    
    let confidence = 0.5;
    
    // Boost confidence based on number of relevant documents
    confidence += Math.min(documents.length * 0.1, 0.3);
    
    // Boost if documents were processed successfully
    const processedCount = documents.filter(doc => doc.metadata.processed).length;
    confidence += (processedCount / documents.length) * 0.2;
    
    return Math.min(confidence, 0.9);
  }
}
