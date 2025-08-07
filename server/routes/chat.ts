import { RequestHandler } from "express";
import { z } from "zod";
import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || "");

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).optional()
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    if (!process.env.GOOGLE_AI_API_KEY) {
      return res.status(500).json({ 
        error: 'Google AI API key not configured. Please set GOOGLE_AI_API_KEY environment variable.' 
      });
    }

    const { message, files } = ChatRequestSchema.parse(req.body);

    // Build context about uploaded files
    let systemPrompt = "You are a helpful AI assistant that can analyze and answer questions about documents. ";
    if (files && files.length > 0) {
      systemPrompt += `The user has uploaded ${files.length} document(s). Please help them with questions about their documents. `;
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });

    const prompt = systemPrompt + "\n\nUser question: " + message;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    res.json({
      success: true,
      response: text,
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
    if (error && typeof error === 'object' && 'message' in error) {
      const errorMessage = (error as any).message;
      
      if (errorMessage.includes('quota') || errorMessage.includes('limit')) {
        return res.status(429).json({ 
          error: 'Google AI API quota exceeded. Please check your billing details or try again later.',
          type: 'quota_exceeded'
        });
      }
      
      if (errorMessage.includes('API key')) {
        return res.status(401).json({ 
          error: 'Google AI API key invalid or unauthorized.',
          type: 'auth_error'
        });
      }

      return res.status(500).json({ 
        error: 'Google AI API error: ' + errorMessage 
      });
    }

    res.status(500).json({ error: 'Failed to process chat message' });
  }
};

export const getChatHistory: RequestHandler = (req, res) => {
  // In a real implementation, you would fetch chat history from a database
  res.json({ messages: [] });
};
