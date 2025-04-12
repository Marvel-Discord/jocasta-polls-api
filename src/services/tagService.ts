import { prisma } from "@/client";
import type { Tag } from "@/types/tag";

export async function getTags(): Promise<Tag[]> {
	const tags = await prisma.pollstags.findMany();

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
