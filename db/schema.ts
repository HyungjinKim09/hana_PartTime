import {sqliteTable, text, integer, index, primaryKey, uniqueIndex} from 'drizzle-orm/sqlite-core';
// Aggregate maintenance triggers live in migration 0006.
export const r2StorageUsage=sqliteTable('r2_storage_usage',{id:integer('id').primaryKey(),bytes:integer('bytes').notNull()});
export const r2DownloadTickets=sqliteTable('r2_download_tickets',{token:text('token').primaryKey(),owner:text('owner').notNull(),objectKey:text('object_key').notNull(),expiresAt:integer('expires_at').notNull()},t=>[index('r2_download_tickets_expiry').on(t.expiresAt)]);
export const r2ObjectUsage=sqliteTable('r2_object_usage',{objectKey:text('object_key').primaryKey(),size:integer('size').notNull()});
export const r2OperationUsage=sqliteTable('r2_operation_usage',{day:text('day').notNull(),kind:text('kind').notNull(),amount:integer('amount').notNull()},t=>[primaryKey({columns:[t.day,t.kind]})]);
export const siteAccount=sqliteTable('site_account',{
  id:integer('id').primaryKey(),owner:text('owner').notNull(),username:text('username').notNull(),salt:text('salt').notNull(),passwordHash:text('password_hash').notNull(),version:integer('version').notNull(),
});
export const siteSessions=sqliteTable('site_sessions',{
  tokenHash:text('token_hash').primaryKey(),version:integer('version').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const siteLoginLimits=sqliteTable('site_login_limits',{
  key:text('key').primaryKey(),attempts:integer('attempts').notNull(),expiresAt:integer('expires_at').notNull(),
});
export const photos=sqliteTable('photos',{
  kind:text('kind').notNull().default('photo'),
  id:text('id').primaryKey(), owner:text('owner').notNull(), folder:text('folder').notNull(),
  filename:text('filename').notNull(), objectKey:text('object_key').notNull(), thumbnailKey:text('thumbnail_key'),
  contentType:text('content_type').notNull(), size:integer('size').notNull(), createdAt:text('created_at').notNull(), deleted:integer('deleted').notNull().default(0),
}, table=>[index('photos_owner_folder_created').on(table.owner,table.folder,table.createdAt)]);
export const folderSeedState=sqliteTable('folder_seed_state',{owner:text('owner').primaryKey()});
export const surveyFolders=sqliteTable('survey_folders',{
  manualAdded:integer('manual_added').notNull().default(0),unitDisplay:text('unit_display').notNull().default(''),deleting:integer('deleting').notNull().default(0),owner:text('owner').notNull(),id:text('id').notNull(),region:text('region').notNull(),date:text('survey_date').notNull(),lot:text('lot').notNull(),unit:text('unit').notNull().default(''),
  time:text('time').notNull(),name:text('name').notNull(),phones:text('phones').notNull(),address:text('address').notNull(),notes:text('notes').notNull(),
  remarks:text('remarks').notNull().default(''),buildingDetails:text('building_details').notNull().default(''),surveyStatus:text('survey_status').notNull().default('미완료'),
  group:integer('group_index').notNull(),sort:integer('sort_index').notNull(),warning:integer('warning').notNull().default(0),
},t=>[primaryKey({columns:[t.owner,t.id]}),uniqueIndex('survey_folders_owner_day_lot_unit').on(t.owner,t.region,t.date,t.lot,t.unit)]);
export const scheduleImports=sqliteTable('schedule_imports',{
  deleted:integer('deleted').notNull().default(0),
  id:text('id').primaryKey(),owner:text('owner').notNull(),filename:text('filename').notNull(),objectKey:text('object_key').notNull(),
  contentType:text('content_type').notNull(),size:integer('size').notNull(),draft:text('draft').notNull(),region:text('region'),date:text('survey_date'),createdAt:text('created_at').notNull(),
},t=>[index('schedule_imports_owner_day').on(t.owner,t.region,t.date)]);

export const drawingDrafts=sqliteTable('drawing_drafts',{photoId:text('photo_id').primaryKey(),owner:text('owner').notNull(),draft:text('draft').notNull(),revision:integer('revision').notNull().default(1),updatedAt:text('updated_at').notNull()});
export const drawingAiUsage=sqliteTable('drawing_ai_usage',{day:text('day').primaryKey(),requests:integer('requests').notNull().default(0)});
