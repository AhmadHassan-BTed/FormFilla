# Use official Node.js runtime as parent image
FROM node:20-alpine

# Set working directory in container
WORKDIR /app

# Copy package configurations
COPY package*.json ./

# Install packages
RUN npm ci

# Copy project files
COPY . .

# Run build compile
RUN npm run build

# Default execution runs test suite
CMD ["npm", "run", "test"]
