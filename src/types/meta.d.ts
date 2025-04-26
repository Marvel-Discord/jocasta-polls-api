export interface Meta {
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	nextPage: int | null;
	prevPage: int | null;
	nextPageUrl?: string | null;
	prevPageUrl?: string | null;
}
