import { RequestHandler } from "express";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const ChatRequestSchema = z.object({
  message: z.string().min(1),
  files: z.array(z.string()).optional()
});

export const handleChat: RequestHandler = async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.' 
      });
    }

    const { message, files } = ChatRequestSchema.parse(req.body);

    // Build context about uploaded files
    let systemMessage = "You are a helpful AI assistant that can analyze and answer questions about documents. ";
    if (files && files.length > 0) {
      systemMessage += `The user has uploaded ${files.length} document(s). Please help them with questions about their documents.`;
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: message }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    const response = completion.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";

    res.json({
      success: true,
      response: response,
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

    if (error instanceof OpenAI.APIError) {
      if (error.status === 429) {
        return res.status(429).json({
          error: 'OpenAI API quota exceeded. Please check your billing details or try again later.',
          type: 'quota_exceeded'
        });
      }
      return res.status(500).json({
        error: 'OpenAI API error: ' + error.message
      });
    }

    res.status(500).json({ error: 'Failed to process chat message' });
  }
};

export const getChatHistory: RequestHandler = (req, res) => {
  // In a real implementation, you would fetch chat history from a database
  res.json({ messages: [] });
};
