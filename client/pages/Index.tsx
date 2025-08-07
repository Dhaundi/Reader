import { useState, useRef, useEffect } from 'react';
import { Upload, MessageCircle, FileText, Mail, Send, Paperclip, CheckCircle, AlertCircle, Brain, Search, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface Message {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    documentsReferenced: number;
    documentDetails: Array<{
      filename: string;
      type: string;
      wordCount: number;
    }>;
  };
}

interface UploadedFile {
  id: string;
  name: string;
  type: string;
  size: number;
  wordCount?: number;
  processed?: boolean;
}

interface DocumentSummary {
  totalDocuments: number;
  totalWordCount: number;
  documentTypes: Record<string, number>;
  documents: Array<{
    id: string;
    filename: string;
    type: string;
    wordCount: number;
    extractedAt: string;
  }>;
}

export default function Index() {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      type: 'assistant',
      content: 'Hello! I\'m your custom document analysis assistant. I can help you extract information, summarize content, find dates, identify contacts, and discover action items from your DOCX and email files. Upload documents and ask me anything!',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [documentSummary, setDocumentSummary] = useState<DocumentSummary | null>(null);
  const [activeTab, setActiveTab] = useState('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (uploadedFiles.length > 0) {
      fetchDocumentSummary();
    }
  }, [uploadedFiles]);

  const fetchDocumentSummary = async () => {
    try {
      const response = await fetch('/api/documents/summary');
      if (response.ok) {
        const summary = await response.json();
        setDocumentSummary(summary);
      }
    } catch (error) {
      console.error('Error fetching document summary:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setError(null);
    setSuccess(null);
    
    try {
      const formData = new FormData();
      Array.from(files).forEach(file => {
        formData.append('files', file);
      });
      formData.append('userId', 'default');

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const newFiles: UploadedFile[] = result.files.map((file: any) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
          wordCount: file.wordCount,
          processed: file.processed
        }));
        
        setUploadedFiles(prev => [...prev, ...newFiles]);
        
        const processedCount = newFiles.filter(f => f.processed).length;
        setSuccess(`Successfully uploaded and processed ${processedCount}/${newFiles.length} file(s)`);
        
        // Add system message about uploaded files
        const systemMessage: Message = {
          id: Date.now().toString(),
          type: 'assistant',
          content: `Great! I've processed ${processedCount} document(s): ${newFiles.filter(f => f.processed).map(f => f.name).join(', ')}. ${processedCount > 0 ? 'You can now ask me questions about the content of these documents.' : ''}`,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, systemMessage]);
        
        // Switch to chat tab after upload
        setActiveTab('chat');
        
        if (result.processingErrors && result.processingErrors.length > 0) {
          console.warn('Processing errors:', result.processingErrors);
        }
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) {
      console.error('Upload error:', err);
      setError(err instanceof Error ? err.message : 'Failed to upload files');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isSending) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      type: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentMessage = inputMessage;
    setInputMessage('');
    setIsSending(true);
    setError(null);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: currentMessage,
          userId: 'default'
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      if (result.success) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          type: 'assistant',
          content: result.response,
          timestamp: new Date(),
          metadata: result.metadata
        };
        setMessages(prev => [...prev, assistantMessage]);
      } else {
        // Custom AI doesn't have external API limitations
        throw new Error(result.error || 'Chat failed');
      }
    } catch (err) {
      console.error('Chat error:', err);
      setError(err instanceof Error ? err.message : 'Failed to send message');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: 'assistant',
        content: 'Sorry, I encountered an error processing your message. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="h-4 w-4 text-red-500" />;
    if (type.includes('word') || type.includes('document')) return <FileText className="h-4 w-4 text-blue-500" />;
    return <Mail className="h-4 w-4 text-green-500" />;
  };

  const suggestedQuestions = [
    "Summarize the main points from my documents",
    "What dates and deadlines are mentioned?",
    "Find contact information (emails, phones)",
    "Identify action items and requirements",
    "What financial amounts are discussed?",
    "Who are the people mentioned?",
    "Search for specific terms"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      {/* Header */}
      <header className="border-b bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
                <Brain className="h-5 w-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-bold">DocAI Analyst</h1>
            </div>
            <Badge variant="secondary" className="text-xs">
              Custom AI Engine
            </Badge>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6 max-w-7xl">
        {/* Alerts */}
        {error && (
          <Alert className="mb-6 border-destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert className="mb-6 border-green-500 bg-green-50 text-green-800 dark:bg-green-950 dark:text-green-200">
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload" className="flex items-center space-x-2">
              <Upload className="h-4 w-4" />
              <span>Upload Documents</span>
            </TabsTrigger>
            <TabsTrigger value="chat" className="flex items-center space-x-2">
              <MessageCircle className="h-4 w-4" />
              <span>AI Analysis</span>
            </TabsTrigger>
            <TabsTrigger value="insights" className="flex items-center space-x-2">
              <BarChart3 className="h-4 w-4" />
              <span>Document Insights</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            {/* Upload Section */}
            <Card className="border-2 border-dashed border-primary/20 hover:border-primary/40 transition-colors">
              <CardHeader className="text-center pb-4">
                <CardTitle className="flex items-center justify-center space-x-2">
                  <Upload className="h-6 w-6" />
                  <span>Upload Documents for AI Analysis</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div 
                  className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center hover:border-primary/50 transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="flex flex-col items-center space-y-4">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Paperclip className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <p className="text-lg font-medium">Click to upload documents</p>
                      <p className="text-sm text-muted-foreground mt-2">
                        Upload PDF, DOCX, or email files for AI analysis
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Max 10MB per file • Supports PDF, DOCX, DOC, EML, MSG
                      </p>
                    </div>
                  </div>
                </div>
                
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.doc,.eml,.msg"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full"
                  size="lg"
                >
                  {isUploading ? 'Processing Documents...' : 'Choose Files'}
                </Button>
              </CardContent>
            </Card>

            {/* Uploaded Files */}
            {uploadedFiles.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Processed Documents ({uploadedFiles.length})</span>
                    <Badge variant="secondary">{uploadedFiles.filter(f => f.processed).length} analyzed</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-64">
                    <div className="space-y-2">
                      {uploadedFiles.map((file) => (
                        <div key={file.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center space-x-3 flex-1 min-w-0">
                            {getFileIcon(file.type)}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                                <span>{formatFileSize(file.size)}</span>
                                {file.wordCount && <span>• {file.wordCount.toLocaleString()} words</span>}
                              </div>
                            </div>
                          </div>
                          <Badge variant={file.processed ? "default" : "secondary"}>
                            {file.processed ? "Analyzed" : "Processing"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="chat" className="space-y-6">
            <div className="grid lg:grid-cols-4 gap-6">
              {/* Chat Interface */}
              <div className="lg:col-span-3">
                <Card className="h-[600px] flex flex-col">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center space-x-2">
                      <MessageCircle className="h-5 w-5" />
                      <span>AI Document Analysis</span>
                      {uploadedFiles.length > 0 && (
                        <Badge variant="outline">{uploadedFiles.length} docs loaded</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  
                  <Separator />
                  
                  <CardContent className="flex-1 flex flex-col p-0">
                    {/* Messages */}
                    <ScrollArea className="flex-1 p-4">
                      <div className="space-y-4">
                        {messages.map((message) => (
                          <div key={message.id} className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg px-4 py-3 ${
                              message.type === 'user' 
                                ? 'bg-primary text-primary-foreground ml-12' 
                                : 'bg-muted mr-12'
                            }`}>
                              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                              {message.metadata && message.metadata.documentsReferenced > 0 && (
                                <div className="mt-2 pt-2 border-t border-current/20">
                                  <p className="text-xs opacity-70">
                                    📄 Referenced {message.metadata.documentsReferenced} document(s): {' '}
                                    {message.metadata.documentDetails.map(doc => doc.filename).join(', ')}
                                  </p>
                                </div>
                              )}
                              <p className="text-xs opacity-70 mt-1">
                                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}
                        {isSending && (
                          <div className="flex justify-start">
                            <div className="bg-muted rounded-lg px-4 py-3 mr-12">
                              <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                                <div className="w-2 h-2 bg-current rounded-full animate-bounce"></div>
                              </div>
                            </div>
                          </div>
                        )}
                        <div ref={messagesEndRef} />
                      </div>
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-4 border-t">
                      <div className="flex space-x-2">
                        <Input
                          value={inputMessage}
                          onChange={(e) => setInputMessage(e.target.value)}
                          placeholder={uploadedFiles.length > 0 ? "Ask about your documents..." : "Upload documents first to start analysis"}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage();
                            }
                          }}
                          disabled={isSending}
                          className="flex-1"
                        />
                        <Button 
                          onClick={handleSendMessage}
                          disabled={!inputMessage.trim() || isSending}
                          size="icon"
                        >
                          <Send className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Suggested Questions */}
              <div className="lg:col-span-1">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center space-x-2">
                      <Search className="h-4 w-4" />
                      <span>Suggested Questions</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {suggestedQuestions.map((question, index) => (
                      <Button
                        key={index}
                        variant="outline"
                        size="sm"
                        className="w-full text-left h-auto p-2 text-xs"
                        onClick={() => setInputMessage(question)}
                        disabled={uploadedFiles.length === 0}
                      >
                        {question}
                      </Button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="insights" className="space-y-6">
            {documentSummary ? (
              <div className="grid md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <BarChart3 className="h-5 w-5" />
                      <span>Document Statistics</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-primary">{documentSummary.totalDocuments}</p>
                        <p className="text-sm text-muted-foreground">Documents</p>
                      </div>
                      <div className="text-center p-4 bg-muted/50 rounded-lg">
                        <p className="text-2xl font-bold text-primary">{documentSummary.totalWordCount.toLocaleString()}</p>
                        <p className="text-sm text-muted-foreground">Total Words</p>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <h4 className="font-medium">Document Types</h4>
                      {Object.entries(documentSummary.documentTypes).map(([type, count]) => (
                        <div key={type} className="flex justify-between items-center">
                          <span className="text-sm">{type}</span>
                          <Badge variant="secondary">{count}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Document Details</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-2">
                        {documentSummary.documents.map((doc) => (
                          <div key={doc.id} className="p-2 rounded bg-muted/50">
                            <p className="text-sm font-medium truncate">{doc.filename}</p>
                            <p className="text-xs text-muted-foreground">
                              {doc.wordCount.toLocaleString()} words • {new Date(doc.extractedAt).toLocaleDateString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>
            ) : (
              <Card>
                <CardContent className="text-center py-12">
                  <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-lg font-medium mb-2">No Documents Analyzed Yet</p>
                  <p className="text-muted-foreground">Upload documents to see insights and statistics</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
