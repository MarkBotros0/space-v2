# migrations-cutover

These migrations are **not applied by any tooling**. Prisma does not read this
directory. `required/` is moved into `prisma/migrations/` by hand, once, by the
operator, inside the cutover window, after v1 has stopped writing and a backup
has been verified. `optional/` is moved only if the user approved that
migration at the go/no-go gate. Do not move either early. Do not run
`prisma migrate dev`, `prisma db push` or `prisma migrate reset` against the
shared database at any time.

Authoring: generate DDL offline from two schema files, never from a database:

    npx prisma migrate diff --from-schema <main schema file> \
      --to-schema prisma/schema.prisma --script

Each folder is `migration.sql` (atomic `BEGIN; ... COMMIT;` except M5) plus
`rollback.sql` (except M5, which is forward-only). Backup copies made by a
migration live in the `cutover_backup` schema, never in `public`.

Apply order is the folder timestamp. The `06` and `11` slots are empty
(M6 and M11 are withdrawn). `optional/` (M14) sorts last (`...99`).
