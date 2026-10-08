# Prisma-invisible database objects

Prisma's schema language cannot express `CHECK` constraints or partial /
functional indexes, and `prisma migrate diff` will not recreate them. Anyone
authoring a migration must keep these; regenerating from the datamodel alone
would drop them (decision D-13.9).

No such object exists yet. Planned entries (added by the migration that creates
them, with their exact SQL):

- M7: `JpcEvent_season_scope_ck`
- M14 (optional): `User_email_lower_active_key`
