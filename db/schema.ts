import {sqliteTable, text, integer, index} from 'drizzle-orm/sqlite-core';
export const photos=sqliteTable('photos',{
  id:text('id').primaryKey(), owner:text('owner').notNull(), folder:text('folder').notNull(),
  filename:text('filename').notNull(), objectKey:text('object_key').notNull(),
  contentType:text('content_type').notNull(), size:integer('size').notNull(), createdAt:text('created_at').notNull(), deleted:integer('deleted').notNull().default(0),
}, table=>[index('photos_owner_folder_created').on(table.owner,table.folder,table.createdAt)]);
