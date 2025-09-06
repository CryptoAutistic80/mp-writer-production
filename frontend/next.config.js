//@ts-check

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { composePlugins, withNx } = require('@nx/next');

/**
 * @type {import('@nx/next/plugins/with-nx').WithNxOptions & import('next').NextConfig}
 **/
const nextConfig = {
	// Use this to set Nx-specific options
	// See: https://nx.dev/recipes/next/next-config-setup
	nx: {
		svgr: false,
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
