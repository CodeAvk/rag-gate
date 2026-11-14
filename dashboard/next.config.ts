import type { NextConfig } from "next";

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The app imports nothing from the parent repository; it only reads the run store at request time.
  turbopack: { root: __dirname },
};

export default config;
