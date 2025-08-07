import natural from 'natural';
import { ProcessedDocument, DocumentChunk } from './advancedDocumentProcessor';
import { VectorDocument, semanticIndex } from './semanticIndex';

export interface QueryResult {
  answer: string;
  confidence: number;
  sources: Array<{
    documentId: string;
    filename: string;
    content: string;
    relevanceScore: number;
    chunkIndex?: number;
  }>;
  queryType: 'factual' | 'summary' | 'list' | 'comparison' | 'unknown';
  metadata: {
    processingTime: number;
    documentsSearched: number;
    chunksRetrieved: number;
  };
}

export interface QueryContext {
  retrievedChunks: VectorDocument[];
  queryType: string;
  entities: string[];
  keywords: string[];
}

export class QueryProcessor {
  
  static async processQuery(query: string, documents: ProcessedDocument[]): Promise<QueryResult> {
    const startTime = Date.now();
    
    // Analyze query to determine intent and type
    const queryAnalysis = this.analyzeQuery(query);
    
    // Retrieve relevant document chunks using semantic search
    const retrievedChunks = semanticIndex.search(query, 8);
    
    // Filter and rank results
    const filteredChunks = this.filterAndRankChunks(retrievedChunks, query, queryAnalysis);
    
    // Generate contextual answer
    const answer = this.generateAnswer(query, filteredChunks, queryAnalysis);
    
    // Calculate confidence score
    const confidence = this.calculateConfidence(filteredChunks, queryAnalysis, answer);
    
    const processingTime = Date.now() - startTime;
    
    return {
      answer,
      confidence,
      sources: filteredChunks.slice(0, 5).map(chunk => ({
        documentId: chunk.metadata.documentId,
        filename: chunk.metadata.filename,
        content: chunk.content.substring(0, 200) + (chunk.content.length > 200 ? '...' : ''),
        relevanceScore: (chunk as any).similarity || 0.8,
        chunkIndex: chunk.metadata.chunkIndex
      })),
      queryType: queryAnalysis.type,
      metadata: {
        processingTime,
        documentsSearched: documents.length,
        chunksRetrieved: retrievedChunks.length
      }
    };
  }

  private static analyzeQuery(query: string): {
    type: 'factual' | 'summary' | 'list' | 'comparison' | 'unknown';
    intent: string;
    entities: string[];
    keywords: string[];
    focus: string[];
  } {
    const lowerQuery = query.toLowerCase();
    
    // Determine query type based on patterns
    let type: 'factual' | 'summary' | 'list' | 'comparison' | 'unknown' = 'unknown';
    
    if (/\b(what is|what are|define|explain|describe)\b/.test(lowerQuery)) {
      type = 'factual';
    } else if (/\b(summarize|summary|overview|main points|key points)\b/.test(lowerQuery)) {
      type = 'summary';
    } else if (/\b(list|enumerate|find all|show all|what.*are)\b/.test(lowerQuery)) {
      type = 'list';
    } else if (/\b(compare|difference|versus|vs|better|worse)\b/.test(lowerQuery)) {
      type = 'comparison';
    } else if (/\b(how|why|when|where|who)\b/.test(lowerQuery)) {
      type = 'factual';
    }

    // Extract entities and keywords
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(query) || [];
    const keywords = tokens.filter(token => 
      token.length > 3 && 
      !/\b(what|how|when|where|why|who|is|are|the|and|or|but|in|on|at|to|for|of|with|by)\b/i.test(token)
    );

    // Extract named entities (simple approach)
    const entities = this.extractEntities(query);
    
    // Determine focus areas
    const focus = this.determineFocus(lowerQuery);

    return {
      type,
      intent: this.determineIntent(lowerQuery),
      entities,
      keywords,
      focus
    };
  }

  private static extractEntities(text: string): string[] {
    const entities: string[] = [];
    
    // Extract potential named entities (capitalized words/phrases)
    const namedEntityPattern = /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b/g;
    const matches = text.match(namedEntityPattern) || [];
    entities.push(...matches);
    
    // Extract dates
    const datePattern = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december|\d{1,2}\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec))\b/gi;
    const dates = text.match(datePattern) || [];
    entities.push(...dates);
    
    // Extract monetary amounts
    const moneyPattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(dollars?|usd|euros?|pounds?)/gi;
    const amounts = text.match(moneyPattern) || [];
    entities.push(...amounts);
    
    return [...new Set(entities)];
  }

  private static determineIntent(query: string): string {
    if (/\b(cost|price|amount|money|budget|pay|payment)\b/.test(query)) return 'financial';
    if (/\b(date|when|deadline|schedule|time)\b/.test(query)) return 'temporal';
    if (/\b(contact|email|phone|address|person|people)\b/.test(query)) return 'contact';
    if (/\b(requirement|must|should|need|action|task|todo)\b/.test(query)) return 'requirements';
    if (/\b(coverage|cover|include|benefit|eligible)\b/.test(query)) return 'coverage';
    if (/\b(process|procedure|how to|steps)\b/.test(query)) return 'procedural';
    return 'general';
  }

  private static determineFocus(query: string): string[] {
    const focus: string[] = [];
    
    const focusAreas = [
      { keywords: ['policy', 'insurance', 'coverage'], focus: 'insurance' },
      { keywords: ['medical', 'health', 'doctor', 'treatment'], focus: 'medical' },
      { keywords: ['financial', 'cost', 'price', 'payment'], focus: 'financial' },
      { keywords: ['legal', 'law', 'regulation', 'compliance'], focus: 'legal' },
      { keywords: ['technical', 'system', 'software', 'technology'], focus: 'technical' },
      { keywords: ['contract', 'agreement', 'terms'], focus: 'contractual' }
    ];
    
    focusAreas.forEach(area => {
      if (area.keywords.some(keyword => query.includes(keyword))) {
        focus.push(area.focus);
      }
    });
    
    return focus;
  }

  private static filterAndRankChunks(chunks: VectorDocument[], query: string, analysis: any): VectorDocument[] {
    return chunks
      .filter(chunk => {
        // Filter out very short chunks
        if (chunk.content.length < 50) return false;
        
        // Ensure some relevance to query
        const similarity = (chunk as any).similarity || 0;
        return similarity > 0.1;
      })
      .sort((a, b) => {
        const simA = (a as any).similarity || 0;
        const simB = (b as any).similarity || 0;
        
        // Boost chunks that contain entities mentioned in query
        let boostA = 0;
        let boostB = 0;
        
        analysis.entities.forEach((entity: string) => {
          if (a.content.toLowerCase().includes(entity.toLowerCase())) boostA += 0.1;
          if (b.content.toLowerCase().includes(entity.toLowerCase())) boostB += 0.1;
        });
        
        return (simB + boostB) - (simA + boostA);
      })
      .slice(0, 6);
  }

  private static generateAnswer(query: string, chunks: VectorDocument[], analysis: any): string {
    if (chunks.length === 0) {
      return "I couldn't find relevant information in the uploaded documents to answer your question. Please make sure you've uploaded documents that contain the information you're looking for.";
    }

    const context = chunks.map(chunk => chunk.content).join('\n\n');
    
    switch (analysis.type) {
      case 'summary':
        return this.generateSummaryAnswer(context, chunks);
      
      case 'list':
        return this.generateListAnswer(query, context, analysis);
      
      case 'factual':
        return this.generateFactualAnswer(query, context, analysis);
      
      case 'comparison':
        return this.generateComparisonAnswer(query, context);
      
      default:
        return this.generateGeneralAnswer(query, context, chunks);
    }
  }

  private static generateSummaryAnswer(context: string, chunks: VectorDocument[]): string {
    const sentences = context.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const keyPoints = sentences.slice(0, 5).map(s => s.trim());
    
    const summary = `Based on the documents, here are the key points:\n\n${keyPoints.map((point, i) => `${i + 1}. ${point}`).join('\n')}`;
    
    const sources = chunks.slice(0, 3).map(chunk => chunk.metadata.filename);
    return summary + `\n\nSources: ${[...new Set(sources)].join(', ')}`;
  }

  private static generateListAnswer(query: string, context: string, analysis: any): string {
    const items: string[] = [];
    
    if (analysis.intent === 'financial') {
      const moneyPattern = /\$[\d,]+\.?\d*|[\d,]+\.?\d*\s*(dollars?|usd|euros?|pounds?)/gi;
      const amounts = context.match(moneyPattern) || [];
      items.push(...amounts);
    } else if (analysis.intent === 'temporal') {
      const datePattern = /\b(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2}|january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
      const dates = context.match(datePattern) || [];
      items.push(...dates);
    } else if (analysis.intent === 'contact') {
      const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
      const phonePattern = /\b(\+?1?[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g;
      const emails = context.match(emailPattern) || [];
      const phones = context.match(phonePattern) || [];
      items.push(...emails, ...phones);
    } else {
      // Extract bullet points or numbered lists
      const listPattern = /^[\s]*[\*\-\•][\s]+(.+)$/gm;
      const numberPattern = /^[\s]*\d+[\.\)][\s]+(.+)$/gm;
      const bullets = [...(context.match(listPattern) || []), ...(context.match(numberPattern) || [])];
      items.push(...bullets);
    }
    
    if (items.length === 0) {
      return `I found relevant information but couldn't extract a specific list. Here's what I found:\n\n${context.substring(0, 300)}...`;
    }
    
    const uniqueItems = [...new Set(items)].slice(0, 10);
    return `Here's what I found:\n\n${uniqueItems.map((item, i) => `• ${item.trim()}`).join('\n')}`;
  }

  private static generateFactualAnswer(query: string, context: string, analysis: any): string {
    // Find the most relevant sentence that might answer the question
    const sentences = context.split(/[.!?]+/).filter(s => s.trim().length > 20);
    const queryWords = query.toLowerCase().split(/\s+/);
    
    let bestSentence = '';
    let bestScore = 0;
    
    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      let score = 0;
      
      queryWords.forEach(word => {
        if (lowerSentence.includes(word)) score++;
      });
      
      // Boost sentences with entities
      analysis.entities.forEach((entity: string) => {
        if (lowerSentence.includes(entity.toLowerCase())) score += 2;
      });
      
      if (score > bestScore) {
        bestScore = score;
        bestSentence = sentence.trim();
      }
    });
    
    if (bestSentence) {
      return `Based on the documents: ${bestSentence}`;
    }
    
    return `Based on the available documents:\n\n${context.substring(0, 400)}...`;
  }

  private static generateComparisonAnswer(query: string, context: string): string {
    const sections = context.split('\n\n').filter(s => s.trim().length > 50);
    return `Based on the documents, here's relevant information for comparison:\n\n${sections.slice(0, 3).map((section, i) => `${i + 1}. ${section.trim()}`).join('\n\n')}`;
  }

  private static generateGeneralAnswer(query: string, context: string, chunks: VectorDocument[]): string {
    const relevantContent = context.substring(0, 500);
    const sources = chunks.slice(0, 3).map(chunk => chunk.metadata.filename);
    
    return `Based on your documents, here's the relevant information:\n\n${relevantContent}${context.length > 500 ? '...' : ''}\n\nSources: ${[...new Set(sources)].join(', ')}`;
  }

  private static calculateConfidence(chunks: VectorDocument[], analysis: any, answer: string): number {
    if (chunks.length === 0) return 0.1;
    
    let confidence = 0.5;
    
    // Boost confidence based on semantic similarity
    const avgSimilarity = chunks.reduce((sum, chunk) => sum + ((chunk as any).similarity || 0), 0) / chunks.length;
    confidence += avgSimilarity * 0.3;
    
    // Boost confidence if entities are found
    const entityMatches = analysis.entities.filter((entity: string) => 
      answer.toLowerCase().includes(entity.toLowerCase())
    ).length;
    confidence += Math.min(entityMatches * 0.1, 0.2);
    
    // Boost confidence based on answer length and content quality
    if (answer.length > 100 && !answer.includes("I couldn't find")) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 0.95);
  }
}
