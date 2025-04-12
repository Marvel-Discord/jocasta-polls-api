export interface Tag {
	tag: number;
	name: string;
	guild_id: bigint;
	channel_id: bigint;
	crosspost_channels: bigint[];
	crosspost_servers: bigint[];
	current_num: number | null;
	colour: number | null;
	end_message: string | null;
	end_message_latest_ids: bigint[];
	end_message_replace: boolean;
	end_message_role_ids: bigint[];
	end_message_ping: boolean;
	end_message_self_assign: boolean;
	persistent: boolean;
}
