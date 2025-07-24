# Use a base image with Node.js (assuming your server.js needs Node)
FROM node:latest

# Install necessary dependencies for APK tools and signing
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jdk unzip wget && rm -rf /var/lib/apt/lists/*

# Set ANDROID_HOME environment variable and download build tools
ENV ANDROID_HOME /opt/android-sdk
RUN mkdir -p $ANDROID_HOME/build-tools && 
    wget https://dl.google.com/android/repository/build-tools_r33.0.2-linux.zip -O /tmp/build-tools.zip && 
    unzip /tmp/build-tools.zip -d $ANDROID_HOME/build-tools/ && 
    rm /tmp/build-tools.zip

ENV PATH $PATH:$ANDROID_HOME/build-tools/$(ls $ANDROID_HOME/build-tools | sort -V | tail -1)

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code
COPY . .+

# Expose the port the app runs on
EXPOSE 5000

# Start the application
CMD ["node", "api/index.js"]