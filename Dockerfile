# Use a base image with Node.js (assuming your server.js needs Node)
FROM node:latest

# Install necessary dependencies for APK tools and signing
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk \
    unzip \
    wget \
    # Install Android SDK build tools
    android-sdk-build-tools 
    && rm -rf /var/lib/apt/lists/*

# Set ANDROID_HOME environment variable
ENV ANDROID_HOME /usr/lib/android-sdk
ENV PATH $PATH:$ANDROID_HOME/build-tools/$(ls $ANDROID_HOME/build-tools | sort -V | tail -1)

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Make sure the uber-apk-signer.jar is executable
RUN chmod +x ./tools/uber-apk-signer.jar

# Expose the port your Node.js server is listening on
EXPOSE 5000

# Start the Node.js server
CMD ["node", "server.js"]
