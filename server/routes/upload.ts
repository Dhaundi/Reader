import { RequestHandler } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'message/rfc822',
    'text/plain'
  ];
  
  if (allowedTypes.includes(file.mimetype) || file.originalname.endsWith('.eml') || file.originalname.endsWith('.msg')) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, DOCX, and email files are allowed.'));
  }
};

export const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

export const handleFileUpload: RequestHandler = async (req, res) => {
  try {
    if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadedFiles = req.files.map((file: Express.Multer.File) => ({
      id: file.filename,
      name: file.originalname,
      type: file.mimetype,
      size: file.size,
      path: file.path
    }));

    res.json({ 
      success: true, 
      files: uploadedFiles,
      message: `Successfully uploaded ${uploadedFiles.length} file(s)`
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload files' });
  }
};

export const getUploadedFiles: RequestHandler = (req, res) => {
  try {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      return res.json({ files: [] });
    }

    const files = fs.readdirSync(uploadDir).map(filename => {
      const filePath = path.join(uploadDir, filename);
      const stats = fs.statSync(filePath);
      
      return {
        id: filename,
        name: filename,
        size: stats.size,
        uploadedAt: stats.ctime
      };
    });

    res.json({ files });
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files' });
  }
};
