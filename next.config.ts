import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // O lançamento em lote envia o PDF/foto da lista do fornecedor por Server
      // Action; o limite padrão (1 MB) barra qualquer lista fotografada.
      bodySizeLimit: "12mb",
    },
  },
};

export default nextConfig;
