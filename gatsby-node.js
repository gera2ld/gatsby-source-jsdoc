const path = require('path');
const anymatch = require('anymatch');
const defaultLocale = require('./lib/locale');
const parser = require('./lib/parser');

exports.sourceNodes = async ({
  getNodes,
  getNode,
  createNodeId,
  actions,
  emitter,
}, pluginOptions) => {
  const { createNode, deleteNode } = actions;
  const { sourceDir, match, i18n } = pluginOptions;
  const nodeOptions = {
    sourceDir,
    match,
  };
  const nodes = getNodes();
  const apis = {
    data: {},
    map: {},
  };
  const helpers = {
    createNode,
    createNodeId,
    getNode,
    deleteNode,
    i18n: {
      ...defaultLocale,
      ...i18n,
    },
  };

  for (const node of nodes) {
    await handleNode(apis, node, nodeOptions);
  }
  Object.entries(apis.data)
  .forEach(([name, payload]) => {
    createDocNode(name, payload, helpers);
  });

  emitter.on('CREATE_NODE', action => {
    const { payload: node } = action;
    const { id } = node;
    updateNode(id, node);
  });
  emitter.on('DELETE_NODE', action => {
    const { payload: id } = action;
    updateNode(id);
  });

  async function updateNode(id, node) {
    const name = apis.map[id];
    const newName = node && await handleNode(apis, node, nodeOptions);
    if (name && name !== newName) {
      updateData(apis, name, id);
      createDocNode(name, apis.data[name], helpers);
    }
    if (newName) {
      createDocNode(newName, apis.data[newName], helpers);
    }
  }
};

async function handleNode(apis, node, { sourceDir, match }) {
  if (node.internal.type !== 'File') return;
  // if (node.internal.mediaType !== 'application/javascript') return;
  if (!/\.(jsx?|tsx?)$/.test(node.relativePath)) return;
  if (match && !anymatch(match, node.relativePath)) return;
  const relpath = path.relative(sourceDir, node.absolutePath);
  if (relpath.startsWith('..')) return;
  if (parser) {
    const name = relpath.split('/')[0];
    const payload = await parser.parse(node.absolutePath, sourceDir);
    if (payload) return updateData(apis, name, node.id, payload);
  }
}

function updateData(apis, name, id, payload) {
  let data = apis.data[name];
  if (payload) {
    if (!data) {
      data = {};
      apis.data[name] = data;
    }
    data[id] = payload;
    apis.map[id] = name;
    return name;
  }
  if (data) {
    delete data[id];
    delete apis.map[id];
    if (!Object.keys(data).length) delete apis.data[name];
    return name;
  }
}

function createDocNode(name, payload, helpers) {
  if (parser && parser.createNode) return parser.createNode(name, payload, helpers);
}
