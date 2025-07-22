FROM node:18-alpine

# Install Java and required tools for APK processing
RUN apk add --no-cache \
    openjdk17-jre \
    bash \
    curl

WORKDIR /app

# Copy package files first for better Docker layer caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application files
COPY . .

# Ensure tools directory has proper permissions
RUN chmod +x tools/*.jar || true

# Create temp directory with proper permissions for APK processing
RUN mkdir -p /tmp/apk-processing && chmod 777 /tmp/apk-processing

# Verify Java installation
RUN java -version

# List contents to debug
RUN ls -la uploads/ && ls -la tools/

# Expose port
EXPOSE 5000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5000/api/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Start the application
CMD ["node", "server.js"]
