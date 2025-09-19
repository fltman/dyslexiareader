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
      console.log(`🔄 Uploading: key="${objectKey}", size=${buffer.length} bytes`);
      
      const uploadResult = await this.client.uploadFromBytes(objectKey, buffer);
      
      if (!uploadResult.ok) {
        console.error(`❌ Upload failed for ${objectKey}:`, uploadResult.error);
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
      console.log(`✅ File uploaded to Object Storage: key="${objectKey}"`);
      
      // Test if we can list objects to see what's actually there
      try {
        const listResult = await this.client.list({ prefix: 'uploads/' });
        if (listResult.ok) {
          console.log(`📋 Current objects with 'uploads/' prefix:`, listResult.value.map(obj => obj.name));
        }
      } catch (listError) {
        console.log(`⚠️ Could not list objects:`, listError);
      }
      
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
      
      // Try downloadAsBytes instead of downloadAsStream for better reliability
      const downloadResult = await this.client.downloadAsBytes(objectKey);
      
      if (!downloadResult.ok) {
        console.error(`❌ Object not found via bytes: key="${objectKey}"`);
        
        // If bytes method fails, try with a small delay and retry
        console.log(`🔄 Retrying with delay...`);
        await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
        
        const retryResult = await this.client.downloadAsBytes(objectKey);
        if (!retryResult.ok) {
          // List what's actually in the bucket to debug
          try {
            const listResult = await this.client.list({ prefix: 'uploads/' });
            if (listResult.ok) {
              console.log(`📋 Available objects:`, listResult.value.map(obj => obj.name));
            }
          } catch (listError) {
            console.log(`⚠️ Could not list objects for debugging:`, listError);
          }
          
          throw new ObjectNotFoundError();
        }
        
        // Retry succeeded, use that result
        console.log(`✅ Retry successful for: ${objectKey}`);
        const bytes = retryResult.value;
        
        // Set appropriate headers
        const contentType = mime.lookup(objectKey) || 'application/octet-stream';
        res.set({
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
          "Content-Length": bytes.length.toString()
        });

        res.send(bytes);
        return;
      }

      console.log(`✅ Downloaded successfully: ${objectKey} (${downloadResult.value.length} bytes)`);
      const bytes = downloadResult.value;

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