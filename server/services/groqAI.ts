import Groq from "groq-sdk";
import { ProcessedDocument, DocumentChunk } from "./advancedDocumentProcessor";
import { VectorDocument, semanticIndex } from "./semanticIndex";

export interface GroqResponse {
  answer: string;
  confidence: number;
  documentsReferenced: number;
  documentDetails: Array<{
    filename: string;
    type: string;
    wordCount: number;
    relevanceScore: number;
  }>;
  queryType: string;
  processingTime: number;
}

export class GroqAI {
  private groq: Groq;

  constructor() {
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }

  async processQuery(
    query: string,
    documents: ProcessedDocument[],
  ): Promise<GroqResponse> {
    const startTime = Date.now();

    try {
      // Use semantic search to find relevant chunks
      const relevantChunks = semanticIndex.search(query, 8);

      // Filter chunks to only include user's documents
      const userDocIds = new Set(documents.map((doc) => doc.id));
      const filteredChunks = relevantChunks.filter((chunk) =>
        userDocIds.has(chunk.metadata.documentId),
      );

      // Prepare context from retrieved chunks
      const context = this.prepareContext(filteredChunks, query);

      // Determine query type for better prompting
      const queryType = this.analyzeQueryType(query);

      // Generate response using Groq
      const response = await this.generateGroqResponse(
        query,
        context,
        queryType,
        documents.length,
      );

      const processingTime = Date.now() - startTime;

      return {
        answer: response,
        confidence: this.calculateConfidence(filteredChunks, response),
        documentsReferenced: filteredChunks.length,
        documentDetails: filteredChunks.slice(0, 5).map((chunk) => ({
          filename: chunk.metadata.filename,
          type: chunk.metadata.type,
          wordCount: chunk.content.split(/\s+/).length,
          relevanceScore: (chunk as any).similarity || 0.8,
        })),
        queryType,
        processingTime,
      };
    } catch (error) {
      console.error("Groq AI processing error:", error);

      // Fallback response
      return {
        answer:
          "I apologize, but I encountered an error while processing your question. Please try rephrasing your query or check if the documents contain the information you're looking for.",
        confidence: 0.1,
        documentsReferenced: 0,
        documentDetails: [],
        queryType: "error",
        processingTime: Date.now() - startTime,
      };
    }
  }

  private prepareContext(chunks: VectorDocument[], query: string): string {
    if (chunks.length === 0) {
      return "No relevant document content found for this query.";
    }

    // Sort chunks by relevance and prepare context
    const sortedChunks = chunks
      .sort(
        (a, b) => ((b as any).similarity || 0) - ((a as any).similarity || 0),
      )
      .slice(0, 5); // Limit to top 5 most relevant chunks

    let context = "RELEVANT DOCUMENT EXCERPTS:\n\n";

    sortedChunks.forEach((chunk, index) => {
      context += `[Document: ${chunk.metadata.filename}]\n`;
      context += `${chunk.content}\n\n`;
    });

    return context;
  }

  private analyzeQueryType(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (
      /\b(summarize|summary|overview|main points|key points)\b/.test(lowerQuery)
    ) {
      return "summary";
    } else if (
      /\b(list|enumerate|find all|show all|what.*are)\b/.test(lowerQuery)
    ) {
      return "list";
    } else if (
      /\b(compare|difference|versus|vs|better|worse)\b/.test(lowerQuery)
    ) {
      return "comparison";
    } else if (/\b(when|date|time|deadline|schedule)\b/.test(lowerQuery)) {
      return "temporal";
    } else if (
      /\b(cost|price|amount|money|budget|financial)\b/.test(lowerQuery)
    ) {
      return "financial";
    } else if (/\b(contact|email|phone|address|who)\b/.test(lowerQuery)) {
      return "contact";
    } else if (/\b(how|why|what|where|explain|describe)\b/.test(lowerQuery)) {
      return "factual";
    } else {
      return "general";
    }
  }

  private async generateGroqResponse(
    query: string,
    context: string,
    queryType: string,
    totalDocuments: number,
  ): Promise<string> {
    if (!process.env.GROQ_API_KEY) {
      throw new Error("Groq API key not configured");
    }

    // Construct system prompt based on query type
    const systemPrompt = this.getSystemPrompt(queryType, totalDocuments);

    // Construct user prompt with context
    const userPrompt = `${context}\n\nUSER QUESTION: ${query}\n\nPlease provide a comprehensive and accurate answer based on the document excerpts above. If the information isn't available in the provided context, please say so clearly.`;

    try {
      const completion = await this.groq.chat.completions.create({
        model: "llama3-8b-8192", // Fast Llama 3 model
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 1000,
        temperature: 0.3, // Lower temperature for more factual responses
        top_p: 0.8,
      });

      return (
        completion.choices[0]?.message?.content ||
        "I apologize, but I couldn't generate a response. Please try again."
      );
    } catch (error: any) {
      console.error("Groq API error:", error);

      if (error.status === 429) {
        throw new Error(
          "Rate limit exceeded. Please wait a moment and try again.",
        );
      } else if (error.status === 401) {
        throw new Error("API authentication failed. Please check the API key.");
      } else {
        throw new Error(
          `AI service error: ${error.message || "Unknown error"}`,
        );
      }
    }
  }

  private getSystemPrompt(queryType: string, totalDocuments: number): string {
    const basePrompt = `You are an advanced document analysis AI assistant. You have access to excerpts from ${totalDocuments} uploaded document(s). Your role is to provide accurate, helpful answers based strictly on the provided document content.

IMPORTANT GUIDELINES:
- Base your answers ONLY on the provided document excerpts
- If information isn't in the documents, clearly state that
- Cite specific documents when possible
- Be precise and factual
- If asked about something not in the documents, explain what information IS available instead`;

    const typeSpecificPrompts = {
      summary:
        "\n\nFocus on creating clear, organized summaries with key points and main themes.",
      list: "\n\nProvide well-structured lists with bullet points or numbered items as appropriate.",
      comparison:
        "\n\nHighlight differences, similarities, and provide balanced comparative analysis.",
      temporal:
        "\n\nPay special attention to dates, timelines, deadlines, and chronological information.",
      financial:
        "\n\nFocus on monetary amounts, costs, budgets, and financial details.",
      contact:
        "\n\nExtract and organize contact information like names, emails, phone numbers, addresses.",
      factual:
        "\n\nProvide detailed, factual explanations with supporting evidence from the documents.",
      general:
        "\n\nProvide comprehensive answers that address all aspects of the question.",
    };

    return (
      basePrompt +
      (typeSpecificPrompts[queryType as keyof typeof typeSpecificPrompts] ||
        typeSpecificPrompts.general)
    );
  }

  private calculateConfidence(
    chunks: VectorDocument[],
    response: string,
  ): number {
    if (chunks.length === 0) return 0.1;

    let confidence = 0.6; // Base confidence for Groq responses

    // Boost confidence based on number of relevant chunks
    confidence += Math.min(chunks.length * 0.05, 0.2);

    // Boost confidence based on average similarity of chunks
    if (chunks.length > 0) {
      const avgSimilarity =
        chunks.reduce(
          (sum, chunk) => sum + ((chunk as any).similarity || 0),
          0,
        ) / chunks.length;
      confidence += avgSimilarity * 0.15;
    }

    // Reduce confidence if response indicates uncertainty
    if (
      response.toLowerCase().includes("i don't have information") ||
      response.toLowerCase().includes("not mentioned in") ||
      response.toLowerCase().includes("cannot determine")
    ) {
      confidence *= 0.7;
    }

    // Boost confidence for longer, detailed responses
    if (response.length > 200 && !response.includes("I apologize")) {
      confidence += 0.05;
    }

    return Math.min(confidence, 0.95);
  }
}

export const groqAI = new GroqAI();
