export type PhotoCursor={created:string;id:string};

export async function fieldPhotosForExport(db:D1Database,owner:string,ids:string[]){
 return db.prepare(`SELECT p.id,p.folder,p.filename,p.object_key,p.size FROM json_each(?) selected CROSS JOIN photos p
  WHERE p.owner=? AND p.folder=selected.value AND p.deleted=0 AND p.kind='photo' ORDER BY p.created_at,p.id`)
  .bind(JSON.stringify([...new Set(ids)]),owner).all<{id:string;folder:string;filename:string;object_key:string;size:number}>();
}

// Selection and cursor validation belong to the API boundary.
export async function photoPage(db:D1Database,owner:string,ids:string[],kind:string|null,limit:number,cursor:PhotoCursor|null){
 // Drive the join from the selected IDs. IN + ORDER BY can make SQLite choose
 // the owner-wide date index and read every other folder before returning 10 rows.
 const values:unknown[]=[JSON.stringify([...new Set(ids)]),owner];let where='p.owner=? AND p.folder=selected.value AND p.deleted=0';
 if(kind){where+=' AND kind=?';values.push(kind);}
 if(cursor){where+=' AND (p.created_at,p.id)<(?,?)';values.push(cursor.created,cursor.id);}
 const rows=await db.prepare(`SELECT p.id,p.folder,p.filename,p.content_type,p.size,p.created_at,p.kind,p.thumbnail_key IS NOT NULL AS has_thumbnail,p.created_by,p.restored FROM json_each(?) selected CROSS JOIN photos p WHERE ${where} ORDER BY p.created_at DESC,p.id DESC LIMIT ?`).bind(...values,limit+1).all<Record<string,unknown>>();
 const photos=rows.results.slice(0,limit),last=photos.at(-1);
 return {photos,nextCursor:rows.results.length>limit&&last?JSON.stringify({created:last.created_at,id:last.id}):null};
}
