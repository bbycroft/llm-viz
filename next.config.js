/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false, // Recommended for the `pages` directory, default in `app`.
  productionBrowserSourceMaps: true,
  experimental: {
    // Required:
    appDir: true,
  },
  redirects: async () => {
    return [
      {
        source: "/llm-viz",
        destination: "/llm",
        permanent: true,
      },
    ];
  }
};

module.exports = nextConfig;
