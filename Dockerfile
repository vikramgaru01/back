FROM node:18-alpine

# Install Java for APK tools (apktool and uber-apk-signer require Java)
RUN apk add --no-cache openjdk17-jre

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Create temp directory with proper permissions for APK processing
RUN mkdir -p /tmp/apk-processing && chmod 777 /tmp/apk-processing

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "server.js"]
