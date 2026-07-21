require("dotenv/config");

const { PrismaClient } = require("./generated/prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");

const globalForPrisma = globalThis;

const connectionString = process.env.DATABASE_URL;
const adapter = new PrismaPg({ connectionString });

const prisma =
  globalForPrisma.__tapzyPrisma ||
  new PrismaClient({
    adapter,
    log: ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__tapzyPrisma = prisma;
}

module.exports = prisma;
