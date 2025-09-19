import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import mime from 'mime-types';

// Cloudflare R2 client using S3 API
const s3Client = new S3Client({
  region: 'auto',
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET_NAME = process.env.CLOUDFLARE_R2_BUCKET_NAME;

console.log('🔧 R2 Configuration:', {
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT ? 'SET' : 'MISSING',
  accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID ? 'SET' : 'MISSING', 
  secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY ? 'SET' : 'MISSING',
  bucketName: BUCKET_NAME || 'MISSING'
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Cloudflare R2 Object Storage service
export class ObjectStorageService {
  // Upload a file to Cloudflare R2
  async uploadFile(buffer, fileName, contentType = 'application/octet-stream') {
    try {
      const objectKey = `uploads/${fileName}`;
      console.log(`🔄 Uploading to R2: key="${objectKey}", size=${buffer.length} bytes`);
      
      const uploadCommand = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        Body: buffer,
        ContentType: contentType,
      });
      
      await s3Client.send(uploadCommand);
      
      console.log(`✅ File uploaded to Cloudflare R2: key="${objectKey}"`);
      
      // Return the object path that can be used to access the file
      return `/objects/${objectKey}`;
    } catch (error) {
      console.error('Error uploading file to Cloudflare R2:', error);
      throw new Error('Failed to upload file');
    }
  }

  // Download and stream an object to the response
  async downloadObject(objectKey, res) {
    try {
      console.log(`🔍 Downloading from R2: key="${objectKey}"`);
      
      const downloadCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
      });
      
      const response = await s3Client.send(downloadCommand);
      
      if (!response.Body) {
        console.error(`❌ Object not found in R2: key="${objectKey}"`);
        throw new ObjectNotFoundError();
      }
      
      console.log(`✅ R2 download successful for: ${objectKey}`);
      
      // Convert stream to buffer
      const chunks = [];
      const stream = response.Body;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const bytes = Buffer.concat(chunks);
      console.log(`✅ Downloaded from R2: ${bytes.length} bytes`);

      // Set appropriate headers
      const contentType = mime.lookup(objectKey) || 'application/octet-stream';
      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Content-Length": bytes.length.toString()
      });

      res.send(bytes);
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.error(`❌ Object not found in R2: key="${objectKey}"`);
        throw new ObjectNotFoundError();
      }
      if (error instanceof ObjectNotFoundError) {
        throw error;
      }
      console.error('Error downloading object from R2:', error);
      throw new Error('Failed to download object');
    }
  }

  // Download object as bytes (for AI processing)
  async downloadBytes(objectKey) {
    try {
      console.log(`🔍 Downloading bytes from R2: key="${objectKey}"`);
      
      const downloadCommand = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
      });
      
      const response = await s3Client.send(downloadCommand);
      
      if (!response.Body) {
        console.error(`❌ Object not found in R2: key="${objectKey}"`);
        throw new ObjectNotFoundError();
      }
      
      // Convert stream to buffer
      const chunks = [];
      const stream = response.Body;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      
      const bytes = Buffer.concat(chunks);
      console.log(`✅ Downloaded bytes from R2: ${objectKey} (${bytes.length} bytes)`);
      return bytes;
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        console.error(`❌ Object not found in R2: key="${objectKey}"`);
        throw new ObjectNotFoundError();
      }
      if (error instanceof ObjectNotFoundError) {
        throw error;
      }
      console.error('Error downloading bytes from R2:', error);
      throw new Error('Failed to download bytes');
    }
  }

  // Delete an object
  async deleteObject(objectKey) {
    try {
      const { ok, error } = await this.client.delete(objectKey);
      
      if (!ok) {
        console.warn(`Failed to delete object ${objectKey}:`, error);
        // Don't throw error for deletion failures - it's not critical
      }
    } catch (error) {
      console.warn("Error deleting object:", error);
      // Don't throw error for deletion failures - it's not critical
    }
  }

  // Get object entity file (compatibility method)
  async getObjectEntityFile(objectPath) {
    // Extract object key from path like "/objects/uploads/filename.jpg"
    const objectKey = objectPath.replace('/objects/', '');
    return { objectKey };
  }
}