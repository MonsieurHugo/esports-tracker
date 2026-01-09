/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'ddragon.leagueoflegends.com',
      },
    ],
  },
  // Disable static generation for all pages
  experimental: {
    // This might help with the useContext issue
    serverComponentsExternalPackages: ['zustand'],
  },
}

export default nextConfig
