/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // These packages do native or dynamic requires (the local embedding model,
  // its ONNX runtime, and the PDF/DOCX parsers). They must stay external to the
  // server bundle so Next does not try to webpack them.
  experimental: {
    serverComponentsExternalPackages: [
      "@xenova/transformers",
      "onnxruntime-node",
      "sharp",
      "pdf-parse",
      "unpdf",
      "mammoth",
      "xlsx",
    ],
  },
};

export default nextConfig;
