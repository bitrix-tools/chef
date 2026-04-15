import { Option } from 'commander';

export const productionOption = new Option(
	'--production',
	'Set process.env.NODE_ENV to "production" before loading bundle config',
);

export const developmentOption = new Option(
	'--development',
	'Set process.env.NODE_ENV to "development" before loading bundle config',
);
