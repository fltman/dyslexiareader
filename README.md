# TheReader

[![Support me on Patreon](https://img.shields.io/badge/Patreon-Support%20my%20work-FF424D?style=flat&logo=patreon&logoColor=white)](https://www.patreon.com/AndersBjarby)

A dyslexia-friendly web application that helps users scan text from books and images, then converts them to speech with synchronized highlighting.

## Features

- 📱 Mobile-first camera interface with portrait orientation
- 🔍 AI-powered text detection using OpenAI GPT-4o
- 🗣️ Text-to-speech with ElevenLabs integration
- 🎯 Character-level synchronization between audio and text
- 📖 Dyslexia-friendly design with OpenDyslexic font
- ☁️ Cloudflare R2 storage integration
- 🐳 Docker containerization
- ⚡ Azure deployment ready

## Tech Stack

### Frontend
- React 18 with Vite
- TypeScript
- Tailwind CSS
- Mobile camera API integration

### Backend
- Node.js with Express
- SQLite (development) / PostgreSQL (production)
- OpenAI GPT-4o for OCR
- ElevenLabs for text-to-speech
- Cloudflare R2 for file storage
- AWS SDK S3-compatible client

## Getting Started

### Prerequisites
- Node.js 20+
- npm or yarn
- Docker (for containerized deployment)

### Environment Variables

Create a `.env` file in the root directory:

```bash
# Required API Keys
OPENAI_API_KEY=your_openai_api_key
ELEVENLABS_API_KEY=your_elevenlabs_api_key

# Database (for production)
USE_POSTGRES=false
DATABASE_URL=postgresql://user:password@host:port/database

# Cloudflare R2 Storage (optional)
USE_R2_STORAGE=false
R2_ACCESS_KEY_ID=your_r2_access_key
R2_SECRET_ACCESS_KEY=your_r2_secret_key
R2_ENDPOINT=your_r2_endpoint
R2_BUCKET=your_r2_bucket

# Server Configuration
PORT=5001
NODE_ENV=development
EXTERNAL_URL=http://localhost:5001
```

### Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/fltman/thereader.git
   cd thereader
   ```

2. **Install dependencies**
   ```bash
   npm install
   cd client && npm install && cd ..
   ```

3. **Start development servers**
   ```bash
   # Start backend (runs on port 5001)
   npm run dev:server

   # Start frontend (runs on port 5173)
   npm run dev:client
   ```

4. **Access the application**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:5001

### Docker Deployment

1. **Build and run with Docker Compose**
   ```bash
   # Build client first
   cd client && npm run build && cd ..

   # Run with Docker Compose
   docker-compose up -d
   ```

2. **Access the application**
   - Application: http://localhost:3000

## Azure Deployment

### App Service Deployment

1. **Set environment variables**
   ```bash
   export AZURE_DB_SERVER=your-db-server
   export AZURE_DB_NAME=your-db-name
   export AZURE_DB_USERNAME=your-db-username
   export AZURE_DB_PASSWORD=your-db-password
   export R2_ACCESS_KEY_ID=your_r2_access_key
   export R2_SECRET_ACCESS_KEY=your_r2_secret_key
   export R2_ENDPOINT=your_r2_endpoint
   export R2_BUCKET=your_r2_bucket
   ```

2. **Run deployment script**
   ```bash
   ./deploy-azure.sh
   ```

### Container Instance Deployment

1. **Set environment variables** (same as above)

2. **Run container deployment script**
   ```bash
   ./deploy-azure-container.sh
   ```

3. **Set API keys in Azure portal**
   - Navigate to your container instance
   - Add `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` as secure environment variables
   - Restart the container

## Project Structure

```
thereader/
├── client/                 # React frontend
│   ├── src/
│   ├── public/
│   └── dist/              # Build output
├── server/                # Node.js backend
│   ├── index.js          # Main server file
│   ├── database.js       # Database abstraction
│   ├── database-unified.js # Unified DB operations
│   └── storage.js        # File storage abstraction
├── deploy-azure.sh       # Azure App Service deployment
├── deploy-azure-container.sh # Azure Container deployment
├── docker-compose.yml    # Docker Compose configuration
├── Dockerfile           # Container definition
└── README.md
```

## Usage

1. **Scan a book page**
   - Open the app on your mobile device
   - Tap "Scan New Book"
   - Use the camera to capture a page
   - The app will automatically detect text

2. **Listen to text**
   - Tap any detected text block
   - The app will generate speech with synchronized highlighting
   - Characters are highlighted as they're spoken

3. **Manage books**
   - View your scanned books in the library
   - Each page is saved with OCR results
   - Navigate between pages easily

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- OpenAI for GPT-4o vision capabilities
- ElevenLabs for high-quality text-to-speech
- OpenDyslexic font for accessibility
- The dyslexia community for inspiration and feedback