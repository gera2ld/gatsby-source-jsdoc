const path = require('path');
const jsdoc = require('jsdoc-api');
const crypto = require('crypto');
const anymatch = require('anymatch');

const digest = str => crypto.createHash('md5').update(str).digest('hex');
const sortKey = item => `${item.kind === 'file' ? 0 : 1} ${item.longname}`;
const defaultLocale = {
  Params: 'Params',
  Returns: 'Returns',
  Example: 'Example',
  DefaultAs: 'Default: ',
};

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
  .forEach(([name, data]) => {
    createJsDocNode(name, data, helpers);
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
      createJsDocNode(name, apis.data[name], helpers);
    }
    if (newName) {
      createJsDocNode(newName, apis.data[newName], helpers);
    }
  }
};

async function handleNode(apis, node, { sourceDir, match }) {
  if (node.internal.mediaType !== 'application/javascript') return;
  if (node.internal.type !== 'File') return;
  if (match && !anymatch(match, node.relativePath)) return;
  const relpath = path.relative(sourceDir, node.absolutePath);
  if (relpath.startsWith('..')) return;
  const name = relpath.split('/')[0];
  let jsdocJson;
  try {
    jsdocJson = await jsdoc.explain({ files: [node.absolutePath] });
    jsdocJson = jsdocJson.filter(({ comment }) => comment);
  } catch (e) {
    // Ignore as there'll probably be other tooling already checking for errors
    // and an error here kills Gatsby.
  }
  if (jsdocJson) {
    jsdocJson = jsdocJson.filter(({ comment }) => comment);
    if (!jsdocJson.length) jsdocJson = null;
  }
  const { id } = node;
  return updateData(apis, name, id, jsdocJson);
}

function updateData(apis, name, id, jsdoc) {
  let data = apis.data[name];
  if (jsdoc) {
    if (!data) {
      data = {};
      apis.data[name] = data;
    }
    data[id] = jsdoc;
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

function createJsDocNode(name, data, {
  createNode,
  createNodeId,
  getNode,
  deleteNode,
  i18n,
}) {
  const id = createNodeId(`jsdoc ${name}`);
  if (!data) {
    const node = getNode(id);
    if (node) deleteNode({ node });
    return;
  }
  const items = Object.values(data)
  .reduce((list, jsdoc) => [...list, ...jsdoc], []);
  items.sort((a, b) => {
    const keya = sortKey(a);
    const keyb = sortKey(b);
    if (keya < keyb) return -1;
    if (keya > keyb) return 1;
    return 0;
  });
  const title = (items[0].kind === 'file' ? items[0].alias : null) || name;
  const contents = [
    `# ${title}`,
  ];
  items.forEach(item => {
    const {
      kind,
      longname,
      description,
      params,
      returns,
      examples,
    } = item;
    const lines = [];
    if (kind !== 'file') {
      lines.push(`## ${longname}`);
    }
    if (description) lines.push('', description);
    [
      [params, i18n.Params],
      [returns, i18n.Returns],
    ].forEach(([entries, title]) => {
      if (entries && entries.length) {
        lines.push('', `#### ${title}`);
        entries.forEach(entry => {
          const parts = [];
          if (entry.name) parts.push(asCode(entry.name));
          if (entry.type) parts.push(`*${entry.type.names.join(' | ').replace(/([<>])/g, '\\$1')}*`);
          if (entry.defaultvalue) parts.push(`${i18n.DefaultAs} ${asCode(entry.defaultvalue)}`);
          lines.push('', `- ${parts.join(' ')}`);
          const rows = [];
          if (entry.description) {
            rows.push('', ...entry.description.split('\n'));
          }
          lines.push(...rows.map(row => `    ${row}`));
        });
      }
    });
    if (examples) {
      lines.push('', `#### ${i18n.Example}`);
      examples.forEach(entry => {
        lines.push('', '```js', entry, '```');
      });
    }
    contents.push(lines.join('\n'));
  });
  const markdownStr = contents.join('\n\n');
  createNode({
    id,
    children: [],
    sourceNodes: Object.keys(data),
    internal: {
      type: 'JsDocMarkdown',
      mediaType: 'text/markdown',
      content: markdownStr,
      contentDigest: digest(markdownStr),
    },
    name,
    jsdoc: items,
  });
}

function asCode(str) {
  const escaped = str.replace(/([`$])/g, '\\$1');
  return `\`${str}\``;
}
