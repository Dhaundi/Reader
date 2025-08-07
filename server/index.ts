import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { handleFileUpload, upload, getUploadedFiles } from "./routes/upload";
import { handleChat, getChatHistory, getDocumentSummary, getChatCapabilities } from "./routes/chat";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // File upload routes
  app.post("/api/upload", upload.array('files'), handleFileUpload);
  app.get("/api/files", getUploadedFiles);

  // AI Chat routes
  app.post("/api/chat", handleChat);
  app.get("/api/chat/history", getChatHistory);

  // Document analysis routes
  app.get("/api/documents/summary", getDocumentSummary);

  return app;
}
