import { prisma } from "@/client";
import type { Tag } from "@/types";

export async function getTags(publishedOnly = false): Promise<Tag[]> {
	const tags = await prisma.tag.findMany({
		include: {
			polls: {
				where: publishedOnly ? { published: true } : {},
			orderBy: {
				start_time: "desc",
			},
				take: 1,
			},
		},
	});

	tags.sort((a, b) => {
		const aTime = a.polls[0]?.start_time
			? new Date(a.polls[0].start_time).getTime()
			: 0;
		const bTime = b.polls[0]?.start_time
			? new Date(b.polls[0].start_time).getTime()
			: 0;
		return bTime - aTime;
	});

	return tags;
}

export async function getTagById(id: number): Promise<Tag | null> {
	const tag = await prisma.tag.findUnique({
		where: {
			tag: id,
		},
	});

	if (!tag) return null;

	return tag;
}
