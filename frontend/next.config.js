//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const path = require('path');
// Load env from workspace root so we can keep a single unified .env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions & import('next').NextConfig}
 **/
const nextConfig = {
	// Use this to set Nx-specific options
	// See: https://nx.dev/recipes/next/next-config-setup
	nx: {
		svgr: false,
	},
	env: {
		// Expose only public variables that the browser needs
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	},
	webpack: (config) => {
		// Handle importing SVGs as React components using SVGR
		config.module.rules.push({
			test: /\.svg$/i,
			issuer: /\.(js|ts|jsx|tsx)$/,
			use: [
				{
					loader: require.resolve('@svgr/webpack'),
					options: {
						// Keep JSX output for React 17+
						jsxRuntime: 'automatic',
					},
				},
			],
		});
		return config;
	},
	async headers() {
		return [
			{
				source: '/:path*',
				headers: [
					{
						key: 'Content-Security-Policy',
						value: [
							"default-src 'self'",
							"script-src 'self' 'unsafe-eval' 'unsafe-inline'", // unsafe-eval needed for Next.js, unsafe-inline for inline scripts
							"style-src 'self' 'unsafe-inline'", // unsafe-inline for styled-components/styled-jsx
							"img-src 'self' data: https:", // Allow data URIs for images, HTTPS for external images
							"font-src 'self' data:", // Allow data URIs for fonts
							"connect-src 'self' https://api.postcodes.io https://api.parliament.uk https://api.getaddress.io", // API endpoints
							"frame-src 'self'", // Allow same-origin iframes
							"object-src 'none'", // Block plugins
							"base-uri 'self'", // Restrict base tag
							"form-action 'self'", // Restrict form submissions
							"frame-ancestors 'none'", // Prevent clickjacking
							"block-all-mixed-content", // Block mixed content
							"upgrade-insecure-requests", // Upgrade HTTP to HTTPS
						].join('; '),
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'X-Frame-Options',
						value: 'DENY',
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'Permissions-Policy',
						value: 'geolocation=(), microphone=(), camera=()',
					},
				],
			},
		];
	},
	async rewrites() {
		const origin = process.env.NEXT_BACKEND_ORIGIN || 'http://localhost:4000';
		return [
			{
				source: '/api/:path*',
				destination: `${origin}/api/:path*`,
			},
		];
	},
};

const plugins = [
	// Add more Next.js plugins to this list if needed.
	withNx,
];

module.exports = composePlugins(...plugins)(nextConfig);
