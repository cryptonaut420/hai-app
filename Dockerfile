FROM node:18-alpine

# Install supervisord
RUN apk add --no-cache supervisor

# Set working directory
WORKDIR /app

# Copy app files
COPY . .

# Install dependencies
RUN yarn install --force

# Create supervisord config
RUN mkdir -p /etc/supervisor/conf.d
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create log directories
RUN mkdir -p /var/log/supervisor /var/run

# Expose port
EXPOSE 5173

# Start supervisord
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"] 