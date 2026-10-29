/** @type {import('next').NextConfig} */
// 127.0.0.1 e não localhost: o Node pode resolver localhost para IPv6 (::1) e a API escuta só em IPv4.
// Os rewrites são gravados no build, então API_URL vale no momento do "next build".
const API_URL = process.env.API_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  // a aba Simular CR otimiza cada função com o OR-Tools (até ~30 s): o padrão de 30 s do proxy cortaria a resposta
  experimental: { proxyTimeout: 120_000 },
  // o front chama /api/* e o Next repassa para a API Python (sem CORS no navegador)
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default nextConfig;
