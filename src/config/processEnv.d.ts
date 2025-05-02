/**
 * Use module augmentation to include the environment variables to the `process.env` object.
 */
declare namespace NodeJS {
	export interface ProcessEnv {
		PORT?: string;
		NODE_ENV?: string;

		FRONTEND_URL?: string;

		DISCORD_CLIENT_ID: string;
		DISCORD_CLIENT_SECRET: string;
		DISCORD_REDIRECT_URI: string;

		EXPRESS_SESSION_SECRET?: string;
	}
}
