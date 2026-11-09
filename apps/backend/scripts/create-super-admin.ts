/**
 * Creates the first SUPER account on an empty, freshly migrated database
 * (e.g. a new production database after `pnpm db:migrate:deploy`).
 *
 * Usage (from apps/backend, DATABASE_URL pointing at the target database):
 *   pnpm create:super-admin
 *
 * Asks for the email, name and password interactively, so the password never
 * lands in shell history or an env var, and shows which database host it is
 * about to write to before it writes anything.
 */
import { createInterface, type Interface } from "node:readline";

import { db } from "../src/db/client";
import { config } from "../src/lib/config";
import { databaseHost } from "./lib/db-host";
import { createSuperAdmin } from "./create-super-admin/create";

type MutableInterface = Interface & { _writeToOutput?: (s: string) => void };

function ask(rl: Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/** Like ask(), but echoes nothing the user types. */
async function askHidden(rl: MutableInterface, question: string): Promise<string> {
  const write = rl._writeToOutput;
  rl._writeToOutput = (s: string) => {
    if (s.startsWith(question) || s === "\r\n" || s === "\n") process.stdout.write(s);
  };
  try {
    return await ask(rl, question);
  } finally {
    rl._writeToOutput = write;
  }
}

async function main(): Promise<void> {
  if (!process.stdin.isTTY) {
    throw new Error("create:super-admin is interactive; run it in a terminal.");
  }
  const rl: MutableInterface = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const host = databaseHost(config.databaseUrl);
    console.log(`Database: ${host}`);

    const email = await ask(rl, "Email: ");
    const name = await ask(rl, "Name: ");
    const password = await askHidden(rl, "Password (min 8): ");
    const again = await askHidden(rl, "Password again: ");
    if (password !== again) throw new Error("The passwords don't match. Nothing was created.");

    const confirm = await ask(rl, `Create SUPER account ${email.trim()} on ${host}? [y/N] `);
    if (confirm.trim().toLowerCase() !== "y") {
      console.log("Cancelled. Nothing was created.");
      return;
    }

    const result = await createSuperAdmin({ email, name, password });
    if (!result.ok) throw new Error(`${result.error} Nothing was created.`);
    console.log(`Created SUPER account #${result.id} (${result.email}). Sign in from the app.`);
  } finally {
    rl.close();
  }
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
