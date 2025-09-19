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
      console.log(`🔄 Uploading file with key: ${objectKey}, buffer size: ${buffer.length} bytes`);
      
      const uploadResult = await this.client.uploadFromBytes(objectKey, buffer);
      console.log(`Upload result:`, uploadResult);
      
      if (!uploadResult.ok) {
        console.error(`❌ Upload failed:`, uploadResult.error);
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
      console.log(`✅ File uploaded successfully: ${objectKey}`);
      
      // Test immediate download to verify upload
      console.log(`🧪 Testing immediate download to verify upload...`);
      try {
        const downloadResult = await this.client.downloadAsBytes(objectKey);
        if (downloadResult.ok) {
          console.log(`✅ Verification successful: file ${objectKey} is accessible, size: ${downloadResult.value.length} bytes`);
        } else {
          console.error(`❌ Verification failed: file ${objectKey} not found immediately after upload`);
        }
      } catch (verifyError) {
        console.error(`❌ Error verifying upload:`, verifyError);
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
      console.log(`Attempting to download object with key: ${objectKey}`);
      const { ok, value: stream, error } = await this.client.downloadAsStream(objectKey);
      
      if (!ok) {
        console.error(`Object not found: ${objectKey}, error: ${error}`);
        throw new ObjectNotFoundError();
      }

      // Set appropriate headers
      const contentType = mime.lookup(objectKey) || 'application/octet-stream';
      res.set({
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      });

      // Stream the file to the response
      stream.on("error", (err) => {
        console.error("Stream error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming file" });
        }
      });

      stream.pipe(res);
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
      console.log(`🔄 Downloading bytes for key: ${objectKey}`);
      const downloadResult = await this.client.downloadAsBytes(objectKey);
      console.log(`Download result:`, downloadResult);
      
      if (!downloadResult.ok) {
        console.error(`❌ Download failed: ${objectKey}, error: ${downloadResult.error}`);
        throw new ObjectNotFoundError();
      }
      
      console.log(`✅ Downloaded ${downloadResult.value.length} bytes for key: ${objectKey}`);
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