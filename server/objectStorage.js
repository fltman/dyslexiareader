import { Client } from '@replit/object-storage';
import mime from 'mime-types';

// Simple Replit Object Storage client
export const objectStorageClient = new Client();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

// Simple Replit Object Storage service
export class ObjectStorageService {
  constructor() {
    this.client = objectStorageClient;
  }

  // Upload a file to Replit Object Storage
  async uploadFile(buffer, fileName, contentType = 'application/octet-stream') {
    try {
      const objectKey = `uploads/${fileName}`;
      console.log(`🔄 Uploading: key="${objectKey}", input size=${buffer.length} bytes`);
      console.log(`📄 Upload buffer info: isBuffer=${Buffer.isBuffer(buffer)}, constructor=${buffer.constructor.name}`);
      
      // Ensure we have a proper Uint8Array for the Object Storage client
      let uploadBuffer = buffer;
      if (Buffer.isBuffer(buffer)) {
        console.log(`🔄 Converting Buffer to Uint8Array for upload...`);
        uploadBuffer = new Uint8Array(buffer);
        console.log(`✅ Converted: new size=${uploadBuffer.length} bytes`);
      }
      
      const uploadResult = await this.client.uploadFromBytes(objectKey, uploadBuffer);
      
      if (!uploadResult.ok) {
        console.error(`❌ Upload failed for ${objectKey}:`, uploadResult.error);
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
      console.log(`✅ File uploaded to Object Storage: key="${objectKey}"`);
      
      // Return the object path that can be used to access the file
      return `/objects/${objectKey}`;
    } catch (error) {
      console.error('Error uploading file to Replit Object Storage:', error);
      throw new Error('Failed to upload file');
    }
  }

  // Download and stream an object to the response
  async downloadObject(objectKey, res) {
    try {
      console.log(`🔍 Trying to download: key="${objectKey}"`);
      
      // Use downloadAsBytes with correct destructuring pattern
      console.log(`🔄 Attempting downloadAsBytes for: ${objectKey}`);
      const { ok, value: bytesValue, error } = await this.client.downloadAsBytes(objectKey);
      console.log(`📥 Download result:`, { ok, bytesLength: bytesValue?.length, error });
      
      if (!ok) {
        console.error(`❌ Object not found via bytes: key="${objectKey}"`, error);
        throw new ObjectNotFoundError();
      }

      console.log(`✅ Downloaded successfully: ${objectKey} (${bytesValue.length} bytes)`);
      const bytes = bytesValue;

      // Set appropriate headers
      const contentType = mime.lookup(objectKey) || 'application/octet-stream';
      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
        "Content-Length": bytes.length.toString()
      });

      res.send(bytes);
    } catch (error) {
      console.error("Error downloading file:", error);
      if (error instanceof ObjectNotFoundError) {
        throw error;
      }
      throw new Error("Error downloading file");
    }
  }

  // Download object as bytes (for AI processing)
  async downloadBytes(objectKey) {
    try {
      const downloadResult = await this.client.downloadAsBytes(objectKey);
      
      if (!downloadResult.ok) {
        throw new ObjectNotFoundError();
      }
      
      return downloadResult.value;
    } catch (error) {
      console.error("Error downloading bytes:", error);
      throw error instanceof ObjectNotFoundError ? error : new Error("Error downloading bytes");
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