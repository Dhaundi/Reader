import { RequestHandler } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Simple multer configuration for debugging
const debugStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname),
    );
  },
});

export const debugUpload = multer({
  storage: debugStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

export const handleDebugUpload: RequestHandler = async (req, res) => {
  try {
    console.log("Debug upload handler called");
    console.log("Files received:", req.files);
    console.log("Body:", req.body);

    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      console.log("No files in request");
      return res.status(400).json({ error: "No files uploaded" });
    }

    const uploadedFiles = req.files.map((file: Express.Multer.File) => ({
      id: file.filename,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      processed: false, // Simple response without document processing
    }));

    console.log("Returning files:", uploadedFiles);

    res.json({
      success: true,
      files: uploadedFiles,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`,
    });
  } catch (error) {
    console.error("Debug upload error:", error);
    res
      .status(500)
      .json({ error: "Failed to upload files: " + (error as Error).message });
  }
};
