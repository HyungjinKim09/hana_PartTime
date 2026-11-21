import test from 'node:test';
import assert from 'node:assert/strict';
import {createScheduleSubmission} from '../lib/schedule-submission.ts';

test('retrying draft cleanup retains the server result and never submits the schedule twice',async()=>{
 const submission=createScheduleSubmission();
 let posts=0,cleanups=0,notifications=0;
 const saved={region:'사직4구역',date:'2026-11-20',team:2};
 const post=async()=>{posts++;return saved;};
 const cleanup=async()=>{cleanups++;if(cleanups===1)throw Error('기기 저장소 일시 장애');};
 const submitted=result=>{assert.equal(result,saved);notifications++;};
 await assert.rejects(submission.finish(post,cleanup,submitted),/저장소/);
 assert.equal(submission.hasSubmitted(),true);
 assert.equal(await submission.finish(post,cleanup,submitted),saved);
 assert.equal(posts,1);
 assert.equal(cleanups,2);
 assert.equal(notifications,1);
});

test('a failed server submission can retry and does not clean an unsaved draft',async()=>{
 const submission=createScheduleSubmission();let posts=0,cleanups=0;
 const post=async()=>{posts++;if(posts===1)throw Error('연결 실패');return {region:'지역'};};
 const cleanup=async()=>{cleanups++;};
 await assert.rejects(submission.finish(post,cleanup),/연결/);
 assert.equal(submission.hasSubmitted(),false);
 assert.equal(cleanups,0);
 assert.deepEqual(await submission.finish(post,cleanup),{region:'지역'});
 assert.equal(posts,2);
 assert.equal(cleanups,1);
});

test('concurrent completion requests share one submission and cleanup attempt',async()=>{
 const submission=createScheduleSubmission();let posts=0,cleanups=0,release;
 const posted=new Promise(resolve=>{release=resolve;});
 const post=async()=>{posts++;await posted;return {region:'지역'};};
 const cleanup=async()=>{cleanups++;};
 const first=submission.finish(post,cleanup),second=submission.finish(post,cleanup);
 release();
 assert.deepEqual(await Promise.all([first,second]),[{region:'지역'},{region:'지역'}]);
 assert.equal(posts,1);
 assert.equal(cleanups,1);
});
