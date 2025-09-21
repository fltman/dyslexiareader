import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import OpenAI from 'openai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import fs from 'fs';
import crypto from 'crypto';
import { dbHelpers } from './database-replit.js';
import { db } from './db.js';
import { books } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { ObjectStorageService } from './objectStorage.js';
import ElevenLabsAgentSDKService from './elevenlabsAgentSDK.js';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import {
  generateToken,
  hashPassword,
  comparePassword,
  authenticateToken,
  optionalAuth,
  getUserWithPreferences
} from './auth.js';
import {
  isValidEmail,
  isValidPassword
} from './middleware/auth.js';
import authRoutes from './authRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize OpenAI (optional for development)
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
  console.log('✅ OpenAI initialized');
} else {
  console.warn('⚠️  OPENAI_API_KEY not set - AI features will not work');
}

// Initialize ElevenLabs (optional for development)
let elevenlabs = null;
let elevenlabsAgent = null;
if (process.env.ELEVENLABS_API_KEY) {
  elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
  });
  elevenlabsAgent = new ElevenLabsAgentSDKService(process.env.ELEVENLABS_API_KEY);
  console.log('✅ ElevenLabs initialized');
} else {
  console.warn('⚠️  ELEVENLABS_API_KEY not set - text-to-speech will not work');
}

// Initialize Google Cloud Vision (using REST API with key since client library needs service account)
let visionApiKey = null;
if (process.env.GOOGLE_CLOUD_VISION_API_KEY) {
  visionApiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  console.log('✅ Google Cloud Vision API key configured');
} else {
  console.warn('⚠️  GOOGLE_CLOUD_VISION_API_KEY not set - using OpenAI for text detection');
}

// Configure multer for image uploads (use memory storage for Replit Object Storage)
const storage = multer.memoryStorage();
const objectStorageService = new ObjectStorageService();

// Generate content-based UUID for consistent caching
function generateContentUUID(text) {
  const hash = crypto.createHash('sha256').update(text.trim()).digest('hex');
  // Take first 32 chars and format as UUID
  const uuid = [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32)
  ].join('-');
  console.log(`🔑 Generated content UUID: ${uuid} for text: "${text.slice(0, 50)}..."`);
  return uuid;
}

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  }
});

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Add CORS headers specifically for image serving
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve objects from Replit Object Storage
app.get('/objects/:objectPath(*)', async (req, res) => {
  try {
    const objectKey = req.params.objectPath;
    await objectStorageService.downloadObject(objectKey, res);
  } catch (error) {
    console.error('Error serving object:', error);
    if (error.name === 'ObjectNotFoundError') {
      return res.status(404).json({ error: 'File not found' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});
app.use('/mobile', express.static(path.join(__dirname, 'public')));
app.use('/audio', express.static(path.join(__dirname, 'public', 'audio')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Note: Static file serving moved to after API routes to prevent conflicts

// Mount auth routes
app.use('/api/auth', authRoutes);

// Basic favicon route to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Test route to verify API routing is working
app.get('/api/test', (req, res) => {
  console.log('Test route called successfully');
  res.json({ message: 'API routing is working' });
});

// Test auth routes removed - handled by authRoutes.js

// Working auth endpoint that we know works
app.get('/api/user-info', authenticateToken, async (req, res) => {
  console.log('User info route called for user:', req.user.id);

  try {
    res.json({
      success: true,
      user: {
        id: req.user.id,
        email: req.user.email,
        firstName: req.user.firstName,
        lastName: req.user.lastName
      }
    });

  } catch (error) {
    console.error('Error in user-info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Routes
app.get('/api/books', authenticateToken, async (req, res) => {
  try {
    const { filter } = req.query;
    let books = await dbHelpers.getAllBooks(req.userId);

    // Add text content for search functionality
    for (const book of books) {
      try {
        // Get all pages for the book
        const pages = await dbHelpers.getPagesByBookId(book.id);
        let searchableText = '';

        // Extract text from all text blocks
        for (const page of pages) {
          const textBlocks = await dbHelpers.getTextBlocksByPageId(page.id);
          for (const block of textBlocks) {
            const text = block.ocrText || block.ocr_text || block.text;
            if (text) {
              searchableText += text + ' ';
            }
          }
        }

        // Limit the searchable text to the first 500 words for performance
        const words = searchableText.trim().split(/\s+/);
        book.searchableText = words.slice(0, 500).join(' ').toLowerCase();

        // Also make keywords searchable
        if (book.keywords && Array.isArray(book.keywords)) {
          book.keywordText = book.keywords.map(kw =>
            (kw.label || kw).toLowerCase()
          ).join(' ');
        } else {
          book.keywordText = '';
        }
      } catch (error) {
        console.error(`Error extracting text for book ${book.id}:`, error);
        book.searchableText = '';
        book.keywordText = '';
      }
    }

    if (filter && filter !== 'all') {
      books = books.filter(book =>
        book.category && book.category.toLowerCase() === filter.toLowerCase()
      );
    }

    res.json(books);
  } catch (error) {
    console.error('Error fetching books:', error);
    res.status(500).json({ error: 'Failed to fetch books' });
  }
});

app.get('/api/books/:id', authenticateToken, async (req, res) => {
  try {
    const book = await dbHelpers.getBookById(req.params.id, req.userId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const pages = await dbHelpers.getBookPages(req.params.id);
    res.json({ ...book, pages });
  } catch (error) {
    console.error('Error fetching book:', error);
    res.status(500).json({ error: 'Failed to fetch book' });
  }
});

// Create new book and scanning session
app.post('/api/books', authenticateToken, async (req, res) => {
  try {
    const bookId = await dbHelpers.createBook(req.userId);
    const sessionId = uuidv4();
    await dbHelpers.createScanningSession(sessionId, bookId);

    // Use external URL if provided, otherwise construct from request headers
    let baseUrl;
    if (process.env.EXTERNAL_URL) {
      baseUrl = process.env.EXTERNAL_URL;
    } else if (process.env.REPLIT_DEPLOYMENT === '1') {
      // In deployment, construct URL from request headers
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers['x-forwarded-host'] || req.headers.host;
      baseUrl = `${protocol}://${host}`;
    } else if (process.env.REPLIT_DEV_DOMAIN) {
      // In development workspace
      baseUrl = `https://${process.env.REPLIT_DEV_DOMAIN}`;
    } else {
      // Local development fallback
      baseUrl = `http://localhost:${PORT}`;
    }
    const mobileUrl = `${baseUrl}/mobile/camera.html?session=${sessionId}`;
    const qrCodeDataUrl = await QRCode.toDataURL(mobileUrl);

    res.json({
      bookId,
      sessionId,
      qrCode: qrCodeDataUrl,
      mobileUrl
    });
  } catch (error) {
    console.error('Error creating book:', error);
    res.status(500).json({ error: 'Failed to create book' });
  }
});

// Get pages for a book
app.get('/api/books/:id/pages', authenticateToken, async (req, res) => {
  try {
    // First verify the book belongs to the user
    const book = await dbHelpers.getBookById(req.params.id, req.userId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    const pages = await dbHelpers.getBookPages(req.params.id);
    res.json(pages);
  } catch (error) {
    console.error('Error fetching pages:', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

// Upload page image (from mobile)
app.post('/api/sessions/:sessionId/pages', upload.single('image'), async (req, res) => {
  try {
    const session = await dbHelpers.getScanningSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired session' });
    }

    // Generate unique filename
    const fileExtension = path.extname(req.file.originalname);
    const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${fileExtension}`;

    // Upload file using Replit Object Storage
    console.log(`📁 Processing upload: ${uniqueFilename}, size: ${req.file.buffer.length} bytes, mimetype: ${req.file.mimetype}`);
    console.log(`📄 Buffer info: isBuffer=${Buffer.isBuffer(req.file.buffer)}, constructor=${req.file.buffer.constructor.name}`);
    
    const imageUrl = await objectStorageService.uploadFile(req.file.buffer, uniqueFilename, req.file.mimetype);
    console.log('✅ File uploaded to Replit Object Storage:', imageUrl);

    // Handle both field names (bookId from schema, book_id from database)
    const bookId = session.bookId || session.book_id;
    const existingPages = await dbHelpers.getBookPages(bookId);
    const pageNumber = existingPages.length + 1;

    await dbHelpers.addPage(bookId, pageNumber, imageUrl);

    res.json({
      success: true,
      pageNumber,
      imagePath: imageUrl
    });
  } catch (error) {
    console.error('Error uploading page:', error);
    res.status(500).json({ error: 'Failed to upload page' });
  }
});

// Complete book scanning and process with AI
app.post('/api/sessions/:sessionId/complete', async (req, res) => {
  try {
    const session = await dbHelpers.getScanningSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Invalid or expired session' });
    }

    // Get first page for AI processing
    const bookId = session.bookId || session.book_id;
    const pages = await dbHelpers.getBookPages(bookId);
    if (pages.length === 0) {
      return res.status(400).json({ error: 'No pages uploaded' });
    }

    if (!openai) {
      // If OpenAI is not configured, use default values
      await dbHelpers.updateBook(bookId, {
        title: 'Scanned Book',
        category: 'General',
        cover: pages[0]?.imagePath || pages[0]?.image_path,
        status: 'completed'
      });

      await dbHelpers.closeScanningSession(req.params.sessionId);

      return res.json({
        success: true,
        bookId: bookId,
        suggestions: { title: 'Scanned Book', category: 'General' }
      });
    }

    // Process first page with OpenAI if available
    try {
      let imageBuffer;
      
      // Handle both field names (imagePath from schema, image_path from database)
      const firstPageImagePath = pages[0]?.imagePath || pages[0]?.image_path;
      
      if (firstPageImagePath && (firstPageImagePath.startsWith('/objects/') || firstPageImagePath.startsWith('uploads/'))) {
        // Image is stored in Object Storage (R2 or Replit)
        let objectKey;
        if (firstPageImagePath.startsWith('/objects/')) {
          objectKey = firstPageImagePath.replace('/objects/', '');
        } else {
          objectKey = firstPageImagePath; // Already in format "uploads/filename"
        }
        
        console.log(`🔍 Downloading image for AI analysis: ${objectKey}`);
        imageBuffer = await objectStorageService.downloadBytes(objectKey);
      } else if (firstPageImagePath) {
        // Legacy: Image might be stored on filesystem (for development)
        const imagePath = path.join(__dirname, '..', firstPageImagePath);
        imageBuffer = fs.readFileSync(imagePath);
      } else {
        throw new Error('No valid image path found for first page');
      }
      
      const base64Image = imageBuffer.toString('base64');

      const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Look at this book page image carefully and extract comprehensive information. Extract the book title, determine up to 3 relevant categories, and generate 8-12 descriptive keywords with emojis. If you can see a clear title, use it. If unclear, suggest a descriptive title based on content. \n\nCategories to choose from: Fiction, Non-Fiction, Education, Science, History, Biography, Children, General\n\nFor keywords, include:\n- Language (🇬🇧 English, 🇸🇪 Swedish, etc.)\n- Topic/Subject (📚 Literature, 🔬 Science, etc.)\n- Level/Audience (👶 Children, 🎓 Academic, etc.)\n- Content type (📖 Book, 📋 Certificate, etc.)\n\nRespond only in strict JSON format:\n{\n  \"title\": \"Book Title Here\",\n  \"category\": \"Primary Category\",\n  \"categories\": [\"Category1\", \"Category2\", \"Category3\"],\n  \"keywords\": [\n    {\"label\": \"Keyword\", \"emoji\": \"🔤\", \"group\": \"language|topic|level|content\"},\n    {\"label\": \"Another\", \"emoji\": \"📚\", \"group\": \"topic\"}\n  ]\n}"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
        max_tokens: 300
      });

      let aiSuggestions = {
        title: "Unknown Book",
        category: "General"
      };

      try {
        const content = response.choices[0].message.content;
        const jsonMatch = content.match(/\{.*\}/s);
        if (jsonMatch) {
          aiSuggestions = JSON.parse(jsonMatch[0]);
        }
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
      }

      // Process all pages for text detection and build knowledge base
      console.log('🔍 Processing all pages for text detection and knowledge base creation...');
      const totalSteps = pages.length + 3; // Pages OCR + title extraction + category analysis + finalization

      // Step 1: Initialize processing
      await dbHelpers.updateScanningSessionProgress(req.params.sessionId, {
        currentStep: 'Preparing book for processing...',
        stepsCompleted: 0,
        totalSteps: totalSteps,
        details: `Processing ${pages.length} page${pages.length > 1 ? 's' : ''}`,
        status: 'processing'
      });

      // Step 2: Analyze first page for book info
      await dbHelpers.updateScanningSessionProgress(req.params.sessionId, {
        currentStep: 'Analyzing book cover and title...',
        stepsCompleted: 1,
        totalSteps: totalSteps,
        details: 'Using AI to extract book information',
        status: 'processing'
      });

      let fullBookText = '';
      let agentId = null;
      let knowledgeBaseId = null;

      if (elevenlabsAgent) {
        try {
          // Step 3: Start OCR processing
          await dbHelpers.updateScanningSessionProgress(req.params.sessionId, {
            currentStep: 'Preparing pages for text recognition...',
            stepsCompleted: 2,
            totalSteps: totalSteps,
            details: 'Setting up OCR for all pages',
            status: 'processing'
          });

          // Process all pages for OCR text extraction
          for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            const pageImagePath = page.imagePath || page.image_path;

            // Update progress for current page
            await dbHelpers.updateScanningSessionProgress(req.params.sessionId, {
              currentStep: `Processing page ${i + 1} of ${pages.length}...`,
              stepsCompleted: 2 + i + 1,
              totalSteps: totalSteps,
              details: `Extracting text from page ${i + 1}`,
              status: 'processing'
            });

            console.log(`📖 Processing page ${i + 1}/${pages.length} for text extraction...`);

            if (pageImagePath && (pageImagePath.startsWith('/objects/') || pageImagePath.startsWith('uploads/'))) {
              let objectKey;
              if (pageImagePath.startsWith('/objects/')) {
                objectKey = pageImagePath.replace('/objects/', '');
              } else {
                objectKey = pageImagePath;
              }

              const pageImageBuffer = await objectStorageService.downloadBytes(objectKey);
              const pageBase64 = pageImageBuffer.toString('base64');

              // Extract text from this page using OCR
              const ocrResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                  {
                    role: "user",
                    content: [
                      {
                        type: "text",
                        text: "Extract all text from this image. Return only the text content, preserving the original structure and formatting as much as possible. If there's no readable text, return 'NO_TEXT_FOUND'."
                      },
                      {
                        type: "image_url",
                        image_url: {
                          url: `data:image/jpeg;base64,${pageBase64}`
                        }
                      }
                    ]
                  }
                ],
                max_tokens: 1000
              });

              const pageText = ocrResponse.choices[0].message.content;
              if (pageText && pageText !== 'NO_TEXT_FOUND') {
                fullBookText += `\n\n=== Sida ${i + 1} ===\n${pageText}`;
              }
            }
          }

          console.log(`📚 Extracted ${fullBookText.length} characters from ${pages.length} pages`);

          // Final step: Create knowledge base
          await dbHelpers.updateScanningSessionProgress(req.params.sessionId, {
            currentStep: 'Finalizing book...',
            stepsCompleted: totalSteps,
            totalSteps: totalSteps,
            details: 'Book ready for reading!',
            status: 'processing'
          });

          // Create ElevenLabs knowledge base and agent if we have text
          if (fullBookText.length > 100) {
            console.log('🤖 Creating ElevenLabs knowledge base and agent...');
            const agentData = await elevenlabsAgent.updateBookKnowledge(
              bookId,
              aiSuggestions.title,
              fullBookText
            );

            agentId = agentData.agentId;
            knowledgeBaseId = agentData.knowledgeBaseId;
            console.log(`✅ Created agent: ${agentId}, knowledge base: ${knowledgeBaseId}`);
          }
        } catch (error) {
          console.error('❌ Error processing pages for knowledge base:', error);
          // Continue without agent if there's an error
        }
      }

      // Update book with AI suggestions, full text, and agent information
      await dbHelpers.updateBook(bookId, {
        title: aiSuggestions.title,
        category: aiSuggestions.category,
        categories: aiSuggestions.categories || [aiSuggestions.category], // Use multiple categories if available
        keywords: aiSuggestions.keywords || [], // Save keywords with emojis
        author: aiSuggestions.author || null, // Save author if detected
        cover: firstPageImagePath,
        status: 'completed',
        fullText: fullBookText,
        agentId: agentId,
        knowledgeBaseId: knowledgeBaseId
      });

      console.log('📚 Book saved with metadata:', {
        title: aiSuggestions.title,
        category: aiSuggestions.category,
        categories: aiSuggestions.categories?.length || 0,
        keywords: aiSuggestions.keywords?.length || 0,
        author: aiSuggestions.author || 'Not detected'
      });

      // Close scanning session
      await dbHelpers.closeScanningSession(req.params.sessionId);

      res.json({
        success: true,
        bookId: bookId,
        suggestions: aiSuggestions
      });
    } catch (error) {
      console.error('Error completing book scan:', error);
      res.status(500).json({ error: 'Failed to complete book processing' });
    }
  } catch (error) {
    console.error('Error completing book scan:', error);
    res.status(500).json({ error: 'Failed to complete book processing' });
  }
});

// Get session status (for real-time updates)
app.get('/api/sessions/:sessionId/status', async (req, res) => {
  try {
    const session = await dbHelpers.getScanningSession(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Fix: Use correct field name and add validation
    const bookId = session.bookId || session.book_id;
    
    if (!bookId || isNaN(parseInt(bookId))) {
      console.error('Invalid book_id in session:', bookId, 'Session:', session);
      return res.status(400).json({ error: 'Invalid session - missing book ID' });
    }

    const pages = await dbHelpers.getBookPages(bookId);
    res.json({
      sessionId: req.params.sessionId,
      bookId: bookId,
      status: session.status,
      pageCount: pages.length,
      pages,
      progress: {
        currentStep: session.processingStep,
        stepsCompleted: session.stepsCompleted || 0,
        totalSteps: session.totalSteps,
        details: session.processingDetails
      }
    });
  } catch (error) {
    console.error('Error fetching session status:', error);
    res.status(500).json({ error: 'Failed to fetch session status' });
  }
});

// Get text blocks for a page
app.get('/api/pages/:pageId/textblocks', async (req, res) => {
  try {
    const textBlocks = await dbHelpers.getTextBlocks(req.params.pageId);
    res.json(textBlocks);
  } catch (error) {
    console.error('Error fetching text blocks:', error);
    res.status(500).json({ error: 'Failed to fetch text blocks' });
  }
});

// Create text blocks for a page
app.post('/api/pages/:pageId/textblocks', async (req, res) => {
  try {
    const { blocks } = req.body;

    // First, clear any existing text blocks for this page
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM text_blocks WHERE page_id = ?', [req.params.pageId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const createdBlocks = [];

    for (const block of blocks) {
      const blockId = await dbHelpers.createTextBlock(
        req.params.pageId,
        block.x,
        block.y,
        block.width,
        block.height
      );
      createdBlocks.push(blockId);
    }

    res.json({
      success: true,
      blocks: createdBlocks
    });
  } catch (error) {
    console.error('Error creating text blocks:', error);
    res.status(500).json({ error: 'Failed to create text blocks' });
  }
});

// Detect text blocks using Google Cloud Vision API (preferred) or OpenAI (fallback)
app.post('/api/pages/:pageId/detect-text-blocks', async (req, res) => {
  try {
    const pageId = req.params.pageId;

    // Get page info
    const page = await dbHelpers.getPageById(pageId);

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Load the page image and get actual dimensions first
    let imageBuffer;
    
    // Handle both field names and path formats
    const pageImagePath = page.imagePath || page.image_path;
    
    if (pageImagePath && (pageImagePath.startsWith('/objects/') || pageImagePath.startsWith('uploads/'))) {
      // Image is stored in Object Storage (R2 or Replit)
      let objectKey;
      if (pageImagePath.startsWith('/objects/')) {
        objectKey = pageImagePath.replace('/objects/', '');
      } else {
        objectKey = pageImagePath; // Already in format "uploads/filename"
      }
      
      console.log(`🔍 Downloading image for text detection: ${objectKey}`);
      imageBuffer = await objectStorageService.downloadBytes(objectKey);
    } else if (pageImagePath) {
      // Legacy: Image might be stored on filesystem (for development)
      const imagePath = path.join(__dirname, '..', pageImagePath);
      imageBuffer = fs.readFileSync(imagePath);
    } else {
      throw new Error('No valid image path found for page');
    }

    // Get actual image dimensions using image-size library
    const sizeOf = await import('image-size');
    const actualImageDimensions = sizeOf.imageSize(imageBuffer);

    console.log('Actual image dimensions:', actualImageDimensions);

    let detectedBlocks = [];

    // Use Google Cloud Vision API if available (preferred for accuracy)
    if (visionApiKey) {
      console.log('🔥 Using Google Cloud Vision API for text detection');
      
      try {
        // Use REST API for document text detection
        const base64Image = imageBuffer.toString('base64');
        
        const requestBody = {
          requests: [{
            image: { content: base64Image },
            features: [{ type: 'DOCUMENT_TEXT_DETECTION' }]
          }]
        };
        
        const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
          throw new Error(`Vision API error: ${response.status} ${response.statusText}`);
        }
        
        const visionResult = await response.json();
        const annotation = visionResult.responses[0];
        
        if (annotation.error) {
          throw new Error(`Vision API error: ${annotation.error.message}`);
        }
        
        const fullTextAnnotation = annotation.fullTextAnnotation;
        
        if (fullTextAnnotation && fullTextAnnotation.pages && fullTextAnnotation.pages.length > 0) {
          console.log('📄 Processing document structure from Google Cloud Vision');
          
          const page = fullTextAnnotation.pages[0];
          detectedBlocks = [];
          
          // Process each block (which represents meaningful text regions)
          for (const block of page.blocks || []) {
            if (!block.paragraphs || block.paragraphs.length === 0) continue;
            
            // Group paragraphs in the same block
            const blockTexts = [];
            let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
            let totalConfidence = 0, totalWords = 0;
            
            for (const paragraph of block.paragraphs) {
              if (!paragraph.words || paragraph.words.length === 0) continue;
              
              // Extract text from words with proper spacing
              const paragraphText = paragraph.words.map(word => {
                const wordText = word.symbols.map(symbol => symbol.text).join('');
                
                // Track bounding box
                if (word.boundingBox && word.boundingBox.vertices) {
                  const vertices = word.boundingBox.vertices;
                  const x = Math.min(...vertices.map(v => v.x || 0));
                  const y = Math.min(...vertices.map(v => v.y || 0));
                  const maxXWord = Math.max(...vertices.map(v => v.x || 0));
                  const maxYWord = Math.max(...vertices.map(v => v.y || 0));
                  
                  minX = Math.min(minX, x);
                  minY = Math.min(minY, y);
                  maxX = Math.max(maxX, maxXWord);
                  maxY = Math.max(maxY, maxYWord);
                }
                
                // Track confidence
                if (word.confidence) {
                  totalConfidence += word.confidence;
                  totalWords++;
                }
                
                return wordText;
              }).join(' '); // Add space between words
              
              if (paragraphText.trim().length > 0) {
                blockTexts.push(paragraphText.trim());
              }
            }
            
            // Create text block if we have content
            if (blockTexts.length > 0 && minX !== Infinity) {
              const text = blockTexts.join(' ').trim();
              
              // Only include blocks with meaningful content (at least 3 characters)
              if (text.length >= 3) {
                detectedBlocks.push({
                  text: text,
                  x: minX,
                  y: minY,
                  width: maxX - minX,
                  height: maxY - minY,
                  confidence: totalWords > 0 ? totalConfidence / totalWords : 0.9
                });
              }
            }
          }
        }
        
        // Transform coordinates for rotated images to match frontend display
        if (actualImageDimensions.orientation && detectedBlocks.length > 0) {
          console.log(`🔄 Transforming coordinates for orientation: ${actualImageDimensions.orientation}`);
          
          detectedBlocks = detectedBlocks.map(block => {
            let transformedX = block.x;
            let transformedY = block.y;
            let transformedWidth = block.width;
            let transformedHeight = block.height;
            
            // Handle EXIF orientation transformations to match browser display
            switch (actualImageDimensions.orientation) {
              case 6: // 90 degrees clockwise - displayed image is 3024w x 4032h
                transformedX = actualImageDimensions.height - (block.y + block.height);
                transformedY = block.x;
                transformedWidth = block.height;
                transformedHeight = block.width;
                break;
              case 8: // 90 degrees counter-clockwise
                transformedX = actualImageDimensions.height - (block.y + block.height);
                transformedY = block.x;
                transformedWidth = block.height;
                transformedHeight = block.width;
                break;
              case 3: // 180 degrees
                transformedX = actualImageDimensions.width - (block.x + block.width);
                transformedY = actualImageDimensions.height - (block.y + block.height);
                break;
              // Orientation 1 (no rotation) uses original coordinates
            }
            
            return {
              ...block,
              x: transformedX,
              y: transformedY,
              width: transformedWidth,
              height: transformedHeight
            };
          });
        }
        
        console.log('Google Cloud Vision detected text blocks (after coordinate transformation):', detectedBlocks);
        
      } catch (visionError) {
        console.error('Google Cloud Vision API error:', visionError);
        console.log('Falling back to OpenAI...');
        // Fall through to OpenAI fallback
      }
    }
    
    // Fallback to OpenAI if Google Cloud Vision is not available or failed
    if (detectedBlocks.length === 0 && openai) {
      console.log('🤖 Using OpenAI for text detection (fallback)');
      
      const base64Image = imageBuffer.toString('base64');
      
      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this book page image and identify all text regions. This image is exactly ${actualImageDimensions.width}x${actualImageDimensions.height} pixels.

For each text block (paragraph, heading, or distinct text area), provide:
1. The text content
2. Precise bounding box coordinates (x, y, width, height) in pixels from the top-left corner
3. A confidence score

IMPORTANT: Use the exact image dimensions I provided (${actualImageDimensions.width}x${actualImageDimensions.height}) for your coordinate calculations.

Return the results in JSON format:
{
  "textBlocks": [
    {
      "text": "actual text content",
      "x": pixel_x_coordinate,
      "y": pixel_y_coordinate,
      "width": pixel_width,
      "height": pixel_height,
      "confidence": confidence_score_0_to_1
    }
  ]
}

Focus on grouping text into meaningful blocks (complete sentences/paragraphs) rather than individual words. Be precise with coordinates using the ${actualImageDimensions.width}x${actualImageDimensions.height} pixel coordinate system.`
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`
                }
              }
            ]
          }
        ],
        max_tokens: 1500
      });

      let aiResult = {
        textBlocks: []
      };

      try {
        const content = response.choices[0].message.content;
        console.log('Raw OpenAI response:', content);
        
        // First try to extract JSON from markdown code blocks
        let jsonString = content;
        const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1];
        } else {
          // Fallback: find JSON object directly
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonString = jsonMatch[0];
          }
        }
        
        console.log('Extracted JSON string:', jsonString.substring(0, 200) + '...');
        aiResult = JSON.parse(jsonString);
        
        detectedBlocks = aiResult.textBlocks || [];
        console.log('OpenAI detected text blocks:', detectedBlocks);
        
      } catch (parseError) {
        console.error('Error parsing AI response:', parseError);
        console.error('Failed content snippet:', response.choices[0].message.content.substring(0, 200));
      }
    }

    // Clear existing text blocks for this page
    await dbHelpers.clearTextBlocks(pageId);

    const createdBlocks = [];

    // Save detected blocks to database
    if (detectedBlocks && detectedBlocks.length > 0) {
      for (const block of detectedBlocks) {
        console.log('Block to save:', block);

        const blockId = await dbHelpers.createTextBlock(
          pageId,
          Math.round(block.x),
          Math.round(block.y),
          Math.round(block.width),
          Math.round(block.height)
        );

        // Update the text block with the detected text immediately
        await dbHelpers.updateTextBlock(blockId, block.text, block.confidence || 0.9);

        createdBlocks.push({
          id: blockId,
          text: block.text,
          confidence: block.confidence,
          x: Math.round(block.x),
          y: Math.round(block.y),
          width: Math.round(block.width),
          height: Math.round(block.height)
        });
      }
    }

    res.json({
      success: true,
      blocks: createdBlocks,
      totalBlocks: createdBlocks.length,
      usedGoogleVision: Boolean(visionApiKey && detectedBlocks.length > 0)
    });

  } catch (error) {
    console.error('Error detecting text blocks:', error);
    res.status(500).json({ error: 'Failed to detect text blocks' });
  }
});

// Process text block with OCR (now simplified since text is already extracted)
app.post('/api/textblocks/:blockId/process', async (req, res) => {
  try {
    const textBlock = await dbHelpers.getTextBlockById(req.params.blockId);

    if (!textBlock) {
      return res.status(404).json({ error: 'Text block not found' });
    }

    // Text is already extracted during detection, just return it
    res.json({
      success: true,
      text: textBlock.ocrText || 'Text already extracted',
      confidence: textBlock.confidence || 0.9
    });

  } catch (error) {
    console.error('Error processing text block:', error);
    res.status(500).json({ error: 'Failed to process text block' });
  }
});

// Delete a specific book
app.delete('/api/books/:id', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.id;

    // First verify the book belongs to the user
    const book = await dbHelpers.getBookById(bookId, req.userId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Get book pages to delete image files
    const pages = await dbHelpers.getBookPages(bookId);

    // Delete image files from storage
    for (const page of pages) {
      // Handle both field names and null checks
      const pageImagePath = page.imagePath || page.image_path;
      
      if (pageImagePath && pageImagePath.startsWith('/objects/')) {
        // Delete from Replit Object Storage
        const objectKey = pageImagePath.replace('/objects/', '');
        try {
          await objectStorageService.deleteObject(objectKey);
        } catch (fileError) {
          console.warn(`Could not delete object storage file: ${objectKey}`, fileError);
        }
      } else if (pageImagePath) {
        // Legacy: Delete from local filesystem
        const imagePath = path.join(__dirname, '..', pageImagePath);
        try {
          if (fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
          }
        } catch (fileError) {
          console.warn(`Could not delete local file: ${imagePath}`, fileError);
        }
      }
    }

    // Database will cascade delete pages, text_blocks, and scanning_sessions
    const result = await db.delete(books).where(eq(books.id, parseInt(bookId)));
    const changes = result.rowCount || 0;

    if (changes === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }

    res.json({
      success: true,
      message: 'Book deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ error: 'Failed to delete book' });
  }
});

// Clean up empty books endpoint
app.delete('/api/books/cleanup', authenticateToken, async (req, res) => {
  try {
    const deletedCount = await dbHelpers.cleanupEmptyBooks();
    res.json({
      success: true,
      message: `Cleaned up ${deletedCount} empty books`
    });
  } catch (error) {
    console.error('Error cleaning up books:', error);
    res.status(500).json({ error: 'Failed to cleanup books' });
  }
});

// Text-to-speech with timestamps endpoint
app.post('/api/textblocks/:blockId/speak', authenticateToken, async (req, res) => {
  try {
    const blockId = req.params.blockId;
    console.log('🎵 TTS ENDPOINT CALLED for block:', blockId, 'by user:', req.user.id);

    // Get user's ElevenLabs preferences
    const userWithPrefs = await getUserWithPreferences(req.user.id);
    if (!userWithPrefs || !userWithPrefs.elevenlabsApiKey || !userWithPrefs.elevenlabsVoiceId) {
      console.log('❌ User missing required ElevenLabs preferences');
      return res.status(400).json({
        error: 'ElevenLabs API key and Voice ID are required. Please configure them in Settings.',
        code: 'ELEVENLABS_CONFIG_REQUIRED'
      });
    }

    console.log('✅ Using user ElevenLabs preferences:', {
      hasApiKey: !!userWithPrefs.elevenlabsApiKey,
      voiceId: userWithPrefs.elevenlabsVoiceId,
      agentId: userWithPrefs.elevenlabsAgentId || 'none'
    });

    // Get text block from database using Drizzle ORM
    const textBlock = await dbHelpers.getTextBlockById(blockId);
    console.log('📖 Retrieved text block:', {
      id: textBlock?.id,
      hasOcrText: !!textBlock?.ocrText,
      hasAudioUrl: !!textBlock?.audioUrl,
      hasAlignmentData: !!textBlock?.alignmentData,
      status: textBlock?.status
    });

    if (!textBlock || !textBlock.ocrText) {
      console.log('❌ Text block not found or no text available');
      return res.status(404).json({ error: 'Text block not found or no text available' });
    }

    // Check if we already have cached audio for this text block
    if (textBlock.audioUrl) {
      console.log('♻️ Using cached audio for text block:', blockId, 'URL:', textBlock.audioUrl);

      // For R2 stored files, load alignment data from R2 as well
      if (textBlock.audioUrl.startsWith('/objects/')) {
        console.log('✅ Using R2 cached audio and alignment data');

        // Load alignment data from R2 using content UUID
        const contentUuid = generateContentUUID(textBlock.ocrText);
        const alignmentFileName = `alignment/tts_content_${contentUuid}_alignment.json`;
        const normalizedAlignmentFileName = `alignment/tts_content_${contentUuid}_normalized.json`;

        try {
          // Download alignment data from R2
          const alignmentKey = `uploads/${alignmentFileName}`;
          const normalizedAlignmentKey = `uploads/${normalizedAlignmentFileName}`;

          const [alignmentBytes, normalizedAlignmentBytes] = await Promise.allSettled([
            objectStorageService.downloadBytes(alignmentKey),
            objectStorageService.downloadBytes(normalizedAlignmentKey)
          ]);

          const alignment = alignmentBytes.status === 'fulfilled' ?
            JSON.parse(alignmentBytes.value.toString()) : null;
          const normalizedAlignment = normalizedAlignmentBytes.status === 'fulfilled' ?
            JSON.parse(normalizedAlignmentBytes.value.toString()) : null;

          return res.json({
            success: true,
            audio_url: textBlock.audioUrl,
            text: textBlock.ocrText,
            alignment: alignment,
            normalized_alignment: normalizedAlignment
          });
        } catch (error) {
          console.warn('⚠️ Could not load alignment data from R2, falling back to database:', error);
          // Fall back to database if R2 alignment files don't exist
          return res.json({
            success: true,
            audio_url: textBlock.audioUrl,
            text: textBlock.ocrText,
            alignment: textBlock.alignmentData ? JSON.parse(textBlock.alignmentData) : null,
            normalized_alignment: textBlock.normalizedAlignmentData ? JSON.parse(textBlock.normalizedAlignmentData) : null
          });
        }
      } else {
        // For legacy local files, check if they exist
        const audioPath = path.join(__dirname, 'public', textBlock.audioUrl);
        if (fs.existsSync(audioPath)) {
          console.log('✅ Legacy cached audio file exists, returning cached result');
          return res.json({
            success: true,
            audio_url: textBlock.audioUrl,
            text: textBlock.ocrText,
            alignment: JSON.parse(textBlock.alignmentData),
            normalized_alignment: textBlock.normalizedAlignmentData ? JSON.parse(textBlock.normalizedAlignmentData) : null
          });
        } else {
          console.log('❌ Cached audio file missing, regenerating:', audioPath);
          // Clear the invalid cache entries
          await dbHelpers.updateTextBlockAudio(blockId, null, null, null);
        }
      }
    } else {
      console.log('🚫 No cached audio found for block:', blockId, {
        hasAudioUrl: !!textBlock.audioUrl,
        hasAlignmentData: !!textBlock.alignmentData
      });
    }

    console.log('Converting text to speech with timestamps:', textBlock.ocrText);

    try {
      // Create user-specific ElevenLabs client with their API key
      const userElevenLabs = new ElevenLabsClient({
        apiKey: userWithPrefs.elevenlabsApiKey
      });

      // Use user's voice ID to convert text to speech with timestamps
      console.log('🗣️ Using user voice ID:', userWithPrefs.elevenlabsVoiceId);
      const ttsResult = await userElevenLabs.textToSpeech.convertWithTimestamps(userWithPrefs.elevenlabsVoiceId, {
        text: textBlock.ocrText,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      });

      console.log('ElevenLabs TTS result:', {
        hasAudio: !!ttsResult.audioBase64,
        hasAlignment: !!ttsResult.alignment,
        characterCount: ttsResult.alignment?.characters?.length || 0
      });

      // Check if we have audio data (property name is audioBase64, not audio_base64)
      if (!ttsResult.audioBase64) {
        console.error('No audio data received from ElevenLabs');
        return res.status(500).json({ error: 'No audio data received from ElevenLabs API' });
      }

      // Convert base64 audio to buffer and upload to R2
      const audioBuffer = Buffer.from(ttsResult.audioBase64, 'base64');
      // Use content-based UUID for consistent caching across identical text
      const contentUuid = generateContentUUID(textBlock.ocrText);
      const audioFileName = `audio/tts_content_${contentUuid}.mp3`;

      console.log('☁️ Uploading audio to Cloudflare R2...');
      const audioUrl = await objectStorageService.uploadFile(audioBuffer, audioFileName, 'audio/mpeg');

      // Upload alignment data to R2 as well
      const alignmentFileName = `alignment/tts_content_${contentUuid}_alignment.json`;
      const normalizedAlignmentFileName = `alignment/tts_content_${contentUuid}_normalized.json`;

      const alignmentPromises = [];

      if (ttsResult.alignment) {
        const alignmentBuffer = Buffer.from(JSON.stringify(ttsResult.alignment), 'utf8');
        alignmentPromises.push(
          objectStorageService.uploadFile(alignmentBuffer, alignmentFileName, 'application/json')
        );
      }

      if (ttsResult.normalized_alignment) {
        const normalizedAlignmentBuffer = Buffer.from(JSON.stringify(ttsResult.normalized_alignment), 'utf8');
        alignmentPromises.push(
          objectStorageService.uploadFile(normalizedAlignmentBuffer, normalizedAlignmentFileName, 'application/json')
        );
      }

      await Promise.all(alignmentPromises);
      console.log('☁️ Uploaded alignment data to Cloudflare R2');

      // Cache only the audio URL in database (alignment data is now in R2)
      await dbHelpers.updateTextBlockAudio(
        blockId,
        audioUrl,
        null, // No longer storing alignment in DB
        null  // No longer storing normalized alignment in DB
      );

      // Return audio URL and timing data (same as what we just uploaded)
      res.json({
        success: true,
        audio_url: audioUrl,
        text: textBlock.ocrText,
        alignment: ttsResult.alignment,
        normalized_alignment: ttsResult.normalized_alignment
      });

    } catch (elevenLabsError) {
      console.error('ElevenLabs API error:', elevenLabsError);
      res.status(500).json({ error: 'Failed to generate speech' });
    }

  } catch (error) {
    console.error('Error in text-to-speech endpoint:', error);
    res.status(500).json({ error: 'Failed to process text-to-speech request' });
  }
});

// Direct TTS endpoint for titles and simple text
app.post('/api/tts/direct', authenticateToken, async (req, res) => {
  try {
    const { text, speed } = req.body;
    console.log('🎵 DIRECT TTS ENDPOINT CALLED for text:', text?.substring(0, 50) + '...', 'by user:', req.user.id);

    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    // Get user's ElevenLabs preferences
    const userWithPrefs = await getUserWithPreferences(req.user.id);
    if (!userWithPrefs || !userWithPrefs.elevenlabsApiKey || !userWithPrefs.elevenlabsVoiceId) {
      console.log('❌ User missing required ElevenLabs preferences');
      return res.status(400).json({
        error: 'ElevenLabs API key and Voice ID are required. Please configure them in Settings.',
        code: 'ELEVENLABS_CONFIG_REQUIRED'
      });
    }

    console.log('✅ Using user ElevenLabs preferences for direct TTS:', {
      hasApiKey: !!userWithPrefs.elevenlabsApiKey,
      voiceId: userWithPrefs.elevenlabsVoiceId
    });

    try {
      // Create user-specific ElevenLabs client with their API key
      const userElevenLabs = new ElevenLabsClient({
        apiKey: userWithPrefs.elevenlabsApiKey
      });

      // Use user's voice ID to convert text to speech with timestamps
      console.log('🗣️ Using user voice ID for direct TTS:', userWithPrefs.elevenlabsVoiceId);
      const ttsResult = await userElevenLabs.textToSpeech.convertWithTimestamps(userWithPrefs.elevenlabsVoiceId, {
        text: text,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      });

      console.log('ElevenLabs Direct TTS result:', {
        hasAudio: !!ttsResult.audioBase64,
        hasAlignment: !!ttsResult.alignment,
        characterCount: ttsResult.alignment?.characters?.length || 0
      });

      // Check if we have audio data
      if (!ttsResult.audioBase64) {
        console.error('No audio data received from ElevenLabs for direct TTS');
        return res.status(500).json({ error: 'No audio data received from ElevenLabs API' });
      }

      // Convert base64 audio to buffer and upload to R2
      const audioBuffer = Buffer.from(ttsResult.audioBase64, 'base64');
      const contentUuid = generateContentUUID(text);
      const audioFileName = `audio/direct_tts_${contentUuid}.mp3`;

      console.log('☁️ Uploading direct TTS audio to Cloudflare R2...');
      const audioUrl = await objectStorageService.uploadFile(audioBuffer, audioFileName, 'audio/mpeg');

      // Return direct audio URL for immediate playback
      res.json({
        success: true,
        audioUrl: audioUrl,
        text: text,
        alignment: ttsResult.alignment,
        normalized_alignment: ttsResult.normalized_alignment
      });

    } catch (elevenLabsError) {
      console.error('ElevenLabs API error in direct TTS:', elevenLabsError);
      res.status(500).json({ error: 'Failed to generate speech' });
    }

  } catch (error) {
    console.error('Error in direct TTS endpoint:', error);
    res.status(500).json({ error: 'Failed to process direct TTS request' });
  }
});

// Serve React build files in production (placed after API routes)
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
}

// Catch-all handler for React routing in production
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  });
}

// Start server
(async () => {
  try {
    console.log('Using Replit PostgreSQL database');
    console.log('Using Cloudflare R2 Object Storage');

// =======================
// ELEVENLABS AGENT ENDPOINTS
// =======================

// Get all text from a book for knowledge base
app.get('/api/books/:bookId/fulltext', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;

    // Get book info and verify ownership
    const book = await dbHelpers.getBookById(bookId, req.userId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Get all pages for the book
    const pages = await dbHelpers.getPagesByBookId(bookId);

    // For each page, get all text blocks
    let fullText = `Bok: ${book.title}\n`;
    if (book.author) {
      fullText += `Författare: ${book.author}\n\n`;
    }

    for (const page of pages) {
      const textBlocks = await dbHelpers.getTextBlocksByPageId(page.id);

      // Sort text blocks by position (top to bottom, left to right)
      textBlocks.sort((a, b) => {
        const yDiff = a.y - b.y;
        if (Math.abs(yDiff) > 50) return yDiff;
        return a.x - b.x;
      });

      // Add page separator
      fullText += `\n--- Sida ${page.page_number || page.pageNumber} ---\n\n`;

      // Add text from each block
      for (const block of textBlocks) {
        const text = block.ocrText || block.ocr_text;
        if (text && text.trim()) {
          fullText += text.trim() + '\n';
        }
      }
    }

    res.json({
      bookId,
      title: book.title,
      author: book.author,
      pageCount: pages.length,
      fullText,
      textLength: fullText.length
    });
  } catch (error) {
    console.error('Error getting full text:', error);
    res.status(500).json({ error: 'Failed to get full text' });
  }
});

// Create an agent for a book
app.post('/api/books/:bookId/agent', authenticateToken, async (req, res) => {
  try {
    const bookId = req.params.bookId;

    // Get user's ElevenLabs preferences
    const userWithPrefs = await getUserWithPreferences(req.user.id);
    if (!userWithPrefs || !userWithPrefs.elevenlabsApiKey) {
      console.log('❌ User missing required ElevenLabs preferences for agent creation');
      return res.status(400).json({
        error: 'ElevenLabs API key is required. Please configure it in Settings.',
        code: 'ELEVENLABS_CONFIG_REQUIRED'
      });
    }

    console.log('✅ Using user ElevenLabs preferences for agent:', {
      hasApiKey: !!userWithPrefs.elevenlabsApiKey,
      hasAgentId: !!userWithPrefs.elevenlabsAgentId
    });

    // Get book info and verify ownership
    const book = await dbHelpers.getBookById(bookId, req.userId);
    if (!book) {
      return res.status(404).json({ error: 'Book not found' });
    }

    // Check if agent already exists in the database
    const agentExists = !!book.agentId;

    // Get book's existing full text or extract from pages
    let fullText = book.fullText;

    if (!fullText || fullText.trim().length === 0) {
      // Extract text from pages if not already stored
      const pages = await dbHelpers.getBookPages(bookId);
      fullText = `Bok: ${book.title}\n`;
      if (book.author) {
        fullText += `Författare: ${book.author}\n\n`;
      }

      for (const page of pages) {
        const textBlocks = await dbHelpers.getTextBlocks(page.id);
        textBlocks.sort((a, b) => {
          const yDiff = a.y - b.y;
          if (Math.abs(yDiff) > 50) return yDiff;
          return a.x - b.x;
        });

        fullText += `\n--- Sida ${page.pageNumber || page.page_number} ---\n\n`;

        for (const block of textBlocks) {
          const text = block.ocrText || block.ocr_text;
          if (text && text.trim()) {
            fullText += text.trim() + '\n';
          }
        }
      }
    }

    if (!fullText || fullText.trim().length === 0) {
      throw new Error('No text content available for this book');
    }

    console.log(`📚 ${agentExists ? 'Updating' : 'Creating'} agent for book: ${book.title} (${fullText.length} characters)`);

    // Create user-specific ElevenLabs agent service
    const userElevenLabsAgent = new ElevenLabsAgentSDKService(userWithPrefs.elevenlabsApiKey);

    // Use user's agent ID if available, otherwise use hardcoded fallback
    const targetAgentId = userWithPrefs.elevenlabsAgentId || 'agent_2701k5hmygdyegps36rmfm75xts3';
    console.log('🤖 Using agent ID:', targetAgentId, userWithPrefs.elevenlabsAgentId ? '(user-specific)' : '(fallback)');

    // Update agent knowledge base for this book using user's API key
    const agentData = await userElevenLabsAgent.updateBookKnowledge(
      bookId,
      book.title,
      fullText
    );

    // Store the knowledge base ID in the database
    await dbHelpers.updateBook(bookId, {
      agentId: agentData.agentId,
      knowledgeBaseId: agentData.knowledgeBaseId
    });

    console.log(`✅ Agent ${agentExists ? 'updated' : 'created'} and saved to database: ${agentData.agentId}`);

    res.json({
      success: true,
      bookId,
      bookTitle: book.title,
      ...agentData
    });
  } catch (error) {
    console.error('Error creating agent:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

// Get agent widget configuration for a book
app.get('/api/books/:bookId/agent/widget', authenticateToken, async (req, res) => {
  try {
    if (!elevenlabsAgent) {
      return res.status(503).json({ error: 'ElevenLabs not configured' });
    }

    const bookId = req.params.bookId;

    // In a real implementation, you'd retrieve the stored agent ID from database
    // For now, we'll need the agent ID from the client
    const agentId = req.query.agentId;

    if (!agentId) {
      return res.status(400).json({ error: 'Agent ID required' });
    }

    const widgetConfig = await elevenlabsAgent.getWidgetConfig(agentId);

    res.json(widgetConfig);
  } catch (error) {
    console.error('Error getting widget config:', error);
    res.status(500).json({ error: 'Failed to get widget config' });
  }
});

// Authentication endpoints
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    if (!isValidPassword(password)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Check if user already exists
    const existingUser = await dbHelpers.getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({ error: 'User already exists with this email' });
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);
    const user = await dbHelpers.createUser(email, passwordHash, firstName, lastName);

    // Create default preferences for the user
    await dbHelpers.createUserPreferences(user.id);

    // Generate JWT token
    const token = generateToken(user.id);

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(201).json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token
    });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get user by email
    const user = await dbHelpers.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Verify password
    const isValidPassword = await comparePassword(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login time
    await dbHelpers.updateUserLastLogin(user.id);

    // Generate JWT token
    const token = generateToken(user.id);

    // Set token in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName
      },
      token
    });
  } catch (error) {
    console.error('Error logging in user:', error);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Get current user info - renamed to avoid conflicts
app.get('/api/auth/current-user', async (req, res) => {
  console.log('Auth/current-user route called');
  
  try {
    // Manual auth check without middleware
    const authHeader = req.headers['authorization'];
    let token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      const cookieToken = req.cookies?.token;
      if (!cookieToken) {
        console.log('No token found');
        return res.status(401).json({ error: 'Access token required' });
      }
      token = cookieToken;
    }

    console.log('Token found, verifying...');
    
    // For now, return a simple response to test
    res.json({
      success: true,
      message: 'Auth endpoint reached successfully'
    });
    
  } catch (error) {
    console.error('Error in auth/current-user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User preferences endpoints
app.get('/api/user/preferences', authenticateToken, async (req, res) => {
  try {
    const preferences = await dbHelpers.getUserPreferences(req.userId);
    res.json({ success: true, preferences });
  } catch (error) {
    console.error('Error getting user preferences:', error);
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

app.put('/api/user/preferences', authenticateToken, async (req, res) => {
  try {
    const preferences = req.body;
    await dbHelpers.updateUserPreferences(req.userId, preferences);

    const updatedPreferences = await dbHelpers.getUserPreferences(req.userId);
    res.json({ success: true, preferences: updatedPreferences });
  } catch (error) {
    console.error('Error updating user preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// Change password endpoint
app.put('/api/user/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long' });
    }

    // Get user and verify current password
    const user = await dbHelpers.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    // Hash new password and update
    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await dbHelpers.updateUserPassword(req.userId, newPasswordHash);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    console.error('Error changing password:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Update user profile endpoint
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const { firstName, lastName } = req.body;

    if (!firstName && !lastName) {
      return res.status(400).json({ error: 'At least one field (firstName or lastName) is required' });
    }

    // Update user profile
    await dbHelpers.updateUserProfile(req.userId, { firstName, lastName });

    // Get updated user data
    const updatedUser = await dbHelpers.getUserById(req.userId);
    if (!updatedUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName
      }
    });
  } catch (error) {
    console.error('Error updating user profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();