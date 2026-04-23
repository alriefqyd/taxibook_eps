const withPWA = require('next-pwa')({
  dest:          'public',
  register:      true,
  skipWaiting:   true,
  disable:       process.env.NODE_ENV === 'development',
  buildExcludes: [
    /middleware-manifest\.json$/,
    /app-build-manifest\.json$/,
    /subresource-integrity-manifest\.json$/,
    /react-loadable-manifest\.json$/,
    /server\/.*$/,
  ],
  // Don't precache anything — just handle push
  publicExcludes: ['!robots.txt'],
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkOnly',
    },
  ],
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = withPWA(nextConfig)
