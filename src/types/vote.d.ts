export interface Vote {
	id: bigint;
	user_id: bigint;
	poll_id: number;
	choice: number;
}
