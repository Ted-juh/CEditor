import test from 'node:test';
import assert from 'node:assert/strict';
import { choiceKeyIndex } from '../src/CE_Application/utils/choiceKeyboard.js';
test('choice navigation visits each enabled/filtered position and stops at ends',()=>{
 assert.equal(choiceKeyIndex('ArrowDown',0,3),1);
 assert.equal(choiceKeyIndex('ArrowUp',2,3),1);
 assert.equal(choiceKeyIndex('ArrowUp',0,3),0);
 assert.equal(choiceKeyIndex('ArrowDown',2,3),2);
 assert.equal(choiceKeyIndex('Home',2,3),0);
 assert.equal(choiceKeyIndex('End',0,3),2);
});
test('empty and unmatched selection have safe navigation',()=>{
 assert.equal(choiceKeyIndex('ArrowDown',-1,0),null);
 assert.equal(choiceKeyIndex('ArrowDown',-1,3),0);
 assert.equal(choiceKeyIndex('ArrowUp',-1,3),2);
 assert.equal(choiceKeyIndex('Enter',0,3),null);
});
