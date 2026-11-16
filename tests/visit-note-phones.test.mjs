import test from 'node:test';
import assert from 'node:assert/strict';
import {mobileNumbersInNote} from '../lib/visit-note-phones.ts';

test('finds multiple mobile numbers while retaining their original text and positions',()=>{
  const note='세입자: 010-0000-0001(오전)\n관리인: 010 0000 0002 / +82 10-0000-0003';
  const numbers=mobileNumbersInNote(note);

  assert.deepEqual(numbers.map(({text,href})=>[text,href]),[
    ['010-0000-0001','tel:01000000001'],
    ['010 0000 0002','tel:01000000002'],
    ['+82 10-0000-0003','tel:+821000000003'],
  ]);
  assert.equal(numbers[0].index,note.indexOf('010-'));
  assert.equal(note.slice(numbers[0].index+numbers[0].text.length,numbers[1].index),'(오전)\n관리인: ');
});

test('leaves ordinary note text and numeric fragments alone',()=>{
  const note='사직동 158-39, 401호, 15:30 이후, 010-1234-567, 010123456789, 01\n012345678, 1010-1234-5678';
  assert.deepEqual(mobileNumbersInNote(note),[]);
  assert.equal(mobileNumbersInNote('연락처 01000000001')[0].href,'tel:01000000001');
});
