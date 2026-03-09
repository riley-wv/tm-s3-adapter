/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  assetPrefix: '/admin',
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
