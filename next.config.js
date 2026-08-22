const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' }
    ]
  },
  // ioredis and Prisma are Node-only. Leaving them external stops the bundler
  // from pulling them (and the node built-ins they require) into the Edge
  // bundle it builds for instrumentation/middleware.
  serverExternalPackages: ['ioredis', '@prisma/client'],
  experimental: {
    workerThreads: false,
    cpus: 1
  },
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname, 'src'),
    };
    return config;
  },
};

module.exports = nextConfig;
