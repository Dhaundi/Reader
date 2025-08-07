import { ProcessedDocument } from './documentProcessor';

export interface ChatResponse {
  response: string;
  confidence: number;
  documentsReferenced: number;
  documentDetails: Array<{
    filename: string;
    type: string;
    wordCount: number;
  }>;
}

export class CustomAI {
  
  static async processQuery(message: string, documents: ProcessedDocument[]): Promise<ChatResponse> {
    const lowercaseMessage = message.toLowerCase();
    const relevantDocs = this.findRelevantDocuments(documents, message);
    
    // Pattern matching for different types of queries
    const patterns = [
      { pattern: /\b(summary|summarize|overview|main points?)\b/i, handler: this.handleSummaryRequest },
      { pattern: /\b(dates?|when|deadline|timeline)\b/i, handler: this.handleDateQueries },
      { pattern: /\b(contact|email|phone|address)\b/i, handler: this.handleContactQueries },
      { pattern: /\b(action items?|tasks?|todo|requirements?)\b/i, handler: this.handleActionItems },
      { pattern: /\b(money|cost|price|amount|budget|payment)\b/i, handler: this.handleFinancialQueries },
      { pattern: /\b(who|person|people|names?)\b/i, handler: this.handlePeopleQueries },
      { pattern: /\b(what|how|why|where)\b/i, handler: this.handleGeneralQueries },
      { pattern: /\b(find|search|look for)\b/i, handler: this.handleSearchQueries },
    ];

    // Find the best matching pattern
    let bestMatch = null;
    let bestScore = 0;

    for (const pattern of patterns) {
      const match = lowercaseMessage.match(pattern.pattern);
      if (match) {
        const score = match[0].length / lowercaseMessage.length;
        if (score > bestScore) {
          bestScore = score;
          bestMatch = pattern;
        }
      }
    }

    let response: string;
    let confidence: number;

    if (bestMatch && documents.length > 0) {
      response = bestMatch.handler(message, relevantDocs);
      confidence = Math.min(0.8, bestScore + 0.3);
    } else if (documents.length === 0) {
      response = this.handleNoDocuments(message);
      confidence = 0.9;
    } else {
      response = this.handleGenericResponse(message, relevantDocs);
      confidence = 0.5;
    }

    return {
      response,
      confidence,
      documentsReferenced: relevantDocs.length,
      documentDetails: relevantDocs.slice(0, 3).map(doc => ({
        filename: doc.filename,
        type: doc.type,
        wordCount: doc.metadata.wordCount
      }))
    };
  }

  private static findRelevantDocuments(documents: ProcessedDocument[], query: string): ProcessedDocument[] {
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

  private static handleNoDocuments(message: string): string {
    const greetings = ['hello', 'hi', 'hey', 'good morning', 'good afternoon'];
    const isGreeting = greetings.some(greeting => message.toLowerCase().includes(greeting));
    
    if (isGreeting) {
      return "Hello! I'm your custom document analysis assistant. Upload some documents (DOCX or email files) and I'll help you analyze and extract information from them.";
    }
    
    return "I'd love to help you analyze documents, but I don't see any documents uploaded yet. Please upload some PDF, DOCX, or email files first, and then I can answer questions about their content.";
  }

  private static handleSummaryRequest(message: string, documents: ProcessedDocument[]): string {
    if (documents.length === 0) {
      return "I don't have any documents to summarize. Please upload some documents first.";
    }

    const summaries = documents.slice(0, 3).map(doc => {
      const content = doc.content;
      const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20);
      const summary = sentences.slice(0, 3).join('. ').trim();
      
      return `**${doc.filename}:**\n${summary || 'Content summary not available for this document.'}`;
    });

    return `Here's a summary of your ${documents.length} document(s):\n\n${summaries.join('\n\n')}`;
  }

  private static handleDateQueries(message: string, documents: ProcessedDocument[]): string {
    const datePattern = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/gi;
    
    const allDates: string[] = [];
    documents.forEach(doc => {
      const matches = doc.content.match(datePattern) || [];
      allDates.push(...matches);
    });

    if (allDates.length === 0) {
      return "I couldn't find any specific dates mentioned in your documents.";
    }

    const uniqueDates = [...new Set(allDates)].slice(0, 10);
    return `I found these dates mentioned in your documents:\n\n${uniqueDates.map(date => `• ${date}`).join('\n')}`;
  }

  private static handleContactQueries(message: string, documents: ProcessedDocument[]): string {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const phonePattern = /\b(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g;
    
    const contacts: string[] = [];
    documents.forEach(doc => {
      const emails = doc.content.match(emailPattern) || [];
      const phones = doc.content.match(phonePattern) || [];
      contacts.push(...emails, ...phones);
    });

    if (contacts.length === 0) {
      return "I couldn't find any contact information (emails or phone numbers) in your documents.";
    }

    const uniqueContacts = [...new Set(contacts)].slice(0, 15);
    return `I found this contact information in your documents:\n\n${uniqueContacts.map(contact => `• ${contact}`).join('\n')}`;
  }

  private static handleActionItems(message: string, documents: ProcessedDocument[]): string {
    const actionWords = ['must', 'should', 'need to', 'required', 'deadline', 'due', 'action', 'task', 'todo', 'complete', 'finish'];
    const actionItems: string[] = [];
    
    documents.forEach(doc => {
      const sentences = doc.content.split(/[.!?]+/);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if (actionWords.some(word => lowerSentence.includes(word))) {
          actionItems.push(sentence.trim());
        }
      });
    });

    if (actionItems.length === 0) {
      return "I couldn't identify any specific action items or requirements in your documents.";
    }

    const uniqueActions = [...new Set(actionItems)].slice(0, 8);
    return `I found these potential action items and requirements:\n\n${uniqueActions.map(item => `• ${item}`).join('\n')}`;
  }

  private static handleFinancialQueries(message: string, documents: ProcessedDocument[]): string {
    const moneyPattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(dollars?|usd|cents?)|price|cost|budget|payment|amount/gi;
    
    const financialInfo: string[] = [];
    documents.forEach(doc => {
      const matches = doc.content.match(moneyPattern) || [];
      financialInfo.push(...matches);
    });

    if (financialInfo.length === 0) {
      return "I couldn't find any financial information or monetary amounts in your documents.";
    }

    const uniqueFinancial = [...new Set(financialInfo)].slice(0, 10);
    return `I found this financial information in your documents:\n\n${uniqueFinancial.map(info => `• ${info}`).join('\n')}`;
  }

  private static handlePeopleQueries(message: string, documents: ProcessedDocument[]): string {
    const namePattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
    
    const names: string[] = [];
    documents.forEach(doc => {
      const matches = doc.content.match(namePattern) || [];
      names.push(...matches);
    });

    if (names.length === 0) {
      return "I couldn't identify any specific person names in your documents.";
    }

    const uniqueNames = [...new Set(names)].slice(0, 15);
    return `I found these names mentioned in your documents:\n\n${uniqueNames.map(name => `• ${name}`).join('\n')}`;
  }

  private static handleSearchQueries(message: string, documents: ProcessedDocument[]): string {
    const searchTerms = message.split(/\s+/).filter(word => word.length > 3);
    const results: string[] = [];
    
    documents.forEach(doc => {
      const content = doc.content.toLowerCase();
      searchTerms.forEach(term => {
        const termLower = term.toLowerCase();
        if (content.includes(termLower)) {
          const sentences = doc.content.split(/[.!?]+/);
          const matchingSentences = sentences.filter(sentence => 
            sentence.toLowerCase().includes(termLower)
          );
          
          matchingSentences.slice(0, 2).forEach(sentence => {
            results.push(`**${doc.filename}:** ${sentence.trim()}`);
          });
        }
      });
    });

    if (results.length === 0) {
      return "I couldn't find any content matching your search terms in the uploaded documents.";
    }

    return `Here's what I found related to your search:\n\n${results.slice(0, 6).join('\n\n')}`;
  }

  private static handleGeneralQueries(message: string, documents: ProcessedDocument[]): string {
    if (documents.length === 0) {
      return "I'd be happy to answer questions about your documents, but I don't see any uploaded yet. Please upload some documents first.";
    }

    const queryWords = message.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    const relevantContent: string[] = [];
    
    documents.forEach(doc => {
      const sentences = doc.content.split(/[.!?]+/);
      sentences.forEach(sentence => {
        const lowerSentence = sentence.toLowerCase();
        if (queryWords.some(word => lowerSentence.includes(word))) {
          relevantContent.push(`**${doc.filename}:** ${sentence.trim()}`);
        }
      });
    });

    if (relevantContent.length === 0) {
      return `I searched through your ${documents.length} document(s) but couldn't find content specifically related to your question. Try asking about summaries, dates, contacts, or action items.`;
    }

    return `Based on your documents, here's what I found:\n\n${relevantContent.slice(0, 5).join('\n\n')}`;
  }

  private static handleGenericResponse(message: string, documents: ProcessedDocument[]): string {
    const responses = [
      `I analyzed your ${documents.length} document(s) for relevant information. Try asking me to summarize the documents, find dates, extract contact information, or identify action items.`,
      `Based on your uploaded documents, I can help you find specific information. Ask me about summaries, key dates, contacts, or requirements mentioned in the documents.`,
      `I'm ready to help analyze your documents. You can ask me to summarize content, find dates and deadlines, extract contact details, or identify action items.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
}
