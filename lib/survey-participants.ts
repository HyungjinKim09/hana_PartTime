export type SurveyParticipant={id:string;name:string;restored?:boolean;manual?:boolean};
export type ParticipantScope={key:string;folder?:string;region?:string;date?:string};

// One query enriches the returned cards and date summary, without loading file
// bodies or issuing a request/query for every folder. Folder date defines the
// investigation day; late uploads stay associated with that scheduled day.
export async function surveyParticipants(db:D1Database,owner:string,scopes:ParticipantScope[]){
 const result=new Map(scopes.map(scope=>[scope.key,[] as SurveyParticipant[]]));
 if(!scopes.length)return result;
 const rows=await db.prepare(`WITH scopes AS (
  SELECT json_extract(value,'$.key') AS key,json_extract(value,'$.folder') AS folder,
   json_extract(value,'$.region') AS region,json_extract(value,'$.date') AS date FROM json_each(?)
 ),cohort AS (
  SELECT s.key,f.owner,f.id,f.survey_updated_by,f.assigned_participants,f.assigned_participants_by FROM scopes s JOIN survey_folders f
   ON f.owner=? AND f.deleting=0 AND (
    (s.folder IS NOT NULL AND f.id=s.folder) OR
    (s.folder IS NULL AND s.region IS NOT NULL AND s.date IS NOT NULL AND f.region=s.region AND f.survey_date=s.date)
   )
 ),events AS (
  SELECT c.key,a.actor_id AS id,a.actor_name AS name,a.created_at AS at,0 AS restored,0 AS manual
   FROM cohort c JOIN activity_log a ON a.owner=c.owner AND a.folder_id=c.id
   WHERE a.status='complete' AND (a.action='survey.updated' OR (a.action='photo.added' AND a.target_type='photo'))
  UNION ALL
  SELECT c.key,r.actor_id,r.actor_name,r.updated_at,r.restored,0
   FROM cohort c JOIN personal_survey_records r ON r.owner=c.owner AND r.folder_id=c.id
  UNION ALL
  SELECT c.key,json_extract(p.created_by,'$.id'),json_extract(p.created_by,'$.name'),json_extract(p.created_by,'$.at'),
   CASE WHEN p.restored=1 OR json_extract(p.created_by,'$.restored')=1 THEN 1 ELSE 0 END,0
   FROM cohort c JOIN photos p ON p.owner=c.owner AND p.folder=c.id
   WHERE p.deleted=0 AND p.kind='photo' AND p.created_by IS NOT NULL
  UNION ALL
  SELECT c.key,json_extract(c.survey_updated_by,'$.id'),json_extract(c.survey_updated_by,'$.name'),json_extract(c.survey_updated_by,'$.at'),
   COALESCE(json_extract(c.survey_updated_by,'$.restored'),0),0
   FROM cohort c WHERE c.survey_updated_by IS NOT NULL
  UNION ALL
  SELECT c.key,json_extract(p.value,'$.id'),json_extract(p.value,'$.name'),json_extract(c.assigned_participants_by,'$.at'),COALESCE(json_extract(c.assigned_participants_by,'$.restored'),0),1
   FROM cohort c,json_each(c.assigned_participants) p
 ),ranked AS (
  SELECT key,id,name,restored,manual,ROW_NUMBER() OVER(PARTITION BY key,id ORDER BY manual,restored,at DESC,name) AS rank
   FROM events WHERE id IS NOT NULL AND name IS NOT NULL
 ) SELECT key,id,name,restored,manual FROM ranked WHERE rank=1 ORDER BY key,name,id`).bind(JSON.stringify(scopes),owner).all<{key:string;id:string;name:string;restored:number;manual:number}>();
 for(const row of rows.results)result.get(row.key)?.push({id:row.id,name:row.name,...(row.restored?{restored:true}:{}),...(row.manual?{manual:true}:{})});
 return result;
}
