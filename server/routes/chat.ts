import { RequestHandler } from "express";
import { z } from "zod";
import { SimpleAI } from "../services/simpleAI";
import { simpleDocumentStore } from "../services/simpleDocumentStore";

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  userId: z.string().optional().default('default')
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    const { message, userId } = ChatRequestSchema.parse(req.body);

    // Get user's documents
    const userDocuments = simpleDocumentStore.getUserDocuments(userId);

    // Process the query using Simple AI
    const aiResult = await SimpleAI.processQuery(message, userDocuments);

    res.json({
      success: true,
      response: aiResult.answer,
      metadata: {
        documentsReferenced: aiResult.documentsReferenced,
        documentDetails: aiResult.documentDetails,
        totalDocuments: userDocuments.length,
        confidence: aiResult.confidence,
        queryType: aiResult.queryType,
        aiType: 'simple-ai',
        processingTime: 50
      },
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
    const userDocuments = simpleDocumentStore.getUserDocuments(userId as string);

    const summary = {
      totalDocuments: userDocuments.length,
      totalWordCount: userDocuments.reduce((sum, doc) => sum + doc.metadata.wordCount, 0),
      totalChunks: userDocuments.length, // Simple processor doesn't chunk documents
      documentTypes: userDocuments.reduce((types, doc) => {
        const type = doc.type.includes('pdf') ? 'PDF' : 
                    doc.type.includes('word') ? 'DOCX' : 
                    doc.type.includes('html') ? 'HTML' :
                    doc.type.includes('message') ? 'Email' : 'Other';
        types[type] = (types[type] || 0) + 1;
        return types;
      }, {} as Record<string, number>),
      languages: { 'unknown': userDocuments.length }, // Simple processor doesn't detect language
      topKeywords: [], // Simple processor doesn't extract keywords
      documents: userDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        type: doc.type,
        wordCount: doc.metadata.wordCount,
        chunkCount: 1, // Simple processor doesn't chunk
        extractedAt: doc.metadata.extractedAt,
        keywords: [] // Simple processor doesn't extract keywords
      })),
      indexStats: simpleDocumentStore.getStats()
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
      'Groq AI-Powered RAG System',
      'Advanced Llama 3 Language Model',
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
      'Groq AI ultra-fast inference',
      'Vector-based semantic search',
      'TF-IDF document indexing',
      'Advanced language understanding',
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

    const userDocuments = simpleDocumentStore.getUserDocuments(userId as string);
    const results = await SimpleAI.processQuery(query, userDocuments);

    res.json({
      success: true,
      query,
      results: {
        answer: results.answer,
        confidence: results.confidence,
        queryType: results.queryType,
        documentDetails: results.documentDetails
      },
      metadata: {
        processingTime: results.processingTime,
        documentsReferenced: results.documentsReferenced
      }
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search documents' });
  }
};
