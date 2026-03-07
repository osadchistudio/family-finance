import "dotenv/config";
import path from "node:path";
import { defineConfig } from "prisma/config";

const prismaDatasourceUrl = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!prismaDatasourceUrl) {
  throw new Error("DIRECT_URL or DATABASE_URL must be defined for Prisma CLI");
}

export default defineConfig({
  schema: path.join(__dirname, "prisma", "schema.prisma"),
  migrations: {
    path: path.join(__dirname, "prisma", "migrations"),
  },
  datasource: {
    url: prismaDatasourceUrl,
  },
});
