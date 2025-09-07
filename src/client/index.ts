import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

prisma.$connect().then(() => {
  return prisma.$executeRaw`SET app.current_platform = 'web'`;
});
