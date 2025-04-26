import { prisma } from "@/client";
import type { Tag } from "@/types";

export async function getTags(publishedOnly = false): Promise<Tag[]> {
	const tags = await prisma.pollstags.findMany({
		include: {
			pollsRelation: {
				where: publishedOnly ? { published: true } : {},
				orderBy: {
					time: "desc",
				},
				take: 1,
			},
		},
	});

	tags.sort((a, b) => {
		const aTime = a.pollsRelation[0]?.time
			? new Date(a.pollsRelation[0].time).getTime()
			: 0;
		const bTime = b.pollsRelation[0]?.time
			? new Date(b.pollsRelation[0].time).getTime()
			: 0;
		return bTime - aTime;
	});

	return tags;
}

export async function getTagById(id: number): Promise<Tag | null> {
	const tag = await prisma.pollstags.findUnique({
		where: {
			tag: id,
		},
	});

	if (!tag) return null;

	return tag;
}
