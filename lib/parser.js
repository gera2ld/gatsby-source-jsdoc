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
      extractExport(node, { code, comments });
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

function extractType(typeAnnotation, options) {
  while (typeAnnotation && typeAnnotation.type === 'TSTypeAnnotation') ({ typeAnnotation } = typeAnnotation);
  const range = typeAnnotation && typeAnnotation.range;
  return range && options.code.slice(...range);
}

function extractParam(node, options) {
  if (node.type === 'Identifier') {
    const { name, optional } = node;
    const type = extractType(node.typeAnnotation, options);
    return { name, type, optional };
  }
  if (node.type === 'AssignmentPattern') {
    const param = extractParam(node.left, options);
    param.default = options.code.slice(...node.right.range);
    return param;
  }
  if (node.type === 'RestElement') {
    const name = node.argument.name;
    const type = extractType(node.typeAnnotation, options);
    return { name, type };
  }
  if (['ObjectPattern'].includes(node.type)) {
    // Not supported
    return;
  }
  throw new Error(`[extractParam] Unsupported type: ${node.type}`);
}

function extractFunction(node, options) {
  if (node.type === 'FunctionDeclaration') {
    const returnType = extractType(node.returnType, options);
    return {
      name: node.id.name,
      params: node.params.map(param => extractParam(param, options)).filter(Boolean),
      returns: returnType && { type: returnType },
    };
  }
  throw new Error(`[extractFunction] Unsupported type: ${node.type}`);
}

function extractExport(node, options) {
  if (['ExportDefaultDeclaration', 'ExportNamedDeclaration'].includes(node.type)) {
    if (node.declaration) {
      attachComments(node.declaration, {
        ...options,
        extraLeadingComments: node.leadingComments,
      });
      return;
    }
  }
  // console.warn(`[extractExport] Unsupported type: ${node.type}`);
}

function extractVariable(node, options) {
  if (['VariableDeclaration'].includes(node.type)) {
    if (node.declarations.length === 1) {
      return extractVariable(node.declarations[0], options);
    }
  } else if (['VariableDeclarator'].includes(node.type)) {
    return {
      name: node.id.name,
    };
  }
}

function attachComments(node, options) {
  let payload;
  if (node.type === 'FunctionDeclaration') {
    payload = extractFunction(node, options);
  } else if (node.type === 'VariableDeclaration') {
    payload = extractVariable(node, options);
  } else {
    const name = _.get(node, 'id.name') || _.get(node.declaration, 'id.name') || '';
    payload = { name };
  }
  const unionLeadingComments = [
    ...options.extraLeadingComments || [],
    ...node.leadingComments || [],
  ];
  _.forEach(
    _.map(unionLeadingComments, comment => docParser.parse(comment, { ...payload, node })),
    doc => {
      if (doc) options.comments.push(doc);
    },
  );
  _.forEach(_.map(node.trailingComments, comment => docParser.parse(comment)), doc => {
    if (doc && doc.kind === 'file') {
      options.comments.push(doc);
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
      [returns && [returns], i18n.Returns],
    ].forEach(([entries, title]) => {
      if (entries && entries.length) {
        lines.push('', `#### ${title}`);
        entries.forEach(entry => {
          const parts = [];
          if (entry.name) parts.push(asCode(entry.name));
          if (entry.type) {
            const type = entry.type
            .trim()
            .replace(/\s*\|\s*/g, ' | ')
            .replace(/([<>])/g, '\\$1');
            if (type) parts.push(`*${type}*`);
          }
          if (entry.optional) parts.push(`*${i18n.Optional}*`)
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
