# Production stage - Use pre-built client
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files for server
COPY package*.json ./

# Install only production dependencies (skip postinstall)
RUN npm ci --only=production --ignore-scripts

# Copy server code
COPY server/ ./server/

# Copy pre-built client files
COPY client/dist/ ./client/dist/

# Create uploads directory for local storage fallback
RUN mkdir -p uploads

# Set environment for Azure
ENV NODE_ENV=production
ENV PORT=80

# Expose port
EXPOSE 80

# Start the application
CMD ["node", "server/index.js"]