import { index, mysqlTable, text, timestamp, varchar } from 'drizzle-orm/mysql-core';

export const users = mysqlTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  name: varchar('name', { length: 120 }),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull()
});

export const sessions = mysqlTable(
  'sessions',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    title: varchar('title', { length: 120 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => ({
    userIdIdx: index('sessions_user_id_idx').on(table.userId),
    updatedAtIdx: index('sessions_updated_at_idx').on(table.updatedAt)
  })
);

export const queries = mysqlTable(
  'queries',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    sessionId: varchar('session_id', { length: 36 }).notNull(),
    question: text('question').notNull(),
    response: text('response'),
    status: varchar('status', { length: 20 }).notNull(),
    error: text('error'),
    provider: varchar('provider', { length: 64 }).notNull(),
    model: varchar('model', { length: 120 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull()
  },
  (table) => ({
    userIdIdx: index('queries_user_id_idx').on(table.userId),
    sessionIdIdx: index('queries_session_id_idx').on(table.sessionId),
    createdAtIdx: index('queries_created_at_idx').on(table.createdAt)
  })
);

export const companies = mysqlTable(
  'companies',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    ticker: varchar('ticker', { length: 16 }).notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => ({
    userIdIdx: index('companies_user_id_idx').on(table.userId),
    tickerIdx: index('companies_ticker_idx').on(table.ticker)
  })
);

export const documents = mysqlTable(
  'documents',
  {
    id: varchar('id', { length: 36 }).primaryKey(),
    userId: varchar('user_id', { length: 36 }).notNull(),
    fileKey: varchar('file_key', { length: 255 }).notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 120 }).notNull(),
    sizeBytes: varchar('size_bytes', { length: 32 }).notNull(),
    url: varchar('url', { length: 512 }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull()
  },
  (table) => ({
    userIdIdx: index('documents_user_id_idx').on(table.userId),
    fileKeyIdx: index('documents_file_key_idx').on(table.fileKey)
  })
);
