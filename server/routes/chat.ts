import { RequestHandler } from "express";
import { z } from "zod";
import { CustomAI } from "../services/customAI";
import { documentStore } from "../services/documentStore";

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  userId: z.string().optional().default('default')
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    const { message, userId } = ChatRequestSchema.parse(req.body);

    // Get user's documents
    const userDocuments = documentStore.getUserDocuments(userId);
    
    // Process the query using our custom AI
    const aiResponse = await CustomAI.processQuery(message, userDocuments);

    res.json({
      success: true,
      response: aiResponse.response,
      metadata: {
        documentsReferenced: aiResponse.documentsReferenced,
        documentDetails: aiResponse.documentDetails,
        totalDocuments: userDocuments.length,
        confidence: aiResponse.confidence,
        aiType: 'custom'
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
    const userDocuments = documentStore.getUserDocuments(userId as string);
    
    const summary = {
      totalDocuments: userDocuments.length,
      totalWordCount: userDocuments.reduce((sum, doc) => sum + doc.metadata.wordCount, 0),
      documentTypes: userDocuments.reduce((types, doc) => {
        const type = doc.type.includes('pdf') ? 'PDF' : 
                    doc.type.includes('word') ? 'DOCX' : 
                    doc.type.includes('message') ? 'Email' : 'Other';
        types[type] = (types[type] || 0) + 1;
        return types;
      }, {} as Record<string, number>),
      documents: userDocuments.map(doc => ({
        id: doc.id,
        filename: doc.filename,
        type: doc.type,
        wordCount: doc.metadata.wordCount,
        extractedAt: doc.metadata.extractedAt
      }))
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
      'Document Summarization',
      'Date and Deadline Extraction',
      'Contact Information Extraction',
      'Action Items Identification', 
      'Financial Information Analysis',
      'People and Names Recognition',
      'Content Search and Retrieval',
      'General Document Q&A'
    ],
    supportedFileTypes: ['DOCX', 'DOC', 'EML', 'MSG', 'TXT'],
    features: [
      'No external API dependencies',
      'Pattern-based intelligence',
      'Document context awareness',
      'Multi-document analysis',
      'Real-time processing'
    ]
  });
};
