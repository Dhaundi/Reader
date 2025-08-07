import { RequestHandler } from "express";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { DocumentProcessor } from "../services/documentProcessor";
import { documentStore } from "../services/documentStore";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  userId: z.string().optional().default('default')
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({ 
        error: 'Google AI API key not configured. Please set GOOGLE_AI_API_KEY environment variable.' 
      });
    }

    const { message, userId } = ChatRequestSchema.parse(req.body);

    // Get user's documents
    const userDocuments = documentStore.getUserDocuments(userId);
    
    let systemPrompt = `You are an AI assistant specialized in analyzing and answering questions about documents. `;
    let documentContext = '';

    if (userDocuments.length > 0) {
      systemPrompt += `The user has uploaded ${userDocuments.length} document(s). Use the document content provided below to answer their questions accurately. If the question cannot be answered from the documents, say so clearly.`;
      
      // Search for relevant documents based on the query
      const relevantDocs = await DocumentProcessor.searchDocuments(userDocuments, message);
      
      if (relevantDocs.length > 0) {
        documentContext = '\n\nDocument Context:\n';
        relevantDocs.slice(0, 3).forEach((doc, index) => { // Limit to top 3 most relevant
          const context = DocumentProcessor.extractRelevantContext(doc, message, 800);
          documentContext += `\n[Document ${index + 1}: ${doc.filename}]\n${context}\n`;
        });
      }
    } else {
      systemPrompt += `The user hasn't uploaded any documents yet. Encourage them to upload documents (PDF, DOCX, or email files) so you can help analyze and answer questions about them.`;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const fullPrompt = systemPrompt + documentContext + "\n\nUser question: " + message;

    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();

    // Add metadata about which documents were referenced
    const referencedDocs = userDocuments.length > 0 ? 
      await DocumentProcessor.searchDocuments(userDocuments, message).slice(0, 3).map(doc => ({
        filename: doc.filename,
        type: doc.type,
        wordCount: doc.metadata.wordCount
      })) : [];

    res.json({
      success: true,
      response: text,
      metadata: {
        documentsReferenced: referencedDocs.length,
        documentDetails: referencedDocs,
        totalDocuments: userDocuments.length
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

    // Handle Google AI specific errors
    if (error && typeof error === 'object') {
      const errorObj = error as any;
      
      if (errorObj.status === 429 || 
          (errorObj.message && errorObj.message.includes('quota')) ||
          (errorObj.message && errorObj.message.includes('limit')) ||
          (errorObj.message && errorObj.message.includes('RATE_LIMIT_EXCEEDED'))) {
        return res.status(429).json({ 
          error: 'Google AI API rate limit exceeded. Please wait a moment and try again.',
          type: 'quota_exceeded'
        });
      }
      
      if (errorObj.status === 401 || (errorObj.message && errorObj.message.includes('API key'))) {
        return res.status(401).json({ 
          error: 'Google AI API key invalid or unauthorized.',
          type: 'auth_error'
        });
      }

      if ('message' in errorObj) {
        return res.status(500).json({ 
          error: 'Google AI API error: ' + errorObj.message 
        });
      }
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
