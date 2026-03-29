export type SortOrder = 'asc' | 'desc';
export type FilterOptions = {
	query: string;
	limit: number;
};

export interface Identifiable
{
	id: number;
}
