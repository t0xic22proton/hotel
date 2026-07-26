export const ENV = {
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  adminPassword: process.env.ADMIN_PASSWORD ?? "",
  isProduction: process.env.NODE_ENV === "production",
};
