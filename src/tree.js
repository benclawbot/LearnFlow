export function cloneTree(tree) {
  return JSON.parse(JSON.stringify(tree));
}

export function slugify(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'topic';
}

export function makeNode(label, parentId = '', index = 0, color = 'blue') {
  const idBase = slugify(label);
  return {
    id: parentId ? `${parentId}-${idBase}-${index + 1}` : idBase,
    label: String(label).trim(),
    color,
    selected: false,
    expanded: false,
    children: []
  };
}

export function walkTree(root, visitor, path = [], depth = 0, parent = null) {
  if (!root) return;
  const nextPath = [...path, root.label];
  visitor(root, nextPath, depth, parent);
  for (const child of root.children || []) {
    walkTree(child, visitor, nextPath, depth + 1, root);
  }
}

export function findNode(root, id) {
  let found = null;
  walkTree(root, (node) => {
    if (node.id === id) found = node;
  });
  return found;
}

export function getSelectedNodes(root) {
  const selected = [];
  walkTree(root, (node, path, depth) => {
    if (node.selected) {
      selected.push({ id: node.id, label: node.label, path, depth, color: node.color });
    }
  });
  return selected;
}

export function toggleSelected(root, id, value) {
  const tree = cloneTree(root);
  const node = findNode(tree, id);
  if (node) node.selected = typeof value === 'boolean' ? value : !node.selected;
  return tree;
}

export function clearSelected(root) {
  const tree = cloneTree(root);
  walkTree(tree, (node) => { node.selected = false; });
  return tree;
}

export function setAllSelected(root, value = true) {
  const tree = cloneTree(root);
  walkTree(tree, (node) => { node.selected = value; });
  return tree;
}

export function addChildren(root, id, childLabels, color = 'blue') {
  const tree = cloneTree(root);
  const node = findNode(tree, id);
  if (!node) return tree;
  const existing = new Set((node.children || []).map((child) => child.label.toLowerCase()));
  const newChildren = childLabels
    .filter(Boolean)
    .filter((label) => !existing.has(String(label).toLowerCase()))
    .map((label, index) => makeNode(label, node.id, index, color));
  node.children = [...(node.children || []), ...newChildren];
  node.expanded = true;
  return tree;
}

export function setChildren(root, id, children) {
  const tree = cloneTree(root);
  const node = findNode(tree, id);
  if (!node) return tree;
  node.children = children;
  node.expanded = true;
  return tree;
}

export function setExpandedToDepth(root, levels) {
  const tree = cloneTree(root);
  walkTree(tree, (node, _path, depth) => {
    node.expanded = depth < levels;
  });
  return tree;
}

export function getVisibleColumns(root, maxDepth = 3) {
  const columns = Array.from({ length: maxDepth + 1 }, () => []);
  function visit(node, depth, path) {
    if (depth > maxDepth) return;
    columns[depth].push({ ...node, path });
    if (node.expanded) {
      for (const child of node.children || []) {
        visit(child, depth + 1, [...path, child.label]);
      }
    }
  }
  visit(root, 0, [root.label]);
  return columns;
}

export function getVisibleEdges(root, maxDepth = 3) {
  const edges = [];
  function visit(node, depth) {
    if (depth >= maxDepth || !node.expanded) return;
    for (const child of node.children || []) {
      edges.push({ from: node.id, to: child.id, color: child.color || node.color || 'blue' });
      visit(child, depth + 1);
    }
  }
  visit(root, 0);
  return edges;
}

export function pathsToNestedList(selectedItems) {
  const root = { label: 'Selected Knowledge Map', children: new Map() };
  for (const item of selectedItems) {
    let cursor = root;
    for (const segment of item.path) {
      if (!cursor.children.has(segment)) cursor.children.set(segment, { label: segment, children: new Map() });
      cursor = cursor.children.get(segment);
    }
  }
  function toPlain(node) {
    return {
      label: node.label,
      children: [...node.children.values()].map(toPlain)
    };
  }
  return toPlain(root);
}
