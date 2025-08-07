import { RequestHandler } from "express";
import { z } from "zod";
import { QueryProcessor } from "../services/queryProcessor";
import { advancedDocumentStore } from "../services/advancedDocumentStore";

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  userId: z.string().optional().default('default')
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    const { message, userId } = ChatRequestSchema.parse(req.body);

    // Get user's documents
    const userDocuments = advancedDocumentStore.getUserDocuments(userId);
    
    // Process the query using advanced AI system
    const queryResult = await QueryProcessor.processQuery(message, userDocuments);

    res.json({
      success: true,
      response: queryResult.answer,
      metadata: {
        documentsReferenced: queryResult.sources.length,
        documentDetails: queryResult.sources.map(source => ({
          filename: source.filename,
          relevanceScore: source.relevanceScore,
          excerpt: source.content
        })),
        totalDocuments: userDocuments.length,
        confidence: queryResult.confidence,
        queryType: queryResult.queryType,
        aiType: 'advanced-rag',
        processingStats: queryResult.metadata
      },
      sources: queryResult.sources,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        error: 'Invalid request format',
        details: error.errors 
      });
    }

    res.status(500).json({ error: 'Failed to process chat message' });
  }
};

export const getChatHistory: RequestHandler = (req, res) => {
  // In a real implementation, you would fetch chat history from a database
  res.json({ messages: [] });
};

export const getDocumentSummary: RequestHandler = (req, res) => {
  try {
    const { userId = 'default' } = req.query;
    const userDocuments = advancedDocumentStore.getUserDocuments(userId as string);
    
    const summary = {
      totalDocuments: userDocuments.length,
      totalWordCount: userDocuments.reduce((sum, doc) => sum + doc.metadata.wordCount, 0),
      totalChunks: userDocuments.reduce((sum, doc) => sum + doc.chunks.length, 0),
      documentTypes: userDocuments.reduce((types, doc) => {
        const type = doc.type.includes('pdf') ? 'PDF' : 
                    doc.type.includes('word') ? 'DOCX' : 
                    doc.type.includes('html') ? 'HTML' :
                    doc.type.includes('message') ? 'Email' : 'Other';
        types[type] = (types[type] || 0) + 1;
        return types;
      }, {} as Record<string, number>),
      languages: userDocuments.reduce((langs, doc) => {
        const lang = doc.metadata.language || 'unknown';
        langs[lang] = (langs[lang] || 0) + 1;
        return langs;
      }, {} as Record<string, number>),
      topKeywords: getTopKeywords(userDocuments),
      documents: userDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        type: doc.type,
        wordCount: doc.metadata.wordCount,
        chunkCount: doc.chunks.length,
        extractedAt: doc.metadata.extractedAt,
        keywords: doc.metadata.keywords.slice(0, 5)
      })),
      indexStats: advancedDocumentStore.getIndexStats()
    };

    res.json(summary);
  } catch (error) {
    console.error('Error getting document summary:', error);
    res.status(500).json({ error: 'Failed to get document summary' });
  }
};

export const getChatCapabilities: RequestHandler = (req, res) => {
  res.json({
    capabilities: [
      'Advanced Document Analysis with RAG',
      'Semantic Search & Retrieval',
      'Multi-format Text Extraction (PDF, DOCX, HTML, Email)',
      'Document Chunking & Preprocessing',
      'Context-Aware Question Answering',
      'Query Intent Recognition',
      'Confidence Scoring',
      'Source Attribution & Transparency'
    ],
    supportedFileTypes: ['PDF', 'DOCX', 'DOC', 'HTML', 'EML', 'MSG', 'TXT'],
    features: [
      'No external API dependencies',
      'Vector-based semantic search',
      'TF-IDF document indexing',
      'Named entity extraction',
      'Multi-document context synthesis',
      'Query type classification',
      'Real-time processing',
      'Chunk-level relevance scoring'
    ],
    queryTypes: [
      'Factual Questions (What is...?)',
      'Summarization (Summarize...)',
      'List Extraction (List all...)',
      'Comparison Queries (Compare...)',
      'Temporal Queries (When...?)',
      'Financial Queries (How much...?)',
      'Contact Information (Who...?)',
      'Procedural Questions (How to...?)'
    ]
  });
};

// Helper method to get top keywords across all documents
function getTopKeywords(documents: any[]): string[] {
  if (!documents || documents.length === 0) return [];
  const allKeywords: { [key: string]: number } = {};
  
  documents.forEach(doc => {
    doc.metadata.keywords.forEach((keyword: string) => {
      allKeywords[keyword] = (allKeywords[keyword] || 0) + 1;
    });
  });
  
  return Object.entries(allKeywords)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 15)
    .map(([keyword]) => keyword);
}

export const searchDocuments: RequestHandler = async (req, res) => {
  try {
    const { query, userId = 'default' } = req.query;
    
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Query parameter is required' });
    }

    const userDocuments = advancedDocumentStore.getUserDocuments(userId as string);
    const results = await QueryProcessor.processQuery(query, userDocuments);
    
    res.json({
      success: true,
      query,
      results: {
        answer: results.answer,
        sources: results.sources,
        confidence: results.confidence,
        queryType: results.queryType
      },
      metadata: results.metadata
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
};
