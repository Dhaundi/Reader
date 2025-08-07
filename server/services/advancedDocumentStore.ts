import { ProcessedDocument } from './advancedDocumentProcessor';
import { semanticIndex } from './semanticIndex';

class AdvancedDocumentStore {
  private documents: Map<string, ProcessedDocument> = new Map();
  private userDocuments: Map<string, string[]> = new Map();

  addDocument(document: ProcessedDocument, userId: string = 'default'): void {
    // Store the document
    this.documents.set(document.id, document);
    
    // Update user mapping
    if (!this.userDocuments.has(userId)) {
      this.userDocuments.set(userId, []);
    }
    this.userDocuments.get(userId)!.push(document.id);
    
    // Add to semantic index
    semanticIndex.addDocument(document);
  }

  getDocument(documentId: string): ProcessedDocument | undefined {
    return this.documents.get(documentId);
  }

  getUserDocuments(userId: string = 'default'): ProcessedDocument[] {
    const documentIds = this.userDocuments.get(userId) || [];
    return documentIds
      .map(id => this.documents.get(id))
      .filter(doc => doc !== undefined) as ProcessedDocument[];
  }

  getAllDocuments(): ProcessedDocument[] {
    return Array.from(this.documents.values());
  }

  removeDocument(documentId: string, userId: string = 'default'): boolean {
    // Remove from user mapping
    const userDocs = this.userDocuments.get(userId);
    if (userDocs) {
      const index = userDocs.indexOf(documentId);
      if (index > -1) {
        userDocs.splice(index, 1);
      }
    }
    
    // Remove from semantic index
    semanticIndex.removeDocument(documentId);
    
    // Remove from documents
    return this.documents.delete(documentId);
  }

  clearUserDocuments(userId: string = 'default'): void {
    const documentIds = this.userDocuments.get(userId) || [];
    documentIds.forEach(id => {
      semanticIndex.removeDocument(id);
      this.documents.delete(id);
    });
    this.userDocuments.set(userId, []);
  }

  getDocumentCount(userId: string = 'default'): number {
    return this.userDocuments.get(userId)?.length || 0;
  }

  searchDocuments(query: string, userId: string = 'default'): ProcessedDocument[] {
    const userDocs = this.getUserDocuments(userId);
    if (userDocs.length === 0) return [];
    
    // Use semantic search
    const semanticResults = semanticIndex.search(query, 10);
    
    // Filter to user's documents and convert back to ProcessedDocument
    const userDocIds = new Set(userDocs.map(doc => doc.id));
    const relevantDocIds = new Set(
      semanticResults
        .filter(result => userDocIds.has(result.metadata.documentId))
        .map(result => result.metadata.documentId)
    );
    
    return userDocs.filter(doc => relevantDocIds.has(doc.id));
  }

  getIndexStats(): any {
    return {
      totalDocuments: this.documents.size,
      semanticIndexStats: semanticIndex.getStats(),
      userCounts: Object.fromEntries(
        Array.from(this.userDocuments.entries()).map(([userId, docs]) => [userId, docs.length])
      )
    };
  }
}

export const advancedDocumentStore = new AdvancedDocumentStore();
