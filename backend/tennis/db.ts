import { SQLDatabase } from 'encore.dev/storage/sqldb';

export const tennisDB = new SQLDatabase("tennis", {
  migrations: "./migrations",
});
