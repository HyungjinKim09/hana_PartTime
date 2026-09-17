import {sqliteTable, text, integer, index, primaryKey, uniqueIndex} from 'drizzle-orm/sqlite-core';
export const photos=sqliteTable('photos',{
  id:text('id').primaryKey(), owner:text('owner').notNull(), folder:text('folder').notNull(),
  filename:text('filename').notNull(), objectKey:text('object_key').notNull(),
  contentType:text('content_type').notNull(), size:integer('size').notNull(), createdAt:text('created_at').notNull(), deleted:integer('deleted').notNull().default(0),
}, table=>[index('photos_owner_folder_created').on(table.owner,table.folder,table.createdAt)]);
export const surveyFolders=sqliteTable('survey_folders',{
  owner:text('owner').notNull(),id:text('id').notNull(),region:text('region').notNull(),date:text('survey_date').notNull(),lot:text('lot').notNull(),unit:text('unit').notNull().default(''),
  time:text('time').notNull(),name:text('name').notNull(),phones:text('phones').notNull(),address:text('address').notNull(),notes:text('notes').notNull(),
  group:integer('group_index').notNull(),sort:integer('sort_index').notNull(),warning:integer('warning').notNull().default(0),
},t=>[primaryKey({columns:[t.owner,t.id]}),uniqueIndex('survey_folders_owner_day_lot_unit').on(t.owner,t.region,t.date,t.lot,t.unit)]);
export const scheduleImports=sqliteTable('schedule_imports',{
  id:text('id').primaryKey(),owner:text('owner').notNull(),filename:text('filename').notNull(),objectKey:text('object_key').notNull(),
  contentType:text('content_type').notNull(),size:integer('size').notNull(),draft:text('draft').notNull(),region:text('region'),date:text('survey_date'),createdAt:text('created_at').notNull(),
},t=>[index('schedule_imports_owner_day').on(t.owner,t.region,t.date)]);
