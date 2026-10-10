import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyDrawingLabelReview,drawingLabelReviewCandidates,drawingLabelReviewInput,drawingLabelReviewSchema,parseDrawingLabelReview} from '../lib/drawing-label-review.ts';

test('only mentioned nonnumeric labels are reviewed without matching a shorter room name inside another',()=>{
 const labels=['침방','방','방','6.7','창고'].map(text=>({text}));
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['침방의 첫 글자가 불명확합니다. 6.7은 확인이 필요합니다.']}),[0]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['창고의 글자가 흐립니다.']}),[4]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['전체 치수와 선을 확인하세요.']}),[]);
});

test('generic orientation words cannot consume label review calls while Korean label particles remain readable',()=>{
 const labels=['방','침방','창고'].map(text=>({text}));
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['사진 방향을 확인해 주세요.']}),[]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['방의 글자를 확인하세요.']}),[0]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['방 글자를 확인하세요.']}),[0]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['침방이라는 글자는 침실의 오기일 가능성이 있습니다.']}),[1]);
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings:['침방(주방일 수도 있음)의 글자를 확인하세요.']}),[1]);
});

test('label review candidates are capped at eight and ignore blank or dimension-only text',()=>{
 const labels=['','2.5 m',...Array.from({length:12},(_,i)=>'공간'+i)].map(text=>({text}));
 const warnings=[labels.map(l=>l.text).join(' · ')];
 assert.deepEqual(drawingLabelReviewCandidates({labels,warnings}),[2,3,4,5,6,7,8,9]);
});

test('cropped review reads bounded Korean and mixed labels and defaults omitted uncertainty to review required',()=>{
 const result={labels:[{index:0,text:' 주방 ',uncertain:false},{index:1,text:'W.C',uncertain:true},{index:2,text:'창고'}],warnings:['두 번째 글자를 확인하세요.']};
 const parsed=parseDrawingLabelReview({response:'```json\n'+JSON.stringify(result)+'\n```'});
 assert.deepEqual(parsed,{labels:[{index:0,text:'주방',uncertain:false},{index:1,text:'W.C',uncertain:true},{index:2,text:'창고',uncertain:true}],warnings:result.warnings});
 assert.equal(parseDrawingLabelReview({choices:[{message:{content:JSON.stringify(result)}}]}).labels[0].text,'주방');
});

test('cropped review rejects duplicate, unknown or oversized results before the client applies text',()=>{
 const encode=labels=>({response:JSON.stringify({labels,warnings:[]})});
 for(const labels of [
  [{index:0,text:'주방',uncertain:false},{index:0,text:'창고',uncertain:false}],
  [{index:8,text:'방',uncertain:false}],
  [{index:0.5,text:'방',uncertain:false}],
  [{index:0,text:' ',uncertain:false}],
  [{index:0,text:'가'.repeat(101),uncertain:false}],
 ])assert.throws(()=>parseDrawingLabelReview(encode(labels)));
 assert.throws(()=>parseDrawingLabelReview({response:'x'.repeat(12001)}));
 assert.throws(()=>parseDrawingLabelReview({response:JSON.stringify({labels:[],warnings:Array(9).fill('확인')})}));
 assert.throws(()=>parseDrawingLabelReview({response:'not JSON'}));
});

test('cropped review sends a single contact sheet and bounds model output and variation',()=>{
 const input=drawingLabelReviewInput('data:image/jpeg;base64,abc');
 const content=input.messages[0].content;
 assert.equal(content.filter(item=>item.type==='image_url').length,1);
 assert.equal(content.find(item=>item.type==='image_url').image_url.url,'data:image/jpeg;base64,abc');
 assert.equal(input.max_completion_tokens,1200);
 assert.equal(input.temperature,0);
 assert.equal(input.chat_template_kwargs.enable_thinking,false);
});

test('verified cropped text updates only known selected labels while keeping geometry and other metadata',()=>{
 const metadata={rotation:270,widthMeters:12,labels:[{text:'침방',x:200,y:250,box:[150,200,250,300]},{text:'창고',x:400,y:500,box:[370,450,430,550]}],warnings:['침방 글자를 확인하세요.','전체 치수를 확인하세요.']};
 const review=drawingLabelReviewSchema.parse({labels:[{index:0,text:'주방',uncertain:false},{index:1,text:'욕실',uncertain:false}],warnings:[],remaining:15});
 const applied=applyDrawingLabelReview(metadata,[0],review);
 assert.equal(applied.labels[0].text,'주방');
 assert.deepEqual(applied.labels[0],{text:'주방',x:200,y:250,box:[150,200,250,300]});
 assert.deepEqual(applied.labels[1],metadata.labels[1]);
 assert.equal(applied.rotation,270);assert.equal(applied.widthMeters,12);
 assert.deepEqual(applied.warnings,['전체 치수를 확인하세요.']);
 assert.equal(metadata.labels[0].text,'침방');
});

test('uncertain cropped text preserves the original label and warns instead of overwriting',()=>{
 const metadata={labels:[{text:'침방',x:200,y:250,box:[150,200,250,300]}],warnings:['침방 글자를 확인하세요.']};
 const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels:[{index:0,text:'주방',uncertain:true}],warnings:['종이에 그림자가 있습니다.']}));
 assert.deepEqual(result.labels,metadata.labels);
 assert.ok(result.warnings.includes('침방 글자를 확인하세요.'));
 assert.ok(result.warnings.includes('종이에 그림자가 있습니다.'));
 assert.match(result.warnings.join(' '),/침방.*확실/);
});

test('resolving a longer label does not remove a warning for another shorter room name',()=>{
 const metadata={labels:[{text:'침방'},{text:'방'}],warnings:['침방의 글자를 확인하세요.','방의 글자를 확인하세요.']};
 const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels:[{index:0,text:'주방',uncertain:false}],warnings:[]}));
 assert.deepEqual(result.warnings,['방의 글자를 확인하세요.']);
});

test('review warnings remain bounded after uncertain crops are added',()=>{
 const metadata={labels:[{text:'침방'}],warnings:Array.from({length:15},(_,i)=>'기존 확인 '+i)};
 const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels:[{index:0,text:'주방',uncertain:true}],warnings:['새 확인사항']}));
 assert.equal(result.warnings.length,15);
 assert.ok(result.warnings.includes('새 확인사항'));
 assert.match(result.warnings.join(' '),/침방.*확실/);
});

test('an uncertain alternative is displayed first without changing the original label or coordinates',()=>{
 const metadata={labels:[{text:'침방',x:200,y:250,box:[150,200,250,300]}],warnings:['침방 글자를 확인하세요.']};
 const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels:[{index:0,text:'주방',uncertain:true}],warnings:['글씨가 흐릿하여 판독이 불확실합니다.']}));
 assert.deepEqual(result.labels,metadata.labels);
 assert.match(result.warnings[0],/침방.*주방.*기존 글자를 유지/);
 assert.equal(result.warnings[1],'글씨가 흐릿하여 판독이 불확실합니다.');
});

test('same, missing and unknown crop alternatives cannot appear as suggested corrections',()=>{
 const metadata={labels:[{text:'침방'}],warnings:[]};
 for(const labels of [[{index:0,text:'침방',uncertain:true}],[],[{index:1,text:'주방',uncertain:true}]]){
  const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels,warnings:[]}));
  assert.deepEqual(result.labels,metadata.labels);
  assert.doesNotMatch(result.warnings.join(' '),/주방|으로도 읽/);
  assert.match(result.warnings[0],/침방.*확실히 읽지 못/);
 }
});

test('uncertain alternatives retain bounded warning lengths and count',()=>{
 const metadata={labels:[{text:'가'.repeat(100)}],warnings:Array.from({length:15},(_,i)=>'기존 확인 '+i)};
 const result=applyDrawingLabelReview(metadata,[0],drawingLabelReviewSchema.parse({labels:[{index:0,text:'나'.repeat(100),uncertain:true}],warnings:['글씨가 흐릿합니다.']}));
 assert.equal(result.warnings.length,15);
 assert.match(result.warnings[0],/으로도 읽/);
 assert.ok(result.warnings.every(warning=>warning.length<=300));
 assert.deepEqual(result.labels,metadata.labels);
});
