function parse(comment, extra = {}) {
  const { type, value } = comment;
  if (type !== 'CommentBlock' || !value.startsWith('*')) return;
  const lines = value.slice(1)
  .trimRight()
  .split('\n')
  .map(line => line.replace(/^\s?\*\s?/, ''));
  const doc = {
    kind: 'block',
    desc: '',
    examples: [],
    comment,
    ...extra,
  };
  doc.params = doc.params || [];
  let block;
  const flushBlock = () => {
    if (!block) return;
    if (block.tag === 'desc') {
      const content = getBlockContent(block.contents);
      if (content) doc.desc = `${doc.desc || ''}\n${content}`;
    } else if (block.tag === 'param') {
      const index = doc.params.findIndex(item => item.name === block.name);
      const param = {
        ...getParamItem(block),
        ...doc.params[index],
      };
      if (index < 0) doc.params.push(param);
      else doc.params[index] = param;
    } else if (block.tag === 'returns') {
      doc.returns = {
        ...getParamItem(block),
        ...doc.returns,
      };
    } else if (block.tag === 'example') {
      let content;
      if (block.contents.some(line => line === '```')) {
        content = block.contents.join('\n');
      } else {
        const [caption, ...code] = block.contents;
        const lines = [];
        if (caption) lines.push(caption);
        lines.push(
          '```js',
          ...code,
          '```',
        );
        content = lines.join('\n');
      }
      doc.examples = [
        ...doc.examples || [],
        { content },
      ];
    }
    block = null;
  };
  for (const line of lines) {
    const tagMatch = line.match(/^\s*@(\w+)(\s.*)?$/);
    if (tagMatch) {
      const [, tag, firstRow] = tagMatch;
      if ([
        'desc',
        'example',
      ].includes(tag)) {
        flushBlock();
        block = {
          tag,
          contents: [firstRow],
        };
      } else if ([
        'param',
        'returns',
      ].includes(tag)) {
        flushBlock();
        block = {
          ...parseParam(firstRow, tag),
          tag,
        };
      } else if ([
        'name',
        'alias',
      ].includes(tag)) {
        flushBlock();
        doc[tag] = firstRow.trim();
      } else if (tag === 'file') {
        doc.kind = tag;
      }
    } else {
      if (!block) {
        block = {
          tag: 'desc',
          contents: [''],
        };
      }
      block.contents.push(line);
    }
  }
  flushBlock();
  return doc;
}

function getBlockContent(contents) {
  return contents[0] ? contents.join('\n') : contents.slice(1).join('\n');
}

function getParamItem(block) {
  return {
    name: block.name,
    type: block.type,
    optional: block.optional,
    default: block.default,
    desc: getBlockContent(block.contents),
  };
}

function parseParam(raw, tag) {
  // raw starts with a space
  const parts = raw.match(/^(?:\s+(\{[^}]+\}))?(?:\s+([\w.]+|\[[^\]]+\]))?(?:\s+(.*))?$/);
  if (!parts) {
    throw new Error(`Invalid @${tag}: ${raw}`);
  }
  const [, rawType, rawName, rawDesc] = parts;
  const props = {
    name: '',
    type: '',
    optional: false,
    default: '',
    contents: [],
  };
  if (rawType) parseParamType(props, rawType);
  if (rawName) parseParamName(props, rawName);
  props.contents = [(rawDesc || '').trim()];
  return props;
}

function parseParamType(props, raw) {
  const type = raw.slice(1, -1);
  props.type = type;
}

function parseParamName(props, raw) {
  if (/^\[.*\]$/.test(raw)) {
    props.optional = true;
    raw = raw.slice(1, -1);
  }
  const [name, defaultValue] = raw.split('=');
  if (name) props.name = name;
  if (defaultValue) props.default = defaultValue;
}

exports.parse = parse;
