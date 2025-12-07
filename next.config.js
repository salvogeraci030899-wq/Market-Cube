/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Se hai immagini esterne, aggiungi qui i domini
  images: {
    domains: [],
  },
};

module.exports = nextConfig;