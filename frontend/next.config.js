/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // Required for the multi-stage Docker build.
  // Produces a self-contained /app/.next/standalone folder that includes
  // a minimal node server (server.js) — no node_modules needed at runtime.
  output: 'standalone',

  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1',
  },
}

module.exports = nextConfig
