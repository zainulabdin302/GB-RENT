// Prisma 6 can fail with a blank schema-engine error for an absent SQLite file.
// Opening in append mode creates a missing file without truncating existing data.
import { mkdir, open } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
const url = process.env.DATABASE_URL;
if (!url?.startsWith('file:')) throw new Error('DATABASE_URL must point to a SQLite file.');
const value = url.slice(5).split('?')[0];
if (!value) throw new Error('DATABASE_URL is missing its file path.');
const file = isAbsolute(value) ? value : resolve('prisma', value);
await mkdir(dirname(file), {recursive:true});
await (await open(file,'a')).close();
