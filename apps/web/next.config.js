/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@aiql/query-engine", "@aiql/schema-intel", "@aiql/close-engine", "@aiql/document-types", "@aiql/pulse-engine", "@aiql/doc-parsers"],
  experimental: {
    serverComponentsExternalPackages: [
      "@node-rs/argon2",
      "@prisma/client",
      "@aws-sdk/client-ssm",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
      "nodemailer",
      "compromise",
      "@anthropic-ai/sdk",
      // pdfkit ships AFM font data files in its `data/` directory that Next.js
      // strips during server bundling. Marking it external means require()s
      // resolve from node_modules at runtime, preserving the data files.
      "pdfkit",
    ],
  },
};

module.exports = nextConfig;
