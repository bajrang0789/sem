# Dockerfile for Backend Service

# Use Node.js official image as a parent image
FROM node:18

# Set the working directory
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the container port 8080
EXPOSE 8080

# Command to start the application (listening internally on port 8080)
CMD ["node", "index.js"]