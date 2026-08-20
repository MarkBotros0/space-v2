import { PrismaPg } from "@prisma/adapter-pg";

import { config } from "@/lib/config";
import { PrismaClient } from "@/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: config.databaseUrl });

export const db = new PrismaClient({ adapter });
