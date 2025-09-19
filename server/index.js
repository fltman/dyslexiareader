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
        cover: pages[0].image_path,
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
      
      if (pages[0].image_path.startsWith('/objects/')) {
        // Image is stored in Replit Object Storage
        const objectKey = pages[0].image_path.replace('/objects/', '');
        imageBuffer = await objectStorageService.downloadBytes(objectKey);
      } else {
        // Legacy: Image might be stored on filesystem (for development)
        const imagePath = path.join(__dirname, '..', pages[0].image_path);
        imageBuffer = fs.readFileSync(imagePath);
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
              text: "Look at this book page image carefully. Extract the book title and determine the best category. If you can see a clear title on the page, use it. If it's unclear, suggest a descriptive title based on the content. Choose one category from: Fiction, Non-Fiction, Education, Science, History, Biography, Children, or General. Respond only in JSON format: {\"title\": \"Book Title Here\", \"category\": \"Category Here\"}"
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
        cover: pages[0].image_path,
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

// Detect text blocks using OpenAI vision
app.post('/api/pages/:pageId/detect-text-blocks', async (req, res) => {
  try {
    const pageId = req.params.pageId;

    // Get page info
    const page = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM pages WHERE id = ?', [pageId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!page) {
      return res.status(404).json({ error: 'Page not found' });
    }

    // Load the page image and get actual dimensions first
    let imageBuffer;
    
    if (page.image_path.startsWith('/objects/')) {
      // Image is stored in Replit Object Storage
      const objectKey = page.image_path.replace('/objects/', '');
      imageBuffer = await objectStorageService.downloadBytes(objectKey);
    } else {
      // Legacy: Image might be stored on filesystem (for development)
      const imagePath = path.join(__dirname, '..', page.image_path);
      imageBuffer = fs.readFileSync(imagePath);
    }
    
    const base64Image = imageBuffer.toString('base64');

    // Get actual image dimensions using image-size library
    const sizeOf = await import('image-size');
    const actualImageDimensions = sizeOf.imageSize(imageBuffer);

    console.log('Actual image dimensions:', actualImageDimensions);

    // Use OpenAI to detect text blocks and extract coordinates
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResult = JSON.parse(jsonMatch[0]);
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', parseError);
    }

    console.log('OpenAI detected text blocks:', aiResult);

    // Clear existing text blocks for this page
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM text_blocks WHERE page_id = ?', [pageId], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const createdBlocks = [];

    // Save detected blocks to database (no scaling needed since OpenAI used actual dimensions)
    if (aiResult.textBlocks && aiResult.textBlocks.length > 0) {
      for (const block of aiResult.textBlocks) {
        console.log('Block to save:', block);

        const blockId = await dbHelpers.createTextBlock(
          pageId,
          block.x,
          block.y,
          block.width,
          block.height
        );

        // Update the text block with the detected text immediately
        await dbHelpers.updateTextBlock(blockId, block.text, block.confidence || 0.9);

        createdBlocks.push({
          id: blockId,
          text: block.text,
          confidence: block.confidence,
          x: block.x,
          y: block.y,
          width: block.width,
          height: block.height
        });
      }
    }

    res.json({
      success: true,
      blocks: createdBlocks,
      totalBlocks: createdBlocks.length
    });

  } catch (error) {
    console.error('Error detecting text blocks:', error);
    res.status(500).json({ error: 'Failed to detect text blocks' });
  }
});

// Process text block with OCR (now simplified since text is already extracted)
app.post('/api/textblocks/:blockId/process', async (req, res) => {
  try {
    const textBlock = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM text_blocks WHERE id = ?', [req.params.blockId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!textBlock) {
      return res.status(404).json({ error: 'Text block not found' });
    }

    // Text is already extracted during detection, just return it
    res.json({
      success: true,
      text: textBlock.ocr_text || 'Text already extracted',
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
      if (page.image_path.startsWith('/objects/')) {
        // Delete from Replit Object Storage
        const objectKey = page.image_path.replace('/objects/', '');
        try {
          await objectStorageService.deleteObject(objectKey);
        } catch (fileError) {
          console.warn(`Could not delete object storage file: ${objectKey}`, fileError);
        }
      } else {
        // Legacy: Delete from local filesystem
        const imagePath = path.join(__dirname, '..', page.image_path);
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

    // Get text block from database
    const textBlock = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM text_blocks WHERE id = ?', [blockId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!textBlock || !textBlock.ocr_text) {
      return res.status(404).json({ error: 'Text block not found or no text available' });
    }

    // Check if we already have cached audio for this text block
    if (textBlock.audio_url && textBlock.alignment_data) {
      console.log('Using cached audio for text block:', blockId);
      return res.json({
        success: true,
        audio_url: textBlock.audio_url,
        text: textBlock.ocr_text,
        alignment: JSON.parse(textBlock.alignment_data),
        normalized_alignment: textBlock.normalized_alignment_data ? JSON.parse(textBlock.normalized_alignment_data) : null
      });
    }

    console.log('Converting text to speech with timestamps:', textBlock.ocr_text);

    try {
      // Use ElevenLabs to convert text to speech with timestamps
      // Using specified voice ID
      const ttsResult = await elevenlabs.textToSpeech.convertWithTimestamps("iwNZQzqCFIBqLR6sgFpN", {
        text: textBlock.ocr_text,
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

      // Convert base64 audio to file and serve it
      const audioBuffer = Buffer.from(ttsResult.audioBase64, 'base64');
      const audioFileName = `tts_${blockId}_${Date.now()}.mp3`;
      const audioPath = path.join(__dirname, 'public', 'audio', audioFileName);

      // Ensure audio directory exists
      const audioDir = path.dirname(audioPath);
      if (!fs.existsSync(audioDir)) {
        fs.mkdirSync(audioDir, { recursive: true });
      }

      fs.writeFileSync(audioPath, audioBuffer);

      const audioUrl = `/audio/${audioFileName}`;

      // Cache the audio URL and alignment data in database
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE text_blocks SET audio_url = ?, alignment_data = ?, normalized_alignment_data = ? WHERE id = ?',
          [
            audioUrl,
            JSON.stringify(ttsResult.alignment),
            ttsResult.normalized_alignment ? JSON.stringify(ttsResult.normalized_alignment) : null,
            blockId
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      // Return audio URL and timing data
      res.json({
        success: true,
        audio_url: audioUrl,
        text: textBlock.ocr_text,
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
    console.log('Using Replit Object Storage');

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
})();