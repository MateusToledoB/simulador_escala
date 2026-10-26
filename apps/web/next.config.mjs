/** @type {import('next').NextConfig} */
const API_URL = process.env.API_URL ?? "http://localhost:8000";

const nextConfig = {
  // o front chama /api/* e o Next repassa para a API Python (sem CORS no navegador)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
