import natural from 'natural';
import { Matrix } from 'ml-matrix';
import * as cosineSimilarity from 'cosine-similarity';
import { ProcessedDocument, DocumentChunk } from './advancedDocumentProcessor';

export interface VectorDocument {
  id: string;
  content: string;
  vector: number[];
  metadata: {
    documentId: string;
    filename: string;
    chunkIndex?: number;
    type: 'document' | 'chunk';
    keywords: string[];
  };
}

export class SemanticIndex {
  private documents: Map<string, VectorDocument> = new Map();
  private vocabulary: Map<string, number> = new Map();
  private idfScores: Map<string, number> = new Map();
  private vectorSize: number = 0;

  // Add documents to the semantic index
  addDocument(doc: ProcessedDocument): void {
    // Add full document
    const docVector = this.createTFIDFVector(doc.cleanedContent, doc.metadata.keywords);
    const vectorDoc: VectorDocument = {
      id: doc.id,
      content: doc.cleanedContent,
      vector: docVector,
      metadata: {
        documentId: doc.id,
        filename: doc.filename,
        type: 'document',
        keywords: doc.metadata.keywords
      }
    };
    this.documents.set(doc.id, vectorDoc);

    // Add document chunks for more granular search
    doc.chunks.forEach(chunk => {
      const chunkVector = this.createTFIDFVector(chunk.content, []);
      const chunkVectorDoc: VectorDocument = {
        id: chunk.id,
        content: chunk.content,
        vector: chunkVector,
        metadata: {
          documentId: doc.id,
          filename: doc.filename,
          chunkIndex: chunk.metadata.chunkIndex,
          type: 'chunk',
          keywords: []
        }
      };
      this.documents.set(chunk.id, chunkVectorDoc);
    });

    // Update IDF scores after adding new documents
    this.updateIDF();
  }

  // Remove document from index
  removeDocument(documentId: string): void {
    // Remove document and its chunks
    const toRemove = Array.from(this.documents.keys()).filter(key => 
      key === documentId || key.startsWith(documentId + '_chunk_')
    );
    
    toRemove.forEach(key => this.documents.delete(key));
    this.updateIDF();
  }

  // Create TF-IDF vector for text
  private createTFIDFVector(text: string, keywords: string[]): number[] {
    const tokens = this.tokenize(text);
    const termFreq = this.calculateTermFrequency(tokens);
    
    // Include keywords with higher weight
    keywords.forEach(keyword => {
      if (termFreq.has(keyword)) {
        termFreq.set(keyword, termFreq.get(keyword)! * 1.5);
      } else {
        termFreq.set(keyword, 0.5);
      }
    });

    // Update vocabulary
    termFreq.forEach((_, term) => {
      if (!this.vocabulary.has(term)) {
        this.vocabulary.set(term, this.vocabulary.size);
      }
    });

    // Create vector
    const vector = new Array(this.vocabulary.size).fill(0);
    termFreq.forEach((tf, term) => {
      const index = this.vocabulary.get(term);
      if (index !== undefined) {
        const idf = this.idfScores.get(term) || 1;
        vector[index] = tf * idf;
      }
    });

    this.vectorSize = Math.max(this.vectorSize, vector.length);
    return vector;
  }

  // Calculate term frequency
  private calculateTermFrequency(tokens: string[]): Map<string, number> {
    const freq = new Map<string, number>();
    const totalTokens = tokens.length;
    
    tokens.forEach(token => {
      freq.set(token, (freq.get(token) || 0) + 1);
    });
    
    // Normalize by total tokens
    freq.forEach((count, term) => {
      freq.set(term, count / totalTokens);
    });
    
    return freq;
  }

  // Update IDF scores
  private updateIDF(): void {
    const documentCount = this.documents.size;
    if (documentCount === 0) return;

    this.vocabulary.forEach((_, term) => {
      let documentsWithTerm = 0;
      this.documents.forEach(doc => {
        if (doc.content.toLowerCase().includes(term)) {
          documentsWithTerm++;
        }
      });
      
      const idf = Math.log(documentCount / (documentsWithTerm + 1));
      this.idfScores.set(term, idf);
    });
  }

  // Tokenize text
  private tokenize(text: string): string[] {
    const tokenizer = new natural.WordTokenizer();
    const tokens = tokenizer.tokenize(text.toLowerCase()) || [];
    return tokens.filter(token => token.length > 2 && /^[a-zA-Z]+$/.test(token));
  }

  // Semantic search using cosine similarity
  search(query: string, topK: number = 5): VectorDocument[] {
    if (this.documents.size === 0) return [];

    const queryVector = this.createTFIDFVector(query, []);
    
    // Ensure all vectors have the same size
    const normalizedQueryVector = this.normalizeVector(queryVector);
    
    const similarities: Array<{ doc: VectorDocument; similarity: number }> = [];
    
    this.documents.forEach(doc => {
      const normalizedDocVector = this.normalizeVector(doc.vector);
      const similarity = this.calculateCosineSimilarity(normalizedQueryVector, normalizedDocVector);
      
      if (similarity > 0.1) { // Threshold for relevance
        similarities.push({ doc, similarity });
      }
    });
    
    // Sort by similarity and return top K
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(item => ({ ...item.doc, similarity: item.similarity }));
  }

  // Normalize vector to consistent size
  private normalizeVector(vector: number[]): number[] {
    const normalized = new Array(this.vectorSize).fill(0);
    for (let i = 0; i < Math.min(vector.length, this.vectorSize); i++) {
      normalized[i] = vector[i];
    }
    return normalized;
  }

  // Calculate cosine similarity between two vectors
  private calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
    try {
      return cosineSimilarity(vec1, vec2);
    } catch (error) {
      // Fallback manual calculation
      let dotProduct = 0;
      let norm1 = 0;
      let norm2 = 0;
      
      for (let i = 0; i < Math.min(vec1.length, vec2.length); i++) {
        dotProduct += vec1[i] * vec2[i];
        norm1 += vec1[i] * vec1[i];
        norm2 += vec2[i] * vec2[i];
      }
      
      if (norm1 === 0 || norm2 === 0) return 0;
      return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }
  }

  // Get similar documents based on content
  findSimilar(documentId: string, topK: number = 3): VectorDocument[] {
    const targetDoc = this.documents.get(documentId);
    if (!targetDoc) return [];

    const similarities: Array<{ doc: VectorDocument; similarity: number }> = [];
    
    this.documents.forEach((doc, id) => {
      if (id !== documentId) {
        const similarity = this.calculateCosineSimilarity(
          this.normalizeVector(targetDoc.vector),
          this.normalizeVector(doc.vector)
        );
        
        if (similarity > 0.1) {
          similarities.push({ doc, similarity });
        }
      }
    });
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .map(item => item.doc);
  }

  // Get index statistics
  getStats(): {
    documentCount: number;
    chunkCount: number;
    vocabularySize: number;
    averageVectorSize: number;
  } {
    const documentCount = Array.from(this.documents.values()).filter(doc => doc.metadata.type === 'document').length;
    const chunkCount = Array.from(this.documents.values()).filter(doc => doc.metadata.type === 'chunk').length;
    
    return {
      documentCount,
      chunkCount,
      vocabularySize: this.vocabulary.size,
      averageVectorSize: this.vectorSize
    };
  }

  // Clear all documents
  clear(): void {
    this.documents.clear();
    this.vocabulary.clear();
    this.idfScores.clear();
    this.vectorSize = 0;
  }

  // Export index for persistence (optional)
  export(): any {
    return {
      documents: Array.from(this.documents.entries()),
      vocabulary: Array.from(this.vocabulary.entries()),
      idfScores: Array.from(this.idfScores.entries()),
      vectorSize: this.vectorSize
    };
  }

  // Import index from persistence (optional)
  import(data: any): void {
    this.documents = new Map(data.documents);
    this.vocabulary = new Map(data.vocabulary);
    this.idfScores = new Map(data.idfScores);
    this.vectorSize = data.vectorSize;
  }
}

// Global semantic index instance
export const semanticIndex = new SemanticIndex();
