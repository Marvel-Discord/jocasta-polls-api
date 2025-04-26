export interface Poll {
	id: number;
	question: string;
	published: boolean;
	active: boolean;
	guild_id: bigint;
	choices: string[];
	votes: number[];
	time: Date | null;
	// duration: string | null;
	num: number | null;
	message_id: bigint | null;
	crosspost_message_ids: bigint[];
	tag: number;
	image: string | null;
	description: string | null;
	thread_question: string | null;
	show_question: boolean;
	show_options: boolean;
	show_voting: boolean;
	fallback: boolean;
}
