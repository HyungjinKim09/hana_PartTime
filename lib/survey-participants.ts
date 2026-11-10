export type SurveyParticipant={id:string;name:string;restored?:boolean;manual?:boolean};
export type ParticipantScope={key:string;folder?:string;region?:string;date?:string};

// Materialize scoped IDs before evidence joins, so SQLite cannot start with an
// owner-wide photo/activity scan. Read evidence once per distinct folder even
// when both its card and date summary need the same roster.
// One query enriches the returned cards and date summary, without loading file
// bodies or issuing a request/query for every folder. Folder date defines the
// investigation day; late uploads stay associated with that scheduled day.
export async function surveyParticipants(db:D1Database,owner:string,scopes:ParticipantScope[]){
 const result=new Map(scopes.map(scope=>[scope.key,[] as SurveyParticipant[]]));
 if(!scopes.length)return result;
 const rows=await db.prepare(`WITH scopes AS MATERIALIZED (
  SELECT json_extract(value,'$.key') AS key,json_extract(value,'$.folder') AS folder,
   json_extract(value,'$.region') AS region,json_extract(value,'$.date') AS date FROM json_each(?)
 ),cohort AS MATERIALIZED (
  SELECT s.key,f.id FROM scopes s CROSS JOIN survey_folders f
   WHERE s.folder IS NOT NULL AND f.owner=? AND f.id=s.folder AND f.deleting=0
  UNION ALL
  SELECT s.key,f.id FROM scopes s CROSS JOIN survey_folders f
   WHERE s.folder IS NULL AND s.region IS NOT NULL AND s.date IS NOT NULL
    AND f.owner=? AND f.region=s.region AND f.survey_date=s.date AND f.deleting=0
 ),folders AS MATERIALIZED (
  SELECT f.owner,f.id,f.survey_updated_by,f.assigned_participants,f.assigned_participants_by
   FROM (SELECT DISTINCT id FROM cohort) c CROSS JOIN survey_folders f WHERE f.owner=? AND f.id=c.id
 ),events AS (
  SELECT c.id AS folder_id,a.actor_id AS id,a.actor_name AS name,a.created_at AS at,0 AS restored,0 AS manual
   FROM folders c CROSS JOIN activity_log a ON a.owner=c.owner AND a.folder_id=c.id
   WHERE a.status='complete' AND (a.action='survey.updated' OR (a.action='photo.added' AND a.target_type='photo'))
  UNION ALL
  SELECT c.id,r.actor_id,r.actor_name,r.updated_at,r.restored,0
   FROM folders c CROSS JOIN personal_survey_records r ON r.owner=c.owner AND r.folder_id=c.id
  UNION ALL
  SELECT c.id,json_extract(p.created_by,'$.id'),json_extract(p.created_by,'$.name'),json_extract(p.created_by,'$.at'),
   CASE WHEN p.restored=1 OR json_extract(p.created_by,'$.restored')=1 THEN 1 ELSE 0 END,0
   FROM folders c CROSS JOIN photos p ON p.owner=c.owner AND p.folder=c.id
   WHERE p.deleted=0 AND p.kind='photo' AND p.created_by IS NOT NULL
  UNION ALL
  SELECT c.id,json_extract(c.survey_updated_by,'$.id'),json_extract(c.survey_updated_by,'$.name'),json_extract(c.survey_updated_by,'$.at'),
   COALESCE(json_extract(c.survey_updated_by,'$.restored'),0),0
   FROM folders c WHERE c.survey_updated_by IS NOT NULL
  UNION ALL
  SELECT c.id,json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),json_extract(c.assigned_participants_by,'$.at'),COALESCE(json_extract(c.assigned_participants_by,'$.restored'),0),1
   FROM folders c,json_each(c.assigned_participants) p
 ),folder_ranked AS MATERIALIZED (
  SELECT *,ROW_NUMBER() OVER(PARTITION BY folder_id,id ORDER BY manual,restored,at DESC,name) AS folder_rank
   FROM events WHERE id IS NOT NULL AND name IS NOT NULL
 ),ranked AS (
  SELECT c.key,e.id,e.name,e.restored,e.manual,
   ROW_NUMBER() OVER(PARTITION BY c.key,e.id ORDER BY e.manual,e.restored,e.at DESC,e.name) AS rank
   FROM cohort c JOIN folder_ranked e ON e.folder_id=c.id AND e.folder_rank=1
 ) SELECT key,id,name,restored,manual FROM ranked WHERE rank=1 ORDER BY key,name,id`).bind(JSON.stringify(scopes),owner,owner,owner).all<{key:string;id:string;name:string;restored:number;manual:number}>();
 for(const row of rows.results)result.get(row.key)?.push({id:row.id,name:row.name,...(row.restored?{restored:true}:{}),...(row.manual?{manual:true}:{})});
 return result;
}
