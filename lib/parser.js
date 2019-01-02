const fs = require('fs').promises;
const path = require('path');
const _ = require('lodash');
const { digest, asCode } = require('./util');
const jsParser = require('./js-parser');
const docParser = require('./doc-parser');

async function parse(absolutePath) {
  const code = await fs.readFile(absolutePath, 'utf8');
  const ast = jsParser.parse(code, absolutePath);
  const comments = [];
  if (ast) {
    const basename = path.basename(absolutePath, path.extname(absolutePath));
    checkComments(comments, ast.program.innerComments, { name: basename });
    _.forEach(ast.program.body, node => {
      checkNode(comments, node);
    });
  }
  if (comments.length) return comments;
}

function checkComments(comments, commentNodes, extra = {}) {
  _.forEach(
    _.map(commentNodes, node => docParser.parse(node, extra)),
    doc => {
      if (!doc) return;
      if (doc.kind === 'file') {
        comments.push(doc);
      } else if (extra.name) {
        comments.push(doc);
      }
    },
  );
}

function checkNode(comments, node, { extraLeadingComments } = {}) {
  const { type, leadingComments, trailingComments } = node;
  if (type === 'ExportDefaultDeclaration') {
    checkNode(comments, node.declaration, {
      extraLeadingComments: leadingComments,
    });
    return;
  }
  const name = _.get(node, 'id.name') || _.get(node.declaration, 'id.name') || '';
  const unionLeadingComments = [
    ...extraLeadingComments || [],
    ...leadingComments || [],
  ];
  _.forEach(
    _.map(unionLeadingComments, comment => docParser.parse(comment, { name, node })),
    doc => {
      if (doc) comments.push(doc);
    },
  );
  _.forEach(_.map(trailingComments, comment => docParser.parse(comment)), doc => {
    if (doc && doc.kind === 'file') {
      comments.push(doc);
    }
  });
}

function sortKey(item) {
  return `${item.kind === 'file' ? 0 : 1} ${item.name}`;
}

function createNode(name, data, {
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
  const items = Object.values(data).reduce((a, b) => [...a, ...b], []);
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
      desc,
      params,
      returns,
      examples,
    } = item;
    const longname = item.alias || item.name;
    const lines = [];
    if (kind !== 'file') {
      lines.push(`## ${longname}`);
    }
    if (desc) lines.push('', desc);
    [
      [params, i18n.Params],
      [returns, i18n.Returns],
    ].forEach(([entries, title]) => {
      if (entries && entries.length) {
        lines.push('', `#### ${title}`);
        entries.forEach(entry => {
          const parts = [];
          if (entry.name) parts.push(asCode(entry.name));
          if (entry.types) {
            const type = entry.types.join(' | ').replace(/([<>])/g, '\\$1');
            if (type) parts.push(`*${type}*`);
          }
          if (entry.default) parts.push(`${i18n.DefaultAs} ${asCode(entry.default)}`);
          lines.push('', `- ${parts.join(' ')}`);
          const rows = [];
          if (entry.desc) {
            rows.push('', ...entry.desc.split('\n'));
          }
          lines.push(...rows.map(row => `    ${row}`));
        });
      }
    });
    if (examples && examples.length) {
      lines.push('', `#### ${i18n.Example}`);
      examples.forEach(({ content }) => {
        lines.push('', content);
      });
    }
    contents.push(lines.join('\n'));
  });
  const markdownStr = contents.join('\n\n');
  createNode({
    id,
    children: [],
    internal: {
      type: 'JsDocMarkdown',
      mediaType: 'text/markdown',
      content: markdownStr,
      contentDigest: digest(markdownStr),
    },
    name,
    jsdoc: true,
  });
}

exports.parse = parse;
exports.createNode = createNode;
