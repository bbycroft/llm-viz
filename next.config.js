/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Recommended for the `pages` directory, default in `app`.
  productionBrowserSourceMaps: true,
  experimental: {
    // Required:
    appDir: true,
  },
};

module.exports = nextConfig;
