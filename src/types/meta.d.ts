export interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  nextPage: number | null;
  prevPage: number | null;
  nextPageUrl?: string | null;
  prevPageUrl?: string | null;
  randomSeed?: number;
}
