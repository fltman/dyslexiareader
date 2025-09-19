# Overview

TheReader is a dyslexia-friendly web application that helps users scan text from books and images, converting them to speech with synchronized highlighting. The application provides a full-stack solution with mobile-first design, AI-powered text detection using OpenAI GPT-4o, and text-to-speech capabilities via ElevenLabs. It's specifically designed for people with dyslexia, featuring accessibility-first principles including high contrast, large touch targets, OpenDyslexic font, and reduced motion support.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with Vite build tool for fast development and hot module replacement
- **Styling**: CSS modules with dyslexia-friendly design principles, including OpenDyslexic font family and high contrast color schemes
- **Routing**: React Router DOM for client-side navigation
- **Mobile-First**: Portrait orientation camera interface optimized for mobile devices
- **Accessibility**: Supports `prefers-reduced-motion` and `prefers-contrast: high` media queries, minimum 48px touch targets

## Backend Architecture
- **Framework**: Node.js with Express.js using ES modules
- **API Design**: RESTful API endpoints for book management, page scanning, and text processing
- **File Upload**: Multer middleware with memory storage for handling image uploads
- **Database Layer**: Drizzle ORM with support for both SQLite (development) and PostgreSQL (production)
- **Real-time Features**: WebSocket support for live scanning sessions and QR code functionality

## Data Storage Strategy
- **Development Database**: SQLite for local development with simplified setup
- **Production Database**: PostgreSQL with Neon serverless integration and SSL configuration
- **Object Storage**: Replit Object Storage integration with Google Cloud Storage SDK
- **File Storage Flexibility**: Support for both local filesystem and cloud storage (Cloudflare R2) depending on environment

## Authentication and Security
- **Public Access Model**: All scanned content is designed to be publicly accessible for ease of use
- **Session Management**: QR code-based scanning sessions with expiration handling
- **SSL Configuration**: Proper SSL handling for database connections with self-signed certificate support

# External Dependencies

## AI and Machine Learning Services
- **OpenAI GPT-4o**: Used for optical character recognition (OCR) and text extraction from images
- **ElevenLabs**: Provides text-to-speech conversion with character-level synchronization for audio highlighting
- **Tesseract.js**: Client-side OCR capabilities as fallback or supplementary text recognition

## Cloud Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting with WebSocket support for production deployments
- **Replit Object Storage**: Primary file storage solution using Google Cloud Storage SDK
- **Cloudflare R2**: Optional S3-compatible object storage for file uploads and audio storage
- **Azure Container Instances**: Deployment target for containerized production environments

## Development and Build Tools
- **Drizzle Kit**: Database migrations and schema management
- **Docker**: Containerization for consistent deployment across environments
- **Concurrently**: Development workflow management for running frontend and backend simultaneously
- **Nodemon**: Development server with automatic restart on file changes

## Core Libraries
- **Multer**: Multipart form data handling for image uploads
- **QRCode**: QR code generation for scanning session management
- **UUID**: Unique identifier generation for sessions and resources
- **WebSocket (ws)**: Real-time communication for scanning sessions
- **CORS**: Cross-origin resource sharing configuration for API access