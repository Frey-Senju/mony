/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Transpile workspace packages — needed so `@mony/shared` (TS source-only,
  // no dist build) is bundled correctly by Next's compiler. Story 2.2.
  transpilePackages: ['@mony/shared'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000',
  },
}

module.exports = nextConfig
