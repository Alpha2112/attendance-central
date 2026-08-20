/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@attendance/contracts', '@attendance/config'],
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Increase script load timeout from default 120s to prevent intermittent ChunkLoadError timeouts
      config.output = config.output || {};
      config.output.chunkLoadingGlobal = 'webpackChunk_attendance_dashboard';
    }
    return config;
  },
};

export default nextConfig;
