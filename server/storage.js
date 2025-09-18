import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// R2 Storage configuration
const useR2 = process.env.USE_R2_STORAGE === 'true';
let s3Client = null;

if (useR2) {
    s3Client = new S3Client({
        region: 'auto',
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID,
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
    });
}

const R2_BUCKET = process.env.R2_BUCKET || 'lipsync';
const LOCAL_UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Ensure local uploads directory exists
if (!useR2 && !fs.existsSync(LOCAL_UPLOADS_DIR)) {
    fs.mkdirSync(LOCAL_UPLOADS_DIR, { recursive: true });
}

export async function uploadFile(buffer, fileName, contentType = 'application/octet-stream') {
    try {
        if (useR2) {
            // Upload to Cloudflare R2
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: R2_BUCKET,
                    Key: fileName,
                    Body: buffer,
                    ContentType: contentType,
                },
            });

            await upload.done();
            return `${process.env.R2_ENDPOINT}/${R2_BUCKET}/${fileName}`;
        } else {
            // Save to local filesystem
            const filePath = path.join(LOCAL_UPLOADS_DIR, fileName);
            fs.writeFileSync(filePath, buffer);
            return `/uploads/${fileName}`;
        }
    } catch (error) {
        console.error('Error uploading file:', error);
        throw new Error('Failed to upload file');
    }
}

export async function getFile(fileName) {
    try {
        if (useR2) {
            // Get from Cloudflare R2
            const command = new GetObjectCommand({
                Bucket: R2_BUCKET,
                Key: fileName,
            });

            const response = await s3Client.send(command);
            const stream = response.Body;

            // Convert stream to buffer
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks);
        } else {
            // Read from local filesystem
            const filePath = path.join(LOCAL_UPLOADS_DIR, fileName);
            return fs.readFileSync(filePath);
        }
    } catch (error) {
        console.error('Error getting file:', error);
        throw new Error('File not found');
    }
}

export async function deleteFile(fileName) {
    try {
        if (useR2) {
            // Delete from Cloudflare R2
            const command = new DeleteObjectCommand({
                Bucket: R2_BUCKET,
                Key: fileName,
            });

            await s3Client.send(command);
        } else {
            // Delete from local filesystem
            const filePath = path.join(LOCAL_UPLOADS_DIR, fileName);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        }
    } catch (error) {
        console.error('Error deleting file:', error);
        throw new Error('Failed to delete file');
    }
}

export function getFileUrl(fileName) {
    if (useR2) {
        return `${process.env.R2_ENDPOINT}/${R2_BUCKET}/${fileName}`;
    } else {
        return `/uploads/${fileName}`;
    }
}

export function isUsingR2() {
    return useR2;
}