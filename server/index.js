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
import { dbHelpers } from './database-replit.js';
import { db } from './db.js';
import { books } from '../shared/schema.js';
import { eq } from 'drizzle-orm';
import { ObjectStorageService } from './objectStorage.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5001;

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
if (process.env.ELEVENLABS_API_KEY) {
  elevenlabs = new ElevenLabsClient({
    apiKey: process.env.ELEVENLABS_API_KEY
  });
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
app.use(cors());
app.use(express.json());

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

// Serve React build files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '..', 'client', 'dist')));
}

// Basic favicon route to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// Routes
app.get('/api/books', async (req, res) => {
  try {
    const { filter } = req.query;
    let books = await dbHelpers.getAllBooks();

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

app.get('/api/books/:id', async (req, res) => {
  try {
    const book = await dbHelpers.getBookById(req.params.id);
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
app.post('/api/books', async (req, res) => {
  try {
    const bookId = await dbHelpers.createBook();
    const sessionId = uuidv4();
    await dbHelpers.createScanningSession(sessionId, bookId);

    // Use Replit domain or external URL if provided, otherwise fallback to localhost  
    const baseUrl = process.env.EXTERNAL_URL || 
                    (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:${PORT}`);
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
app.get('/api/books/:id/pages', async (req, res) => {
  try {
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

      // Update book with AI suggestions and set first page as cover
      await dbHelpers.updateBook(bookId, {
        title: aiSuggestions.title,
        category: aiSuggestions.category,
        cover: firstPageImagePath,
        status: 'completed'
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
      pages
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
app.delete('/api/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;

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
app.delete('/api/books/cleanup', async (req, res) => {
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
app.post('/api/textblocks/:blockId/speak', async (req, res) => {
  try {
    const blockId = req.params.blockId;
    console.log('🎵 TTS ENDPOINT CALLED for block:', blockId);

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
    if (textBlock.audioUrl && textBlock.alignmentData) {
      console.log('♻️ Using cached audio for text block:', blockId, 'URL:', textBlock.audioUrl);

      // For R2 stored files, assume they exist if we have a URL
      // R2 URLs start with /objects/
      if (textBlock.audioUrl.startsWith('/objects/')) {
        console.log('✅ Cached audio file exists, returning cached result');
        return res.json({
          success: true,
          audio_url: textBlock.audioUrl,
          text: textBlock.ocrText,
          alignment: JSON.parse(textBlock.alignmentData),
          normalized_alignment: textBlock.normalizedAlignmentData ? JSON.parse(textBlock.normalizedAlignmentData) : null
        });
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
      // Use ElevenLabs to convert text to speech with timestamps
      // Using specified voice ID
      const ttsResult = await elevenlabs.textToSpeech.convertWithTimestamps("iwNZQzqCFIBqLR6sgFpN", {
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
      // Use deterministic filename for better caching
      const audioFileName = `audio/tts_block_${blockId}.mp3`;

      console.log('☁️ Uploading audio to Cloudflare R2...');
      const audioUrl = await objectStorageService.uploadFile(audioBuffer, audioFileName, 'audio/mpeg');

      // Cache the audio URL and alignment data in database
      await dbHelpers.updateTextBlockAudio(
        blockId,
        audioUrl,
        JSON.stringify(ttsResult.alignment),
        ttsResult.normalized_alignment ? JSON.stringify(ttsResult.normalized_alignment) : null
      );

      // Return audio URL and timing data
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

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();