import test from 'node:test';
import assert from 'node:assert/strict';
import { initialTree } from '../src/data.js';
import { cloneTree, getSelectedNodes, toggleSelected, clearSelected, setAllSelected, getVisibleColumns, setExpandedToDepth, pathsToNestedList } from '../src/tree.js';

test('initial design tree contains the selected topics from the mockup', () => {
  const selected = getSelectedNodes(cloneTree(initialTree)).map((node) => node.label);
  assert.deepEqual(selected, [
    'Machine Learning',
    'Supervised Learning',
    'Regression',
    'Classification',
    'Natural Language Processing',
    'Language Models'
  ]);
});

test('toggleSelected only changes the requested node', () => {
  const tree = toggleSelected(initialTree, 'clustering', true);
  const selected = getSelectedNodes(tree).map((node) => node.label);
  assert.equal(selected.includes('Clustering'), true);
  assert.equal(getSelectedNodes(initialTree).some((node) => node.label === 'Clustering'), false);
});

test('clearSelected removes every selected level', () => {
  const tree = clearSelected(initialTree);
  assert.equal(getSelectedNodes(tree).length, 0);
});

test('setAllSelected selects every known topic in the tree', () => {
  const tree = setAllSelected(clearSelected(initialTree));
  assert.equal(getSelectedNodes(tree).length, 17);
});

test('setExpandedToDepth controls visible recursive levels', () => {
  const levelOne = setExpandedToDepth(initialTree, 1);
  const columns = getVisibleColumns(levelOne, 3);
  assert.equal(columns[0].length, 1);
  assert.equal(columns[1].length, 4);
  assert.equal(columns[2].length, 0);
});

test('pathsToNestedList preserves the selected hierarchy', () => {
  const selected = getSelectedNodes(initialTree).slice(0, 2);
  const nested = pathsToNestedList(selected);
  assert.equal(nested.children[0].label, 'Artificial Intelligence');
  assert.equal(nested.children[0].children[0].label, 'Machine Learning');
});
