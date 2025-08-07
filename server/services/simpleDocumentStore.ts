import { SimpleProcessedDocument } from './simpleDocumentProcessor';

class SimpleDocumentStore {
  private documents: Map<string, SimpleProcessedDocument> = new Map();
  private userDocuments: Map<string, string[]> = new Map();

  addDocument(document: SimpleProcessedDocument, userId: string = 'default'): void {
    // Store the document
    this.documents.set(document.id, document);
    
    // Update user mapping
    if (!this.userDocuments.has(userId)) {
      this.userDocuments.set(userId, []);
    }
    this.userDocuments.get(userId)!.push(document.id);
  }

  getDocument(documentId: string): SimpleProcessedDocument | undefined {
    return this.documents.get(documentId);
  }

  getUserDocuments(userId: string = 'default'): SimpleProcessedDocument[] {
    const documentIds = this.userDocuments.get(userId) || [];
    return documentIds
      .map(id => this.documents.get(id))
      .filter(doc => doc !== undefined) as SimpleProcessedDocument[];
  }

  getAllDocuments(): SimpleProcessedDocument[] {
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
    
    // Remove from documents
    return this.documents.delete(documentId);
  }

  clearUserDocuments(userId: string = 'default'): void {
    const documentIds = this.userDocuments.get(userId) || [];
    documentIds.forEach(id => {
      this.documents.delete(id);
    });
    this.userDocuments.set(userId, []);
  }

  getDocumentCount(userId: string = 'default'): number {
    return this.userDocuments.get(userId)?.length || 0;
  }

  searchDocuments(query: string, userId: string = 'default'): SimpleProcessedDocument[] {
    const userDocs = this.getUserDocuments(userId);
    const lowercaseQuery = query.toLowerCase();
    
    return userDocs.filter(doc => 
      doc.content.toLowerCase().includes(lowercaseQuery) ||
      doc.filename.toLowerCase().includes(lowercaseQuery)
    );
  }

  getStats(): any {
    return {
      totalDocuments: this.documents.size,
      userCounts: Object.fromEntries(
        Array.from(this.userDocuments.entries()).map(([userId, docs]) => [userId, docs.length])
      )
    };
  }
}

export const simpleDocumentStore = new SimpleDocumentStore();
