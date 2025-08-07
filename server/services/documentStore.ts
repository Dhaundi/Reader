import { ProcessedDocument } from './documentProcessor';

// In-memory storage for processed documents
// In production, this would be replaced with a database
class DocumentStore {
  private documents: Map<string, ProcessedDocument> = new Map();
  private userDocuments: Map<string, string[]> = new Map(); // userId -> documentIds

  addDocument(document: ProcessedDocument, userId: string = 'default'): void {
    this.documents.set(document.id, document);
    
    if (!this.userDocuments.has(userId)) {
      this.userDocuments.set(userId, []);
    }
    this.userDocuments.get(userId)!.push(document.id);
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
    const userDocs = this.userDocuments.get(userId);
    if (userDocs) {
      const index = userDocs.indexOf(documentId);
      if (index > -1) {
        userDocs.splice(index, 1);
      }
    }
    
    return this.documents.delete(documentId);
  }

  clearUserDocuments(userId: string = 'default'): void {
    const documentIds = this.userDocuments.get(userId) || [];
    documentIds.forEach(id => this.documents.delete(id));
    this.userDocuments.set(userId, []);
  }

  getDocumentCount(userId: string = 'default'): number {
    return this.userDocuments.get(userId)?.length || 0;
  }

  searchDocuments(query: string, userId: string = 'default'): ProcessedDocument[] {
    const userDocs = this.getUserDocuments(userId);
    const lowercaseQuery = query.toLowerCase();
    
    return userDocs.filter(doc => 
      doc.content.toLowerCase().includes(lowercaseQuery) ||
      doc.filename.toLowerCase().includes(lowercaseQuery)
    );
  }
}

export const documentStore = new DocumentStore();
