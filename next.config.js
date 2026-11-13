// Export statico per GitHub Pages. Il sito vive in /<nome-repo>/, quindi serve un basePath
// (impostato dal workflow tramite BASE_PATH; in locale resta vuoto).
const basePath = process.env.BASE_PATH || '';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  output: 'export',
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
};
