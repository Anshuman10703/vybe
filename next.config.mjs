/** @type {import('next').NextConfig} */

const nextConfig = {
  reactStrictMode: false,

  deploymentId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12),

  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
