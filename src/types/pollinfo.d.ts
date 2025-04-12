export interface PollInfo {
	guild_id: bigint;
	default_channel_id: bigint;
	manage_channel_id: bigint[];
	manager_role_id: bigint[];
	default_colour: number | null;
	fallback_channel_id: bigint | null;
}
